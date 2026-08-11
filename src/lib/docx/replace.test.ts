// Diese Datei lädt Fixtures per node:fs/promises von der Platte und läuft
// deshalb unter tsconfig.test.json (eigenes TS-Projekt mit 'node' in
// "types") — siehe die ausführliche Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { DocxDocument, Run } from './model'
import { parseDocx } from './parse'
import { replaceRange } from './replace'
import { serializeDocx } from './serialize'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadFixture(fileName: string): Promise<DocxDocument> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return parseDocx(arrayBuffer)
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

// Baut für Sonderfälle (Abschnittswechsel, leerer Absatz) ein minimales
// .docx im Speicher. Die drei regulären Fixtures unter tests/fixtures/
// decken die Fälle der Aufgabenstellung ab; für diese Randfälle wäre eine
// eigene Binärdatei unverhältnismäßig.
function buildDocx(bodyInner: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const zipped = zipSync({
    '[Content_Types].xml': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${bodyInner}</w:body></w:document>`,
    ),
  })
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
}

// Der eigentliche Beweis: erst serialisieren, dann wieder einlesen. Nur so
// ist sichergestellt, dass die XML-Änderung ein gültiges Word-Dokument
// ergibt und nicht bloß der In-Memory-Baum stimmt.
async function roundTrip(docx: DocxDocument): Promise<DocxDocument> {
  const blob = await serializeDocx(docx)
  return parseDocx(await blob.arrayBuffer())
}

function runXml(run: Run): string {
  return new XMLSerializer().serializeToString(run.node)
}

// Serialisiertes XML aller Läufe der angegebenen Absätze — damit lässt sich
// zeichengenau prüfen, dass unbeteiligte Läufe (inklusive ihrer w:rPr)
// unangetastet bleiben.
function runXmlOfParagraphs(docx: DocxDocument, indices: number[]): string[] {
  return indices.flatMap((index) => (docx.paragraphs[index]?.runs ?? []).map(runXml))
}

describe('replaceRange', () => {
  it('ersetzt einen Bereich innerhalb eines einzelnen Laufs und lässt alle übrigen Läufe unangetastet', async () => {
    const original = await loadFixture('anschreiben.docx')
    const from = original.text.indexOf('Damen und Herren')
    const untouchedBefore = runXmlOfParagraphs(original, [1, 2, 3, 4])

    const result = replaceRange(original, { from, to: from + 'Damen und Herren'.length }, 'Frau Dr. Müller')

    expect(result.text).toBe(original.text.replace('Damen und Herren', 'Frau Dr. Müller'))
    expect(runXmlOfParagraphs(result, [1, 2, 3, 4])).toEqual(untouchedBefore)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe(result.text)
    expect(reparsed.paragraphs).toHaveLength(5)
    // Tabulator und Zeilenumbruch des dritten Absatzes überleben den
    // Rundlauf unverändert.
    expect(reparsed.paragraphs[2]?.text).toBe('Anrede:\tHerr\nZeile zwei')
  })

  it('behält die Fettung des verbleibenden Teils, wenn die Ersetzung mitten in einem fetten Lauf beginnt', async () => {
    const original = await loadFixture('anschreiben-fett.docx')
    const from = original.text.indexOf('motivierter')
    const to = original.text.indexOf(' mit einschlägiger')
    const leadingRunBefore = runXml(original.paragraphs[0]!.runs[0]!)

    const result = replaceRange(original, { from, to }, 'engagierter Kandidat')

    expect(result.text).toBe('Ich bin ein hoch engagierter Kandidat mit einschlägiger Erfahrung.')

    const paragraph = result.paragraphs[0]!
    // Unbeteiligter Lauf davor: zeichengenau unverändert.
    expect(runXml(paragraph.runs[0]!)).toBe(leadingRunBefore)

    // Der fette Lauf trägt jetzt Rest + Ersatztext — und ist immer noch fett.
    const boldRun = paragraph.runs[1]!
    expect(boldRun.text).toBe('hoch engagierter Kandidat')
    expect(boldRun.node.getElementsByTagName('w:b')).toHaveLength(1)
    // Verbliebener Text und Ersatztext werden zu einem w:t zusammengefasst,
    // damit wiederholte Ersetzungen einen Lauf nicht zersplittern.
    expect(boldRun.node.getElementsByTagName('w:t')).toHaveLength(1)

    // Der formatierungsreine Lauf (w:i, ohne w:t) liegt innerhalb des
    // ersetzten Bereichs, trägt aber keinen Text — er darf nicht verloren
    // gehen, weil ein solcher Lauf auch ein Bild o. Ä. tragen kann.
    expect(paragraph.runs[2]?.node.getElementsByTagName('w:i')).toHaveLength(1)

    // Der Lauf danach behält seinen eigenen (fettfreien) Rest.
    expect(paragraph.runs[3]?.text).toBe(' mit einschlägiger Erfahrung.')
    expect(paragraph.runs[3]?.node.getElementsByTagName('w:b')).toHaveLength(0)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe(result.text)
    expect(reparsed.paragraphs[0]?.runs[1]?.node.getElementsByTagName('w:b')).toHaveLength(1)
    expect(reparsed.paragraphs[0]?.runs[1]?.text).toBe('hoch engagierter Kandidat')
  })

  it('verteilt den Ersatztext über zwei Absätze und erhält die Absatzgrenze', async () => {
    const original = await loadFixture('anschreiben.docx')
    const from = original.text.indexOf('Damen')
    const to = original.text.indexOf('Meine Motivation')
    const untouchedBefore = runXmlOfParagraphs(original, [2, 3, 4])

    const result = replaceRange(original, { from, to }, 'Frau Müller,\nvielen Dank für Ihre Anzeige. ')

    expect(result.paragraphs).toHaveLength(5)
    expect(result.paragraphs[0]?.text).toBe('Sehr geehrte Frau Müller,')
    expect(result.paragraphs[1]?.text).toBe('vielen Dank für Ihre Anzeige. Meine Motivation ist hoch.')
    expect(runXmlOfParagraphs(result, [2, 3, 4])).toEqual(untouchedBefore)
    // Der zweite Lauf des zweiten Absatzes lag außerhalb des Bereichs.
    expect(runXml(result.paragraphs[1]!.runs[1]!)).toBe(runXml(original.paragraphs[1]!.runs[1]!))

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe(result.text)
    expect(reparsed.paragraphs).toHaveLength(5)
  })

  it('ersetzt den gesamten Dokumenttext und entfernt die leer gebliebenen Absätze', async () => {
    const original = await loadFixture('anschreiben.docx')

    const result = replaceRange(original, { from: 0, to: original.text.length }, 'Erster Absatz\nZweiter Absatz')

    expect(result.text).toBe('Erster Absatz\nZweiter Absatz')
    expect(result.paragraphs).toHaveLength(2)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe('Erster Absatz\nZweiter Absatz')
    expect(reparsed.paragraphs).toHaveLength(2)
  })

  it('lässt w:sectPr im Body unangetastet, wenn alle Absätze ersetzt werden', async () => {
    const original = await loadFixture('anschreiben-kopf-fuss.docx')

    const result = replaceRange(original, { from: 0, to: original.text.length }, 'Nur noch ein Absatz')
    const reparsed = await roundTrip(result)

    expect(reparsed.text).toBe('Nur noch ein Absatz')
    expect(reparsed.paragraphs).toHaveLength(1)
    // Seiteneinrichtung (Ränder, Kopf-/Fußzeilenverweise) hängt am
    // w:sectPr des Bodys — es darf beim Entfernen von Absätzen nicht
    // mitgelöscht werden.
    expect(reparsed.doc.getElementsByTagName('w:sectPr')).toHaveLength(1)
    expect(reparsed.doc.getElementsByTagName('w:headerReference')).toHaveLength(1)
    expect(Object.keys(reparsed.zip).sort()).toEqual(Object.keys(original.zip).sort())
  })

  it('leert einen Absatz, ohne ihn zu entfernen, wenn der Ersatztext leer ist', async () => {
    const original = await loadFixture('anschreiben.docx')
    const paragraph = original.paragraphs[3]!
    const untouchedBefore = runXmlOfParagraphs(original, [0, 1, 2, 4])

    const result = replaceRange(original, { from: paragraph.start, to: paragraph.end }, '')

    expect(result.paragraphs).toHaveLength(5)
    expect(runXmlOfParagraphs(result, [0, 1, 2, 4])).toEqual(untouchedBefore)
    expect(result.paragraphs[3]?.text).toBe('')
    expect(result.text).toBe(original.text.replace('Mit freundlichen Grüßen', ''))

    const reparsed = await roundTrip(result)
    expect(reparsed.paragraphs).toHaveLength(5)
    expect(reparsed.text).toBe(result.text)
  })

  it('behält bei leerem Ersatztext über das ganze Dokument mindestens einen Absatz', async () => {
    const original = await loadFixture('anschreiben.docx')

    const result = replaceRange(original, { from: 0, to: original.text.length }, '')

    expect(result.text).toBe('')
    expect(result.paragraphs).toHaveLength(1)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe('')
    expect(reparsed.paragraphs).toHaveLength(1)
  })

  it('hängt überzählige Zeilen des Ersatztexts mit w:br an den letzten betroffenen Absatz', async () => {
    const original = await loadFixture('anschreiben.docx')
    const from = original.text.indexOf('Mit freundlichen Grüßen')

    const result = replaceRange(original, { from, to: from + 'Mit freundlichen Grüßen'.length }, 'Zeile A\nZeile B\nZeile C')

    // Nur ein Absatz war betroffen: Absatzgrenzen bleiben, die
    // überzähligen Zeilen werden innerhalb des Absatzes umbrochen.
    expect(result.paragraphs).toHaveLength(5)
    expect(result.paragraphs[3]?.text).toBe('Zeile A\nZeile B\nZeile C')
    expect(result.paragraphs[3]?.node.getElementsByTagName('w:br')).toHaveLength(2)

    const reparsed = await roundTrip(result)
    expect(reparsed.paragraphs[3]?.text).toBe('Zeile A\nZeile B\nZeile C')
    expect(reparsed.paragraphs).toHaveLength(5)
  })

  it('wandelt Tabulatoren im Ersatztext in w:tab', async () => {
    const original = await loadFixture('anschreiben.docx')
    // Bewusst absatzrelativ gesucht: 'Herr' kommt auch in 'Herren,' des
    // ersten Absatzes vor.
    const paragraph = original.paragraphs[2]!
    const from = paragraph.start + paragraph.text.indexOf('Herr')

    const result = replaceRange(original, { from, to: from + 'Herr'.length }, 'Frau\tDr.')
    const reparsed = await roundTrip(result)

    expect(reparsed.paragraphs[2]?.text).toBe('Anrede:\tFrau\tDr.\nZeile zwei')
    expect(reparsed.paragraphs[2]?.node.getElementsByTagName('w:tab')).toHaveLength(2)
  })

  it('fügt an einem Einfügepunkt (from === to) ein, ohne bestehenden Text zu verlieren', async () => {
    const original = await loadFixture('anschreiben.docx')
    const at = original.text.indexOf(',')

    const result = replaceRange(original, { from: at, to: at }, ' Frau Müller')
    const reparsed = await roundTrip(result)

    expect(reparsed.paragraphs[0]?.text).toBe('Sehr geehrte Damen und Herren Frau Müller,')
    expect(reparsed.paragraphs).toHaveLength(5)
  })

  it('legt in einem leeren Absatz einen neuen Lauf an', async () => {
    const original = await parseDocx(buildDocx('<w:p><w:r><w:t>Kopf</w:t></w:r></w:p><w:p/>'))
    expect(original.paragraphs[1]?.runs).toHaveLength(0)

    const result = replaceRange(original, { from: original.text.length, to: original.text.length }, 'Nachtrag')
    const reparsed = await roundTrip(result)

    expect(reparsed.text).toBe('Kopf\nNachtrag')
    expect(reparsed.paragraphs[1]?.runs).toHaveLength(1)
  })

  it('entfernt keinen Absatz, der einen Abschnittswechsel (w:sectPr) trägt', async () => {
    const original = await parseDocx(
      buildDocx(
        '<w:p><w:r><w:t>Erster</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr><w:r><w:t>Zweiter</w:t></w:r></w:p>',
      ),
    )

    const result = replaceRange(original, { from: 0, to: original.text.length }, 'Alles neu')
    const reparsed = await roundTrip(result)

    expect(reparsed.text).toBe('Alles neu\n')
    expect(reparsed.paragraphs).toHaveLength(2)
    expect(reparsed.doc.getElementsByTagName('w:sectPr')).toHaveLength(1)
  })

  it('lässt das übergebene Dokument unverändert', async () => {
    const original = await loadFixture('anschreiben.docx')
    const textBefore = original.text
    const xmlBefore = new XMLSerializer().serializeToString(original.doc)
    const paragraphCountBefore = original.paragraphs.length

    replaceRange(original, { from: 0, to: original.text.length }, 'Alles neu')

    expect(original.text).toBe(textBefore)
    expect(original.paragraphs).toHaveLength(paragraphCountBefore)
    expect(new XMLSerializer().serializeToString(original.doc)).toBe(xmlBefore)
  })

  // Erschöpfender Vergleich gegen die naive Zeichenkettenoperation: Solange
  // ein Bereich innerhalb eines Absatzes liegt und der Ersatztext keinen
  // Zeilenumbruch enthält, muss das Ergebnis exakt
  // text.slice(0, from) + Ersatz + text.slice(to) sein — unabhängig davon,
  // wie die Läufe, w:tab und w:br darunter geschnitten sind. Genau hier
  // würden Rundungsfehler in der Offset-Arithmetik auffallen.
  it.each(['anschreiben.docx', 'anschreiben-fett.docx'])(
    'ersetzt in %s jeden Bereich innerhalb eines Absatzes zeichengenau',
    async (fileName) => {
      const original = await loadFixture(fileName)

      for (const paragraph of original.paragraphs) {
        for (let from = paragraph.start; from <= paragraph.end; from += 1) {
          for (let to = from; to <= paragraph.end; to += 1) {
            // Auch der leere Ersatztext gehört dazu: Ein einzelner Absatz
            // wird dabei geleert, aber nie entfernt.
            for (const replacement of ['XY', '']) {
              const result = replaceRange(original, { from, to }, replacement)
              const expected = original.text.slice(0, from) + replacement + original.text.slice(to)
              expect(result.text, `Bereich ${from}..${to} ("${replacement}") in ${fileName}`).toBe(expected)
              expect(result.paragraphs).toHaveLength(original.paragraphs.length)
            }
          }
        }
      }
    },
    // Erschöpfend heißt hier mehrere tausend Ersetzungen; die
    // Standardgrenze von 5 s reicht dafür auf langsameren Rechnern nicht.
    20_000,
  )

  it('wirft aussagekräftige deutsche Fehler bei ungültigen Bereichen', async () => {
    const original = await loadFixture('anschreiben.docx')

    expect(() => replaceRange(original, { from: 10, to: 3 }, 'x')).toThrow(/Ungültiger Bereich/)
    expect(() => replaceRange(original, { from: -1, to: 3 }, 'x')).toThrow(/Ungültiger Bereich/)
    expect(() => replaceRange(original, { from: 0, to: original.text.length + 1 }, 'x')).toThrow(/Ungültiger Bereich/)
    expect(() => replaceRange(original, { from: 0.5, to: 3 }, 'x')).toThrow(/Ungültiger Bereich/)
    // Der gültige Randfall darf nicht mitgefangen werden.
    expect(() => replaceRange(original, { from: 0, to: original.text.length }, 'x')).not.toThrow()
  })
})
