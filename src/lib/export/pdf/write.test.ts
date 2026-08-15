// Erzeugt PDF-Dateien und liest sie mit pdfjs-dist wieder ein. Läuft deshalb
// unter tsconfig.test.json (node:fs für Schriften und Fixtures) — siehe
// src/lib/docx/parse.test.ts.
import { describe, expect, it } from 'vitest'
import { extractPdf } from '../../pdf/extract'
import { loadFixtureFormat } from './fonts.testutils'
import { layoutDocument } from './layout'
import { writePdf } from './write'

const CREATED = new Date(2026, 7, 13, 12, 0, 0)

/**
 * Der Nachweis, auf den es ankommt: Die erzeugte Datei wird mit **einem
 * fremden Leser** wieder geöffnet — pdfjs, das im Projekt ohnehin für die
 * Gegenrichtung liegt. Was dort ankommt, kommt auch in jedem Betrachter und
 * in jedem Bewerbungsportal an.
 */
// Je Fixture einmal erzeugt und gelesen: pdfjs aufzurufen ist der teuerste
// Schritt im ganzen Ordner, und alle Prüfungen unten schauen sich dasselbe
// Ergebnis von verschiedenen Seiten an.
const roundTrips = new Map<string, ReturnType<typeof buildRoundTrip>>()

function buildRoundTrip(fileName: string) {
  return (async () => {
    const { format, fonts } = await loadFixtureFormat(fileName)
    const bytes = writePdf(layoutDocument(format, fonts), { created: CREATED })
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return { bytes, pages: await extractPdf(buffer as ArrayBuffer) }
  })()
}

async function roundTrip(fileName: string) {
  const cached = roundTrips.get(fileName) ?? buildRoundTrip(fileName)
  roundTrips.set(fileName, cached)
  return cached
}

describe('writePdf', () => {
  it('schreibt eine Datei, die sich als PDF ausweist', async () => {
    const { bytes } = await roundTrip('anschreiben-formatiert.docx')

    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.7')
    expect(new TextDecoder().decode(bytes.subarray(bytes.length - 6))).toBe('%%EOF\n')
  })

  it('erzeugt aus demselben Dokument dieselben Bytes', async () => {
    // Hier ausdrücklich zweimal gebaut und nicht über `roundTrip` geholt:
    // Der Zwischenspeicher gäbe sonst zweimal dasselbe Ergebnis zurück und
    // der Test prüfte sich selbst.
    const first = await buildRoundTrip('anschreiben-formatiert.docx')
    const second = await buildRoundTrip('anschreiben-formatiert.docx')

    expect(first.bytes).toEqual(second.bytes)
  })

  it('übernimmt Blattmaß und Seitenzahl aus dem Dokument', async () => {
    const { pages } = await roundTrip('anschreiben-formatiert.docx')

    expect(pages).toHaveLength(3)
    expect(pages[0].width).toBeCloseTo(595.3, 0)
    expect(pages[0].height).toBeCloseTo(841.9, 0)
  })

  /**
   * Die Zeichen müssen aus der Datei wieder herauskommen: Bewerbungsportale
   * lesen den Text aus dem PDF, um Felder vorzubelegen. Ein PDF, aus dem
   * nichts zu holen ist, kostet den Bewerber echte Nachteile.
   */
  it('gibt den Text wieder heraus, Umlaute eingeschlossen', async () => {
    const { pages } = await roundTrip('anschreiben-formatiert.docx')

    const text = pages.flatMap((page) => page.items.map((item) => item.text)).join(' ')
    expect(text).toContain('Sehr geehrte Damen und Herren,')
    expect(text).toContain('fünf Jahre Erfahrung')
    expect(text).toContain('Grüßen')
    expect(text).toContain('Erika Mustermann')
  })

  it('setzt den Text mit den Graden aus dem Dokument', async () => {
    const { pages } = await roundTrip('anschreiben-formatiert.docx')

    const greeting = pages[0].items.find((item) => item.text.startsWith('Sehr geehrte'))
    expect(greeting?.fontSize).toBeCloseTo(11, 0)

    const subject = pages[0].items.find((item) => item.text.startsWith('Bewerbung als'))
    expect(subject?.fontSize).toBeCloseTo(12, 0)
  })

  it('hält den linken Satzspiegelrand des Dokuments ein', async () => {
    const { pages } = await roundTrip('anschreiben-formatiert.docx')

    const greeting = pages[0].items.find((item) => item.text.startsWith('Sehr geehrte'))
    // w:left="1701" Twips sind 85,05 pt.
    expect(greeting?.x).toBeCloseTo(85.05, 1)
  })

  it('setzt die Kopfzeile auf jede Seite', async () => {
    const { pages } = await roundTrip('anschreiben-formatiert.docx')

    for (const page of pages) {
      expect(page.items.some((item) => item.text.includes('Erika Mustermann'))).toBe(true)
    }
  })

  it('kommt auch mit einer Datei ohne Formatvorlagen zurecht', async () => {
    const { pages } = await roundTrip('anschreiben.docx')

    expect(pages).toHaveLength(1)
    const text = pages[0].items.map((item) => item.text).join(' ')
    expect(text).toContain('Sehr geehrte Damen und Herren,')
    expect(text).toContain('Mit freundlichen Grüßen')
  })

  /** Ohne Eindampfen wögen schon zwei Schnitte über ein halbes Megabyte. */
  it('bleibt klein genug für einen Mailanhang', async () => {
    const { bytes } = await roundTrip('anschreiben-formatiert.docx')

    expect(bytes.length).toBeLessThan(100_000)
  })
})

/**
 * Der Nachweis am schwierigsten Fall: ein Anschreiben aus einer
 * PDF-Umwandlung, dessen Empfängeranschrift in einem schwebenden Textfeld
 * steht. Was hier bei pdfjs ankommt, kommt auch beim Bewerbungsportal an.
 */
describe('writePdf — schwebende Objekte', () => {
  it('bringt die Empfängeranschrift in die Datei', async () => {
    const { pages } = await roundTrip('anschreiben-schwebend.docx')

    const text = pages.flatMap((page) => page.items).map((item) => item.text).join(' ')
    expect(text).toContain('Musterwerk GmbH')
    expect(text).toContain('10827 Berlin')
  })

  it('setzt sie an ihre Blattkoordinate, nicht in den Fluss', async () => {
    const { pages } = await roundTrip('anschreiben-schwebend.docx')

    const company = pages[0].items.find((item) => item.text.startsWith('Musterwerk'))
    expect(company).toBeDefined()
    // Kastenrand 70 pt plus 7,2 pt Innenabstand.
    expect(company?.x).toBeCloseTo(77.2, 0)
  })

  it('nimmt die Anschrift genau einmal auf', async () => {
    const { pages } = await roundTrip('anschreiben-schwebend.docx')

    const hits = pages
      .flatMap((page) => page.items)
      .filter((item) => item.text.includes('Musterwerk'))
    expect(hits).toHaveLength(1)
  })

  it('macht aus dem Wingdings-Trenner einen Aufzählungspunkt', async () => {
    const { pages } = await roundTrip('anschreiben-schwebend.docx')

    const text = pages.flatMap((page) => page.items).map((item) => item.text).join(' ')
    expect(text).toContain('•')
    expect(text).not.toContain('\uF09F')
  })

  it('bricht „meine" nicht zwischen den Läufen um', async () => {
    const { pages } = await roundTrip('anschreiben-schwebend.docx')

    const text = pages.flatMap((page) => page.items).map((item) => item.text).join(' ')
    expect(text).toContain('meine Mitarbeit')
  })
})
