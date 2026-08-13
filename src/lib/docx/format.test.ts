// Lädt Fixtures per node:fs/promises von der Platte und läuft deshalb unter
// tsconfig.test.json — siehe die ausführliche Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readDocumentFormat, type FormattedParagraph } from './format'
import type { DocxDocument } from './model'
import { buildTextModel, parseDocx } from './parse'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadDocx(fileName: string): Promise<DocxDocument> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  return parseDocx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}

/** Der Text eines Absatzes, so wie ihn das Layoutmodell zusammensetzt. */
function itemText(paragraph: FormattedParagraph): string {
  return paragraph.items
    .map((item) => {
      switch (item.kind) {
        case 'text':
          return item.text
        case 'tab':
          return '\t'
        case 'break':
          return '\n'
        case 'image':
          return ''
      }
    })
    .join('')
}

describe('readDocumentFormat — Seite', () => {
  it('liest Blattmaß und Ränder aus w:sectPr', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    // A4: 11906 × 16838 Twips sind 595,3 × 841,9 pt.
    expect(format.page.widthPt).toBeCloseTo(595.3, 1)
    expect(format.page.heightPt).toBeCloseTo(841.9, 1)
    expect(format.page.marginTopPt).toBeCloseTo(70.85, 2)
    expect(format.page.marginLeftPt).toBeCloseTo(85.05, 2)
    expect(format.page.headerDistancePt).toBeCloseTo(35.4, 1)
  })

  it('fällt ohne w:sectPr auf A4 mit Word-Standardrand zurück', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben.docx'))

    expect(format.page.widthPt).toBeCloseTo(595.3, 1)
    expect(format.page.marginTopPt).toBe(72)
  })

  it('nimmt den Standardtabulator aus settings.xml', async () => {
    const formatted = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))
    const bare = readDocumentFormat(await loadDocx('anschreiben.docx'))

    expect(formatted.defaultTabStopPt).toBeCloseTo(35.45, 2) // 709 Twips
    expect(bare.defaultTabStopPt).toBe(36) // 720 Twips, Words Vorgabe
  })
})

describe('readDocumentFormat — Vorlagen und Design', () => {
  /**
   * Der Fall, an dem ein naiver Leser scheitert: In einem von Word
   * geschriebenen Dokument steht die Schrift nirgends im Klartext, sondern
   * nur als Verweis `w:asciiTheme="minorHAnsi"` auf `theme1.xml`.
   */
  it('löst die Designschrift auf', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const greeting = format.paragraphs[2]
    expect(itemText(greeting)).toBe('Sehr geehrte Damen und Herren,')
    expect(greeting.items[0]?.format.fontFamily).toBe('Calibri')
    expect(greeting.items[0]?.format.sizePt).toBe(11) // w:sz 22 sind halbe Punkte
  })

  it('wendet die Vorlagenkette von der Wurzel abwärts an', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    // „Betreff" ist von „Standard" abgeleitet: Der Abstand davor kommt aus
    // der eigenen Vorlage, Schrift und Grad aus der geerbten bzw. den
    // Dokumentvorgaben, überschrieben von den eigenen Angaben.
    const subject = format.paragraphs[1]
    expect(subject.format.spaceBeforePt).toBe(12) // 240 Twips
    expect(subject.items[0]?.format.bold).toBe(true)
    expect(subject.items[0]?.format.sizePt).toBe(12) // w:sz 24
    expect(subject.items[0]?.format.fontFamily).toBe('Calibri')
  })

  it('wendet Zeichenvorlagen an, die ein Lauf über w:rStyle zieht', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const body = format.paragraphs[3]
    const highlighted = body.items.find(
      (item) => item.kind === 'text' && item.text === 'Ihr Produkt',
    )
    expect(highlighted?.format.italic).toBe(true)
    expect(highlighted?.format.color).toBe('C00000')
    expect(highlighted?.format.bold).toBe(false)
  })
})

describe('readDocumentFormat — Absätze', () => {
  it('liest Ausrichtung, Einzüge und Abstände', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const body = format.paragraphs[3]
    expect(body.format.alignment).toBe('justify')
    expect(body.format.indentLeftPt).toBeCloseTo(28.35, 2) // 567 Twips
    // Hängender Einzug ist ein negativer Erstzeileneinzug.
    expect(body.format.indentFirstLinePt).toBeCloseTo(-14.2, 1)
    expect(body.format.spaceBeforePt).toBe(6)
    expect(body.format.lineSpacing).toEqual({ rule: 'auto', factor: 1.5 }) // 360/240
  })

  it('liest Tabulatorhalte samt ihrer Ausrichtung', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    expect(format.paragraphs[0].format.tabStops).toEqual([
      { positionPt: 453.5, alignment: 'right' },
    ])
  })

  it('unterscheidet den Seitenumbruch von der Zeilenschaltung', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const anlagen = format.paragraphs[4]
    const softBreak = anlagen.items.find((item) => item.kind === 'break')
    expect(softBreak).toMatchObject({ kind: 'break', page: false })

    const second = format.paragraphs[5]
    expect(second.items[0]).toMatchObject({ kind: 'break', page: true })

    expect(format.paragraphs[6].format.pageBreakBefore).toBe(true)
  })

  it('liest Auszeichnungen der Läufe', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const bold = format.paragraphs[3].items.find(
      (item) => item.kind === 'text' && item.text === 'fünf Jahre Erfahrung',
    )
    expect(bold?.format.bold).toBe(true)

    const underlined = format.paragraphs[4].items[0]
    expect(underlined?.format.underline).toBe(true)
  })
})

describe('readDocumentFormat — Kopf- und Fußzeilen', () => {
  it('liest die Kopfzeile über ihre Beziehung', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const header = format.header.default
    expect(header).not.toBeNull()
    expect(itemText(header?.[1] as FormattedParagraph)).toContain('Erika Mustermann')
    expect(header?.[1].format.alignment).toBe('right')
    expect(format.footer.default?.[0].items[0]?.format.color).toBe('808080')
  })

  /**
   * Das Logo hängt an der Kopfzeile, nicht am Hauptdokument. Wer beim
   * Auflösen die Beziehungsdatei des Hauptteils benutzt, findet es nicht —
   * und der Briefkopf käme ohne Bild heraus.
   */
  it('findet das Bild über die Beziehungen der Kopfzeile', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-formatiert.docx'))

    const image = format.header.default?.[0].items[0]
    expect(image?.kind).toBe('image')
    if (image?.kind !== 'image') throw new Error('kein Bild')
    expect(image.image.path).toBe('word/media/logo.png')
    expect(image.image.bytes.length).toBeGreaterThan(0)
    // 1080000 EMU sind 85,04 pt (3 cm).
    expect(image.image.widthPt).toBeCloseTo(85.04, 2)
    expect(image.image.heightPt).toBeCloseTo(28.35, 2)
  })

  it('kennt keine Kopfzeile, wo keine steht', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben.docx'))

    expect(format.header.default).toBeNull()
    expect(format.footer.default).toBeNull()
  })
})

/**
 * Die tragende Zusage dieses Moduls: Es liest **dieselben Zeichen** wie
 * `parse.ts`. Wichen die beiden voneinander ab, zeigte der Bearbeiter eine
 * andere Stelle an als die, die im PDF landet — und die Markierungen des
 * Nutzers verschöben sich gegenüber dem, was er markiert hat.
 */
describe('readDocumentFormat — Zeichengleichheit mit dem Textmodell', () => {
  it.each([
    'anschreiben.docx',
    'anschreiben-fett.docx',
    'anschreiben-kopf-fuss.docx',
    'anschreiben-sonderfaelle.docx',
    'anschreiben-formatiert.docx',
  ])('stimmt für %s Zeichen für Zeichen mit parseDocx überein', async (fileName) => {
    const docx = await loadDocx(fileName)
    const format = readDocumentFormat(docx)

    expect(format.paragraphs).toHaveLength(docx.paragraphs.length)
    format.paragraphs.forEach((paragraph, index) => {
      expect(itemText(paragraph)).toBe(docx.paragraphs[index].text)
      expect(paragraph.index).toBe(index)
    })
  })
})

/**
 * Die Absatzmarke ist ein Zeichen für sich.
 *
 * Wer in Word eine fett gesetzte Überschrift löscht, lässt oft die Marke mit
 * ihrer Auszeichnung stehen und tippt darunter weiter. Zöge man ihre Angaben
 * auf die Läufe des Absatzes, stünde im PDF ein fetter Absatz, den in Word
 * niemand sieht.
 */
describe('readDocumentFormat — Absatzmarke', () => {
  it('vererbt die Angaben der Marke nicht an die Läufe des Absatzes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:pPr><w:r><w:t>Fließtext</w:t></w:r></w:p>
  </w:body>
</w:document>`
    const zip = { 'word/document.xml': new TextEncoder().encode(xml) }
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const format = readDocumentFormat({ zip, doc, ...buildTextModel(doc) })

    const paragraph = format.paragraphs[0]
    expect(paragraph.items[0]?.format.bold).toBe(false)
    expect(paragraph.items[0]?.format.sizePt).toBe(10)
    // Für die Höhe eines leeren Absatzes zählen sie trotzdem.
    expect(paragraph.markFormat.bold).toBe(true)
    expect(paragraph.markFormat.sizePt).toBe(20)
  })
})
