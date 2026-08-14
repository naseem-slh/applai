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

  it('beginnt mit einem übergroßen Absatz und trennt danach', () => {
    expect(splitIntoPages([1000, 100], 500)).toEqual([[0], [1]])
  })

  // Der gemeldete Fehler: Ein frisches Blatt für den übergroßen Absatz ließ
  // die Seite davor fast leer, und überlaufen wäre er dort genauso.
  it('lässt einen übergroßen Absatz auf der angefangenen Seite und sie wachsen', () => {
    expect(splitIntoPages([100, 1000], 500)).toEqual([[0, 1]])
  })

  it('trennt nach einem übergroßen Absatz wieder gewöhnlich', () => {
    expect(splitIntoPages([100, 1000, 100], 500)).toEqual([[0, 1], [2]])
  })

  // Der Abstand fällt nur zwischen zwei Absätzen an. Ihn jedem zuzuschlagen
  // verschenkte je Seite einen Abstand — bei zwanzig Seiten ein ganzer
  // Absatz.
  it('rechnet den Abstand zwischen Absätzen, nicht hinter dem letzten', () => {
    // Drei Absätze zu 100 plus zwei Abstände zu 20 sind genau 340.
    expect(splitIntoPages([100, 100, 100], 340, 20)).toEqual([[0, 1, 2]])
  })

  it('trennt, sobald der Abstand den nächsten Absatz nicht mehr hineinlässt', () => {
    expect(splitIntoPages([100, 100, 100], 339, 20)).toEqual([[0, 1], [2]])
  })

  // Eine zusammengefallene Leerzeile meldet eine negative Höhe von genau
  // einem Abstand: Sie ist nicht nur nichts hoch, sie hebt auch den Abstand
  // vor sich auf (siehe `DocumentView`). Unterm Strich kostet sie null.
  it('lässt eine Zeile, die ihren eigenen Abstand aufhebt, nichts kosten', () => {
    // Zwei Absätze zu 100 mit einem Abstand von 20 sind 220 — die
    // aufgehobene Zeile dazwischen ändert daran nichts.
    expect(splitIntoPages([100, -20, 100], 220, 20)).toEqual([[0, 1, 2]])
    expect(splitIntoPages([100, -20, 100], 219, 20)).toEqual([[0, 1], [2]])
  })

  // Am Kopf einer Seite gibt es keinen Abstand, den sie aufheben könnte —
  // sie kostet dort null und darf der Seite nichts gutschreiben. Zwei
  // Absätze zu 100 mit zwei Abständen zu 20 sind deshalb 240, nicht 220.
  it('schenkt der Seite keinen Platz, wenn so eine Zeile oben steht', () => {
    expect(splitIntoPages([-20, 100, 100], 240, 20)).toEqual([[0, 1, 2]])
    expect(splitIntoPages([-20, 100, 100], 239, 20)).toEqual([[0, 1], [2]])
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

  it(`lässt ${VISIBLE_EMPTY_RUN} Leerzeile hintereinander stehen`, () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['Text', '', '', 'Mehr']))
    expect([...collapsed]).toEqual([2])
  })

  it('faltet jede weitere Leerzeile eines Laufs zusammen', () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['Text', '', '', '', '', 'Mehr']))
    expect([...collapsed]).toEqual([2, 3, 4])
  })

  it('zählt je Lauf neu, nicht über das ganze Dokument', () => {
    const collapsed = collapsedEmptyParagraphs(
      paragraphs(['A', '', '', '', 'B', '', '', '', 'C']),
    )
    expect([...collapsed]).toEqual([2, 3, 6, 7])
  })

  // Leerraum ist nicht dasselbe wie Leere: Ein Absatz aus Leerzeichen sieht
  // im Brief aus wie eine Leerzeile und zählt deshalb als eine.
  it('behandelt einen Absatz aus reinem Leerraum wie eine Leerzeile', () => {
    const collapsed = collapsedEmptyParagraphs(paragraphs(['A', '', '  ', '\t', '', 'B']))
    expect([...collapsed]).toEqual([2, 3, 4])
  })

  it('lässt eine einzelne Leerzeile auch am Anfang des Briefes stehen', () => {
    expect([...collapsedEmptyParagraphs(paragraphs(['', 'A']))]).toEqual([])
  })
})
