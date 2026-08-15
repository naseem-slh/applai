import { describe, expect, it } from 'vitest'
import { splitIntoPages } from './pagination'

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
