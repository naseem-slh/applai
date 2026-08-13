# Nächste Anzeige — Implementierungsplan

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTERFÄHIGKEIT: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Ein Knopf in der Exportleiste nimmt eine neue Stellenausschreibung entgegen und arbeitet die vorgemerkten Stellen des Anschreibens selbsttätig ab, bis die neue Fassung zum Herunterladen bereitsteht.

**Architektur:** Eine reine Zustandsmaschine in `src/lib/domain/reapply.ts` besitzt Reihenfolge und Haltegründe, aber niemals Text. Ein Haken `useReapply` führt sie aus, indem er die **vorhandenen** Seiten des Editors bedient: `rewrite` für die Varianten, `applyEdit` für die Textänderung, `setSession` für die neue Anzeige. Es entsteht kein neuer KI-Aufrufort und kein zweiter Weg, auf dem sich Brieftext ändert.

**Tech-Stack:** React 19 · TypeScript strict · Vitest + Testing Library · Playwright · i18next · Tailwind 4

**Spec:** `docs/superpowers/specs/2026-08-13-naechste-anzeige-design.md`

## Globale Randbedingungen

Gelten für **jede** Aufgabe, zusätzlich zu deren eigenen Anforderungen:

- G1/G2: Kein Server, keine Laufzeit-Ressourcen fremder Hosts.
- G3/G4: Kein neuer KI-Aufrufort. Der Durchlauf nutzt ausschließlich das vorhandene `rewrite` aus `Editor.tsx` und die vorhandene `useLetterAnalysis`.
- G7: `npm run lint` mit `--max-warnings=0`, `npm run typecheck`, `npm test` müssen nach jeder Aufgabe grün sein.
- G8: Jeder sichtbare Text über i18next in `de` **und** `en`. Schlüsselraum `editor.reapply.*`.
- G10: Unbelegte Aussagen brauchen Einzelbestätigung — auch im Schnellmodus.
- Sprache: Kommentare, Commit-Nachrichten und Oberflächentexte deutsch, Bezeichner englisch.
- Tests liegen neben dem Code.

## Abweichung von der Spec (bewusst)

Die Spec lässt den Haken in Schritt 3 `analyzeJobAd` selbst rufen. Der Plan tut das **nicht**: `useLetterAnalysis` hängt bereits an `session.jobAdText`, und `setSession` liegt im App-Kontext. Der Haken setzt den neuen Anzeigentext und wartet auf `analysis.jobAd`. Damit erbt der Durchlauf Auswertungsspeicher, Fehleranzeige, Wiederholung und den selbsttätigen Briefkopf, ohne sie nachzubauen. Alles Übrige der Spec bleibt unverändert.

**Warum das die Kostenzeile nicht verfälscht:** `useLetterAnalysis` wertet Anzeige und Stilprofil in *einem* Effekt aus, holt beide aber durch `cached(...)`. Der Schlüssel des Stilprofils ist `letterText` — der ändert sich nicht. Ein Wechsel des Anzeigentextes trifft dort also den Zwischenspeicher und kostet nichts; nur die neue Anzeige ist eine echte Anfrage. Damit gilt „1 + N" wie in der Spec.

## Dateien

| Datei | Verantwortung |
|---|---|
| `src/lib/domain/reapply.ts` (neu) | Zustandsmaschine: Reihenfolge, Betriebsart, Haltegründe. Kennt weder React noch Text |
| `src/lib/domain/reapply.test.ts` (neu) | Die Maschine vollständig, ohne Oberfläche |
| `src/components/editor/useReapply.ts` (neu) | Ausführung: Anzeige setzen, Original herstellen, Varianten holen, `applyEdit` rufen |
| `src/components/editor/useReapply.test.tsx` (neu) | Ausführung gegen Attrappen von `rewrite` und `applyEdit` |
| `src/components/editor/ReapplyDialog.tsx` (neu) | Der Dialog: Textfeld, Vorabmeldung, Kostenzeile, zwei Knöpfe |
| `src/components/editor/ReapplyDialog.test.tsx` (neu) | Dialogverhalten, Sperren, Beschriftungen |
| `src/components/editor/ReapplyStatus.tsx` (neu) | Fortschrittszeile, Haltemeldung, Abschlussbericht |
| `src/components/editor/ReapplyStatus.test.tsx` (neu) | Anzeige je Zustand |
| `src/routes/Editor.tsx` (geändert) | Haken einbinden, Dialog und Statuszeile einhängen |
| `src/components/editor/ExportBar.tsx` (geändert) | Knopf „Nächste Anzeige" |
| `src/lib/i18n/locales/{de,en}.json` (geändert) | `editor.reapply.*` |
| `e2e/reapply.spec.ts` (neu) | Beide Betriebsarten von Ende zu Ende |
| `e2e/a11y.spec.ts` (geändert) | Dialog und Haltezustand als neue Prüfstände |

---

## Aufgabe 1: Die Zustandsmaschine

**Dateien:**
- Anlegen: `src/lib/domain/reapply.ts`
- Test: `src/lib/domain/reapply.test.ts`

**Schnittstellen:**
- Verbraucht: `Variant` aus `@/lib/domain/rewrite`
- Liefert: `ReapplyMode`, `HaltReason`, `SkipReason`, `ReapplyState`, `Handlung`, `naechsteHandlung`, `starten`, `anzeigeGelesen`, `variantenDa`, `waehlen`, `uebernommen`, `fehler`, `nochmal`, `ueberspringen`, `abbrechen`

- [ ] **Schritt 1: Die Typen anlegen**

`src/lib/domain/reapply.ts`:

```ts
import type { Variant } from './rewrite'

export type ReapplyMode = 'schnell' | 'waehlen'

/** Warum der Durchlauf ruht. Genau vier, siehe Spec. */
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

/** Was der Aufrufer als Nächstes tun soll. Die Maschine tut es nicht selbst. */
export type Handlung =
  | { kind: 'anzeigeLesen' }
  | { kind: 'anfordern'; markId: string }
  | { kind: 'uebernehmen'; markId: string; variant: Variant }
  | { kind: 'warten' }
  | { kind: 'beendet' }
```

- [ ] **Schritt 2: Den ersten roten Test schreiben**

`src/lib/domain/reapply.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Variant } from './rewrite'
import {
  abbrechen,
  anzeigeGelesen,
  fehler,
  naechsteHandlung,
  nochmal,
  starten,
  ueberspringen,
  uebernommen,
  variantenDa,
  waehlen,
  type ReapplyState,
} from './reapply'

const STEPS = [{ markId: 'a' }, { markId: 'b' }]

function variante(text: string, unbacked: string[] = []): Variant {
  return { text, unbackedClaims: unbacked }
}

const DREI = [variante('eins'), variante('zwei'), variante('drei')]

/** Bringt die Maschine bis zur ersten angeforderten Stelle. */
function bisErsteStelle(mode: 'schnell' | 'waehlen'): ReapplyState {
  return anzeigeGelesen(starten(STEPS, mode))
}

describe('reapply — der Weg durch den Durchlauf', () => {
  it('beginnt damit, die Anzeige lesen zu lassen', () => {
    const state = starten(STEPS, 'schnell')
    expect(state.status).toBe('anzeigeWirdGelesen')
    expect(naechsteHandlung(state)).toEqual({ kind: 'anzeigeLesen' })
  })

  it('fordert nach der Anzeige die erste Stelle an', () => {
    expect(naechsteHandlung(bisErsteStelle('schnell'))).toEqual({
      kind: 'anfordern',
      markId: 'a',
    })
  })

  it('ist ohne vorgemerkte Stellen sofort fertig', () => {
    const state = anzeigeGelesen(starten([], 'schnell'))
    expect(state.status).toBe('fertig')
    expect(naechsteHandlung(state)).toEqual({ kind: 'beendet' })
  })
})
```

- [ ] **Schritt 3: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: FAIL, `starten` ist nicht exportiert.

- [ ] **Schritt 4: Die Übergänge dieses Tests umsetzen**

```ts
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
```

- [ ] **Schritt 5: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: PASS, 3 Tests.

- [ ] **Schritt 6: Die Betriebsarten als roten Test**

An `reapply.test.ts` anhängen:

```ts
describe('reapply — die beiden Betriebsarten', () => {
  it('übernimmt im Schnellmodus die erste Variante ungefragt', () => {
    const state = variantenDa(bisErsteStelle('schnell'), DREI)
    expect(state.status).toBe('uebernimmt')
    expect(naechsteHandlung(state)).toEqual({
      kind: 'uebernehmen',
      markId: 'a',
      variant: DREI[0],
    })
  })

  it('hält im Wählen-Modus mit allen drei Varianten an', () => {
    const state = variantenDa(bisErsteStelle('waehlen'), DREI)
    expect(state).toMatchObject({ status: 'haelt', reason: 'wahl' })
    expect(naechsteHandlung(state)).toEqual({ kind: 'warten' })
  })

  it('hält auch im Schnellmodus an, sobald eine Variante unbelegte Aussagen trägt (G10)', () => {
    const mitErfundenem = [variante('eins', ['Zehn Jahre Erfahrung']), ...DREI.slice(1)]
    const state = variantenDa(bisErsteStelle('schnell'), mitErfundenem)
    expect(state).toMatchObject({ status: 'haelt', reason: 'unbelegteAussagen' })
  })

  it('rückt nach der Übernahme auf die nächste Stelle', () => {
    const state = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    expect(state).toMatchObject({ status: 'laeuft', applied: 1 })
    expect(naechsteHandlung(state)).toEqual({ kind: 'anfordern', markId: 'b' })
  })

  it('ist nach der letzten Stelle fertig und zählt die Übernahmen', () => {
    let state = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    state = uebernommen(variantenDa(state, DREI))
    expect(state).toMatchObject({ status: 'fertig', applied: 2 })
  })

  it('nimmt im Wählen-Modus die gewählte Variante, nicht die erste', () => {
    const state = waehlen(variantenDa(bisErsteStelle('waehlen'), DREI), DREI[2])
    expect(naechsteHandlung(state)).toEqual({
      kind: 'uebernehmen',
      markId: 'a',
      variant: DREI[2],
    })
  })
})
```

- [ ] **Schritt 7: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: FAIL, `variantenDa` ist nicht exportiert.

- [ ] **Schritt 8: Betriebsarten umsetzen**

```ts
/**
 * Die einzige Stelle, an der die Betriebsart überhaupt zählt.
 *
 * Unbelegte Aussagen schlagen die Betriebsart: G10 verlangt für erfundene
 * Fakten Einzelbestätigung, und die lässt sich nicht wegautomatisieren. Im
 * strengen Modus ist `unbackedClaims` immer leer — dort läuft der
 * Schnellmodus tatsächlich ohne Rückfrage durch.
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
  return { ...ohneHalt(state), status: 'uebernimmt', variant }
}

/** Der Aufrufer hat den Text eingesetzt; der Zeiger rückt weiter. */
export function uebernommen(state: ReapplyState): ReapplyState {
  if (state.status !== 'uebernimmt') return state
  return weiter({ ...ohneVariante(state), applied: state.applied + 1 })
}

function weiter(lauf: Lauf): ReapplyState {
  const index = lauf.index + 1
  return index >= lauf.steps.length
    ? { status: 'fertig', applied: lauf.applied, skipped: lauf.skipped }
    : { ...lauf, status: 'laeuft', index }
}

function ohneHalt(state: ReapplyState & { status: 'haelt' }): Lauf {
  const { status, reason, variants, ...lauf } = state
  return lauf
}

function ohneVariante(state: ReapplyState & { status: 'uebernimmt' }): Lauf {
  const { status, variant, ...lauf } = state
  return lauf
}
```

- [ ] **Schritt 9: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: PASS, 9 Tests.

- [ ] **Schritt 10: Fehler, Überspringen und Abbruch als roter Test**

```ts
describe('reapply — Halt, Überspringen, Abbruch', () => {
  it('hält bei einem Anbieterfehler an', () => {
    const state = fehler(bisErsteStelle('schnell'), 'anbieterfehler')
    expect(state).toMatchObject({ status: 'haelt', reason: 'anbieterfehler' })
  })

  it('versucht dieselbe Stelle nach einem Fehler erneut', () => {
    const state = nochmal(fehler(bisErsteStelle('schnell'), 'antwortVerworfen'))
    expect(naechsteHandlung(state)).toEqual({ kind: 'anfordern', markId: 'a' })
  })

  it('merkt sich übersprungene Stellen samt Grund', () => {
    const state = ueberspringen(fehler(bisErsteStelle('schnell'), 'anbieterfehler'))
    expect(state).toMatchObject({ status: 'laeuft', index: 1 })
    expect(state).toMatchObject({ skipped: [{ markId: 'a', reason: 'anbieterfehler' }] })
  })

  it('behält beim Abbruch, was schon übernommen wurde', () => {
    const nachErster = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    const state = abbrechen(nachErster)
    expect(state).toMatchObject({ status: 'abgebrochen', applied: 1 })
    expect(state).toMatchObject({ skipped: [{ markId: 'b', reason: 'abgebrochen' }] })
    expect(naechsteHandlung(state)).toEqual({ kind: 'beendet' })
  })

  it('überspringt die letzte Stelle und ist dann fertig', () => {
    let state = ueberspringen(fehler(bisErsteStelle('schnell'), 'anbieterfehler'))
    state = ueberspringen(fehler(state, 'anbieterfehler'))
    expect(state).toMatchObject({ status: 'fertig', applied: 0 })
    expect(state.status === 'fertig' && state.skipped).toHaveLength(2)
  })
})
```

- [ ] **Schritt 11: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: FAIL, `fehler` ist nicht exportiert.

- [ ] **Schritt 12: Fehler, Überspringen und Abbruch umsetzen**

```ts
export function fehler(state: ReapplyState, reason: 'anbieterfehler' | 'antwortVerworfen'): ReapplyState {
  if (state.status !== 'laeuft') return state
  return { ...state, status: 'haelt', reason, variants: [] }
}

/** Aus dem Halt heraus dieselbe Stelle noch einmal anfordern. */
export function nochmal(state: ReapplyState): ReapplyState {
  if (state.status !== 'haelt') return state
  return { ...ohneHalt(state), status: 'laeuft' }
}

export function ueberspringen(state: ReapplyState): ReapplyState {
  if (state.status !== 'haelt') return state
  const lauf = ohneHalt(state)
  return weiter({
    ...lauf,
    skipped: [...lauf.skipped, { markId: lauf.steps[lauf.index].markId, reason: state.reason }],
  })
}

/**
 * Abbrechen heißt: Was im Brief steht, bleibt stehen. Der Rest wird als
 * übersprungen vermerkt, damit der Bericht vollständig ist.
 */
export function abbrechen(state: ReapplyState): ReapplyState {
  if (state.status === 'fertig' || state.status === 'abgebrochen' || state.status === 'bereit') {
    return state
  }
  const rest = state.steps.slice(state.index).map((step): SkippedStep => ({
    markId: step.markId,
    reason: 'abgebrochen',
  }))
  return { status: 'abgebrochen', applied: state.applied, skipped: [...state.skipped, ...rest] }
}
```

- [ ] **Schritt 13: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/lib/domain/reapply.test.ts`
Erwartet: PASS, 14 Tests.

- [ ] **Schritt 14: Vollprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib/domain/reapply.ts src/lib/domain/reapply.test.ts
git commit -m "feat(domain): Zustandsmaschine für den Durchlauf über die vorgemerkten Stellen"
```

---

## Aufgabe 2: Der Dialog

**Dateien:**
- Anlegen: `src/components/editor/ReapplyDialog.tsx`, `src/components/editor/ReapplyDialog.test.tsx`
- Ändern: `src/lib/i18n/locales/de.json`, `src/lib/i18n/locales/en.json`

**Schnittstellen:**
- Verbraucht: `ReapplyMode` aus `@/lib/domain/reapply`, `Dialog`/`DialogContent`/`DialogTitle`/`DialogDescription`/`DialogFooter` aus `@/components/ui/Dialog`, `Button`, `Field`
- Liefert: `ReapplyDialog`, `ReapplyDialogProps`

- [ ] **Schritt 1: Die Texte anlegen**

In `src/lib/i18n/locales/de.json` unter `editor`:

```json
"reapply": {
  "trigger": "Nächste Anzeige",
  "heading": "Nächste Stellenausschreibung",
  "description": "Der Brief entsteht neu aus Ihrem hochgeladenen Anschreiben. Die vorgemerkten Stellen werden auf die neue Anzeige umgeschrieben.",
  "jobAdLabel": "Stellenausschreibung",
  "marks_one": "1 vorgemerkte Stelle",
  "marks_other": "{{count}} vorgemerkte Stellen",
  "unresolved_one": "1 Stelle wurde nicht wiedergefunden und bleibt unverändert.",
  "unresolved_other": "{{count}} Stellen wurden nicht wiedergefunden und bleiben unverändert.",
  "cost_one": "Kostet 1 Anfrage.",
  "cost_other": "Kostet {{count}} Anfragen.",
  "fast": "Schnell übernehmen",
  "choose": "Varianten zeigen",
  "cancel": "Abbrechen"
}
```

In `en.json` an derselben Stelle:

```json
"reapply": {
  "trigger": "Next posting",
  "heading": "Next job posting",
  "description": "The letter is rebuilt from your uploaded cover letter. The marked passages are rewritten for the new posting.",
  "jobAdLabel": "Job posting",
  "marks_one": "1 marked passage",
  "marks_other": "{{count}} marked passages",
  "unresolved_one": "1 passage could not be found again and stays unchanged.",
  "unresolved_other": "{{count}} passages could not be found again and stay unchanged.",
  "cost_one": "Costs 1 request.",
  "cost_other": "Costs {{count}} requests.",
  "fast": "Apply automatically",
  "choose": "Show variants",
  "cancel": "Cancel"
}
```

- [ ] **Schritt 2: Den roten Test schreiben**

`src/components/editor/ReapplyDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReapplyDialog } from './ReapplyDialog'

function setup(props: Partial<Parameters<typeof ReapplyDialog>[0]> = {}) {
  const onStart = vi.fn()
  const user = userEvent.setup()
  render(
    <ReapplyDialog
      open
      onOpenChange={vi.fn()}
      markCount={5}
      unresolvedCount={0}
      onStart={onStart}
      {...props}
    />,
  )
  return { onStart, user }
}

describe('ReapplyDialog', () => {
  it('sperrt beide Knöpfe, solange keine Anzeige eingefügt ist', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Schnell übernehmen' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Varianten zeigen' })).toBeDisabled()
  })

  it('beziffert die Kosten aus Anzeige plus vorgemerkten Stellen', () => {
    setup({ markCount: 5 })
    expect(screen.getByText('Kostet 6 Anfragen.')).toBeInTheDocument()
  })

  it('nennt nicht wiedergefundene Stellen vorab', () => {
    setup({ markCount: 4, unresolvedCount: 1 })
    expect(
      screen.getByText('1 Stelle wurde nicht wiedergefunden und bleibt unverändert.'),
    ).toBeInTheDocument()
  })

  it('gibt Text und Betriebsart weiter', async () => {
    const { onStart, user } = setup()
    await user.type(screen.getByLabelText('Stellenausschreibung'), 'Gesucht: Projektleiterin')
    await user.click(screen.getByRole('button', { name: 'Varianten zeigen' }))
    expect(onStart).toHaveBeenCalledWith('Gesucht: Projektleiterin', 'waehlen')
  })

  it('meldet den Schnellmodus als eigene Betriebsart', async () => {
    const { onStart, user } = setup()
    await user.type(screen.getByLabelText('Stellenausschreibung'), 'Gesucht: Projektleiterin')
    await user.click(screen.getByRole('button', { name: 'Schnell übernehmen' }))
    expect(onStart).toHaveBeenCalledWith('Gesucht: Projektleiterin', 'schnell')
  })
})
```

- [ ] **Schritt 3: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/components/editor/ReapplyDialog.test.tsx`
Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 4: Den Dialog bauen**

`src/components/editor/ReapplyDialog.tsx` — Aufbau: `Dialog` → `DialogContent` → `DialogTitle` (`editor.reapply.heading`), `DialogDescription` (`editor.reapply.description`), ein `Field` mit `<textarea>` und Beschriftung `editor.reapply.jobAdLabel`, darunter die Zeilen `marks`, `unresolved` (nur wenn `unresolvedCount > 0`) und `cost` mit `count={markCount + 1}`, im `DialogFooter` die drei Knöpfe. Die beiden Startknöpfe sind gesperrt, solange `text.trim() === ''`, und rufen `onStart(text, 'schnell' | 'waehlen')`.

```tsx
export interface ReapplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  markCount: number
  unresolvedCount: number
  onStart: (jobAdText: string, mode: ReapplyMode) => void
}
```

- [ ] **Schritt 5: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/components/editor/ReapplyDialog.test.tsx`
Erwartet: PASS, 5 Tests.

- [ ] **Schritt 6: Vollprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/components/editor/ReapplyDialog.tsx src/components/editor/ReapplyDialog.test.tsx src/lib/i18n/locales/de.json src/lib/i18n/locales/en.json
git commit -m "feat(editor): Dialog für die nächste Anzeige samt Kostenangabe"
```

---

## Aufgabe 3: Der ausführende Haken

**Dateien:**
- Anlegen: `src/components/editor/useReapply.ts`, `src/components/editor/useReapply.test.tsx`

**Schnittstellen:**
- Verbraucht: alles aus Aufgabe 1; `Mark` aus `./marks`; `createSelection` aus `./documentSelection`; `Variant` aus `@/lib/domain/rewrite`
- Liefert:

```ts
export interface ReapplyOptions {
  /** Der laufende Dokumentstand. `null`, solange nichts geladen ist. */
  docx: DocxDocument | null
  marks: readonly Mark[]
  /** Genau das `rewrite` aus `Editor.tsx` — kein zweiter KI-Aufrufort. */
  rewrite: (selection: EditorSelection, signal: AbortSignal) => Promise<Variant[]>
  /** Genau das `applyEdit` aus `Editor.tsx` — der eine Änderungsweg. */
  applyEdit: (range: TextRange, text: string, options?: { completes?: boolean }) => void
  /** Meldet die unbelegten Aussagen der übernommenen Variante an. */
  addClaims: (claims: readonly string[]) => void
  /** Setzt den neuen Anzeigentext; löst `useLetterAnalysis` aus. */
  setJobAdText: (text: string) => void
  /** Stellt das hochgeladene Original wieder her und setzt die Stellen neu. */
  restoreOriginal: () => Promise<{ markIds: readonly string[]; unresolved: number }>
  /** Wechselt auf `true`, sobald die neue Anzeige ausgewertet ist. */
  jobAdReady: boolean
}

export interface ReapplyHandle {
  state: ReapplyState
  start: (jobAdText: string, mode: ReapplyMode) => void
  choose: (variant: Variant) => void
  retry: () => void
  skip: () => void
  cancel: () => void
}

export function useReapply(options: ReapplyOptions): ReapplyHandle
```

- [ ] **Schritt 1: Den roten Test schreiben**

`src/components/editor/useReapply.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReapply, type ReapplyOptions } from './useReapply'

const VARIANTEN = [
  { text: 'neu eins', unbackedClaims: [] },
  { text: 'neu zwei', unbackedClaims: [] },
  { text: 'neu drei', unbackedClaims: [] },
]

function optionen(over: Partial<ReapplyOptions> = {}): ReapplyOptions {
  return {
    docx: { text: 'Hallo Welt, hier steht etwas.', paragraphs: [] } as never,
    marks: [
      { id: 'a', range: { from: 0, to: 5 }, anchor: {} as never, current: 'Hallo', done: false },
      { id: 'b', range: { from: 6, to: 10 }, anchor: {} as never, current: 'Welt', done: false },
    ],
    rewrite: vi.fn().mockResolvedValue(VARIANTEN),
    applyEdit: vi.fn(),
    addClaims: vi.fn(),
    setJobAdText: vi.fn(),
    restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['a', 'b'], unresolved: 0 }),
    jobAdReady: true,
    ...over,
  }
}

describe('useReapply', () => {
  it('stellt das Original her und setzt den neuen Anzeigentext, bevor etwas umgeschrieben wird', async () => {
    const opts = optionen()
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'schnell'))
    await waitFor(() => expect(opts.restoreOriginal).toHaveBeenCalled())
    expect(opts.setJobAdText).toHaveBeenCalledWith('Neue Anzeige')
  })

  it('setzt im Schnellmodus jede Stelle genau einmal ein', async () => {
    const opts = optionen()
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'schnell'))
    await waitFor(() => expect(result.current.state.status).toBe('fertig'))
    expect(opts.applyEdit).toHaveBeenCalledTimes(2)
    expect(opts.applyEdit).toHaveBeenNthCalledWith(1, { from: 0, to: 5 }, 'neu eins', {
      completes: true,
    })
  })

  it('hält im Wählen-Modus an, statt zu übernehmen', async () => {
    const opts = optionen()
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'waehlen'))
    await waitFor(() => expect(result.current.state.status).toBe('haelt'))
    expect(opts.applyEdit).not.toHaveBeenCalled()
  })

  it('hält im Schnellmodus bei unbelegten Aussagen an (G10)', async () => {
    const opts = optionen({
      rewrite: vi.fn().mockResolvedValue([
        { text: 'erfunden', unbackedClaims: ['Zehn Jahre Erfahrung'] },
        ...VARIANTEN.slice(1),
      ]),
    })
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'schnell'))
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'haelt', reason: 'unbelegteAussagen' }),
    )
    expect(opts.applyEdit).not.toHaveBeenCalled()
  })

  it('hält bei einem Fehler des Anbieters an und lässt sich fortsetzen', async () => {
    const rewrite = vi
      .fn()
      .mockRejectedValueOnce(new Error('Netz weg'))
      .mockResolvedValue(VARIANTEN)
    const opts = optionen({ rewrite })
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'schnell'))
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'haelt', reason: 'anbieterfehler' }),
    )
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('fertig'))
  })

  it('meldet die unbelegten Aussagen der übernommenen Variante an', async () => {
    const opts = optionen()
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'waehlen'))
    await waitFor(() => expect(result.current.state.status).toBe('haelt'))
    act(() => result.current.choose({ text: 'gewählt', unbackedClaims: ['erfunden'] }))
    await waitFor(() => expect(opts.addClaims).toHaveBeenCalledWith(['erfunden']))
  })

  it('bricht ab, ohne weitere Anfragen zu stellen', async () => {
    const opts = optionen()
    const { result } = renderHook(() => useReapply(opts))
    act(() => result.current.start('Neue Anzeige', 'waehlen'))
    await waitFor(() => expect(result.current.state.status).toBe('haelt'))
    act(() => result.current.cancel())
    expect(result.current.state.status).toBe('abgebrochen')
    expect(opts.rewrite).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Schritt 2: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/components/editor/useReapply.test.tsx`
Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 3: Den Haken umsetzen**

Aufbau, in dieser Reihenfolge:

1. `useState<ReapplyState>({ status: 'bereit' })`, dazu ein `AbortController` in einem `useRef`.
2. `start(text, mode)`: `restoreOriginal()` abwarten, aus `markIds` die `steps` bilden, `setJobAdText(text)` rufen, `setState(starten(steps, mode))`.
3. Ein `useEffect` auf `[state, jobAdReady]`, der `naechsteHandlung(state)` liest und ausführt:
   - `anzeigeLesen`: nur wenn `jobAdReady`, dann `setState(anzeigeGelesen)`.
   - `anfordern`: Bereich der Marke **frisch** aus `marks` lesen (`marks.find(m => m.id === markId)`), `createSelection(docx, mark.range)`, `rewrite(selection, signal)`. Erfolg → `setState(s => variantenDa(s, varianten))`; Fehler → `setState(s => fehler(s, grund))`, wobei `grund` `'antwortVerworfen'` ist, wenn der Fehler ein `ModelResponseError` ist, sonst `'anbieterfehler'`.
   - `uebernehmen`: `applyEdit(mark.range, variant.text, { completes: true })`, dann `addClaims(variant.unbackedClaims)`, dann `setState(uebernommen)`.
   - `warten`/`beendet`: nichts.
4. `choose`, `retry`, `skip`, `cancel` reichen auf `waehlen`, `nochmal`, `ueberspringen`, `abbrechen` durch; `cancel` bricht zusätzlich den `AbortController` ab.

**Wichtig:** Der Bereich wird bei `anfordern` **und** bei `uebernehmen` neu aus `marks` gelesen. Ein zwischengespeicherter Bereich wäre nach der ersten Übernahme falsch — `shiftMarks` hat die Merkliste inzwischen nachgeführt.

- [ ] **Schritt 4: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/components/editor/useReapply.test.tsx`
Erwartet: PASS, 7 Tests.

- [ ] **Schritt 5: Vollprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/components/editor/useReapply.ts src/components/editor/useReapply.test.tsx
git commit -m "feat(editor): Haken führt den Durchlauf über die vorgemerkten Stellen aus"
```

---

## Aufgabe 4: Statuszeile und Bericht

**Dateien:**
- Anlegen: `src/components/editor/ReapplyStatus.tsx`, `src/components/editor/ReapplyStatus.test.tsx`
- Ändern: `src/lib/i18n/locales/de.json`, `en.json`

**Schnittstellen:**
- Verbraucht: `ReapplyState` aus `@/lib/domain/reapply`
- Liefert: `ReapplyStatus`, `ReapplyStatusProps` mit `{ state, onRetry, onSkip, onCancel }`

- [ ] **Schritt 1: Texte ergänzen**

Unter `editor.reapply` in `de.json`:

```json
"progress": "Stelle {{current}} von {{total}}",
"reading": "Die Anzeige wird ausgewertet.",
"halt": {
  "wahl": "Bitte wählen Sie eine Formulierung.",
  "unbelegteAussagen": "Diese Variante enthält Aussagen, die Ihre Unterlagen nicht decken. Bitte einzeln bestätigen.",
  "anbieterfehler": "Die Anfrage ist fehlgeschlagen.",
  "antwortVerworfen": "Die Antwort der KI war nicht verwertbar."
},
"retry": "Erneut versuchen",
"skip": "Stelle überspringen",
"done_one": "1 Stelle übernommen.",
"done_other": "{{count}} Stellen übernommen.",
"skipped_one": "1 Stelle blieb unverändert.",
"skipped_other": "{{count}} Stellen blieben unverändert."
```

In `en.json` sinngemäß mit denselben Schlüsseln.

- [ ] **Schritt 2: Den roten Test schreiben**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReapplyStatus } from './ReapplyStatus'

const LAUF = { mode: 'schnell', steps: [{ markId: 'a' }, { markId: 'b' }], index: 1, applied: 1, skipped: [] } as const

describe('ReapplyStatus', () => {
  it('zeigt während des Laufs, welche Stelle dran ist', () => {
    render(<ReapplyStatus state={{ status: 'laeuft', ...LAUF }} onRetry={vi.fn()} onSkip={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Stelle 2 von 2')).toBeInTheDocument()
  })

  it('nennt beim Halt den Grund und bietet die Auswege', () => {
    render(
      <ReapplyStatus
        state={{ status: 'haelt', reason: 'anbieterfehler', variants: [], ...LAUF }}
        onRetry={vi.fn()}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Die Anfrage ist fehlgeschlagen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stelle überspringen' })).toBeInTheDocument()
  })

  it('zeigt am Ende, was übernommen und was ausgelassen wurde', () => {
    render(
      <ReapplyStatus
        state={{ status: 'fertig', applied: 3, skipped: [{ markId: 'x', reason: 'anbieterfehler' }] }}
        onRetry={vi.fn()}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('3 Stellen übernommen.')).toBeInTheDocument()
    expect(screen.getByText('1 Stelle blieb unverändert.')).toBeInTheDocument()
  })

  it('zeigt im Zustand „bereit" nichts', () => {
    const { container } = render(
      <ReapplyStatus state={{ status: 'bereit' }} onRetry={vi.fn()} onSkip={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Schritt 3: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/components/editor/ReapplyStatus.test.tsx`
Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 4: Umsetzen**

Eine Fallunterscheidung über `state.status`, die `null` für `bereit` liefert. Fortschritt als `role="status"` mit `aria-live="polite"`, damit Vorlesesoftware den Wechsel der Stelle mitbekommt. Kein Balken, keine Prozentzahl.

- [ ] **Schritt 5: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/components/editor/ReapplyStatus.test.tsx`
Erwartet: PASS, 4 Tests.

- [ ] **Schritt 6: Vollprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/components/editor/ReapplyStatus.tsx src/components/editor/ReapplyStatus.test.tsx src/lib/i18n/locales/de.json src/lib/i18n/locales/en.json
git commit -m "feat(editor): Fortschritt, Haltemeldung und Bericht des Durchlaufs"
```

---

## Aufgabe 5: Einbindung in die Arbeitsfläche

**Dateien:**
- Ändern: `src/routes/Editor.tsx`, `src/components/editor/ExportBar.tsx`, `src/routes/Editor.test.tsx`

**Schnittstellen:**
- Verbraucht: `useReapply`, `ReapplyDialog`, `ReapplyStatus`
- `ExportBarProps` bekommt ein Feld: `onNextPosting: (() => void) | null` — `null` sperrt den Knopf (keine vorgemerkten Stellen oder kein Anbieter).

- [ ] **Schritt 1: Roter Test in `Editor.test.tsx`**

```tsx
it('arbeitet nach einer neuen Anzeige beide vorgemerkten Stellen ab', async () => {
  const { user, provider } = await setupEditorMitZweiVormerkungen()
  await user.click(screen.getByRole('button', { name: 'Nächste Anzeige' }))
  await user.type(screen.getByLabelText('Stellenausschreibung'), 'Gesucht: Projektleiterin')
  await user.click(screen.getByRole('button', { name: 'Schnell übernehmen' }))

  await waitFor(() => expect(screen.getByText('2 Stellen übernommen.')).toBeInTheDocument())
  expect(screen.getByRole('textbox', { name: 'Anschreiben' })).toHaveTextContent('neu eins')
})
```

Die Hilfsfunktion `setupEditorMitZweiVormerkungen` folgt dem Muster der vorhandenen Aufbauhilfen in `Editor.test.tsx`; sie nutzt die bestehende Anbieter-Attrappe und merkt zwei Absätze vor.

- [ ] **Schritt 2: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npm test -- src/routes/Editor.test.tsx`
Erwartet: FAIL, Knopf „Nächste Anzeige" nicht gefunden.

- [ ] **Schritt 3: `ExportBar` erweitern**

`onNextPosting` in `ExportBarProps` aufnehmen und als zweiten Knopf neben dem Word-Download rendern, beschriftet mit `t('editor.reapply.trigger')`, gesperrt wenn `onNextPosting === null`.

- [ ] **Schritt 4: `Editor.tsx` verdrahten**

`useReapply` neben den vorhandenen Haken aufrufen. `restoreOriginal` wird dort umgesetzt: `parseDocx(session.letter.docxBase)` → `reset(parsed)` → `restoreMarks(parsed.text, anker, makeId)` → `setMarks(...)`, Rückgabe `{ markIds, unresolved }`. Dialogzustand als `useState<boolean>`. `ReapplyStatus` unter der Exportleiste einhängen, im Halt mit Grund `wahl` zusätzlich die vorhandene `VariantPopover` an der laufenden Stelle öffnen.

- [ ] **Schritt 5: Lauf lassen, grün bestätigen**

Ausführen: `npm test -- src/routes/Editor.test.tsx`
Erwartet: PASS.

- [ ] **Schritt 6: Vollprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/routes/Editor.tsx src/routes/Editor.test.tsx src/components/editor/ExportBar.tsx
git commit -m "feat(editor): Knopf „Nächste Anzeige\" führt den Durchlauf aus"
```

---

## Aufgabe 6: Ende zu Ende und Barrierefreiheit

**Dateien:**
- Anlegen: `e2e/reapply.spec.ts`
- Ändern: `e2e/a11y.spec.ts`

- [ ] **Schritt 1: Den e2e-Test schreiben**

`e2e/reapply.spec.ts` — nach dem Muster von `e2e/marked-passages.spec.ts`:

```ts
test('schreibt nach dem Export mit einer neuen Anzeige alles neu', async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  await markParagraph(page, 'ich bewerbe mich hiermit')
  await page.getByRole('button', { name: t('editor.reapply.trigger') }).click()
  await page
    .getByLabel(t('editor.reapply.jobAdLabel'))
    .fill('Stellenanzeige: Projektleiterin (m/w/d). Gesucht wird Erfahrung in der Leitung von Teams.')
  await page.getByRole('button', { name: t('editor.reapply.fast') }).click()

  await expect(page.getByText(t('editor.reapply.done', { count: 1 }))).toBeVisible()
  await expect(page.getByRole('textbox', { name: t('editor.document.heading') })).toContainText(
    VARIANT_TEXT,
  )
})
```

Dazu ein zweiter Test für den Wählen-Modus, der nach `t('editor.reapply.choose')` die `VariantPopover` erwartet und eine Variante übernimmt.

- [ ] **Schritt 2: Lauf lassen, Fehlschlag bestätigen**

Ausführen: `npx playwright test reapply.spec.ts`
Erwartet: FAIL.

- [ ] **Schritt 3: Was auffällt, im Produktionscode beheben**

Der e2e-Lauf prüft gegen den gebauten Stand samt strenger CSP. Fehler hier sind echte Fehler, keine Testfehler.

- [ ] **Schritt 4: `a11y.spec.ts` erweitern**

Den geöffneten Dialog und den Haltezustand als zwei neue Prüfstände in die vorhandene axe-Liste aufnehmen, in beiden Fensterbreiten.

- [ ] **Schritt 5: Volle Prüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
git add e2e/reapply.spec.ts e2e/a11y.spec.ts
git commit -m "test(e2e): der Durchlauf über die vorgemerkten Stellen in beiden Betriebsarten"
```

---

## Abschluss

Nach Aufgabe 6: `npm run lint && npm run typecheck && npm test && npm run e2e` in einem Zug, dann der Zweig `feat/naechste-anzeige` zum Zusammenführen anbieten.
