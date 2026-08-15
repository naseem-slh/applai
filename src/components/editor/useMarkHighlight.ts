import { useLayoutEffect, type RefObject } from 'react'
import { rangeToDomRange } from './documentSelection'
import { applyHighlight, highlightRegistry } from './highlights'
import type { Mark } from './marks'

/**
 * Die vorgemerkten Stellen im Brief farbig hinterlegen — **ohne den DOM
 * anzufassen**.
 *
 * Das ist hier keine Feinheit, sondern die einzige gangbare Bauweise.
 * `DocumentView` hält ausdrücklich fest, dass eine Auszeichnung *innerhalb*
 * des Absatztexts die Offset-Rechnung in `documentSelection.ts` bricht —
 * deshalb werden unbelegte Aussagen und Fremdfirmen dort nur auf
 * Absatzebene hervorgehoben. Ein Absatz ist für eine vorgemerkte Stelle
 * aber zu grob: Sie ist oft ein halber Satz. Eingeschobene `<span>` fielen
 * zudem im `contentEditable` beim ersten Tastendruck auseinander.
 *
 * Die CSS Custom Highlight API löst genau das: Sie färbt Bereiche, die als
 * `Range` übergeben werden, und lässt den Baum unberührt. Der Zugang zu ihr
 * liegt in `highlights.ts`, geteilt mit der Textprüfung. Die Farben stehen in
 * `design.css` unter `::highlight(applai-mark)` und
 * `::highlight(applai-mark-done)`.
 *
 * **Wo es sie nicht gibt** (jsdom in den Tests, ältere Browser), entfällt
 * die Hinterlegung und sonst nichts. Das ist tragbar, weil die Bedeutung
 * nicht an der Farbe hängt: Welche Stellen vorgemerkt sind, steht
 * nummeriert und im Wortlaut in `MarkPanel` (DESIGN.md, „Kontrast").
 *
 * `useLayoutEffect` aus demselben Grund wie in `DocumentView`: Die
 * Hinterlegung soll im selben Bildaufbau sitzen wie der Text, zu dem sie
 * gehört, sonst blitzt sie nach einer Textänderung kurz an der alten Stelle
 * auf.
 */

export const MARK_HIGHLIGHT = 'applai-mark'
export const MARK_HIGHLIGHT_DONE = 'applai-mark-done'

export interface MarkHighlightOptions {
  /** Die Fläche, die die Absätze trägt. */
  rootRef: RefObject<HTMLElement | null>
  marks: readonly Mark[]
}

export function useMarkHighlight({ rootRef, marks }: MarkHighlightOptions): void {
  useLayoutEffect(() => {
    const registry = highlightRegistry()
    const root = rootRef.current
    if (registry === null || root === null) return

    const open: Range[] = []
    const done: Range[] = []
    for (const mark of marks) {
      const range = rangeToDomRange(root, mark.range)
      if (range === null) continue
      ;(mark.done ? done : open).push(range)
    }

    applyHighlight(registry, MARK_HIGHLIGHT, open)
    applyHighlight(registry, MARK_HIGHLIGHT_DONE, done)

    return () => {
      registry.delete(MARK_HIGHLIGHT)
      registry.delete(MARK_HIGHLIGHT_DONE)
    }
  }, [rootRef, marks])
}
