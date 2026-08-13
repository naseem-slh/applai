import type { Variant } from './rewrite'

/**
 * Der Durchlauf über die vorgemerkten Stellen — als Zustandsmaschine, ohne
 * React, ohne Anbieter, ohne Dokument.
 *
 * **Sie besitzt die Reihenfolge, nicht den Text.** Was zu tun ist, sagt
 * {@link naechsteHandlung}; getan wird es vom Aufrufer. Deshalb ist der Kern
 * dieser Erweiterung ohne Oberfläche prüfbar, und deshalb gibt es hier
 * keinen zweiten Weg, auf dem sich Brieftext ändert — der eine liegt in
 * `Editor.tsx` (`applyEdit`) und bleibt der einzige.
 *
 * **Ein Schritt trägt eine Marken-Kennung, nie einen Zeichenbereich.** Jede
 * Übernahme verschiebt den Text hinter sich; ein hier gemerkter Bereich wäre
 * nach dem ersten Schritt falsch. Der Aufrufer liest den Bereich vor jedem
 * Schritt frisch aus der Merkliste, die `shiftMarks` bereits nachgeführt hat.
 */

export type ReapplyMode = 'schnell' | 'waehlen'

/** Warum der Durchlauf ruht. Genau vier Gründe, siehe Spezifikation. */
export type HaltReason = 'wahl' | 'unbelegteAussagen' | 'anbieterfehler' | 'antwortVerworfen'

/** Warum eine Stelle ohne Übernahme geblieben ist. */
export type SkipReason = HaltReason | 'abgebrochen'

/** Eine Stelle im Durchlauf — über die Kennung, nie über den Bereich. */
export interface ReapplyStep {
  markId: string
}

export interface SkippedStep {
  markId: string
  reason: SkipReason
}

/** Was jeder laufende Zustand mitführt. */
interface Lauf {
  mode: ReapplyMode
  steps: readonly ReapplyStep[]
  index: number
  applied: number
  skipped: readonly SkippedStep[]
}

export type ReapplyState =
  | { status: 'bereit' }
  | ({ status: 'anzeigeWirdGelesen' } & Lauf)
  | ({ status: 'laeuft' } & Lauf)
  | ({ status: 'uebernimmt'; variant: Variant } & Lauf)
  | ({ status: 'haelt'; reason: HaltReason; variants: readonly Variant[] } & Lauf)
  | { status: 'fertig'; applied: number; skipped: readonly SkippedStep[] }
  | { status: 'abgebrochen'; applied: number; skipped: readonly SkippedStep[] }

/**
 * Was der Aufrufer als Nächstes tun soll. Die Maschine tut es nicht selbst —
 * sie kennt weder Anbieter noch Dokument.
 */
export type Handlung =
  | { kind: 'anzeigeLesen' }
  | { kind: 'anfordern'; markId: string }
  | { kind: 'uebernehmen'; markId: string; variant: Variant }
  | { kind: 'warten' }
  | { kind: 'beendet' }

// ---------------------------------------------------------------------------
// Übergänge — jeder nimmt einen Zustand und gibt einen neuen zurück
// ---------------------------------------------------------------------------

/**
 * Jeder Übergang lässt einen Zustand, der nicht zu ihm passt, unverändert
 * stehen, statt zu werfen. Der Aufrufer ist ein Effekt, der nebenläufig mit
 * Abbruch und Wiederholung arbeitet; eine verspätete Antwort auf eine
 * abgebrochene Anfrage ist dort der Normalfall und kein Fehler.
 */
export function starten(steps: readonly ReapplyStep[], mode: ReapplyMode): ReapplyState {
  return { status: 'anzeigeWirdGelesen', mode, steps, index: 0, applied: 0, skipped: [] }
}

/**
 * Die Anzeige ist ausgewertet. Ohne vorgemerkte Stellen gibt es nichts zu
 * tun — der Brief trägt dann nur den selbsttätigen Briefkopf, und das ist
 * ein gültiges Ergebnis, kein Fehler.
 */
export function anzeigeGelesen(state: ReapplyState): ReapplyState {
  if (state.status !== 'anzeigeWirdGelesen') return state
  return state.steps.length === 0
    ? { status: 'fertig', applied: state.applied, skipped: state.skipped }
    : { ...state, status: 'laeuft' }
}

/**
 * Die einzige Stelle, an der die Betriebsart überhaupt zählt.
 *
 * **Unbelegte Aussagen schlagen die Betriebsart.** G10 verlangt für
 * erfundene Fakten Einzelbestätigung, und die lässt sich nicht
 * wegautomatisieren — auch nicht von einem Modus, der „schnell" heißt. Im
 * strengen Modus ist `unbackedClaims` immer leer; dort läuft der
 * Schnellmodus tatsächlich ohne eine einzige Rückfrage durch.
 *
 * Eine leere Variantenliste kommt aus `rewrite.ts` nicht vor (dort ist die
 * Anzahl hart geprüft). Sie wird hier trotzdem behandelt, weil ein Zustand
 * ohne erste Variante sonst stillschweigend hängen bliebe.
 */
export function variantenDa(state: ReapplyState, variants: readonly Variant[]): ReapplyState {
  if (state.status !== 'laeuft') return state
  const erste = variants[0]
  if (erste === undefined) {
    return { ...state, status: 'haelt', reason: 'antwortVerworfen', variants: [] }
  }
  if (state.mode === 'waehlen') {
    return { ...state, status: 'haelt', reason: 'wahl', variants }
  }
  if (erste.unbackedClaims.length > 0) {
    return { ...state, status: 'haelt', reason: 'unbelegteAussagen', variants }
  }
  return { ...state, status: 'uebernimmt', variant: erste }
}

/** Aus dem Halt heraus eine Variante nehmen. */
export function waehlen(state: ReapplyState, variant: Variant): ReapplyState {
  if (state.status !== 'haelt') return state
  return { ...lauf(state), status: 'uebernimmt', variant }
}

/**
 * Der Aufrufer hat den Text eingesetzt; der Zeiger rückt weiter.
 *
 * Gezählt wird **hier** und nicht beim Wählen: Erst wenn `applyEdit` gerufen
 * wurde, steht die Übernahme im Brief, und nur was im Brief steht, gehört in
 * den Bericht.
 */
export function uebernommen(state: ReapplyState): ReapplyState {
  if (state.status !== 'uebernimmt') return state
  return weiter({ ...lauf(state), applied: state.applied + 1 })
}

/**
 * Die Anfrage für die laufende Stelle ist gescheitert.
 *
 * `antwortVerworfen` steht für eine Antwort, die `rewrite.ts` an seiner
 * harten Grenze zurückgewiesen hat; alles Übrige — Netz, Schlüssel,
 * Kontingent — ist `anbieterfehler`. Die Unterscheidung trägt die
 * Oberfläche, nicht der Fehlertext.
 */
export function fehler(
  state: ReapplyState,
  reason: 'anbieterfehler' | 'antwortVerworfen',
): ReapplyState {
  if (state.status !== 'laeuft') return state
  return { ...state, status: 'haelt', reason, variants: [] }
}

/** Aus dem Halt heraus dieselbe Stelle noch einmal anfordern. */
export function nochmal(state: ReapplyState): ReapplyState {
  if (state.status !== 'haelt') return state
  return { ...lauf(state), status: 'laeuft' }
}

/** Die Stelle bleibt, wie sie ist — mit dem Grund, der zum Halt geführt hat. */
export function ueberspringen(state: ReapplyState): ReapplyState {
  if (state.status !== 'haelt') return state
  const current = lauf(state)
  return weiter({
    ...current,
    skipped: [
      ...current.skipped,
      { markId: current.steps[current.index].markId, reason: state.reason },
    ],
  })
}

/**
 * Abbrechen heißt: Was im Brief steht, bleibt stehen.
 *
 * Die noch nicht bearbeiteten Stellen wandern in `skipped`, damit der
 * Bericht am Ende vollständig ist und der Nutzer sieht, was offen blieb —
 * offen ist es ohnehin, denn die Merkliste behält sie.
 */
export function abbrechen(state: ReapplyState): ReapplyState {
  if (state.status === 'bereit' || state.status === 'fertig' || state.status === 'abgebrochen') {
    return state
  }
  const rest = state.steps.slice(state.index).map(
    (step): SkippedStep => ({ markId: step.markId, reason: 'abgebrochen' }),
  )
  return { status: 'abgebrochen', applied: state.applied, skipped: [...state.skipped, ...rest] }
}

/** Den Zeiger vorrücken — oder fertig sein, wenn nichts mehr kommt. */
function weiter(current: Lauf): ReapplyState {
  const index = current.index + 1
  return index >= current.steps.length
    ? { status: 'fertig', applied: current.applied, skipped: current.skipped }
    : { ...current, status: 'laeuft', index }
}

/** Den laufenden Teil eines Zustands ohne dessen Sonderfelder. */
function lauf(state: ReapplyState & Lauf): Lauf {
  return {
    mode: state.mode,
    steps: state.steps,
    index: state.index,
    applied: state.applied,
    skipped: state.skipped,
  }
}

export function naechsteHandlung(state: ReapplyState): Handlung {
  switch (state.status) {
    case 'bereit':
      return { kind: 'warten' }
    case 'anzeigeWirdGelesen':
      return { kind: 'anzeigeLesen' }
    case 'laeuft':
      return { kind: 'anfordern', markId: state.steps[state.index].markId }
    case 'uebernimmt':
      return {
        kind: 'uebernehmen',
        markId: state.steps[state.index].markId,
        variant: state.variant,
      }
    case 'haelt':
      return { kind: 'warten' }
    case 'fertig':
    case 'abgebrochen':
      return { kind: 'beendet' }
  }
}
