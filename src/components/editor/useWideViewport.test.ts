import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWideViewport, WIDE_VIEWPORT_QUERY } from './useWideViewport'

interface FakeMediaQuery {
  emit: (matches: boolean) => void
}

/** Wie in `usePrecisePointer.test.ts`: jsdom kennt `matchMedia` nicht. */
function stubMatchMedia(initial: boolean): FakeMediaQuery {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches: initial,
    media: WIDE_VIEWPORT_QUERY,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia
  return {
    emit: (matches: boolean) => {
      query.matches = matches
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent)
    },
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('useWideViewport', () => {
  it('nimmt ein breites Fenster an, wenn der Browser nicht gefragt werden kann', () => {
    const { result } = renderHook(() => useWideViewport())

    expect(result.current).toBe(true)
  })

  it('fragt nach derselben Schwelle wie die lg-Klassen im Aufbau', () => {
    stubMatchMedia(true)

    renderHook(() => useWideViewport())

    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 64rem)')
  })

  it('meldet ein schmales Fenster', () => {
    stubMatchMedia(false)

    const { result } = renderHook(() => useWideViewport())

    expect(result.current).toBe(false)
  })

  it('zieht nach, wenn das Fenster die Schwelle überschreitet', () => {
    const query = stubMatchMedia(false)
    const { result } = renderHook(() => useWideViewport())

    act(() => query.emit(true))

    expect(result.current).toBe(true)
  })

  it('bestellt seinen Zuhörer wieder ab', () => {
    const query = stubMatchMedia(true)
    const { result, unmount } = renderHook(() => useWideViewport())

    unmount()
    act(() => query.emit(false))

    expect(result.current).toBe(true)
  })
})
