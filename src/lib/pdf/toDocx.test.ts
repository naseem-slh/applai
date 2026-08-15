// Lädt die reale PDF-Fixture per node:fs/promises — läuft deshalb unter
// tsconfig.test.json, nicht unter tsconfig.app.json (siehe Begründung in
// src/lib/docx/parse.test.ts). Die reinen Klassifikations-Tests unten
// bräuchten das nicht, liegen aber aus Übersichtlichkeit in derselben Datei.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseDocx } from '../docx/parse'
import { extractPdf, type PdfItem, type PdfPage } from './extract'
import { pdfToDocx } from './toDocx'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadPdfPages(fileName: string): Promise<PdfPage[]> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return extractPdf(arrayBuffer)
}

// Parst das von pdfToDocx erzeugte Blob mit dem vorhandenen, bereits
// getesteten Parser — er ist das Kontrollinstrument dieser Tests (siehe
// Aufgabenstellung: "du hast einen Parser, nutze ihn als Referenz").
async function roundTrip(pages: PdfPage[]) {
  const blob = await pdfToDocx(pages)
  const arrayBuffer = await blob.arrayBuffer()
  return { blob, arrayBuffer, doc: await parseDocx(arrayBuffer) }
}

function item(overrides: Partial<PdfItem> & Pick<PdfItem, 'text' | 'x' | 'y'>): PdfItem {
  return { fontSize: 11, fontName: 'Helvetica', bold: false, ...overrides }
}

describe('pdfToDocx — Klassifikation und Absatzbildung (konstruierte Seite)', () => {
  // Deckt beide Überschrift-Zweige (Größe und fett), das Verschmelzen
  // umbrochener Fließtextzeilen zu einem Absatz, den Absatzumbruch bei
  // auffällig größerem Zeilenabstand sowie alle vier Stichpunktmarker ab.
  const page: PdfPage = {
    width: 595,
    height: 842,
    items: [
      item({ text: 'Titel Gross', x: 72, y: 220, fontSize: 24 }),
      item({ text: 'Abschnitt Fett', x: 72, y: 200, fontSize: 11, bold: true }),
      item({ text: 'Zeile eins des Absatzes', x: 72, y: 180 }),
      item({ text: 'Zeile zwei desselben Absatzes.', x: 72, y: 166 }),
      item({ text: 'Zeile drei desselben Absatzes.', x: 72, y: 152 }),
      item({ text: 'Neuer Absatz nach grosser Luecke.', x: 72, y: 126 }),
      item({ text: '• Punktmarker', x: 72, y: 106 }),
      item({ text: '- Bindestrichmarker', x: 72, y: 90 }),
      item({ text: '– Gedankenstrichmarker', x: 72, y: 74 }),
      item({ text: '* Sternmarker', x: 72, y: 58 }),
    ],
  }

  it('bildet genau die erwarteten acht Absätze in Lesereihenfolge', async () => {
    const { doc } = await roundTrip([page])

    expect(doc.paragraphs.map((p) => p.text)).toEqual([
      'Titel Gross',
      'Abschnitt Fett',
      'Zeile eins des Absatzes Zeile zwei desselben Absatzes. Zeile drei desselben Absatzes.',
      'Neuer Absatz nach grosser Luecke.',
      'Punktmarker',
      'Bindestrichmarker',
      'Gedankenstrichmarker',
      'Sternmarker',
    ])
  })

  it('setzt bei einer großen Schrift w:b und die verdoppelte Schriftgröße in Halbpunkten', async () => {
    const { doc } = await roundTrip([page])
    const [title] = doc.paragraphs

    expect(title!.node.getElementsByTagName('w:b')).toHaveLength(1)
    expect(title!.node.getElementsByTagName('w:sz')[0]?.getAttribute('w:val')).toBe('48')
  })

  it('erkennt eine durchgehend fette Zeile auch unterhalb der Größenschwelle als Überschrift', async () => {
    const { doc } = await roundTrip([page])
    const section = doc.paragraphs[1]!

    expect(section.text).toBe('Abschnitt Fett')
    expect(section.node.getElementsByTagName('w:b')).toHaveLength(1)
    expect(section.node.getElementsByTagName('w:sz')[0]?.getAttribute('w:val')).toBe('22')
  })

  it('rückt Stichpunkt-Absätze ein und lässt Fließtext-Absätze ohne Einrückung', async () => {
    const { doc } = await roundTrip([page])
    const bullet = doc.paragraphs[4]!
    const body = doc.paragraphs[2]!

    expect(bullet.node.getElementsByTagName('w:ind')[0]?.getAttribute('w:left')).toBe('720')
    expect(body.node.getElementsByTagName('w:ind')).toHaveLength(0)
    expect(body.node.getElementsByTagName('w:b')).toHaveLength(0)
  })

  it.each([
    ['•', 4, 'Punktmarker'],
    ['-', 5, 'Bindestrichmarker'],
    ['–', 6, 'Gedankenstrichmarker'],
    ['*', 7, 'Sternmarker'],
  ])('erkennt den Marker "%s" als Stichpunkt und entfernt ihn aus dem Text', async (_marker, index, expectedText) => {
    const { doc } = await roundTrip([page])
    const paragraph = doc.paragraphs[index as number]!

    expect(paragraph.text).toBe(expectedText)
    expect(paragraph.node.getElementsByTagName('w:ind')).toHaveLength(1)
  })
})

describe('pdfToDocx — Struktur der erzeugten .docx-Datei', () => {
  const page: PdfPage = { width: 595, height: 842, items: [item({ text: 'Nur ein Absatz.', x: 72, y: 700 })] }

  it('liefert ein Blob mit dem Word-MIME-Typ', async () => {
    const blob = await pdfToDocx([page])
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })

  it('enthält alle für Word nötigen Archivteile', async () => {
    const blob = await pdfToDocx([page])
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))

    expect(Object.keys(zip).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml'].sort(),
    )
  })

  it('enthält eine w:sectPr in word/document.xml', async () => {
    const { doc } = await roundTrip([page])
    expect(doc.doc.getElementsByTagName('w:sectPr')).toHaveLength(1)
  })

  it('lässt sich mit parseDocx wieder einlesen und liefert den erwarteten Fließtext', async () => {
    const { doc } = await roundTrip([page])
    expect(doc.text).toBe('Nur ein Absatz.')
  })

  it('erzeugt bei einer Seite ganz ohne Text dennoch ein gültiges, parsbares Dokument', async () => {
    const emptyPage: PdfPage = { width: 595, height: 842, items: [] }
    const { doc } = await roundTrip([emptyPage])
    expect(doc.paragraphs).toHaveLength(1)
    expect(doc.paragraphs[0]!.text).toBe('')
  })
})

describe('pdfToDocx — Zusammenspiel mit extractPdf (echte Fixtures)', () => {
  it('wandelt lebenslauf.pdf in die erwarteten sieben Absätze um (Überschriften, verschmolzener Absatz, Absatzwechsel, zwei Stichpunkte)', async () => {
    const pages = await loadPdfPages('lebenslauf.pdf')
    const { doc } = await roundTrip(pages)

    expect(doc.paragraphs.map((p) => p.text)).toEqual([
      'Anna Beispiel',
      'Berufserfahrung',
      'Mehrjaehrige Erfahrung in der Webentwicklung mit Fokus auf moderne Frontend-Frameworks, agile Teams sowie kontinuierliche Qualitaetssicherung in produktiven Umgebungen.',
      'Zustaendig fuer Konzeption und Umsetzung neuer Module.',
      'Kernkompetenzen',
      'Bullet mit Punktzeichen',
      'Bullet mit Bindestrich',
    ])

    const [name] = doc.paragraphs
    expect(name!.node.getElementsByTagName('w:b')).toHaveLength(1)
    expect(name!.node.getElementsByTagName('w:sz')[0]?.getAttribute('w:val')).toBe('44')
  })

  it('übernimmt beide Seiten von lebenslauf-zwei-seiten.pdf und markiert den ersten Absatz der zweiten Seite mit w:pageBreakBefore', async () => {
    const pages = await loadPdfPages('lebenslauf-zwei-seiten.pdf')
    const { doc } = await roundTrip(pages)

    expect(doc.paragraphs.map((p) => p.text)).toEqual([
      'Erste Seite',
      'Text auf der ersten Seite.',
      'Zweite Seite',
      'Text auf der zweiten Seite.',
    ])

    expect(doc.paragraphs[0]!.node.getElementsByTagName('w:pageBreakBefore')).toHaveLength(0)
    expect(doc.paragraphs[1]!.node.getElementsByTagName('w:pageBreakBefore')).toHaveLength(0)
    expect(doc.paragraphs[2]!.node.getElementsByTagName('w:pageBreakBefore')).toHaveLength(1)
    expect(doc.paragraphs[3]!.node.getElementsByTagName('w:pageBreakBefore')).toHaveLength(0)
  })
})
