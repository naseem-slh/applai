import type { Paragraph } from '@/lib/docx/model'

/**
 * Wie aus einem fortlaufenden Brief Seiten werden — und wie viel Leerraum
 * die Ansicht davon zeigt.
 *
 * Beides ist reine Rechnung über Zahlen und Texte, ohne DOM und ohne React,
 * damit die Fälle einzeln prüfbar sind: die zu hohe Seite, der übergroße
 * Absatz, der Brief ohne Absätze, der Lauf aus sieben Leerzeilen.
 */

/**
 * Teilt Absätze auf Seiten auf, gemessen an ihren tatsächlichen Höhen.
 *
 * **Getrennt wird nur zwischen Absätzen, nie in einem.** Der Absatztext im
 * DOM muss zeichengleich mit `Paragraph.text` bleiben (siehe
 * `documentSelection.ts`); ein über zwei Seitenkästen verteilter Absatz
 * wäre zwei Elemente, und jede Markierung zeigte danach auf die falsche
 * Stelle.
 *
 * Daraus folgt der eine Fall, in dem eine Seite ihr Maß überschreitet: ein
 * Absatz, der allein höher ist als eine Seite. Er wird **nicht** auf ein
 * frisches Blatt geschoben, sondern bleibt, wo er anfällt, und lässt seine
 * Seite wachsen. Die erste Fassung tat das Gegenteil, und das Ergebnis war
 * eine fast leere Seite davor — gemeldet als „warum ist der Text schon auf
 * Seite 2, da ist doch noch Platz". Überlaufen muss er so oder so; dann
 * lieber ohne verschenkten Platz.
 *
 * `pageHeight` ist die Höhe, die für Text zur Verfügung steht, also die
 * Seitenhöhe ohne Ränder. `gap` ist der Abstand zwischen zwei Absätzen; er
 * fällt nur zwischen ihnen an, nicht hinter dem letzten. Ist sie 0 — vor der ersten Messung —, kommt alles
 * auf eine Seite: Ohne Maß darf nicht getrennt werden, sonst bekäme jeder
 * Absatz sein eigenes Blatt.
 */
export function splitIntoPages(
  heights: readonly number[],
  pageHeight: number,
  gap = 0,
): number[][] {
  if (heights.length === 0) return [[]]
  if (pageHeight <= 0) return [heights.map((_, index) => index)]

  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  for (const [index, height] of heights.entries()) {
    // Der Abstand fällt nur **zwischen** zwei Absätzen an, nicht hinter dem
    // letzten. Ihn jedem Absatz zuzuschlagen verschenkte je Seite einen
    // Abstand.
    const needed = (current.length > 0 ? gap : 0) + height
    const fits = used + needed <= pageHeight
    // Ein Absatz, der auch allein auf keine Seite passt, gewinnt durch ein
    // frisches Blatt nichts — er liefe dort genauso über und ließe hier
    // eine Lücke.
    const fitsOnItsOwnPage = height <= pageHeight
    if (!fits && current.length > 0 && fitsOnItsOwnPage) {
      pages.push(current)
      current = []
      used = 0
    }
    // Nach einem Umbruch steht der Absatz am Kopf der neuen Seite und
    // kostet den Abstand nicht mehr — deshalb wird hier erneut gefragt und
    // nicht `needed` weiterverwendet.
    const cost = (current.length > 0 ? gap : 0) + height
    current.push(index)
    // Nie unter null: Eine Höhe darf negativ sein — die Ansicht drückt
    // damit aus, dass ein Absatz nicht nur nichts hoch ist, sondern auch
    // den Abstand vor sich aufhebt (siehe `collapsedEmptyParagraphs`).
    // Steht so einer am Kopf einer Seite, gibt es davor aber gar keinen
    // Abstand, den er aufheben könnte; ohne die Schranke zöge er der Seite
    // Platz ab, den sie nie ausgegeben hat.
    used = Math.max(0, used + cost)
  }

  pages.push(current)
  return pages
}

/**
 * Wie viele leere Zeilen hintereinander stehen bleiben, bevor der Rest
 * zusammenfällt.
 *
 * Eine. Was im Brief nacheinander leer steht, ist auf dem Papier ein
 * Abstand und auf dem Bildschirm nur Weg: Eine Leerzeile sagt „hier endet
 * ein Gedanke" bereits vollständig, jede weitere sagt dasselbe noch einmal.
 * Es standen einmal zwei, in der Annahme, zwei seien eine bewusste Lücke —
 * gemessen an einem wirklichen Anschreiben waren es aber vier und fünf, und
 * zwischen zwei Absätzen klaffte ein Drittel Seite.
 */
export const VISIBLE_EMPTY_RUN = 1

/**
 * Die Absätze, deren Höhe die Ansicht zusammenfallen lässt: jede leere
 * Zeile eines Laufs ab der zweiten.
 *
 * **Nur die Ansicht.** Die Absätze bleiben im Dokument, im DOM und im
 * Export — sie werden lediglich flach dargestellt. Sie aus dem DOM zu
 * nehmen hieße, ihre Offsets zu verlieren und sie unanklickbar zu machen;
 * sie aus dem Modell zu nehmen hieße, das Layout der Word-Datei zu ändern,
 * und genau das darf Applai nicht (siehe `docs/spec.md`, „Das Original mit
 * gepatchten Textstellen").
 *
 * Ein Absatz aus reinem Leerraum zählt als leer: Im Brief sieht er aus wie
 * eine Leerzeile, und der Nutzer unterscheidet die beiden nicht.
 */
export function collapsedEmptyParagraphs(paragraphs: readonly Paragraph[]): Set<number> {
  const collapsed = new Set<number>()
  let run = 0

  for (const paragraph of paragraphs) {
    if (paragraph.text.trim() === '') {
      run += 1
      if (run > VISIBLE_EMPTY_RUN) collapsed.add(paragraph.index)
    } else {
      run = 0
    }
  }

  return collapsed
}
