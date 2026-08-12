import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COARSE_POINTER_QUERY, usePrecisePointer } from './usePrecisePointer'

interface FakeMediaQuery {
  matches: boolean
  emit: (matches: boolean) => void
}

/**
 * jsdom kennt `matchMedia` nicht (nachgemessen). Der Ersatz ist deshalb
 * zugleich der Nachweis, dass der Haken die Schnittstelle so benutzt, wie
 * der Browser sie anbietet: eine Abfrage, ein Zuhörer, ein Abbestellen.
 *
 * `matches` heißt hier „grobes Zeigegerät" — der Haken meldet das
 * Umgekehrte.
 */
function stubMatchMedia(initial: boolean): FakeMediaQuery {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches: initial,
    media: COARSE_POINTER_QUERY,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia
  return {
    get matches() {
      return query.matches
    },
    emit: (matches: boolean) => {
      query.matches = matches
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent)
    },
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('usePrecisePointer', () => {
  it('nimmt ein genaues Zeigegerät an, wenn der Browser nicht gefragt werden kann', () => {
    const { result } = renderHook(() => usePrecisePointer())

    expect(result.current).toBe(true)
  })

  it('fragt nach dem Zeigegerät, nicht nach der Fensterbreite', () => {
    stubMatchMedia(false)

    renderHook(() => usePrecisePointer())

    expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
  })

  it('meldet ein grobes Zeigegerät als nicht genau', () => {
    stubMatchMedia(true)

    const { result } = renderHook(() => usePrecisePointer())

    expect(result.current).toBe(false)
  })

  // Eine Maus an ein Tablet gesteckt, ein Notebook in den Tablet-Modus
  // geklappt: Das primäre Zeigegerät wechselt zur Laufzeit.
  it('zieht nach, wenn das Zeigegerät wechselt', () => {
    const query = stubMatchMedia(true)
    const { result } = renderHook(() => usePrecisePointer())

    act(() => query.emit(false))

    expect(result.current).toBe(true)
  })

  it('bestellt seinen Zuhörer wieder ab', () => {
    const query = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => usePrecisePointer())

    unmount()
    act(() => query.emit(true))

    expect(result.current).toBe(true)
  })
})
