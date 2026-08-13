// Lädt Fixtures per node:fs/promises von der Platte und läuft deshalb unter
// tsconfig.test.json — siehe die ausführliche Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readDocumentFormat, type DocumentFormat, type FormattedParagraph } from './format'
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
    'anschreiben-schwebend.docx',
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

/**
 * Word legt ein eingefügtes Objekt zweimal ab: unter `mc:Choice` in der
 * neueren Form und unter `mc:Fallback` als VML, damit ältere Fassungen es
 * auch anzeigen können. Wer beide liest, setzt Briefkopf-Grafik und
 * Unterschrift doppelt; wer keinen von beiden liest, lässt sie ganz weg —
 * und genau das tat der Export vorher.
 */
describe('readDocumentFormat — mc:AlternateContent', () => {
  const IMAGE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p><w:r>
      <mc:AlternateContent>
        <mc:Choice Requires="wps">
          <w:drawing><wp:inline><wp:extent cx="1123950" cy="578484"/>
            <a:graphic><a:graphicData><a:blip r:embed="rId1"/></a:graphicData></a:graphic>
          </wp:inline></w:drawing>
        </mc:Choice>
        <mc:Fallback>
          <w:pict><v:shape style="width:88.5pt;height:45.55pt">
            <v:imagedata r:id="rId1"/>
          </v:shape></w:pict>
        </mc:Fallback>
      </mc:AlternateContent>
    </w:r></w:p>
  </w:body>
</w:document>`

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/unterschrift.png"/>
</Relationships>`

  function read(xml: string) {
    const encoder = new TextEncoder()
    const zip = {
      'word/document.xml': encoder.encode(xml),
      'word/_rels/document.xml.rels': encoder.encode(RELS),
      'word/media/unterschrift.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    return readDocumentFormat({ zip, doc, ...buildTextModel(doc) })
  }

  it('nimmt das Objekt genau einmal auf', () => {
    const format = read(IMAGE_XML)

    const images = format.paragraphs[0].items.filter((item) => item.kind === 'image')
    expect(images).toHaveLength(1)
    expect(images[0].image.path).toBe('word/media/unterschrift.png')
  })

  it('weicht auf die ältere Fassung aus, wenn die neuere nichts trägt', () => {
    // `mc:Choice` ohne verwertbaren Inhalt — Word schreibt das, wenn die
    // neuere Form die Form gar nicht ausdrücken kann.
    const format = read(IMAGE_XML.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/, '<w:drawing/>'))

    const images = format.paragraphs[0].items.filter((item) => item.kind === 'image')
    expect(images).toHaveLength(1)
    expect(images[0].image.widthPt).toBeCloseTo(88.5, 1)
  })
})

/**
 * Ein Anschreiben, das aus einer PDF-Umwandlung kommt, besteht in weiten
 * Teilen aus schwebenden Kästen statt aus Fließtext: Die Empfängeranschrift
 * steht im Anschriftenfeld, unter dem Briefkopf liegt eine Linie, die
 * Unterschrift hängt an der Grußformel. Alle drei stehen nicht im
 * Textmodell — und fehlten deshalb im PDF ganz.
 */
describe('readDocumentFormat — schwebende Objekte', () => {
  /** Das Textfeld samt seinem eingegrenzten Inhalt. */
  function textboxOf(format: DocumentFormat) {
    const box = format.floats.find((float) => float.content.kind === 'textbox')
    if (box?.content.kind !== 'textbox') throw new Error('Kein Textfeld gelesen.')
    return { box, content: box.content }
  }

  it('liest Textfeld, Linie und Unterschrift je einmal', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-schwebend.docx'))

    expect(format.floats).toHaveLength(3)
    expect(format.floats.map((float) => float.content.kind)).toEqual([
      'shape',
      'textbox',
      'image',
    ])
  })

  it('setzt die Empfängeranschrift an ihre Blattkoordinate', async () => {
    const format = readDocumentFormat(await loadDocx('anschreiben-schwebend.docx'))

    const { box, content } = textboxOf(format)
    expect(box.anchor.fromH).toBe('page')
    expect(box.anchor.fromV).toBe('page')
    expect(box.anchor.xPt).toBeCloseTo(70, 1)
    expect(box.anchor.yPt).toBeCloseTo(200, 1)
    expect(box.widthPt).toBeCloseTo(185.9, 1)
    expect(content.insets.leftPt).toBeCloseTo(7.2, 1)
  })

  it('hängt die Unterschrift an den Absatz der Grußformel', async () => {
    const docx = await loadDocx('anschreiben-schwebend.docx')
    const format = readDocumentFormat(docx)

    const signature = format.floats.find((float) => float.content.kind === 'image')
    expect(signature?.anchor.fromV).toBe('paragraph')
    const greeting = docx.paragraphs.findIndex((paragraph) =>
      paragraph.text.startsWith('Mit freundlichen'),
    )
    expect(signature?.anchor.paragraphIndex).toBe(greeting)
  })

  /**
   * Die Absätze eines Textfelds dürfen **nicht** im Fließtext auftauchen —
   * daran hängen die Zeichen-Offsets der Markierungen des Nutzers.
   */
  it('lässt den Textfeldinhalt aus dem Fließtext heraus', async () => {
    const docx = await loadDocx('anschreiben-schwebend.docx')
    const format = readDocumentFormat(docx)

    expect(docx.text).not.toContain('Musterwerk GmbH')
    const { content } = textboxOf(format)
    expect(content.paragraphs).toHaveLength(3)
    expect(content.paragraphs.every((paragraph) => paragraph.index === null)).toBe(true)
  })
})
