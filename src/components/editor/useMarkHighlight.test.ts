import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createAnchor, type Mark } from './marks'
import { useMarkHighlight, MARK_HIGHLIGHT, MARK_HIGHLIGHT_DONE } from './useMarkHighlight'

const TEXT = 'Sehr geehrte Damen und Herren, ich bewerbe mich um die Stelle.'

/**
 * Eine Attrappe der CSS Custom Highlight API. jsdom bringt sie nicht mit,
 * und genau das ist auch ein Prüffall: Ohne die Attrappe darf der Haken
 * nichts tun und nichts werfen.
 */
class FakeHighlight {
  readonly ranges: Range[]
  constructor(...ranges: Range[]) {
    this.ranges = ranges
  }
}

function installHighlightApi(): Map<string, FakeHighlight> {
  const registry = new Map<string, FakeHighlight>()
  Object.defineProperty(globalThis, 'Highlight', { value: FakeHighlight, configurable: true })
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: registry }, configurable: true })
  return registry
}

function removeHighlightApi(): void {
  Reflect.deleteProperty(globalThis, 'Highlight')
  Reflect.deleteProperty(globalThis, 'CSS')
}

function makeRoot(): HTMLDivElement {
  const root = document.createElement('div')
  const paragraph = document.createElement('p')
  paragraph.setAttribute('data-paragraph-start', '0')
  paragraph.setAttribute('data-paragraph-index', '0')
  paragraph.textContent = TEXT
  root.append(paragraph)
  document.body.append(root)
  return root
}

function markOn(needle: string, done = false): Mark {
  const from = TEXT.indexOf(needle)
  const range = { from, to: from + needle.length }
  return { id: needle, range, anchor: createAnchor(TEXT, range), current: needle, done }
}

afterEach(() => {
  removeHighlightApi()
  document.body.replaceChildren()
})

describe('useMarkHighlight', () => {
  it('tut nichts, wenn der Browser die Hinterlegung nicht kennt', () => {
    const root = makeRoot()
    expect(() =>
      renderHook(() => useMarkHighlight({ rootRef: { current: root }, marks: [markOn('Damen')] })),
    ).not.toThrow()
  })

  it('hinterlegt jede offene Stelle', () => {
    const registry = installHighlightApi()
    const root = makeRoot()

    renderHook(() =>
      useMarkHighlight({ rootRef: { current: root }, marks: [markOn('Damen'), markOn('Stelle')] }),
    )

    expect(registry.get(MARK_HIGHLIGHT)?.ranges).toHaveLength(2)
  })

  it('trennt erledigte Stellen von offenen', () => {
    const registry = installHighlightApi()
    const root = makeRoot()

    renderHook(() =>
      useMarkHighlight({
        rootRef: { current: root },
        marks: [markOn('Damen'), markOn('Stelle', true)],
      }),
    )

    expect(registry.get(MARK_HIGHLIGHT)?.ranges).toHaveLength(1)
    expect(registry.get(MARK_HIGHLIGHT_DONE)?.ranges).toHaveLength(1)
  })

  it('nimmt die Hinterlegung zurück, sobald nichts mehr vorgemerkt ist', () => {
    const registry = installHighlightApi()
    const root = makeRoot()
    const { rerender } = renderHook(
      ({ marks }: { marks: Mark[] }) => useMarkHighlight({ rootRef: { current: root }, marks }),
      { initialProps: { marks: [markOn('Damen')] } },
    )

    rerender({ marks: [] })

    expect(registry.has(MARK_HIGHLIGHT)).toBe(false)
  })

  it('räumt beim Abbau auf', () => {
    const registry = installHighlightApi()
    const root = makeRoot()
    const { unmount } = renderHook(() =>
      useMarkHighlight({ rootRef: { current: root }, marks: [markOn('Damen')] }),
    )

    unmount()

    expect(registry.has(MARK_HIGHLIGHT)).toBe(false)
    expect(registry.has(MARK_HIGHLIGHT_DONE)).toBe(false)
  })
})
