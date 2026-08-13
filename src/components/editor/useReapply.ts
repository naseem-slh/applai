import { useCallback, useEffect, useRef, useState } from 'react'
import { ModelResponseError } from '@/lib/ai/modelJson'
import type { DocxDocument } from '@/lib/docx/model'
import type { Range as TextRange } from '@/lib/docx/replace'
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
  type ReapplyMode,
  type ReapplyState,
} from '@/lib/domain/reapply'
import type { Variant } from '@/lib/domain/rewrite'
import { createSelection, type EditorSelection } from './documentSelection'
import type { Mark } from './marks'

/**
 * Der Durchlauf, ausgeführt.
 *
 * Die Maschine in `@/lib/domain/reapply` sagt, was zu tun ist; hier wird es
 * getan — und zwar ausschließlich mit **vorhandenen** Mitteln des Editors:
 * `rewrite` ist dasselbe, das die Variantenauswahl von Hand benutzt,
 * `applyEdit` derselbe eine Weg, auf dem sich Brieftext ändert. Es entsteht
 * kein zweiter KI-Aufrufort (G3, G4) und kein zweiter Änderungsweg.
 *
 * **Erst das Original, dann die Anzeige.** Der selbsttätige Briefkopf in
 * `Editor.tsx` merkt sich per Ref, für welche `jobAd` er schon gelaufen ist.
 * Käme die neue Anzeige vor dem Zurücksetzen, liefe er auf dem alten,
 * bereits angepassten Text, markierte die Anzeige als erledigt — und das
 * hergestellte Original bekäme nie einen Briefkopf. Die Reihenfolge ist
 * darum Teil der Zusage, nicht Geschmackssache.
 *
 * **Scheitert die Auswertung der Anzeige**, bleibt der Durchlauf im Zustand
 * `anzeigeWirdGelesen` stehen und der Brief steht als hergestelltes Original
 * da. Das ist kein Verlust, sondern genau das, was der Dialog zusagt („Der
 * Brief entsteht neu aus Ihrem hochgeladenen Anschreiben"); die vorhandene
 * Fehlermeldung samt „Erneut versuchen" führt weiter.
 *
 * **Bereiche werden vor jedem Schritt frisch gelesen.** Jede Übernahme
 * verschiebt den Text hinter sich, und `shiftMarks` führt die Merkliste
 * nach. Ein zwischengespeicherter Bereich wäre nach der ersten Übernahme
 * falsch — deshalb sucht jeder Schritt seine Marke neu über die Kennung.
 */

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
  /** Setzt den neuen Anzeigentext in der Sitzung; löst die Auswertung aus. */
  setJobAdText: (text: string) => void
  /** Stellt das hochgeladene Original her und setzt die Stellen neu. */
  restoreOriginal: () => Promise<{ markIds: readonly string[]; unresolved: number }>
  /** Der Anzeigentext, der gerade ausgewertet ist. */
  currentJobAdText: string
  /**
   * Die ausgewertete Anzeige aus `useLetterAnalysis`.
   *
   * Gewartet wird auf ihre **Identität**, nicht auf einen Statuswert: Eine
   * neue `jobAd` ist der einzige eindeutige Beleg dafür, dass die Auswertung
   * die *neue* Ausschreibung gelesen hat. Ein `ready` allein wäre das
   * `ready` der vorigen Anzeige, und der Durchlauf schriebe alle Stellen mit
   * dem alten Prompt um.
   */
  jobAd: object | null
}

export interface ReapplyHandle {
  state: ReapplyState
  start: (jobAdText: string, mode: ReapplyMode) => void
  choose: (variant: Variant) => void
  retry: () => void
  skip: () => void
  cancel: () => void
}

export function useReapply({
  docx,
  marks,
  rewrite,
  applyEdit,
  addClaims,
  setJobAdText,
  restoreOriginal,
  currentJobAdText,
  jobAd,
}: ReapplyOptions): ReapplyHandle {
  const [state, setState] = useState<ReapplyState>({ status: 'bereit' })

  /** Wartet der Durchlauf auf eine **frische** Auswertung? */
  const awaiting = useRef(false)
  /** Die Anzeige, die beim Start galt. Auf eine *andere* wird gewartet. */
  const jobAdAtStart = useRef<object | null>(null)
  const latestJobAd = useRef(jobAd)
  latestJobAd.current = jobAd
  const controller = useRef<AbortController | null>(null)
  /** Der zuletzt ausgeführte Zustand, damit kein Schritt doppelt losgeht. */
  const handled = useRef<ReapplyState | null>(null)

  // Die Mitspieler wandern über Refs in den Effekt: Sie wechseln bei jedem
  // Rendern die Identität, und in der Abhängigkeitsliste würden sie den
  // Schritt erneut auslösen, obwohl sich der Zustand nicht bewegt hat.
  const deps = useRef({ docx, marks, rewrite, applyEdit, addClaims })
  deps.current = { docx, marks, rewrite, applyEdit, addClaims }

  const start = useCallback(
    (jobAdText: string, mode: ReapplyMode) => {
      // **Vor** dem `await` festgehalten: Träfe die neue Auswertung ein,
      // während das Original noch hergestellt wird, hielte der Durchlauf sie
      // sonst für die alte und wartete auf eine, die nie mehr kommt.
      const startedWith = latestJobAd.current
      void (async () => {
        const { markIds } = await restoreOriginal()
        jobAdAtStart.current = startedWith
        // Dieselbe Anzeige noch einmal auszuwerten wäre eine bezahlte
        // Anfrage für ein bekanntes Ergebnis — und der Effekt in
        // `useLetterAnalysis` liefe mangels Änderung gar nicht erst an,
        // sodass der Durchlauf ewig auf eine neue `jobAd` wartete.
        awaiting.current = jobAdText !== currentJobAdText
        if (awaiting.current) setJobAdText(jobAdText)
        setState(starten(markIds.map((markId) => ({ markId })), mode))
      })()
    },
    [restoreOriginal, setJobAdText, currentJobAdText],
  )

  useEffect(() => {
    const handlung = naechsteHandlung(state)

    if (handlung.kind === 'anzeigeLesen') {
      if (!awaiting.current) {
        setState(anzeigeGelesen)
        return
      }
      // Scheitert die Auswertung, bleibt es bei dieser `jobAd` — der
      // Durchlauf wartet weiter, während die vorhandene Fehlermeldung samt
      // „Erneut versuchen" die Führung übernimmt.
      if (jobAd !== null && jobAd !== jobAdAtStart.current) {
        awaiting.current = false
        setState(anzeigeGelesen)
      }
      return
    }

    if (handled.current === state) return
    handled.current = state

    if (handlung.kind === 'anfordern') {
      const { docx: document, marks: current, rewrite: ask } = deps.current
      const mark = current.find((entry) => entry.id === handlung.markId)
      const selection = document === null || mark === undefined
        ? null
        : createSelection(document, mark.range)
      // Ohne Dokument oder Marke gibt es nichts umzuschreiben. Das kann nur
      // eintreten, wenn die Arbeitsfläche unter dem Durchlauf weggezogen
      // wird — dann ist Abbrechen die ehrliche Antwort, kein Fehlerhalt.
      if (selection === null) {
        setState(abbrechen)
        return
      }

      const own = new AbortController()
      controller.current = own
      void ask(selection, own.signal).then(
        (variants) => {
          if (own.signal.aborted) return
          setState((previous) => variantenDa(previous, variants))
        },
        (caught: unknown) => {
          if (own.signal.aborted) return
          setState((previous) =>
            fehler(previous, caught instanceof ModelResponseError ? 'antwortVerworfen' : 'anbieterfehler'),
          )
        },
      )
      return
    }

    if (handlung.kind === 'uebernehmen') {
      const { marks: current, applyEdit: apply, addClaims: claims } = deps.current
      const mark = current.find((entry) => entry.id === handlung.markId)
      if (mark === undefined) {
        setState(abbrechen)
        return
      }
      // Erst einsetzen, dann die Aussagen anmelden: `locateClaims` findet
      // sie nur, wenn sie im Dokument stehen. Dieselbe Reihenfolge wie bei
      // der Übernahme von Hand.
      apply(mark.range, handlung.variant.text, { completes: true })
      claims(handlung.variant.unbackedClaims)
      setState(uebernommen)
    }
  }, [state, jobAd])

  const choose = useCallback((variant: Variant) => setState((s) => waehlen(s, variant)), [])
  const retry = useCallback(() => setState(nochmal), [])
  const skip = useCallback(() => setState(ueberspringen), [])
  const cancel = useCallback(() => {
    controller.current?.abort()
    setState(abbrechen)
  }, [])

  return { state, start, choose, retry, skip, cancel }
}
