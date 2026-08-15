import { useLayoutEffect, type RefObject } from 'react'
import { rangeToDomRange } from './documentSelection'
import { applyHighlight, highlightRegistry } from './highlights'
import type { ProofreadingFinding } from './proofreading'

/**
 * Die Wellenlinie unter den Befunden der Textprüfung.
 *
 * Sie muss **Zeichen** treffen, nicht Absätze: Ein doppeltes Wort oder ein
 * Leerzeichen vor dem Komma sind zwei, drei Zeichen — die Kontur am
 * Absatzrand, mit der unbelegte Aussagen und Fremdfirmen gemeldet werden,
 * sagte hier nichts. Also derselbe Weg wie bei den vorgemerkten Stellen: die
 * CSS Custom Highlight API über `highlights.ts`, die Bereiche färbt und den
 * Baum unberührt lässt. Wie die Linie aussieht, steht in `design.css` unter
 * `::highlight(applai-proofreading)`.
 *
 * `useLayoutEffect` aus demselben Grund wie in `useMarkHighlight`: Die Linie
 * gehört in denselben Bildaufbau wie der Text darunter, sonst blitzt sie nach
 * einer Bearbeitung kurz an der alten Stelle auf.
 */

export const PROOFREADING_HIGHLIGHT = 'applai-proofreading'

export interface ProofreadingHighlightOptions {
  /** Die Fläche, die die Absätze trägt. */
  rootRef: RefObject<HTMLElement | null>
  findings: readonly ProofreadingFinding[]
}

export function useProofreadingHighlight({
  rootRef,
  findings,
}: ProofreadingHighlightOptions): void {
  useLayoutEffect(() => {
    const registry = highlightRegistry()
    const root = rootRef.current
    if (registry === null || root === null) return

    const ranges: Range[] = []
    for (const finding of findings) {
      const range = rangeToDomRange(root, finding.range)
      if (range === null) continue
      ranges.push(range)
    }

    applyHighlight(registry, PROOFREADING_HIGHLIGHT, ranges)

    return () => {
      registry.delete(PROOFREADING_HIGHLIGHT)
    }
  }, [rootRef, findings])
}
