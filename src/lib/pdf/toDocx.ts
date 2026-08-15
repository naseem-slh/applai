import { zipSync, type Zippable } from 'fflate'
import { groupItemsIntoLines, type PdfItem, type PdfPage } from './extract'

// Eine Zeile gilt als Überschrift, wenn ihre dominante Schriftgröße den
// Median der Schriftgrößen auf der Seite um diesen Faktor überschreitet.
// 1.3 (30 % größer) trennt sicher eine bewusst größer gesetzte Überschrift
// von normalen Schwankungen innerhalb des Fließtexts (z. B. hochgestellte
// Zeichen), ohne bei knapp größerem Text (z. B. 12 pt gegenüber 11 pt
// Median) fälschlich anzuschlagen.
const HEADING_FONT_SIZE_RATIO = 1.3

// Ein Zeilenabstand, der mehr als das so-vielfache des auf der Seite
// üblichen (Median-)Zeilenabstands beträgt, beginnt einen neuen Absatz.
// 1.5 lässt normale Zeilendurchschüsse (auch mit kleinen Rundungsdifferenzen)
// im selben Absatz, trennt aber eine bewusste Leerzeile oder einen größeren
// Absatzabstand zuverlässig ab.
const PARAGRAPH_GAP_FACTOR = 1.5

// Marker, die eine Zeile als Stichpunkt kennzeichnen (Aufgabenstellung).
// Nur Zeichen an anführender Position zählen — mittig im Fließtext sind das
// gewöhnliche Satzzeichen.
const BULLET_MARKERS = ['•', '-', '–', '*']

// Einrückung eines Stichpunkt-Absatzes: 720 Twips = 0,5 Zoll, der in Word
// übliche Standardwert für eine Listenebene.
const BULLET_INDENT_TWIPS = 720

const DOCUMENT_XML_PATH = 'word/document.xml'
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`

const PACKAGE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`

// Leer, weil die Beta-Umwandlung weder Bilder, Kopf-/Fußzeilen noch
// Hyperlinks erzeugt — ein Word-Dokument ohne diesen Teil gilt manchen
// Prüfwerkzeugen dennoch als beschädigt, siehe Aufgabenstellung.
const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
`

// DIN-A4-Maße in Twips (1/1440 Zoll) mit 2 cm Rand — reine Formsache für
// eine gültige Datei, die einspaltige Beta-Umwandlung beansprucht keine
// layoutgetreue Wiedergabe.
const SECTION_PROPERTIES_XML =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'

type LineType = 'heading' | 'bullet' | 'body'

interface ClassifiedLine {
  type: LineType
  text: string
  fontSize: number
  y: number
}

interface ParagraphBlock {
  type: LineType
  text: string
  fontSize: number
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

// Die "dominante" Schriftgröße einer Zeile: die des längsten Textelements.
// Ein einzelnes fett gesetztes Wort in sonst normal großem Text soll die
// ganze Zeile nicht als Überschrift erscheinen lassen; das lange Element
// bestimmt den optischen Eindruck der Zeile.
function dominantFontSize(line: PdfItem[]): number {
  return line.reduce((longest, item) => (item.text.length > longest.text.length ? item : longest)).fontSize
}

// Die Zeile als zusammenhängender Text, in x-Reihenfolge (siehe
// `groupItemsIntoLines`). Es wird bewusst kein Leerzeichen zwischen
// Elementen eingefügt: Ein Leerzeichen zwischen zwei Wörtern derselben
// Quellzeile steckt bereits im Text des davorliegenden Elements, sobald ein
// Schriftwechsel mitten im Wort pdf.js nicht dazu zwingt, das Leerzeichen
// als eigenes Element abzuspalten.
function lineText(line: PdfItem[]): string {
  return line.map((item) => item.text).join('')
}

function classifyLine(line: PdfItem[], medianFontSize: number): ClassifiedLine {
  const text = lineText(line)
  const fontSize = dominantFontSize(line)
  const y = line[0]!.y

  const isHeading = line.every((item) => item.bold) || fontSize >= medianFontSize * HEADING_FONT_SIZE_RATIO
  if (isHeading) {
    return { type: 'heading', text: text.trim(), fontSize, y }
  }

  const marker = BULLET_MARKERS.find((candidate) => text.startsWith(candidate))
  if (marker !== undefined) {
    return { type: 'bullet', text: text.slice(marker.length).trimStart(), fontSize, y }
  }

  return { type: 'body', text, fontSize, y }
}

// Median der Zeilenabstände (y-Differenz) zwischen zwei *unmittelbar
// aufeinanderfolgenden Fließtextzeilen* — der Bezugswert für "auffällig
// größerer Abstand" beim Absatzumbruch. Bewusst nur Fließtext-zu-Fließtext-
// Abstände: Der Abstand vor/nach einer Überschrift ist typischerweise
// größer als der reguläre Zeilendurchschuss und würde den Median sonst nach
// oben verzerren — genau die Fälle, die als eigener Absatz erkannt werden
// sollen, verschwämmen dann mit dem "normalen" Abstand. 0, wenn es weniger
// als zwei solcher Paare gibt: Dann lässt sich kein üblicher Abstand
// ermitteln, und keine Zeile wird verschmolzen (sicherer Rückfall).
function medianBodyLineSpacing(classified: ClassifiedLine[]): number {
  const gaps: number[] = []
  for (let i = 1; i < classified.length; i++) {
    const previous = classified[i - 1]!
    const current = classified[i]!
    if (previous.type === 'body' && current.type === 'body') {
      gaps.push(previous.y - current.y)
    }
  }
  return median(gaps)
}

/**
 * Fasst klassifizierte Zeilen zu Word-Absätzen zusammen.
 *
 * Überschriften und Stichpunkte bilden immer einen eigenen Absatz — auch
 * wenn ihr Zeilenabstand zum Nachbarn klein ist, zwei aufeinanderfolgende
 * Stichpunkte sollen nicht zu einem Absatz verschmelzen. Fließtextzeilen
 * verschmelzen dagegen mit der vorigen Fließtextzeile, solange ihr
 * Zeilenabstand nicht auffällig größer ist als der auf der Seite übliche
 * (siehe `medianBodyLineSpacing`) — das rekonstruiert im PDF umgebrochene
 * Absätze zu einem zusammenhängenden Word-Absatz.
 */
function buildParagraphBlocks(lines: PdfItem[][], medianFontSize: number): ParagraphBlock[] {
  const classified = lines.map((line) => classifyLine(line, medianFontSize))
  const gapThreshold = medianBodyLineSpacing(classified) * PARAGRAPH_GAP_FACTOR

  const blocks: ParagraphBlock[] = []
  classified.forEach((current, index) => {
    const previous = index > 0 ? classified[index - 1] : undefined
    const gap = previous ? previous.y - current.y : Infinity
    const canMergeWithPrevious = current.type === 'body' && previous?.type === 'body' && gap <= gapThreshold

    if (canMergeWithPrevious) {
      const block = blocks.at(-1)!
      block.text = `${block.text} ${current.text}`.trim()
    } else {
      blocks.push({ type: current.type, text: current.text, fontSize: current.fontSize })
    }
  })
  return blocks
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Markiert den ersten Absatz einer neuen (Original-)Seite: `w:pageBreakBefore`
// steht in `w:pPr`, ist also für das Textmodell aus `parse.ts` unsichtbar
// (das liest nur `w:r`-Läufe) — anders als ein `w:br` im Fließtext, der als
// zusätzliches Zeichen im Absatztext auftauchen würde, obwohl er keinen
// eigenen Absatz darstellt.
function paragraphXml(block: ParagraphBlock, startsNewPage: boolean): string {
  const text = escapeXmlText(block.text)
  const pageBreak = startsNewPage ? '<w:pageBreakBefore/>' : ''

  switch (block.type) {
    case 'heading': {
      // w:sz ist in Halbpunkten anzugeben (OOXML-Konvention). w:b/w:sz
      // stehen nur im Lauf (w:r/w:rPr) — der sichtbare Text. Eine Kopie in
      // w:pPr/w:rPr würde nur das unsichtbare Absatzmarkzeichen betreffen
      // (die Formatierung, die ein direkt danach eingegebener neuer Absatz
      // erben würde) und ist für die Beta-Umwandlung unnötig.
      const halfPoints = Math.round(block.fontSize * 2)
      const pPr = pageBreak ? `<w:pPr>${pageBreak}</w:pPr>` : ''
      return `<w:p>${pPr}<w:r><w:rPr><w:b/><w:sz w:val="${halfPoints}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
    }
    case 'bullet':
      return `<w:p><w:pPr>${pageBreak}<w:ind w:left="${BULLET_INDENT_TWIPS}"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
    case 'body': {
      const pPr = pageBreak ? `<w:pPr>${pageBreak}</w:pPr>` : ''
      return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
    }
  }
}

/**
 * Wandelt extrahierte PDF-Seiten in ein **einspaltiges** Word-Dokument um
 * (Beta, siehe Aufgabenstellung: Layouttreue ist ausdrücklich kein Ziel
 * dieser Stufe). Schreibt das minimale OOXML-Gerüst selbst und packt es mit
 * `fflate` — dieselbe Technik, mit der auch
 * `tests/fixtures/build-fixtures.mjs` seine `.docx`-Fixtures erzeugt (siehe
 * Commit-Nachricht für die Begründung gegen eine zusätzliche Bibliothek,
 * G9).
 *
 * Jede Seite wird zeilen- und absatzweise eingelesen (siehe
 * `groupItemsIntoLines`), Zeilen mit deutlich größerer oder durchgehend
 * fetter Schrift werden zu Überschriften, Zeilen mit einem der Marker
 * `• - – *` zu eingerückten Stichpunkt-Absätzen, alles andere zu
 * Fließtext-Absätzen (siehe `classifyLine`). Der erste Absatz jeder Seite
 * außer der ersten trägt `w:pageBreakBefore`, damit die Seitenaufteilung des
 * Originals wenigstens als Seitenumbruch erkennbar bleibt, auch wenn Spalten
 * und genaue Positionen verloren gehen.
 */
export async function pdfToDocx(pages: PdfPage[]): Promise<Blob> {
  const paragraphsXml: string[] = []

  pages.forEach((page, pageIndex) => {
    const lines = groupItemsIntoLines(page.items)
    const medianFontSize = median(page.items.map((item) => item.fontSize))
    const blocks = buildParagraphBlocks(lines, medianFontSize)
    blocks.forEach((block, blockIndex) => {
      const startsNewPage = pageIndex > 0 && blockIndex === 0
      paragraphsXml.push(paragraphXml(block, startsNewPage))
    })
  })

  // Ein Textkörper ganz ohne Absatz vor w:sectPr gilt manchen Word-Versionen
  // als beschädigt — bei einer (seltenen) Seite ganz ohne erkannten Text
  // bleibt wenigstens eine Leerzeile stehen.
  if (paragraphsXml.length === 0) {
    paragraphsXml.push('<w:p/>')
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}>
  <w:body>
${paragraphsXml.join('\n')}
${SECTION_PROPERTIES_XML}
  </w:body>
</w:document>
`

  const encoder = new TextEncoder()
  const zippable: Zippable = {
    '[Content_Types].xml': encoder.encode(CONTENT_TYPES_XML),
    '_rels/.rels': encoder.encode(PACKAGE_RELS_XML),
    'word/_rels/document.xml.rels': encoder.encode(DOCUMENT_RELS_XML),
    [DOCUMENT_XML_PATH]: encoder.encode(documentXml),
  }

  return new Blob([zipSync(zippable)], { type: DOCX_MIME_TYPE })
}
