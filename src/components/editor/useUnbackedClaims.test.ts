import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import { useUnbackedClaims } from './useUnbackedClaims'

/** Wie in `unbackedClaims.test.ts`: nur Absatztexte und ihre Offsets. */
function fakeDocument(texts: string[]): DocxDocument {
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return {
      index,
      node: null as unknown as Element,
      text,
      runs: [],
      start,
      end: start + text.length,
    }
  })
  return { zip: {}, doc: null as unknown as XMLDocument, paragraphs, text: texts.join('\n') }
}

const WITH_CLAIM = fakeDocument(['Sehr geehrte Damen und Herren,', 'Ich spreche fließend Finnisch.'])
const WITHOUT_CLAIM = fakeDocument(['Sehr geehrte Damen und Herren,', 'Ich lerne gerade Finnisch.'])

describe('useUnbackedClaims', () => {
  it('beginnt ohne Aussagen und ohne Sperre', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    expect(result.current.located).toEqual([])
    expect(result.current.exportBlocked).toBe(false)
  })

  it('sperrt den Export, sobald eine gemeldete Aussage im Dokument steht', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    act(() => result.current.add(['spreche fließend Finnisch']))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pendingParagraphs).toEqual([1])
    expect(result.current.exportBlocked).toBe(true)
  })

  it('gibt den Export nach der Einzelbestätigung frei', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    act(() => result.current.add(['spreche fließend Finnisch']))
    act(() => result.current.confirm(result.current.pending[0]!.id))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.located).toHaveLength(1)
    expect(result.current.exportBlocked).toBe(false)
  })

  it('sperrt nicht mehr, sobald die Aussage nicht mehr im Dokument steht', () => {
    const { result, rerender } = renderHook(({ docx }) => useUnbackedClaims(docx), {
      initialProps: { docx: WITH_CLAIM },
    })

    act(() => result.current.add(['spreche fließend Finnisch']))
    expect(result.current.exportBlocked).toBe(true)

    rerender({ docx: WITHOUT_CLAIM })

    expect(result.current.located).toEqual([])
    expect(result.current.exportBlocked).toBe(false)
  })

  it('sperrt wieder, wenn die Aussage zurückkehrt — Rückgängig darf keine Markierung verlieren', () => {
    const { result, rerender } = renderHook(({ docx }) => useUnbackedClaims(docx), {
      initialProps: { docx: WITH_CLAIM },
    })

    act(() => result.current.add(['spreche fließend Finnisch']))
    rerender({ docx: WITHOUT_CLAIM })
    expect(result.current.exportBlocked).toBe(false)

    rerender({ docx: WITH_CLAIM })

    expect(result.current.exportBlocked).toBe(true)
  })

  it('nimmt denselben Wortlaut nicht zweimal auf und behält seine Bestätigung', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    act(() => result.current.add(['spreche fließend Finnisch']))
    act(() => result.current.confirm(result.current.located[0]!.id))
    act(() => result.current.add(['spreche   fließend\nFinnisch']))

    expect(result.current.located).toHaveLength(1)
    expect(result.current.exportBlocked).toBe(false)
  })

  it('übergeht Aussagen, die nur aus Leerraum bestehen — eine Sperre ohne Fundstelle wäre unauflösbar', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    act(() => result.current.add(['   ']))

    expect(result.current.located).toEqual([])
    expect(result.current.exportBlocked).toBe(false)
  })

  it('nimmt mehrere Aussagen einer Variante in einem Zug auf', () => {
    const { result } = renderHook(() => useUnbackedClaims(WITH_CLAIM))

    act(() => result.current.add(['spreche fließend Finnisch', 'Sehr geehrte Damen']))

    expect(result.current.pending).toHaveLength(2)
    expect(result.current.pendingParagraphs).toEqual([0, 1])
  })
})
