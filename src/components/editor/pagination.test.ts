import { describe, expect, it } from 'vitest'
import type { Paragraph } from '@/lib/docx/model'
import { collapsedEmptyParagraphs, splitIntoPages, VISIBLE_EMPTY_RUN } from './pagination'

/** Absätze, so weit die Seitenaufteilung sie ansieht: nur ihr Text. */
function paragraphs(texts: string[]): Paragraph[] {
  let offset = 0
  return texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return { index, node: null as unknown as Element, text, runs: [], start, end: start + text.length }
  })
}

describe('splitIntoPages', () => {
  it('lässt alles auf einer Seite, solange es passt', () => {
    expect(splitIntoPages([100, 100, 100], 400)).toEqual([[0, 1, 2]])
  })

  it('beginnt eine neue Seite, sobald der nächste Absatz nicht mehr passt', () => {
    expect(splitIntoPages([300, 300, 300], 700)).toEqual([
      [0, 1],
      [2],
    ])
  })

  // Sonst entstünde eine leere erste Seite, und der Absatz stünde trotzdem
  // über den Rand hinaus — nur eine Seite weiter unten.
  it('gibt einem Absatz, der allein höher als eine Seite ist, eine eigene Seite', () => {
    expect(splitIntoPages([1000, 100], 500)).toEqual([[0], [1]])
  })

  it('setzt einen übergroßen Absatz nicht auf eine bereits begonnene Seite', () => {
    expect(splitIntoPages([100, 1000], 500)).toEqual([[0], [1]])
  })

  it('liefert für ein leeres Dokument eine einzige leere Seite', () => {
    // Ein Brief ohne Absätze ist ein leeres Blatt, keine Abwesenheit von
    // Blättern: Der Nutzer soll etwas sehen, in das er schreiben kann.
    expect(splitIntoPages([], 500)).toEqual([[]])
  })

  it('setzt alles auf eine Seite, solange die Höhe unbekannt ist', () => {
    // Vor der ersten Messung steht die Seitenhöhe auf 0. Dann darf nicht
    // jeder Absatz seine eigene Seite bekommen.
    expect(splitIntoPages([100, 100], 0)).toEqual([[0, 1]])
  })
})

describe('collapsedEmptyParagraphs', () => {
  it('lässt einzelne Leerzeilen in Ruhe', () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['Text', '', 'Mehr']))
    expect([...collapsed]).toEqual([])
  })

  it(`lässt ${VISIBLE_EMPTY_RUN} Leerzeilen hintereinander stehen`, () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['Text', '', '', 'Mehr']))
    expect([...collapsed]).toEqual([])
  })

  it('faltet jede weitere Leerzeile eines Laufs zusammen', () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['Text', '', '', '', '', 'Mehr']))
    expect([...collapsed]).toEqual([3, 4])
  })

  it('zählt je Lauf neu, nicht über das ganze Dokument', () => {
    const collapsed = collapsedEmptyParagraphs(
      paragraphs(['A', '', '', '', 'B', '', '', '', 'C']),
    )
    expect([...collapsed]).toEqual([3, 7])
  })

  // Leerraum ist nicht dasselbe wie Leere: Ein Absatz aus Leerzeichen sieht
  // im Brief aus wie eine Leerzeile und zählt deshalb als eine.
  it('behandelt einen Absatz aus reinem Leerraum wie eine Leerzeile', () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['A', '', '  ', '\t', '', 'B']))
    expect([...collapsed]).toEqual([3, 4])
  })

  it('faltet nichts zusammen, wenn der Brief nur aus Leerzeilen besteht und kurz ist', () => {
    expect([...collapsedEmptyParagraphs(paragraphs(['', '']))]).toEqual([])
  })
})
