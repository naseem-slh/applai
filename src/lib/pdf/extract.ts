import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdfjsLib } from './worker'

// `TextItem`/`TextMarkedContent` sind pdf.js-interne Typnamen, die das
// öffentliche Typ-Barrel des Pakets nicht re-exportiert (nur `PDFPageProxy`
// & Co., siehe `pdfjs-dist/types/src/pdf.d.ts`) — deshalb hier strukturell
// aus der tatsächlichen Rückgabe von `getTextContent` abgeleitet statt per
// Name importiert.
type TextContentItem = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number]
type TextItem = Extract<TextContentItem, { str: string }>

/**
 * Ein einzelnes Textelement aus dem PDF, so wie pdf.js es liefert: `x`/`y`
 * sind die linke, untere Ecke der Grundlinie in PDF-Einheiten (1/72 Zoll),
 * `y` wächst nach oben (PDF-Koordinatensystem, nicht Bildschirm).
 */
export interface PdfItem {
  text: string
  x: number
  y: number
  fontSize: number
  fontName: string
  bold: boolean
}

/** Alle Textelemente einer Seite, bereits in Lesereihenfolge (siehe `extractPdf`). */
export interface PdfPage {
  items: PdfItem[]
  width: number
  height: number
}

// Zwei Textelemente gelten als "auf derselben Zeile", wenn sich ihre
// Grundlinien um höchstens diesen Wert unterscheiden. Von der Aufgabe
// vorgegeben ("Toleranz ~2 pt") — reale PDFs setzen Grundlinien einer Zeile
// nicht immer auf exakt denselben Wert (Rundungsfehler, Sub-/Superskript).
const LINE_Y_TOLERANCE_PT = 2

// pdf.js liefert vereinzelt Elemente ohne sichtbares Zeichen: leere
// Marken-Strings (z. B. ein `hasEOL`-Trenner zwischen zwei BT/ET-Blöcken
// derselben Quellzeile) ebenso wie synthetische Leerzeichen-Elemente mit
// Breite und Schriftgröße 0, die pdf.js selbst einfügt, wenn zwei
// Textstücke derselben Zeile weit auseinanderliegen (beobachtet zwischen
// den Spalten der Fixture `lebenslauf-zweispaltig.pdf`, siehe
// extract.test.ts) — beide tragen nichts zur Lesereihenfolge, zur
// Spaltenerkennung oder zur Fett-/Größenanalyse bei und würden sie sogar
// verfälschen (ein Element mit fontSize 0 zöge z. B. den Seiten-Median nach
// unten). Reines Leerzeichen im Fließtext geht dadurch nicht verloren: Es
// steckt, wo es tatsächlich zum Wortabstand gehört, ohnehin im Text des
// vorangehenden Elements.
function hasVisibleText(item: TextContentItem): item is TextItem {
  return 'str' in item && item.str.trim().length > 0
}

// pdf.js löst den Namen und die Fett-Eigenschaft einer Schriftart erst auf,
// nachdem die Operatorenliste der Seite verarbeitet wurde — vor dem Aufruf
// wäre `commonObjs.get` entweder leer oder würfe. Für reine Textextraktion
// (kein Rendering) ist das der einzige Zweck dieses Aufrufs.
interface PdfFontObject {
  name?: string
  bold?: boolean
}

async function buildPdfItems(page: PDFPageProxy): Promise<PdfItem[]> {
  await page.getOperatorList()
  const content = await page.getTextContent()

  return content.items.filter(hasVisibleText).map((item) => {
    const fontObject = page.commonObjs.get(item.fontName) as PdfFontObject | undefined
    return {
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      // `item.height` ist bereits die von pdf.js berechnete Höhe der
      // Transformationsmatrix (für unsere achsenparallelen Testfixtures
      // identisch mit der gesetzten Schriftgröße) — das erspart eine eigene
      // Matrixauswertung.
      fontSize: item.height,
      fontName: fontObject?.name ?? item.fontName,
      bold: fontObject?.bold ?? false,
    }
  })
}

/**
 * Gruppiert Textelemente zu Zeilen (Toleranz `LINE_Y_TOLERANCE_PT`) und
 * sortiert jede Zeile nach `x`. Zeilen selbst stehen absteigend nach `y`,
 * also von oben nach unten — pdf.js-y wächst nach oben.
 *
 * Exportiert, weil `toDocx.ts` dieselbe Zeilenbildung braucht, um Zeilen zu
 * Absätzen zusammenzufassen: beide Stellen müssen sich einig sein, was "eine
 * Zeile" ist, sonst könnte eine Übermittlung leicht auseinanderlaufen.
 */
export function groupItemsIntoLines(items: PdfItem[]): PdfItem[][] {
  const sortedByY = [...items].sort((a, b) => b.y - a.y)
  const lines: PdfItem[][] = []

  for (const item of sortedByY) {
    const currentLine = lines.at(-1)
    // Vergleich mit dem *ersten* Element der Zeile (nicht mit dem zuletzt
    // hinzugefügten): Sonst könnte eine lange Zeile mit vielen leicht
    // schwankenden Grundlinien schrittweise "wegdriften" und am Ende weiter
    // von ihrem Anfang entfernt sein als die Toleranz erlaubt.
    const lineY = currentLine?.[0]?.y
    if (currentLine && lineY !== undefined && Math.abs(lineY - item.y) <= LINE_Y_TOLERANCE_PT) {
      currentLine.push(item)
    } else {
      lines.push([item])
    }
  }

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x)
  }

  return lines
}

// Klare, auf Deutsch verständliche Fehlermeldung für passwortgeschützte
// PDFs (siehe extractPdf) — benannte Konstante statt Inline-String, damit
// extract.test.ts denselben Wortlaut referenzieren kann, ohne ihn zu
// duplizieren.
export const PASSWORD_PROTECTED_MESSAGE =
  'Diese PDF-Datei ist passwortgeschützt. Passwortgeschützte PDF-Dateien werden nicht unterstützt — bitte entfernen Sie den Schutz und laden Sie die Datei erneut hoch.'

// pdf.js exportiert `PasswordException` nicht über sein öffentliches
// Typ-Barrel (dieselbe Lücke wie bei TextItem/TextMarkedContent, siehe
// oben) — erkennbar bleibt sie trotzdem zuverlässig an `.name`: Der Worker
// baut Ausnahmen anhand ihres serialisierten Namens wieder zum passenden
// Klassentyp zusammen (`pdf.mjs`, `wrapReason`: `case "PasswordException":
// return new PasswordException(...)`), `.name` ist also kein Zufallswert,
// sondern Teil dieses Wiederaufbaus.
function isPasswordException(error: unknown): boolean {
  return error instanceof Error && error.name === 'PasswordException'
}

/**
 * Liest eine `.pdf`-Datei ein und liefert je Seite die enthaltenen
 * Textelemente **in Lesereihenfolge**: Die rohe Reihenfolge des
 * Inhaltsstroms folgt keiner verlässlichen Regel (Schriftwechsel,
 * Kommentare, mehrspaltiges Layout erzeugen oft eine andere Reihenfolge als
 * die visuelle) — `groupItemsIntoLines` stellt Zeile für Zeile, innerhalb
 * jeder Zeile links nach rechts, wieder her.
 *
 * Bei mehrspaltigem Layout ist das bewusst weiterhin nur "Zeile für Zeile
 * über die ganze Seitenbreite", nicht "erst linke Spalte komplett, dann
 * rechte" — eine layoutbewusste Spaltenerkennung ist expliziter
 * Nicht-Anspruch dieser Beta-Stufe (siehe `detectMultiColumn`, das genau vor
 * diesem Fall warnt, statt ihn zu lösen).
 */
export async function extractPdf(buffer: ArrayBuffer): Promise<PdfPage[]> {
  // Kopie statt der Originalreferenz: pdf.js "übernimmt" bei ArrayBuffer-
  // Daten ggf. den Speicher (Transfer an den Worker) — ohne Kopie könnte ein
  // zweiter Aufruf mit demselben Buffer der Aufrufenden fehlschlagen.
  const data = new Uint8Array(buffer.slice(0))
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: pdfjsLib.VerbosityLevel.ERRORS })

  // `onPassword` ist eine Eigenschaft der Ladeaufgabe (kein Feld von
  // `getDocument`s Parametern). Applai hat in dieser Schicht keine
  // Möglichkeit, ein Kennwort abzufragen (kein Server, siehe G1; keine
  // Oberfläche, siehe Aufgabe 13) — `updatePassword` mit einem Error lehnt
  // die offene Anfrage sofort ab, statt sie unbeantwortet zu lassen.
  //
  // Wichtig, geprüft an einer echten (RC4-)verschlüsselten Testfixture: Der
  // konkrete Wortlaut dieses Errors kommt bei pdf.js 5.4.624 NICHT beim
  // Aufrufenden an — der Worker fängt eine abgelehnte "PasswordRequest"-
  // Antwort intern ab und sendet stattdessen immer seine eigene,
  // ursprüngliche PasswordException erneut (`pdf.worker.mjs`, `setupDoc` →
  // `onFailure`: `.catch(() => handler.send("DocException", ex))` — `ex`
  // ist die *ursprüngliche* Ausnahme, nicht das, womit `onPassword`
  // abgelehnt hat). `onPassword` sorgt hier also nur dafür, dass überhaupt
  // sofort abgelehnt wird (ein zusätzliches Sicherheitsnetz: pdf.js lehnt
  // ohne gesetztes `onPassword` bei dieser Version zwar ebenfalls schon von
  // sich aus ab, siehe `pdf.mjs`, `messageHandler.on("PasswordRequest", …)`
  // — aber dieses Verhalten ist an eine interne Falllogik gebunden, auf die
  // sich nicht production-kritisch verlassen werden soll). Die tatsächliche,
  // auf Deutsch verständliche Meldung entsteht erst unten, beim Abfangen der
  // abgelehnten `loadingTask.promise`.
  loadingTask.onPassword = (updatePassword: (password: string | Error) => void) => {
    updatePassword(new Error(PASSWORD_PROTECTED_MESSAGE))
  }

  const doc = await loadingTask.promise.catch((error: unknown) => {
    throw isPasswordException(error) ? new Error(PASSWORD_PROTECTED_MESSAGE) : error
  })

  try {
    const pages: PdfPage[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const items = await buildPdfItems(page)
      const orderedItems = groupItemsIntoLines(items).flat()
      const [x0, y0, x1, y1] = page.view
      pages.push({ items: orderedItems, width: x1 - x0, height: y1 - y0 })
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

// Zwei Startpositionen zählen als "derselbe Block", wenn sie höchstens so
// weit auseinanderliegen. Muss groß genug sein, um normale Einrückungen
// (z. B. Stichpunkte) noch demselben Block zuzuordnen, aber deutlich kleiner
// als COLUMN_MIN_GAP_PT — sonst verschmölzen zwei echte Spalten wieder zu
// einer.
const COLUMN_CLUSTER_GAP_PT = 36

// Erst ein Zwischenraum von dieser Breite zwischen zwei Blöcken gilt als
// Spaltenlücke statt als bloße Einrückung innerhalb einer Spalte. 100 pt
// liegt deutlich über üblichen Einrückungen (18–36 pt) und deutlich unter
// dem Abstand zweier Spalten eines A4-/Letter-Layouts mit Randspalte.
const COLUMN_MIN_GAP_PT = 100

// Ein Block zählt nur als eigenständige Spalte, wenn er einen spürbaren
// Anteil der Elemente der Seite trägt — eine einzelne verirrte
// Randnotiz oder Seitenzahl soll keine Zweispaltigkeit vortäuschen.
const COLUMN_MIN_SHARE = 0.2

/**
 * Erkennt zweispaltiges Layout an der Verteilung der Anfangs-x-Werte aller
 * Elemente einer Seite: liegen die Werte in zwei deutlich getrennten
 * Bändern, die beide einen spürbaren Anteil der Elemente tragen, gilt die
 * Seite als mehrspaltig.
 *
 * Dient ausschließlich als Signal für einen Warnhinweis in der Oberfläche
 * (Aufgabe 13): Die einspaltige Umwandlung in `pdfToDocx` liest eine solche
 * Seite trotzdem zeilenweise über die ganze Breite ein (siehe `extractPdf`)
 * — mit entsprechend unbrauchbarem Ergebnis. Diese Funktion repariert das
 * nicht, sie deckt es nur auf.
 */
export function detectMultiColumn(page: PdfPage): boolean {
  if (page.items.length === 0) {
    return false
  }

  const sortedX = page.items.map((item) => item.x).sort((a, b) => a - b)
  const clusters: number[][] = [[sortedX[0]!]]
  for (let i = 1; i < sortedX.length; i++) {
    const x = sortedX[i]!
    const currentCluster = clusters.at(-1)!
    if (x - currentCluster.at(-1)! <= COLUMN_CLUSTER_GAP_PT) {
      currentCluster.push(x)
    } else {
      clusters.push([x])
    }
  }

  const significantClusters = clusters.filter((cluster) => cluster.length / sortedX.length >= COLUMN_MIN_SHARE)
  if (significantClusters.length < 2) {
    return false
  }

  for (let i = 0; i < significantClusters.length - 1; i++) {
    const gap = significantClusters[i + 1]![0]! - significantClusters[i]!.at(-1)!
    if (gap >= COLUMN_MIN_GAP_PT) {
      return true
    }
  }
  return false
}
