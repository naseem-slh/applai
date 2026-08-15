// Lädt Fixtures per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { DocxDocument } from './model'
import { parseDocx } from './parse'
import { replaceRange } from './replace'
import { serializeDocx } from './serialize'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadFixture(fileName: string): Promise<DocxDocument> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return parseDocx(arrayBuffer)
}

async function unzipBlob(blob: Blob) {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()))
}

describe('serializeDocx', () => {
  it('übernimmt jeden übrigen Zip-Eintrag byteidentisch und ersetzt nur word/document.xml', async () => {
    const original = await loadFixture('anschreiben-kopf-fuss.docx')
    const changed = replaceRange(original, { from: 0, to: 'Betreff'.length }, 'Thema')

    const entries = await unzipBlob(await serializeDocx(changed))

    expect(Object.keys(entries).sort()).toEqual(Object.keys(original.zip).sort())
    for (const [path, bytes] of Object.entries(original.zip)) {
      if (path === 'word/document.xml') {
        expect(entries[path]).not.toEqual(bytes)
      } else {
        // Kopf-, Fußzeile, Beziehungen, Content-Types: byteidentisch.
        expect(entries[path]).toEqual(bytes)
      }
    }
  })

  it('erhält die XML-Deklaration, die Word erwartet', async () => {
    const original = await loadFixture('anschreiben.docx')
    const changed = replaceRange(original, { from: 0, to: 4 }, 'Hallo')

    const entries = await unzipBlob(await serializeDocx(changed))
    const xml = new TextDecoder('utf-8').decode(entries['word/document.xml'])

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(xml).toContain('<w:document')
  })

  it('liefert ein Blob mit dem Word-MIME-Typ', async () => {
    const original = await loadFixture('anschreiben.docx')

    const blob = await serializeDocx(original)

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('verändert das übergebene DocxDocument nicht', async () => {
    const original = await loadFixture('anschreiben.docx')
    const zipBefore = { ...original.zip }
    const documentXmlBefore = original.zip['word/document.xml']!.slice()
    const changed = replaceRange(original, { from: 0, to: 4 }, 'Hallo')

    await serializeDocx(changed)

    expect(Object.keys(original.zip).sort()).toEqual(Object.keys(zipBefore).sort())
    expect(original.zip['word/document.xml']).toEqual(documentXmlBefore)
  })

  it('führt ein unverändertes Dokument verlustfrei durch den Rundlauf', async () => {
    const original = await loadFixture('anschreiben.docx')

    const blob = await serializeDocx(original)
    const reparsed = await parseDocx(await blob.arrayBuffer())

    expect(reparsed.text).toBe(original.text)
    expect(reparsed.paragraphs).toHaveLength(original.paragraphs.length)
    expect(Object.keys(reparsed.zip).sort()).toEqual(Object.keys(original.zip).sort())
  })
})
