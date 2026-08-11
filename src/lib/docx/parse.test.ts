import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseDocx } from './parse'

// Fixtures liegen unter tests/fixtures/ (binäre Testdateien, siehe
// CLAUDE.md), erzeugt durch tests/fixtures/build-fixtures.mjs.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadFixture(fileName: string) {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  // Node liefert einen Buffer; parseDocx erwartet einen echten ArrayBuffer.
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return parseDocx(arrayBuffer)
}

describe('parseDocx', () => {
  it('liest ein einfaches Anschreiben mit Absätzen, Tabulator und Zeilenumbruch', async () => {
    const result = await loadFixture('anschreiben.docx')

    expect(result.paragraphs).toHaveLength(4)
    expect(result.text).toBe(
      [
        'Sehr geehrte Damen und Herren,',
        'ich bewerbe mich hiermit um die ausgeschriebene Stelle. Meine Motivation ist hoch.',
        'Anrede:\tHerr\nZeile zwei',
        'Mit freundlichen Grüßen',
      ].join('\n'),
    )

    for (const paragraph of result.paragraphs) {
      expect(paragraph.text).toBe(paragraph.runs.map((run) => run.text).join(''))
      expect(result.text.slice(paragraph.start, paragraph.end)).toBe(paragraph.text)
    }
  })

  it('hält xml:space="preserve" ein und trennt den zweiten Absatz korrekt in zwei Läufe', () => {
    return loadFixture('anschreiben.docx').then((result) => {
      const [, secondParagraph] = result.paragraphs
      expect(secondParagraph.runs).toHaveLength(2)
      expect(secondParagraph.runs[0]?.text).toBe('ich bewerbe mich hiermit um die ausgeschriebene Stelle. ')
      expect(secondParagraph.runs[1]?.text).toBe('Meine Motivation ist hoch.')
    })
  })

  it('bildet w:tab als \\t und w:br als \\n innerhalb desselben Laufs ab', async () => {
    const result = await loadFixture('anschreiben.docx')
    const [, , thirdParagraph] = result.paragraphs

    expect(thirdParagraph.text).toBe('Anrede:\tHerr\nZeile zwei')
    expect(thirdParagraph.runs).toHaveLength(1)
    expect(thirdParagraph.runs[0]?.text).toBe(thirdParagraph.text)
  })

  it('liefert für jeden Run einen korrekten node-Verweis auf das <w:r>-Element', async () => {
    const result = await loadFixture('anschreiben-fett.docx')
    expect(result.paragraphs).toHaveLength(1)

    const [paragraph] = result.paragraphs
    expect(paragraph).toBeDefined()
    expect(paragraph!.runs).toHaveLength(3)
    expect(paragraph!.text).toBe(paragraph!.runs.map((run) => run.text).join(''))
    expect(paragraph!.text).toBe('Ich bin ein hoch motivierter Bewerber mit einschlägiger Erfahrung.')

    const boldRun = paragraph!.runs[1]
    expect(boldRun?.text).toBe('hoch motivierter')
    // Der Node-Verweis muss auf das tatsächliche <w:r>-Element zeigen, damit
    // Aufgabe 3 die Formatierung (hier: w:b) unangetastet lassen kann.
    expect(boldRun?.node.tagName).toBe('w:r')
    expect(boldRun?.node.getElementsByTagName('w:b')).toHaveLength(1)

    // Run-Offsets sind relativ zum Absatztext, nicht zum Dokumenttext.
    expect(boldRun?.start).toBe('Ich bin ein '.length)
    expect(boldRun?.end).toBe(boldRun!.start + 'hoch motivierter'.length)
  })

  it('parst nur word/document.xml — Kopf- und Fußzeilentext tauchen nicht in text auf, das Archiv bleibt aber vollständig erhalten', async () => {
    const result = await loadFixture('anschreiben-kopf-fuss.docx')

    expect(result.paragraphs).toHaveLength(2)
    expect(result.text).toBe('Betreff: Bewerbung als Softwareentwicklerin\nMit freundlichen Grüßen')
    expect(result.text).not.toContain('Kopfzeilentext')
    expect(result.text).not.toContain('Fußzeilentext')

    // Aufgabe 3 muss beim Rezippen jeden Original-Eintrag wiederfinden.
    expect(Object.keys(result.zip).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'word/_rels/document.xml.rels',
        'word/document.xml',
        'word/footer1.xml',
        'word/header1.xml',
      ].sort(),
    )
  })

  it('wirft einen aussagekräftigen Fehler, wenn word/document.xml im Archiv fehlt', async () => {
    const encoder = new TextEncoder()
    const invalidZip = zipSync({
      '[Content_Types].xml': encoder.encode('<Types/>'),
    })

    await expect(parseDocx(invalidZip.buffer as ArrayBuffer)).rejects.toThrow('word/document.xml')
  })
})
