#!/usr/bin/env node
// Erzeugt die `.pdf`-Testfixtures unter `tests/fixtures/` aus handgeschriebener
// PDF-Syntax (%PDF-1.4, Katalog, Seitenbaum, Type1-Basisschriften). Bewusst
// kein LibreOffice (in dieser Umgebung nicht verfügbar) und kein Download
// (G2) — Textinhalt, Position und Schriftgröße jedes Elements müssen exakt
// bekannt sein, damit extract.test.ts / toDocx.test.ts sie prüfen können.
// Zum Neuerzeugen: `node tests/fixtures/build-pdf-fixtures.mjs`.
//
// Die Dateien verzichten bewusst auf eine echte Kreuzverweistabelle (xref):
// pdf.js baut sie beim Lesen ohnehin per Objekt-Scan neu auf ("Indexing all
// PDF objects", geprüft), das spart hier fehleranfällige Byte-Offset-
// Buchführung von Hand.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(fileURLToPath(import.meta.url))

// A4 in PDF-Punkten (1/72 Zoll), gerundet — wie die übrigen Fixtures im
// Projekt orientieren sich Maße an einem realen deutschen Lebenslauf.
const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842

// WinAnsiEncoding-Bytewert für "•" (U+2022) außerhalb des ASCII-Bereichs.
// Ohne explizite `/Encoding` einigen sich Schriftart und Leser nicht
// zwangsläufig auf dieselbe Zuordnung — mit `/WinAnsiEncoding` decodiert
// pdf.js Byte 0x95 zuverlässig zu "•", geprüft per Probelauf gegen
// pdfjs-dist. Die übrigen Stichpunktmarker ("-", "–", "*") sind
// ASCII-Zeichen (bzw. werden in toDocx.test.ts direkt an konstruierten
// PdfItem-Objekten geprüft, ohne den Umweg über eine PDF-Byte-Kodierung).
const BULLET_CHAR = '\x95' // •

/**
 * Baut die Bytes einer mehrseitigen PDF-Datei.
 *
 * @param {Array<{ texts: Array<{ font: 'Helvetica' | 'Helvetica-Bold', size: number, x: number, y: number, text: string }> }>} pages
 */
function buildPdf(pages) {
  const objects = [] // 1-indiziert; objects[0] bleibt ungenutzt.
  let nextObjectNumber = 1
  const allocate = () => nextObjectNumber++

  const catalogNumber = allocate()
  const pagesNumber = allocate()

  const fontNumberByBaseFont = new Map()
  function fontObjectNumber(baseFont) {
    if (!fontNumberByBaseFont.has(baseFont)) {
      const number = allocate()
      objects[number] = `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`
      fontNumberByBaseFont.set(baseFont, number)
    }
    return fontNumberByBaseFont.get(baseFont)
  }

  const pageNumbers = []
  for (const page of pages) {
    const pageNumber = allocate()
    const contentNumber = allocate()
    pageNumbers.push(pageNumber)

    const fontsOnPage = [...new Set(page.texts.map((t) => t.font))]
    const aliasByFont = new Map(fontsOnPage.map((font, index) => [font, `F${index + 1}`]))
    const fontResourceEntries = fontsOnPage.map((font) => `/${aliasByFont.get(font)} ${fontObjectNumber(font)} 0 R`).join(' ')

    const contentStream =
      page.texts
        .map((t) => `BT /${aliasByFont.get(t.font)} ${t.size} Tf ${t.x} ${t.y} Td (${escapePdfString(t.text)}) Tj ET`)
        .join('\n') + '\n'
    // latin1: Bytewerte 0x00–0xFF werden 1:1 übernommen (wichtig für
    // BULLET_CHAR, siehe oben) — bei 'utf8' würde dieses Zeichen in eine
    // Mehrbyte-Sequenz zerlegt und der WinAnsi-Bytewert stimmte nicht mehr.
    const contentBytes = Buffer.from(contentStream, 'latin1')
    objects[contentNumber] = `<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream`

    objects[pageNumber] =
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << ${fontResourceEntries} >> >> /Contents ${contentNumber} 0 R >>`
  }

  objects[catalogNumber] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`
  objects[pagesNumber] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`

  let body = '%PDF-1.4\n'
  for (let number = 1; number < objects.length; number++) {
    if (objects[number] === undefined) continue
    body += `${number} 0 obj\n${objects[number]}\nendobj\n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root ${catalogNumber} 0 R >>\n%%EOF`
  return Buffer.from(body, 'latin1')
}

// Runde Klammern und Backslashes müssen in PDF-Literal-Strings maskiert
// werden — keine der Fixtures unten braucht das aktuell, die Funktion steht
// trotzdem hier, damit ein künftiger Fixture-Text nicht still falsch würde.
function escapePdfString(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function writePdf(fileName, pages) {
  writeFileSync(join(fixturesDir, fileName), buildPdf(pages))
  console.log(`geschrieben: ${fileName}`)
}

// --- Fixture (a): einspaltiger Lebenslauf ---
// Deckt beide Überschrift-Heuristiken ab (großer Name: über dem
// Größen-Schwellwert; Abschnittsüberschriften: fett, aber mit 13 pt unter
// dem Schwellwert), einen über drei Zeilen umbrochenen Absatz (kleiner,
// regelmäßiger Zeilenabstand von 14 pt), einen bewussten Absatzwechsel
// (26 pt Abstand, > 1,5× der 14-pt-Grundlinie) und je einen Stichpunkt mit
// "•" und mit "-". Alle Elemente stehen bei x=72 (eine Spalte) — Gegenstück
// zu Fixture (b) für detectMultiColumn.
{
  const HEADING = 'Helvetica-Bold'
  const BODY = 'Helvetica'
  writePdf('lebenslauf.pdf', [
    {
      texts: [
        { font: HEADING, size: 22, x: 72, y: 780, text: 'Anna Beispiel' },
        { font: HEADING, size: 13, x: 72, y: 750, text: 'Berufserfahrung' },
        { font: BODY, size: 11, x: 72, y: 730, text: 'Mehrjaehrige Erfahrung in der Webentwicklung mit Fokus auf' },
        { font: BODY, size: 11, x: 72, y: 716, text: 'moderne Frontend-Frameworks, agile Teams sowie kontinuierliche' },
        { font: BODY, size: 11, x: 72, y: 702, text: 'Qualitaetssicherung in produktiven Umgebungen.' },
        { font: BODY, size: 11, x: 72, y: 676, text: 'Zustaendig fuer Konzeption und Umsetzung neuer Module.' },
        { font: HEADING, size: 13, x: 72, y: 646, text: 'Kernkompetenzen' },
        { font: BODY, size: 11, x: 72, y: 626, text: `${BULLET_CHAR} Bullet mit Punktzeichen` },
        { font: BODY, size: 11, x: 72, y: 610, text: '- Bullet mit Bindestrich' },
      ],
    },
  ])
}

// --- Fixture (b): zweispaltige Seite ---
// Zwei x-Bänder (72 und 320, Abstand 248 pt) mit je fünf Zeilen — Gegenstück
// zu Fixture (a) für detectMultiColumn (dort: false, hier: true). Der
// Lesereihenfolge wird hier bewusst kein Sinn unterstellt (siehe extract.ts:
// die "ehrliche" einspaltige Umwandlung liest zeilenweise über die ganze
// Breite, das ist bei echtem Zweispalten-Layout absichtlich Mus — dafür
// warnt detectMultiColumn).
{
  const BODY = 'Helvetica'
  const rows = [760, 740, 720, 700, 680]
  const texts = []
  rows.forEach((y, index) => {
    const n = index + 1
    texts.push({ font: BODY, size: 11, x: 72, y, text: `Linke Spalte Zeile ${n}` })
    texts.push({ font: BODY, size: 11, x: 320, y, text: `Rechte Spalte Zeile ${n}` })
  })
  writePdf('lebenslauf-zweispaltig.pdf', [{ texts }])
}

// --- Fixture (c): zweiseitiges Dokument ---
// Belegt die Seitenbehandlung: extractPdf muss zwei PdfPage-Einträge
// liefern, deren Elemente sich nicht vermischen; pdfToDocx muss den Inhalt
// beider Seiten übernehmen (mit Seitenumbruch vor dem ersten Absatz der
// zweiten Seite, siehe toDocx.test.ts). Die erste Zeile jeder Seite ist fett
// (Überschrift) statt einer zweiten Fließtextzeile: Mit nur einer
// Fließtextzeile je Seite gibt es keinen zweiten Zeilenabstand, an dem sich
// ein "üblicher" Absatzabstand ablesen ließe — diese Fixture soll allein die
// Seitenaufteilung prüfen, nicht das (in Fixture (a) bereits abgedeckte)
// Zusammenfassen mehrerer Fließtextzeilen zu einem Absatz.
{
  const HEADING = 'Helvetica-Bold'
  const BODY = 'Helvetica'
  writePdf('lebenslauf-zwei-seiten.pdf', [
    {
      texts: [
        { font: HEADING, size: 13, x: 72, y: 780, text: 'Erste Seite' },
        { font: BODY, size: 11, x: 72, y: 760, text: 'Text auf der ersten Seite.' },
      ],
    },
    {
      texts: [
        { font: HEADING, size: 13, x: 72, y: 780, text: 'Zweite Seite' },
        { font: BODY, size: 11, x: 72, y: 760, text: 'Text auf der zweiten Seite.' },
      ],
    },
  ])
}
