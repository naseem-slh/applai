// Diese Datei lädt Fixtures per node:fs/promises von der Platte und läuft
// deshalb unter tsconfig.test.json (eigenes TS-Projekt mit 'node' in
// "types"), nicht unter tsconfig.app.json — so bleibt die G1-Absicherung
// (kein Node-API-Zugriff aus src/-Produktionscode) für den Rest von src/
// scharf: Ambient-Node-Typen gelten programweit, ein einzelner
// `/// <reference types="node" />` hier würde sie auch in parse.ts
// sichtbar machen, wenn beide Dateien im selben TS-Projekt lägen.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseDocx } from './parse'

// Fixtures liegen unter tests/fixtures/ (binäre Testdateien, siehe
// CLAUDE.md), erzeugt durch tests/fixtures/build-fixtures.mjs.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

const ALL_FIXTURES = [
  'anschreiben.docx',
  'anschreiben-fett.docx',
  'anschreiben-kopf-fuss.docx',
  'anschreiben-sonderfaelle.docx',
]

async function loadFixture(fileName: string) {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  // Node liefert einen Buffer; parseDocx erwartet einen echten ArrayBuffer.
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return parseDocx(arrayBuffer)
}

describe('parseDocx', () => {
  it('liest ein einfaches Anschreiben mit Absätzen, Tabulator, Zeilenumbruch und einem leeren Absatz', async () => {
    const result = await loadFixture('anschreiben.docx')

    expect(result.paragraphs).toHaveLength(5)
    expect(result.text).toBe(
      [
        'Sehr geehrte Damen und Herren,',
        'ich bewerbe mich hiermit um die ausgeschriebene Stelle. Meine Motivation ist hoch.',
        'Anrede:\tHerr\nZeile zwei',
        'Mit freundlichen Grüßen',
        '',
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

  it('bildet einen leeren Absatz (Leerzeile ohne w:r) als start === end ohne Läufe ab', async () => {
    const result = await loadFixture('anschreiben.docx')
    const emptyParagraph = result.paragraphs.at(-1)

    expect(emptyParagraph).toBeDefined()
    expect(emptyParagraph!.text).toBe('')
    expect(emptyParagraph!.runs).toHaveLength(0)
    // Vertrag aus model.ts: end ist exklusiv, für einen leeren Absatz fällt
    // start also mit end zusammen. Aufgabe 3 muss so einen Bereich beim
    // Ersetzen als "leer, aber vorhanden" behandeln können.
    expect(emptyParagraph!.start).toBe(emptyParagraph!.end)
  })

  it('liefert für jeden Run einen korrekten node-Verweis auf das <w:r>-Element und überspringt einen formatierungsreinen Lauf ohne w:t', async () => {
    const result = await loadFixture('anschreiben-fett.docx')
    expect(result.paragraphs).toHaveLength(1)

    const [paragraph] = result.paragraphs
    expect(paragraph).toBeDefined()
    expect(paragraph!.runs).toHaveLength(4)
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

    // Dritter Lauf trägt nur Formatierung (w:rPr/w:i), aber kein w:t — er
    // muss als real vorhandener Run mit leerem Text erscheinen (start ===
    // end), ohne selbst zum Absatztext beizutragen und ohne die Offsets
    // des nachfolgenden Laufs zu verschieben.
    const formattingOnlyRun = paragraph!.runs[2]
    expect(formattingOnlyRun?.text).toBe('')
    expect(formattingOnlyRun?.start).toBe(formattingOnlyRun?.end)
    expect(formattingOnlyRun?.node.getElementsByTagName('w:i')).toHaveLength(1)

    const trailingRun = paragraph!.runs[3]
    expect(trailingRun?.text).toBe(' Bewerber mit einschlägiger Erfahrung.')
    // Der leere Lauf davor darf die Offsets nicht verschieben: der
    // nachfolgende Lauf beginnt exakt dort, wo der fette Lauf endet.
    expect(trailingRun?.start).toBe(boldRun!.end)
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

  it('zählt einen Absatz in einem Textfeld nicht als eigenen Absatz', async () => {
    const result = await loadFixture('anschreiben-sonderfaelle.docx')

    // getElementsByTagName ist rekursiv: Ohne Filter erschiene der Absatz
    // aus dem w:txbxContent zusätzlich als eigener Dokumentabsatz und sein
    // Text stünde doppelt im Modell.
    expect(result.paragraphs).toHaveLength(5)
    expect(result.text).toBe('Alpha\n\nZelle\nVor\nGamma')
    expect(result.text).not.toContain('BoxText')
  })

  it('zählt die Läufe eines Textfelds nicht zum umgebenden Absatz', async () => {
    const result = await loadFixture('anschreiben-sonderfaelle.docx')
    const paragraph = result.paragraphs[3]

    // Sonst läge derselbe w:r-Knoten in zwei Absätzen mit zwei
    // widersprüchlichen Offsets — der Vertrag „Läufe zerlegen den
    // Absatztext lückenlos“ wäre verletzt und Aufgabe 3 würde beim
    // Ersetzen das Textfeld zerstören.
    expect(paragraph?.text).toBe('Vor')
    // Zwei Läufe: der Text und der Lauf, der das Textfeld trägt. Letzterer
    // steuert nichts zum Fließtext bei (Länge 0), gehört aber sehr wohl
    // zum Absatz — der Lauf *innerhalb* des w:txbxContent dagegen nicht.
    expect(paragraph?.runs).toHaveLength(2)
    expect(paragraph?.runs[0]?.text).toBe('Vor')
    expect(paragraph?.runs[1]?.text).toBe('')
    expect(paragraph?.runs[1]?.node.getElementsByTagName('w:pict')).toHaveLength(1)
  })

  it('bildet einen Absatz in einer Tabellenzelle als eigenen Absatz ab', async () => {
    const result = await loadFixture('anschreiben-sonderfaelle.docx')

    expect(result.paragraphs[2]?.text).toBe('Zelle')
    expect(result.paragraphs[2]?.node.parentElement?.tagName).toBe('w:tc')
  })

  it('bildet einen Absatz, der nur ein Bild trägt, als leeren Absatz ab', async () => {
    const result = await loadFixture('anschreiben-sonderfaelle.docx')
    const paragraph = result.paragraphs[1]

    expect(paragraph?.text).toBe('')
    expect(paragraph?.runs).toHaveLength(1)
    expect(paragraph?.node.getElementsByTagName('w:drawing')).toHaveLength(1)
  })

  it('wirft einen aussagekräftigen Fehler, wenn word/document.xml im Archiv fehlt', async () => {
    const encoder = new TextEncoder()
    const invalidZip = zipSync({
      '[Content_Types].xml': encoder.encode('<Types/>'),
    })

    await expect(parseDocx(invalidZip.buffer as ArrayBuffer)).rejects.toThrow('word/document.xml')
  })

  it('hält für jeden Lauf in jedem Absatz aller Fixtures den Run-Offset-Vertrag ein', async () => {
    for (const fileName of ALL_FIXTURES) {
      const result = await loadFixture(fileName)
      for (const paragraph of result.paragraphs) {
        for (const run of paragraph.runs) {
          expect(paragraph.text.slice(run.start, run.end)).toBe(run.text)
        }
      }
    }
  })
})
