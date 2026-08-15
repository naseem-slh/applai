import type { FigureCheck } from './factsGuard'
import type { Variant } from './rewrite'

/**
 * Der Befund einer Variante, an der die Faktenprüfung nichts gefunden hat.
 *
 * Er steht hier und nicht als Vorgabewert am Typ: `Variant.figures` ist ein
 * Pflichtfeld, damit niemand vergisst, es zu füllen — `rewriteSelection` ist
 * der einzige Ort, der es echt berechnet. Tests, die eine Variante von Hand
 * bauen, brauchen trotzdem einen Wert, und „nichts gefunden" ist für sie der
 * uninteressante Normalfall.
 */
export const NO_FIGURES: FigureCheck = { added: [], removed: [] }

/** Eine Variante für Tests, mit leerem Faktenbefund, sofern nichts anderes gesagt wird. */
export function variant(text: string, overrides: Partial<Variant> = {}): Variant {
  return { text, unbackedClaims: [], figures: NO_FIGURES, ...overrides }
}
