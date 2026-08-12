import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DocxDocument } from '@/lib/docx/model'
import { HISTORY_LIMIT, useDocumentHistory } from './useDocumentHistory'

/**
 * Die Historie sieht in ein `DocxDocument` nie hinein, sie hält es nur fest.
 * Deshalb genügen hier unterscheidbare Attrappen; ein echtes Dokument je
 * Zustand würde den Test langsam machen, ohne etwas mehr zu prüfen.
 */
function doc(label: string): DocxDocument {
  return { text: label } as unknown as DocxDocument
}

describe('useDocumentHistory', () => {
  it('beginnt leer und ohne Rückgängig', () => {
    const { result } = renderHook(() => useDocumentHistory())

    expect(result.current.document).toBeNull()
    expect(result.current.canUndo).toBe(false)
  })

  it('nimmt das geladene Dokument auf, ohne einen Schritt anzulegen', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const first = doc('geladen')

    act(() => result.current.reset(first))

    expect(result.current.document).toBe(first)
    expect(result.current.canUndo).toBe(false)
  })

  it('stellt mit Rückgängig genau den vorigen Stand wieder her', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const first = doc('eins')
    const second = doc('zwei')

    act(() => result.current.reset(first))
    act(() => result.current.commit(second))
    expect(result.current.document).toBe(second)
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())

    expect(result.current.document).toBe(first)
    expect(result.current.canUndo).toBe(false)
  })

  it('fasst Änderungen mit demselben Merkmal zu einem Schritt zusammen', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const run = {}

    act(() => result.current.reset(doc('leer')))
    act(() => result.current.commit(doc('T'), run))
    act(() => result.current.commit(doc('Te'), run))
    act(() => result.current.commit(doc('Tex'), run))

    expect(result.current.document?.text).toBe('Tex')
    expect(result.current.depth).toBe(1)

    act(() => result.current.undo())

    expect(result.current.document?.text).toBe('leer')
  })

  it('trennt zwei Läufe mit verschiedenen Merkmalen in zwei Schritte', () => {
    const { result } = renderHook(() => useDocumentHistory())

    act(() => result.current.reset(doc('leer')))
    act(() => result.current.commit(doc('A'), {}))
    act(() => result.current.commit(doc('AB'), {}))

    expect(result.current.depth).toBe(2)
  })

  it('legt ohne Merkmal für jede Änderung einen eigenen Schritt an', () => {
    const { result } = renderHook(() => useDocumentHistory())

    act(() => result.current.reset(doc('leer')))
    act(() => result.current.commit(doc('eins')))
    act(() => result.current.commit(doc('zwei')))

    expect(result.current.depth).toBe(2)
  })

  it('beginnt nach einem Rückgängig einen neuen Schritt, auch bei gleichem Merkmal', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const run = {}

    act(() => result.current.reset(doc('leer')))
    act(() => result.current.commit(doc('A'), run))
    act(() => result.current.undo())
    act(() => result.current.commit(doc('B'), run))

    // Ohne das Zurücksetzen des Merkmals hätte der zweite `commit` den
    // gerade wiederhergestellten Stand überschrieben, statt ihn zu bewahren.
    expect(result.current.depth).toBe(1)
    act(() => result.current.undo())
    expect(result.current.document?.text).toBe('leer')
  })

  it('hält höchstens HISTORY_LIMIT Schritte und wirft die ältesten weg', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const overflow = 5

    act(() => result.current.reset(doc('stand-0')))
    for (let step = 1; step <= HISTORY_LIMIT + overflow; step += 1) {
      act(() => result.current.commit(doc(`stand-${step}`)))
    }

    expect(result.current.depth).toBe(HISTORY_LIMIT)

    for (let step = 0; step < HISTORY_LIMIT; step += 1) {
      act(() => result.current.undo())
    }

    expect(result.current.canUndo).toBe(false)
    // Zurück bis genau an die Grenze, nicht bis zum Anfang: Die ältesten
    // fünf Stände sind bewusst weg.
    expect(result.current.document?.text).toBe(`stand-${overflow}`)
  })

  it('tut bei Rückgängig ohne Verlauf nichts', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const only = doc('einzig')

    act(() => result.current.reset(only))
    act(() => result.current.undo())

    expect(result.current.document).toBe(only)
  })

  it('legt für einen unveränderten Stand keinen Schritt an', () => {
    const { result } = renderHook(() => useDocumentHistory())
    const same = doc('gleich')

    act(() => result.current.reset(same))
    act(() => result.current.commit(same))

    expect(result.current.canUndo).toBe(false)
  })

  it('räumt den Verlauf, wenn ein neues Dokument geladen wird', () => {
    const { result } = renderHook(() => useDocumentHistory())

    act(() => result.current.reset(doc('alt')))
    act(() => result.current.commit(doc('bearbeitet')))
    act(() => result.current.reset(doc('neu')))

    expect(result.current.canUndo).toBe(false)
    expect(result.current.document?.text).toBe('neu')
  })
})
