import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProofreadingFinding } from './proofreading'
import { PROOFREADING_HIGHLIGHT, useProofreadingHighlight } from './useProofreadingHighlight'

const TEXT = 'Ich habe habe dort gearbeitet und arbeite seid 2024 im Team.'

/**
 * Dieselbe Attrappe wie in `useMarkHighlight.test.ts`: jsdom bringt die CSS
 * Custom Highlight API nicht mit, und dass der Haken ohne sie einfach nichts
 * tut, ist selbst ein Prüffall.
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

function findingOn(needle: string, suggestion: string): ProofreadingFinding {
  const from = TEXT.indexOf(needle)
  return {
    id: `test-${from}`,
    rule: 'doubledWord',
    range: { from, to: from + needle.length },
    found: needle,
    suggestion,
    paragraph: 0,
  }
}

afterEach(() => {
  removeHighlightApi()
  document.body.replaceChildren()
})

describe('useProofreadingHighlight', () => {
  it('tut nichts, wenn der Browser die Hervorhebung nicht kennt', () => {
    const root = makeRoot()
    expect(() =>
      renderHook(() =>
        useProofreadingHighlight({
          rootRef: { current: root },
          findings: [findingOn('habe habe', 'habe')],
        }),
      ),
    ).not.toThrow()
  })

  it('meldet die Bereiche der Befunde unter einem Namen an', () => {
    const registry = installHighlightApi()
    const root = makeRoot()
    renderHook(() =>
      useProofreadingHighlight({
        rootRef: { current: root },
        findings: [findingOn('habe habe', 'habe'), findingOn('seid', 'seit')],
      }),
    )

    const highlight = registry.get(PROOFREADING_HIGHLIGHT)
    expect(highlight).toBeInstanceOf(FakeHighlight)
    expect(highlight?.ranges).toHaveLength(2)
    expect(highlight?.ranges[0]?.toString()).toBe('habe habe')
    expect(highlight?.ranges[1]?.toString()).toBe('seid')
  })

  it('nimmt den Eintrag zurück, wenn nichts mehr gefunden wird', () => {
    const registry = installHighlightApi()
    const root = makeRoot()
    const { rerender } = renderHook(
      ({ findings }: { findings: ProofreadingFinding[] }) =>
        useProofreadingHighlight({ rootRef: { current: root }, findings }),
      { initialProps: { findings: [findingOn('habe habe', 'habe')] } },
    )
    expect(registry.has(PROOFREADING_HIGHLIGHT)).toBe(true)

    // Ein leerer Eintrag bliebe sonst in der Registrierung stehen und wäre
    // ein Hinweis auf etwas, das es nicht mehr gibt.
    rerender({ findings: [] })
    expect(registry.has(PROOFREADING_HIGHLIGHT)).toBe(false)
  })

  it('räumt beim Abbauen auf', () => {
    const registry = installHighlightApi()
    const root = makeRoot()
    const { unmount } = renderHook(() =>
      useProofreadingHighlight({
        rootRef: { current: root },
        findings: [findingOn('habe habe', 'habe')],
      }),
    )
    expect(registry.has(PROOFREADING_HIGHLIGHT)).toBe(true)

    unmount()
    expect(registry.has(PROOFREADING_HIGHLIGHT)).toBe(false)
  })
})
