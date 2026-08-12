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
import { inspectRange, replaceRange } from './replace'
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

    // Der letzte Absatz des Fixtures ist leer und liegt genau auf dem
    // Bereichsende: Der Bereich überdeckt kein einziges seiner Zeichen, die
    // Leerzeile bleibt deshalb stehen. Entfernt werden nur die drei
    // Absätze, deren Text vollständig im Bereich lag.
    expect(result.text).toBe('Erster Absatz\nZweiter Absatz\n')
    expect(result.paragraphs).toHaveLength(3)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe('Erster Absatz\nZweiter Absatz\n')
    expect(reparsed.paragraphs).toHaveLength(3)
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

    // Ein Absatz des Bereichs überlebt immer; die abschließende Leerzeile
    // des Fixtures liegt außerhalb des Bereichs und bleibt ebenfalls.
    expect(result.text).toBe('\n')
    expect(result.paragraphs).toHaveLength(2)

    const reparsed = await roundTrip(result)
    expect(reparsed.text).toBe('\n')
    expect(reparsed.paragraphs).toHaveLength(2)
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

  // Unabhängiges Zeichenketten-Modell der in replaceRange dokumentierten
  // Regeln: Es rechnet ausschließlich mit Absatztexten und Offsets, während
  // die Implementierung XML schneidet. Stimmen beide über *jeden* Bereich
  // eines Dokuments überein, ist auch die absatzübergreifende Arithmetik
  // abgesichert — samt Leerzeilen, die nur berührt statt überdeckt werden.
  function erwarteteAbsaetze(paragraphs: string[], from: number, to: number, replacement: string): string[] {
    const starts: number[] = []
    let offset = 0
    for (const text of paragraphs) {
      starts.push(offset)
      offset += text.length + 1 // Absatztrennzeichen
    }
    const startOf = (index: number) => starts[index]!
    const endOf = (index: number) => starts[index]! + paragraphs[index]!.length

    const einfuegepunkt = () => {
      const index = paragraphs.findIndex((_, i) => startOf(i) <= from && from <= endOf(i))
      return index === -1 ? [] : [index]
    }

    let affected: number[]
    if (from === to) {
      affected = einfuegepunkt()
    } else {
      affected = paragraphs
        .map((_, index) => index)
        .filter((index) => {
          const start = startOf(index)
          const end = endOf(index)
          // Leerer Absatz: nur echt im Inneren des Bereichs betroffen.
          return start === end ? from < start && end < to : Math.max(start, from) < Math.min(end, to)
        })
      if (affected.length === 0) {
        affected = einfuegepunkt()
      }
    }

    const segments = replacement.split('\n')
    const result = [...paragraphs]
    const entfernt = new Set<number>()

    affected.forEach((paragraphIndex, position) => {
      const segment =
        position === affected.length - 1 && segments.length > affected.length
          ? segments.slice(position).join('\n')
          : segments[position]
      const text = paragraphs[paragraphIndex]!
      const localFrom = Math.min(Math.max(from - startOf(paragraphIndex), 0), text.length)
      const localTo = Math.min(Math.max(to - startOf(paragraphIndex), 0), text.length)
      const rest = text.slice(0, localFrom) + text.slice(localTo)
      result[paragraphIndex] = text.slice(0, localFrom) + (segment ?? '') + text.slice(localTo)
      if (segment === undefined && rest === '') {
        entfernt.add(paragraphIndex)
      }
    })

    return result.filter((_, index) => !entfernt.has(index))
  }

  it(
    'bildet über das ganze Dokument jeden Bereich so ab wie das Regelmodell',
    async () => {
      // Bewusst kompakt, aber mit allem, was schiefgehen kann: zwei Läufe
      // (einer fett), Tabulator, w:br, eine Leerzeile in der Mitte und eine
      // am Ende. Alle Absätze enthalten nur Text und Formatierung, sind also
      // regulär entfernbar — genau das setzt das Modell voraus.
      const original = await parseDocx(
        buildDocx(
          '<w:p><w:r><w:t>Ab</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>c</w:t></w:r></w:p>' +
            '<w:p/>' +
            '<w:p><w:r><w:t>d</w:t><w:tab/><w:t>e</w:t><w:br/><w:t>f</w:t></w:r></w:p>' +
            '<w:p><w:r><w:t>gh</w:t></w:r></w:p>' +
            '<w:p/>',
        ),
      )
      expect(original.text).toBe('Abc\n\nd\te\nf\ngh\n')

      const absaetze = original.paragraphs.map((paragraph) => paragraph.text)

      for (let from = 0; from <= original.text.length; from += 1) {
        for (let to = from; to <= original.text.length; to += 1) {
          for (const replacement of ['XY', '', 'P\nQ', 'P\nQ\nR']) {
            const result = replaceRange(original, { from, to }, replacement)
            const erwartet = erwarteteAbsaetze(absaetze, from, to, replacement)
            const fall = `Bereich ${from}..${to} ("${replacement.replace(/\n/g, '\\n')}")`
            expect(result.text, fall).toBe(erwartet.join('\n'))
            expect(result.paragraphs, fall).toHaveLength(erwartet.length)
          }
        }
      }
    },
    20_000,
  )

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

  it('entfernt keinen Absatz, der nur ein Bild trägt, und keine Tabellenzelle', async () => {
    const original = await loadFixture('anschreiben-sonderfaelle.docx')
    expect(original.text).toBe('Alpha\n\nZelle\nVor\nGamma')

    const result = replaceRange(original, { from: 0, to: original.text.length }, 'Alles neu')
    const reparsed = await roundTrip(result)

    // Das Bild, die Zelle und das Textfeld sind für das Textmodell
    // unsichtbar (Länge 0 bzw. gar nicht enthalten) — sie dürfen deshalb
    // nicht mitgelöscht werden, nur weil ihr Absatz textlos zurückbleibt.
    expect(reparsed.doc.getElementsByTagName('w:drawing')).toHaveLength(1)
    expect(reparsed.doc.getElementsByTagName('w:tbl')).toHaveLength(1)
    expect(reparsed.doc.getElementsByTagName('w:txbxContent')).toHaveLength(1)
    expect(reparsed.doc.getElementsByTagName('w:txbxContent')[0]?.textContent).toContain('BoxText')

    // Eine w:tc muss mindestens einen Absatz enthalten und als w:p enden,
    // sonst hält Word die Datei für beschädigt.
    const cell = reparsed.doc.getElementsByTagName('w:tc')[0]
    const cellChildren = Array.from(cell?.children ?? [])
    expect(cellChildren.filter((child) => child.tagName === 'w:p').length).toBeGreaterThanOrEqual(1)
    expect(cellChildren.at(-1)?.tagName).toBe('w:p')

    expect(reparsed.text).toBe('Alles neu\n\n\n')
    expect(reparsed.paragraphs).toHaveLength(4)
  })

  it('lässt den letzten Absatz einer Tabellenzelle stehen, statt eine leere w:tc zu hinterlassen', async () => {
    const original = await parseDocx(
      buildDocx(
        '<w:p><w:r><w:t>Alpha</w:t></w:r></w:p>' +
          '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Zelle</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
          '<w:p><w:r><w:t>Gamma</w:t></w:r></w:p>',
      ),
    )

    const result = replaceRange(original, { from: 0, to: original.text.length }, 'Neu')
    const reparsed = await roundTrip(result)

    const cell = reparsed.doc.getElementsByTagName('w:tc')[0]
    expect(cell?.getElementsByTagName('w:p')).toHaveLength(1)
    expect(new XMLSerializer().serializeToString(cell!)).not.toBe('<w:tc/>')
  })

  it('lässt einen leeren Absatz stehen, den der Bereich nur am Ende berührt', async () => {
    // [Alpha 0..5] [leer 6..6] [Gamma 7..12]
    const original = await parseDocx(
      buildDocx('<w:p><w:r><w:t>Alpha</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>Gamma</w:t></w:r></w:p>'),
    )
    expect(original.text).toBe('Alpha\n\nGamma')

    // to ist exklusiv: Der Bereich überdeckt kein Zeichen des leeren
    // Absatzes, die Leerzeile muss also bleiben.
    const result = replaceRange(original, { from: 3, to: 6 }, 'X')

    expect(result.text).toBe('AlpX\n\nGamma')
    expect(result.paragraphs).toHaveLength(3)
  })

  it('schreibt in den Absatz, den der Bereich wirklich überdeckt, nicht in die davorliegende Leerzeile', async () => {
    const original = await parseDocx(
      buildDocx(
        '<w:p><w:r><w:t>Alpha</w:t></w:r></w:p><w:p/>' +
          '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Gamma</w:t></w:r></w:p>',
      ),
    )

    const result = replaceRange(original, { from: 6, to: 10 }, 'X')

    expect(result.text).toBe('Alpha\n\nXma')
    expect(result.paragraphs).toHaveLength(3)
    // Der Ersatztext muss die Formatierung des überdeckten Laufs erben und
    // darf nicht in einem neuen, formatierungslosen Lauf der Leerzeile
    // landen.
    expect(result.paragraphs[1]?.runs).toHaveLength(0)
    expect(result.paragraphs[2]?.runs[0]?.node.getElementsByTagName('w:b')).toHaveLength(1)
    expect(result.paragraphs[2]?.runs[0]?.text).toBe('Xma')
  })

  it('behält die abschließende Leerzeile, wenn die Grußformel samt Zeilenumbruch ersetzt wird', async () => {
    const original = await loadFixture('anschreiben.docx')
    const from = original.text.indexOf('Mit freundlichen Grüßen')

    const result = replaceRange(original, { from, to: original.text.length }, 'Beste Grüße')

    // Leerzeilen sind der vertikale Abstand eines Anschreibens.
    expect(result.paragraphs).toHaveLength(5)
    expect(result.text).toBe(original.text.replace('Mit freundlichen Grüßen', 'Beste Grüße'))
  })

  it('entfernt einen Lauf, dessen Text vollständig ersetzt wurde, behält aber textlose Läufe', async () => {
    const original = await loadFixture('anschreiben-fett.docx')
    const to = original.text.indexOf(' mit einschlägiger')

    const result = replaceRange(original, { from: 0, to }, 'Neu')

    // Der fette Lauf war vollständig überdeckt und trägt keinen Text mehr:
    // er verschwindet. Der formatierungsreine Lauf (w:i, nie mit Text) und
    // der angeschnittene letzte Lauf bleiben.
    expect(result.paragraphs[0]?.runs).toHaveLength(3)
    expect(result.paragraphs[0]?.node.getElementsByTagName('w:b')).toHaveLength(0)
    expect(result.paragraphs[0]?.node.getElementsByTagName('w:i')).toHaveLength(1)
    expect(result.text).toBe('Neu mit einschlägiger Erfahrung.')
  })

  it('bleibt über viele aufeinanderfolgende Ersetzungen strukturell stabil', async () => {
    const original = await loadFixture('anschreiben-fett.docx')
    const laufZahl = (docx: DocxDocument) => docx.paragraphs[0]!.runs.length
    const textKnoten = (docx: DocxDocument) => docx.paragraphs[0]!.node.getElementsByTagName('w:t').length

    let current = replaceRange(original, { from: 12, to: 28 }, 'hoch motiviert')
    const runsNachErsterErsetzung = laufZahl(current)
    const textKnotenNachErsterErsetzung = textKnoten(current)

    for (let index = 0; index < 25; index += 1) {
      const from = current.text.indexOf('motiviert')
      current = replaceRange(current, { from, to: from + 'motiviert'.length }, 'motiviert')
    }

    // Weder Läufe noch w:t dürfen sich aufschaukeln (Undo/Redo, Aufgabe 14).
    expect(laufZahl(current)).toBe(runsNachErsterErsetzung)
    expect(textKnoten(current)).toBe(textKnotenNachErsterErsetzung)
    expect(current.text).toBe('Ich bin ein hoch motiviert Bewerber mit einschlägiger Erfahrung.')
    expect(current.paragraphs[0]?.node.getElementsByTagName('w:b')).toHaveLength(1)

    const reparsed = await roundTrip(current)
    expect(reparsed.text).toBe(current.text)
  })

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

describe('inspectRange', () => {
  // Weitergabe aus Aufgabe 3: Die Oberfläche muss den bewussten Tausch
  // gegen Datenverlust sichtbar machen, statt ihn geschehen zu lassen.
  // Dafür braucht sie eine Vorschau auf das, was `replaceRange` täte.

  it('nennt jeden betroffenen Absatz in Dokumentreihenfolge', async () => {
    const original = await loadFixture('anschreiben.docx')

    expect(inspectRange(original, { from: 0, to: original.text.length }).affected).toEqual([
      0, 1, 2, 3,
    ])
  })

  it('meldet ohne festen Inhalt nichts Festgehaltenes', async () => {
    const original = await loadFixture('anschreiben.docx')

    const inspection = inspectRange(original, { from: 0, to: original.text.length })

    expect(inspection.retained).toEqual([])
    expect(inspection.mayShiftContent).toBe(false)
  })

  it('unterscheidet Bild, Tabellenzelle und Abschnittswechsel', async () => {
    // „Alpha\n\nZelle\nVor\nGamma": Absatz 1 trägt nur ein Bild, Absatz 2
    // ist der letzte in einer Tabellenzelle, Absatz 3 trägt ein Textfeld.
    const original = await loadFixture('anschreiben-sonderfaelle.docx')
    const withSectionBreak = await parseDocx(
      buildDocx(
        '<w:p><w:r><w:t>Alpha</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>Beta</w:t></w:r></w:p>',
      ),
    )

    expect(inspectRange(original, { from: 0, to: original.text.length }).retained).toEqual([
      { index: 1, position: 1, reason: 'embeddedContent' },
      { index: 2, position: 2, reason: 'tableCell' },
      { index: 3, position: 3, reason: 'embeddedContent' },
    ])
    expect(
      inspectRange(withSectionBreak, { from: 0, to: withSectionBreak.text.length }).retained,
    ).toEqual([{ index: 1, position: 1, reason: 'sectionBreak' }])
  })

  it('meldet eine mögliche Verschiebung nur, wenn der feste Absatz nicht der erste betroffene ist', async () => {
    const original = await loadFixture('anschreiben-sonderfaelle.docx')

    // Von „Alpha" bis in die Tabellenzelle: der Bildabsatz liegt dazwischen.
    expect(inspectRange(original, { from: 2, to: 9 }).mayShiftContent).toBe(true)
    // Nur innerhalb der Tabellenzelle: Der erste betroffene Absatz bekommt
    // immer ein Segment und bleibt deshalb, wo er ist.
    expect(inspectRange(original, { from: 7, to: 12 }).mayShiftContent).toBe(false)
  })

  it('sagt die Wirkung von replaceRange richtig voraus', async () => {
    const original = await loadFixture('anschreiben-sonderfaelle.docx')
    const range = { from: 2, to: 9 }
    const inspection = inspectRange(original, range)

    // Ein einzeiliger Ersatztext für drei betroffene Absätze: Genau die
    // gemeldeten Absätze müssen danach noch da sein, obwohl sie keinen Text
    // mehr bekommen haben.
    const result = replaceRange(original, range, 'X')

    expect(inspection.retained.map((entry) => entry.index)).toEqual([1, 2])
    expect(result.text).toBe('AlX\n\nlle\nVor\nGamma')
    expect(result.paragraphs).toHaveLength(original.paragraphs.length)
  })

  // Der eine Unterschied zu `replaceRange`, und er ist Absicht: Findet sich
  // zu einem gültigen Bereich kein Absatz, wirft das Ersetzen, während die
  // Vorschau ein leeres Ergebnis liefert. Sie läuft bei jeder Änderung der
  // Markierung, also in einem `selectionchange`-Rückruf; ein Wurf von dort
  // risse die Ansicht ab, obwohl nichts kaputt ist.
  it('liefert für ein Dokument ohne Absatz ein leeres Ergebnis, wo replaceRange wirft', async () => {
    const empty = await parseDocx(buildDocx(''))

    expect(empty.paragraphs).toHaveLength(0)
    expect(inspectRange(empty, { from: 0, to: 0 })).toEqual({
      affected: [],
      retained: [],
      mayShiftContent: false,
    })
    expect(() => replaceRange(empty, { from: 0, to: 0 }, 'X')).toThrow(/keinen Absatz/)
  })

  it('prüft ungültige Offsets nach denselben Regeln wie replaceRange', async () => {
    const original = await loadFixture('anschreiben.docx')

    expect(() => inspectRange(original, { from: 10, to: 3 })).toThrow(/Ungültiger Bereich/)
    expect(() => inspectRange(original, { from: 0, to: original.text.length + 1 })).toThrow(
      /Ungültiger Bereich/,
    )
  })
})
