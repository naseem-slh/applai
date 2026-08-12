// Diese Datei lädt Fixtures per node:fs/promises von der Platte und läuft
// deshalb unter tsconfig.test.json (eigenes TS-Projekt mit 'node' in
// "types") — siehe die ausführliche Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import type { DocxDocument } from '@/lib/docx/model'
import { parseDocx } from '@/lib/docx/parse'
import {
  CONTEXT_MAX_CHARS,
  createSelection,
  PARAGRAPH_INDEX_ATTRIBUTE,
  PARAGRAPH_START_ATTRIBUTE,
  paragraphIndexOf,
  paragraphRange,
  paragraphsLeftBehind,
  rangeToDomRange,
  selectionToRange,
  wholeDocumentRange,
} from './documentSelection'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadFixture(fileName: string): Promise<DocxDocument> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  return parseDocx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** Ein minimales `.docx` im Speicher, für Texte, die keine Fixture wert sind. */
async function buildDocx(paragraphTexts: string[]): Promise<DocxDocument> {
  const encoder = new TextEncoder()
  const body = paragraphTexts
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`)
    .join('')
  const zipped = zipSync({
    '[Content_Types].xml': encoder.encode('<?xml version="1.0"?><Types/>'),
    '_rels/.rels': encoder.encode('<?xml version="1.0"?><Relationships/>'),
    'word/document.xml': encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`,
    ),
  })
  return parseDocx(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength))
}

/**
 * Baut die Absätze so in den DOM, wie `DocumentView` es tut: ein Element je
 * Absatz, genau ein Textknoten darin, die beiden Datenattribute daran. Ein
 * Test in `DocumentView.test.tsx` hält fest, dass die echte Ansicht
 * dieselben Attribute schreibt.
 */
function renderParagraphs(docx: DocxDocument): HTMLElement {
  const root = document.createElement('div')
  for (const paragraph of docx.paragraphs) {
    const element = document.createElement('p')
    element.setAttribute(PARAGRAPH_INDEX_ATTRIBUTE, String(paragraph.index))
    element.setAttribute(PARAGRAPH_START_ATTRIBUTE, String(paragraph.start))
    element.textContent = paragraph.text
    root.append(element)
  }
  document.body.append(root)
  return root
}

function paragraphElement(root: HTMLElement, index: number): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}="${index}"]`)
  if (element === null) throw new Error(`Absatz ${index} nicht im DOM`)
  return element
}

/** Der (einzige) Textknoten eines Absatzes. */
function textNode(root: HTMLElement, index: number): Text {
  const node = paragraphElement(root, index).firstChild
  if (node === null || node.nodeType !== Node.TEXT_NODE) {
    throw new Error(`Absatz ${index} hat keinen Textknoten`)
  }
  return node as Text
}

/** Setzt die Markierung im Browser und liest sie als Punkte zurück. */
function selectPoints(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) {
  const selection = window.getSelection()
  if (selection === null) throw new Error('Keine Selection in dieser Umgebung')
  selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
  return selection
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('selectionToRange', () => {
  // Der im Plan ausdrücklich benannte Test.
  it('bildet eine Markierung über zwei Absätze auf die erwarteten Offsets ab', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    const first = docx.paragraphs[0]!
    const second = docx.paragraphs[1]!
    const localFrom = first.text.indexOf('geehrte')
    const localTo = second.text.indexOf('hiermit') + 'hiermit'.length

    const points = selectPoints(textNode(root, 0), localFrom, textNode(root, 1), localTo)
    const range = selectionToRange(root, points)

    expect(range).toEqual({ from: first.start + localFrom, to: second.start + localTo })
    // Die Gegenprobe am Text: Der Bereich schneidet genau das heraus, was
    // markiert aussieht, samt der Absatzgrenze in der Mitte.
    expect(docx.text.slice(range!.from, range!.to)).toBe(
      'geehrte Damen und Herren,\nich bewerbe mich hiermit',
    )
  })

  it('trifft eine Markierung, die mitten im Wort beginnt und mitten im Wort endet', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)
    const paragraph = docx.paragraphs[1]!

    const points = selectPoints(textNode(root, 1), 4, textNode(root, 1), 9)
    const range = selectionToRange(root, points)

    expect(range).toEqual({ from: paragraph.start + 4, to: paragraph.start + 9 })
    expect(docx.text.slice(range!.from, range!.to)).toBe('bewer')
  })

  it('zählt Tabulator und Zeilenumbruch innerhalb eines Absatzes als je ein Zeichen', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)
    const paragraph = docx.paragraphs[2]!
    expect(paragraph.text).toBe('Anrede:\tHerr\nZeile zwei')

    // Hinter dem `\n`, also am Anfang von „Zeile zwei".
    const local = paragraph.text.indexOf('Zeile')
    const points = selectPoints(textNode(root, 2), local, textNode(root, 2), local + 5)
    const range = selectionToRange(root, points)

    expect(range).toEqual({ from: paragraph.start + local, to: paragraph.start + local + 5 })
    expect(docx.text.slice(range!.from, range!.to)).toBe('Zeile')
  })

  it('liefert für eine rückwärts gezogene Markierung denselben Bereich wie für die vorwärts gezogene', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    const forward = selectionToRange(root, selectPoints(textNode(root, 0), 5, textNode(root, 1), 3))
    const backward = selectionToRange(root, selectPoints(textNode(root, 1), 3, textNode(root, 0), 5))

    expect(backward).toEqual(forward)
    expect(backward!.from).toBeLessThan(backward!.to)
  })

  it('liefert bei zusammengefallener Markierung einen leeren Bereich an der Cursorstelle', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)
    const paragraph = docx.paragraphs[1]!

    const range = selectionToRange(root, selectPoints(textNode(root, 1), 7, textNode(root, 1), 7))

    expect(range).toEqual({ from: paragraph.start + 7, to: paragraph.start + 7 })
  })

  it('trifft eine Markierung, die genau auf einer Absatzgrenze beginnt und endet', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)
    const paragraph = docx.paragraphs[1]!

    const range = selectionToRange(
      root,
      selectPoints(textNode(root, 1), 0, textNode(root, 1), paragraph.text.length),
    )

    expect(range).toEqual({ from: paragraph.start, to: paragraph.end })
    expect(docx.text.slice(range!.from, range!.to)).toBe(paragraph.text)
  })

  it('legt einen Punkt außerhalb aller Absätze auf die nächste Absatzgrenze', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    // Der Fokus liegt auf der Fläche selbst, hinter dem zweiten Absatz —
    // so, wie es passiert, wenn jemand über den Rand hinauszieht.
    const range = selectionToRange(root, selectPoints(textNode(root, 0), 0, root, 2))

    expect(range).toEqual({ from: 0, to: docx.paragraphs[1]!.end })
  })

  it('gibt für einen Punkt außerhalb der Dokumentfläche nichts zurück', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)
    const outside = document.createElement('p')
    outside.textContent = 'Werkzeugleiste'
    document.body.append(outside)

    expect(selectionToRange(root, selectPoints(textNode(root, 0), 0, outside.firstChild!, 3))).toBeNull()
  })

  it('gibt für einen Offset hinter dem Ende des Knotens nichts zurück, statt zu werfen', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    // Kein `setBaseAndExtent`: Ein solcher Punkt lässt sich über die
    // Selection-Schnittstelle gar nicht erzeugen, über eine gespeicherte
    // Knotenreferenz nach einer Textänderung aber sehr wohl.
    expect(
      selectionToRange(root, {
        anchorNode: textNode(root, 0),
        anchorOffset: 0,
        focusNode: textNode(root, 0),
        focusOffset: 9999,
      }),
    ).toBeNull()
  })

  it('gibt ohne Markierung nichts zurück', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    expect(
      selectionToRange(root, { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0 }),
    ).toBeNull()
  })

  it('überspringt einen leeren Absatz, ohne die Rechnung zu verschieben', async () => {
    // „Alpha\n\nZelle\nVor\nGamma" — Absatz 1 ist leer und trägt nur ein Bild.
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')
    const root = renderParagraphs(docx)

    const range = selectionToRange(root, selectPoints(textNode(root, 0), 2, textNode(root, 2), 2))

    expect(range).toEqual({ from: 2, to: docx.paragraphs[2]!.start + 2 })
    expect(docx.text.slice(range!.from, range!.to)).toBe('pha\n\nZe')
  })
})

describe('rangeToDomRange', () => {
  it('führt jeden Bereich des Dokuments verlustfrei hin und zurück', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    // Jedes Paar (from, to) über den gesamten Dokumenttext: Der Weg in den
    // DOM und zurück muss denselben Bereich liefern. Ein Test an
    // ausgewählten Stellen hätte genau die Randfälle verfehlt, um die es
    // hier geht.
    //
    // Gesammelt statt Paar für Paar zugesichert: Das sind rund 11 000
    // Durchläufe, und zwei `expect` je Durchlauf kosten ein Vielfaches der
    // geprüften Rechnung selbst — der Test lief damit dicht an der
    // Zeitgrenze und fiel auf einem ausgelasteten Rechner um. Die Aussage
    // bleibt dieselbe, und die Meldung wird sogar genauer: Sie nennt jeden
    // abweichenden Bereich, statt beim ersten abzubrechen.
    const mismatches: string[] = []
    for (let from = 0; from <= docx.text.length; from += 1) {
      for (let to = from; to <= docx.text.length; to += 1) {
        const domRange = rangeToDomRange(root, { from, to })
        if (domRange === null) {
          mismatches.push(`${from}–${to} → kein DOM-Bereich`)
          continue
        }
        const points = selectPoints(
          domRange.startContainer,
          domRange.startOffset,
          domRange.endContainer,
          domRange.endOffset,
        )
        const roundTrip = selectionToRange(root, points)
        if (roundTrip === null || roundTrip.from !== from || roundTrip.to !== to) {
          mismatches.push(`${from}–${to} → ${JSON.stringify(roundTrip)}`)
        }
      }
    }

    expect(mismatches).toEqual([])
  })

  it('markiert das ganze Dokument von seinem ersten bis zu seinem letzten Zeichen', async () => {
    const docx = await loadFixture('anschreiben.docx')
    const root = renderParagraphs(docx)

    const range = wholeDocumentRange(docx)
    const domRange = rangeToDomRange(root, range)

    expect(range).toEqual({ from: 0, to: docx.text.length })
    expect(selectionToRange(root, pointsOf(domRange!))).toEqual(range)
  })
})

function pointsOf(range: globalThis.Range) {
  return {
    anchorNode: range.startContainer,
    anchorOffset: range.startOffset,
    focusNode: range.endContainer,
    focusOffset: range.endOffset,
  }
}

describe('paragraphRange', () => {
  it('liefert Anfang und Ende genau eines Absatzes', async () => {
    const docx = await loadFixture('anschreiben.docx')

    expect(paragraphRange(docx, 2)).toEqual({
      from: docx.paragraphs[2]!.start,
      to: docx.paragraphs[2]!.end,
    })
  })

  it('liefert für einen unbekannten Absatz nichts', async () => {
    const docx = await loadFixture('anschreiben.docx')

    expect(paragraphRange(docx, 99)).toBeNull()
  })
})

describe('createSelection', () => {
  it('gibt für einen zusammengefallenen Bereich nichts zurück', async () => {
    const docx = await loadFixture('anschreiben.docx')

    expect(createSelection(docx, { from: 5, to: 5 })).toBeNull()
  })

  it('meldet eine Markierung aus reinem Leerraum als inhaltslos', async () => {
    const docx = await buildDocx(['Vorne   hinten'])

    const selection = createSelection(docx, { from: 5, to: 8 })

    expect(selection?.text).toBe('   ')
    expect(selection?.hasContent).toBe(false)
  })

  // Weitergabe aus Aufgabe 11: „bis zu 600 Zeichen" wird hier erzwungen.
  it('kappt den Kontext davor auf 600 Zeichen', async () => {
    const filler = 'wort '.repeat(400) // 2000 Zeichen
    const docx = await buildDocx([`${filler}MARKE Rest`])
    const from = docx.text.indexOf('MARKE')

    const selection = createSelection(docx, { from, to: from + 5 })

    expect(selection?.text).toBe('MARKE')
    expect(selection!.contextBefore.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS)
    // Nicht bloß gekürzt, sondern der Rand ist auch wirklich der Text davor.
    expect(docx.text.slice(0, from).endsWith(selection!.contextBefore)).toBe(true)
  })

  it('kappt den Kontext danach auf 600 Zeichen', async () => {
    const filler = 'wort '.repeat(400)
    const docx = await buildDocx([`Anfang MARKE ${filler}`])
    const from = docx.text.indexOf('MARKE')

    const selection = createSelection(docx, { from, to: from + 5 })

    expect(selection!.contextAfter.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS)
    expect(docx.text.slice(from + 5).startsWith(selection!.contextAfter)).toBe(true)
  })

  it('beginnt den gekappten Kontext an einer Satzgrenze, wenn dabei genug übrig bleibt', async () => {
    const docx = await buildDocx([`${'a'.repeat(900)}. Ein neuer Satz beginnt hier. ${'b '.repeat(200)}MARKE`])
    const from = docx.text.indexOf('MARKE')

    const selection = createSelection(docx, { from, to: from + 5 })

    expect(selection!.contextBefore.startsWith('Ein neuer Satz beginnt hier.')).toBe(true)
  })

  it('begnügt sich mit einer Wortgrenze, wenn die Satzgrenze zu viel wegschneiden würde', async () => {
    // Der einzige Punkt liegt kurz vor der Markierung: An ihm zu schneiden
    // ließe fast nichts übrig, also wird nur bis zur Wortgrenze vorgerückt.
    const docx = await buildDocx([`${'wort '.repeat(300)}Ende. Kurz MARKE`])
    const from = docx.text.indexOf('MARKE')

    const selection = createSelection(docx, { from, to: from + 5 })

    expect(selection!.contextBefore.startsWith('wort')).toBe(true)
    expect(selection!.contextBefore.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS)
  })

  it('lässt einen kurzen Kontext unangetastet', async () => {
    const docx = await buildDocx(['Kurz davor MARKE und danach'])
    const from = docx.text.indexOf('MARKE')

    const selection = createSelection(docx, { from, to: from + 5 })

    expect(selection!.contextBefore).toBe('Kurz davor ')
    expect(selection!.contextAfter).toBe(' und danach')
  })

  // Weitergabe aus Aufgabe 3: Die Oberfläche muss den Tausch sichtbar machen.
  it('meldet einen nicht entfernbaren Absatz in der Mitte der Markierung', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')

    // Von „Alpha" bis in die Tabellenzelle hinein: dazwischen liegt der
    // Absatz, der nur ein Bild trägt.
    const selection = createSelection(docx, { from: 2, to: 9 })

    expect(selection!.inspection.affected).toEqual([0, 1, 2])
    expect(selection!.inspection.retained).toEqual([
      { index: 1, position: 1, reason: 'embeddedContent' },
      { index: 2, position: 2, reason: 'tableCell' },
    ])
    expect(selection!.inspection.mayShiftContent).toBe(true)
  })

  it('meldet keine Verschiebung, wenn die Markierung in einem einzigen Absatz bleibt', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')

    const selection = createSelection(docx, { from: 7, to: 12 })

    expect(selection!.inspection.affected).toEqual([2])
    expect(selection!.inspection.retained).toEqual([
      { index: 2, position: 0, reason: 'tableCell' },
    ])
    // Der erste betroffene Absatz bekommt immer ein Segment und bleibt
    // deshalb an seinem Platz, ohne dass etwas verrutscht.
    expect(selection!.inspection.mayShiftContent).toBe(false)
  })
})

// Die Verfeinerung der Verschiebungswarnung: Mit dem Ersatztext in der Hand
// wird aus „kann verrutschen" ein „wird verrutschen" (Aufgabe 14b, siehe
// `paragraphsLeftBehind`).
describe('paragraphsLeftBehind', () => {
  it('nennt den festgehaltenen Absatz, der kein Segment mehr abbekommt', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')
    const selection = createSelection(docx, { from: 2, to: 9 })!

    // Eine Zeile Ersatztext für drei betroffene Absätze: Absatz 1 und 2
    // bekommen nichts mehr und bleiben beide stehen.
    expect(paragraphsLeftBehind(selection, 'Eine Zeile')).toEqual([
      { index: 1, position: 1, reason: 'embeddedContent' },
      { index: 2, position: 2, reason: 'tableCell' },
    ])
  })

  it('meldet nichts, wenn der Ersatztext für jeden betroffenen Absatz eine Zeile hat', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')
    const selection = createSelection(docx, { from: 2, to: 9 })!

    expect(paragraphsLeftBehind(selection, 'Eine\nZwei\nDrei')).toEqual([])
  })

  it('zählt fremde Zeilenenden wie `replaceRange` als eine Zeile', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')
    const selection = createSelection(docx, { from: 2, to: 9 })!

    expect(paragraphsLeftBehind(selection, 'Eine\r\nZwei\r\nDrei')).toEqual([])
  })

  it('meldet nichts für den ersten betroffenen Absatz, der immer ein Segment bekommt', async () => {
    const docx = await loadFixture('anschreiben-sonderfaelle.docx')
    const selection = createSelection(docx, { from: 7, to: 12 })!

    expect(selection.inspection.retained).toHaveLength(1)
    expect(paragraphsLeftBehind(selection, '')).toEqual([])
  })
})

// Beide Datenattribute kommen heute von `DocumentView` und sind immer da.
// Diese beiden Fälle sind deshalb unerreichbar — und trotzdem geprüft:
// `Number(null)` ist 0, `Number.isInteger(0)` ist wahr, und eine stille 0
// wäre hier die teuerste Antwort von allen.
describe('Absätze ohne brauchbare Datenattribute', () => {
  it('nennt für einen Absatz ohne Index keinen Index, statt ihn für den ersten zu halten', async () => {
    const docx = await buildDocx(['Alpha', 'Beta'])
    const root = renderParagraphs(docx)
    const node = textNode(root, 1)

    paragraphElement(root, 1).removeAttribute(PARAGRAPH_INDEX_ATTRIBUTE)

    expect(paragraphIndexOf(node)).toBeNull()
  })

  it('rechnet aus einem Absatz mit unlesbarem Offset keinen Bereich, statt am Dokumentanfang zu messen', async () => {
    const docx = await buildDocx(['Alpha', 'Beta'])
    const root = renderParagraphs(docx)
    const node = textNode(root, 0)

    paragraphElement(root, 0).setAttribute(PARAGRAPH_START_ATTRIBUTE, 'zwei')

    expect(selectionToRange(root, selectPoints(node, 1, node, 3))).toBeNull()
  })
})
