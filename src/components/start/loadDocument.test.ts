// Lädt Fixtures per node:fs/promises von der Platte und läuft deshalb unter
// tsconfig.test.json — dieselbe Begründung wie in src/lib/docx/parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DocumentLoadError, loadDocument, loadPdfText, pdfPagesToText } from './loadDocument'
import { groupItemsIntoLines, type PdfItem, type PdfPage } from '@/lib/pdf/extract'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

// pdf.js braucht für die größeren Fixtures spürbar länger als das globale
// Test-Timeout auf einem langsamen Rechner erlaubt.
const PDF_TIMEOUT_MS = 30_000

async function fixtureFile(fileName: string, type: string): Promise<File> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  return new File([new Uint8Array(buffer)], fileName, { type })
}

function item(text: string, x: number, y: number): PdfItem {
  return { text, x, y, fontSize: 11, fontName: 'Helvetica', bold: false }
}

function page(items: PdfItem[]): PdfPage {
  return { items, width: 595, height: 842 }
}

describe('pdfPagesToText', () => {
  it('stellt Zeilen und Seitenumbrüche wieder her', () => {
    const text = pdfPagesToText(
      [
        page([item('Sehr', 72, 700), item('geehrte', 100, 700), item('Damen', 72, 680)]),
        page([item('Zweite Seite', 72, 700)]),
      ],
      groupItemsIntoLines,
    )

    expect(text).toBe('Sehr geehrte\nDamen\n\nZweite Seite')
  })

  it('lässt leere Seiten weg, statt Leerzeilen zu häufen', () => {
    expect(pdfPagesToText([page([]), page([item('Text', 72, 700)])], groupItemsIntoLines)).toBe('Text')
  })
})

describe('loadDocument', () => {
  it('liest eine Word-Datei und behält ihre Bytes', async () => {
    const file = await fixtureFile(
      'anschreiben.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    const loaded = await loadDocument(file)

    expect(loaded.source).toBe('docx')
    expect(loaded.fileName).toBe('anschreiben.docx')
    expect(loaded.multiColumn).toBe(false)
    expect(loaded.text.length).toBeGreaterThan(0)
    // Die Bytes müssen unverändert weitergereicht werden: Aufgabe 3 patcht
    // genau dieses Archiv, damit das Layout des Originals stehen bleibt.
    expect(loaded.docxBase.byteLength).toBe(file.size)
  })

  it(
    'liest ein PDF, wandelt es nach Word um und meldet einspaltiges Layout als solches',
    async () => {
      const loaded = await loadDocument(await fixtureFile('lebenslauf.pdf', 'application/pdf'))

      expect(loaded.source).toBe('pdf')
      expect(loaded.multiColumn).toBe(false)
      expect(loaded.text.length).toBeGreaterThan(0)
      // Umgewandelt, nicht durchgereicht: Was hier herauskommt, ist ein
      // .docx-Archiv, aus dem `parseDocx` gelesen hat.
      expect(loaded.docxBase.byteLength).toBeGreaterThan(0)
    },
    PDF_TIMEOUT_MS,
  )

  it(
    'meldet ein mehrspaltiges PDF als mehrspaltig',
    async () => {
      const loaded = await loadDocument(
        await fixtureFile('lebenslauf-zweispaltig.pdf', 'application/pdf'),
      )

      expect(loaded.source).toBe('pdf')
      expect(loaded.multiColumn).toBe(true)
    },
    PDF_TIMEOUT_MS,
  )

  it(
    'gibt bei einem passwortgeschützten PDF einen eigenen Grund zurück, keine fremde Meldung',
    async () => {
      // Der Text der Ausnahme aus extract.ts ist nicht übersetzt und darf
      // deshalb nie in der Oberfläche landen (G8).
      await expect(
        loadDocument(await fixtureFile('verschluesselt.pdf', 'application/pdf')),
      ).rejects.toMatchObject({ reason: 'passwordProtected' })
    },
    PDF_TIMEOUT_MS,
  )

  it('lehnt ein unbekanntes Format ab, ohne es zu öffnen', async () => {
    const file = new File(['Nur Text'], 'anschreiben.txt', { type: 'text/plain' })

    await expect(loadDocument(file)).rejects.toBeInstanceOf(DocumentLoadError)
    await expect(loadDocument(file)).rejects.toMatchObject({ reason: 'unsupportedType' })
  })

  it('meldet eine kaputte Word-Datei als unlesbar', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'kaputt.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    await expect(loadDocument(file)).rejects.toMatchObject({ reason: 'unreadable' })
  })
})

describe('loadPdfText', () => {
  it(
    'liefert den Text einer Anzeige, ohne sie nach Word umzuwandeln',
    async () => {
      const text = await loadPdfText(await fixtureFile('lebenslauf.pdf', 'application/pdf'))

      expect(text.length).toBeGreaterThan(0)
      expect(text).toContain('\n')
    },
    PDF_TIMEOUT_MS,
  )

  it('lehnt eine Datei ab, die kein PDF ist', async () => {
    await expect(
      loadPdfText(new File(['x'], 'anzeige.docx', { type: 'application/octet-stream' })),
    ).rejects.toMatchObject({ reason: 'unsupportedType' })
  })
})
