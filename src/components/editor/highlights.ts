/**
 * Der Zugang zur CSS Custom Highlight API — die einzige Art, im Brief
 * Zeichen auszuzeichnen, **ohne den DOM anzufassen**.
 *
 * Warum das keine Feinheit ist, steht ausführlich in `useMarkHighlight.ts`:
 * Eine Auszeichnung *innerhalb* des Absatztexts bräuchte ein Zwischenelement,
 * und das bräche die Offset-Rechnung in `documentSelection.ts`; im
 * `contentEditable` fiele es außerdem beim ersten Tastendruck auseinander.
 *
 * Hier steht nur das Gemeinsame: der Registrierungspunkt und das Setzen. Zwei
 * Haken benutzen es — die vorgemerkten Stellen (`useMarkHighlight`) und die
 * Textprüfung (`useProofreadingHighlight`). Die Farben und die Wellenlinie
 * selbst stehen in `design.css` unter `::highlight(…)`.
 *
 * **Wo es die API nicht gibt** (jsdom in den Tests, ältere Browser), entfällt
 * die Auszeichnung und sonst nichts. Das ist tragbar, weil die Bedeutung nie
 * allein an ihr hängt: Was vorgemerkt ist, steht im `MarkPanel`, was die
 * Prüfung gefunden hat, im `ProofreadingPanel` (DESIGN.md, „Kontrast").
 */

export interface HighlightRegistry {
  set: (name: string, highlight: object) => void
  delete: (name: string) => void
}

/** Der Registrierungspunkt der API, `null` wo der Browser sie nicht kennt. */
export function highlightRegistry(): HighlightRegistry | null {
  const api = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS
  if (api?.highlights === undefined) return null
  if (typeof (globalThis as { Highlight?: unknown }).Highlight !== 'function') return null
  return api.highlights
}

/**
 * Ein leerer Eintrag wird **entfernt** statt leer gesetzt: Ein `Highlight`
 * ohne Bereiche ist zwar wirkungslos, bliebe aber in der Registrierung stehen
 * und wäre in den Entwicklerwerkzeugen ein Hinweis auf etwas, das es nicht
 * gibt.
 */
export function applyHighlight(
  registry: HighlightRegistry,
  name: string,
  ranges: Range[],
): void {
  if (ranges.length === 0) {
    registry.delete(name)
    return
  }
  const Constructor = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => object })
    .Highlight
  registry.set(name, new Constructor(...ranges))
}
