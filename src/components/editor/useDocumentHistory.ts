import { useCallback, useMemo, useReducer } from 'react'
import type { DocxDocument } from '@/lib/docx/model'

/**
 * Die Verlaufshistorie der Arbeitsfläche: ein Stapel vollständiger
 * `DocxDocument`-Zustände, wie der Plan es vorgibt.
 *
 * **Die Grenze und ihr Grund.** Ein `DocxDocument` trägt einen geparsten
 * XML-Baum. `replaceRange` klont ihn bei jeder Änderung (Aufgabe 3, bewusst,
 * damit die Historie nicht rückwirkend verfälscht wird); das Archiv `zip`
 * wird dabei als Referenz geteilt, sodass ein Zustand nur den Baum von
 * `word/document.xml` kostet, nicht die ganze Datei. Bei einem Anschreiben
 * sind das grob 10 bis 40 kB XML, als DOM ein Mehrfaches davon. Ein
 * unbegrenzter Stapel wäre trotzdem ein Leck: Wer eine Stunde lang tippt,
 * sammelt Hunderte Zustände, und keiner davon wird je wieder gebraucht.
 *
 * {@link HISTORY_LIMIT} = 30 ist die Antwort. Ein Anschreiben hat zehn bis
 * zwanzig Absätze, und zusammenhängendes Tippen zählt als **ein** Schritt
 * (siehe unten) — 30 Schritte reichen also für mehr als einen vollständigen
 * Durchgang durch den Brief, während der Speicherbedarf bei rund dem
 * Dreißigfachen eines Dokumentbaums gedeckelt bleibt. Wird die Grenze
 * überschritten, fällt der **älteste** Zustand heraus: Was ganz am Anfang
 * war, wird am wenigsten vermisst, und der zuletzt gemachte Schritt muss
 * immer rückgängig zu machen sein.
 *
 * **Kein Wiederherstellen (Redo).** Der Plan nennt nur „Strg+Z". Ein
 * zweiter Stapel wäre eine eigene Entscheidung samt eigener Grenze.
 *
 * **Zusammenfassen.** `commit` nimmt ein optionales `group`-Merkmal. Zwei
 * aufeinanderfolgende Änderungen mit **demselben Objekt** bilden einen
 * einzigen Schritt. Verglichen wird die Identität, nicht ein Name: Die
 * Arbeitsfläche legt für jeden Tipp-Lauf ein frisches Objekt an und wirft es
 * weg, sobald der Absatz den Fokus verliert oder eine Pause eintritt. Ein
 * Name („absatz-3") würde einen späteren zweiten Lauf im selben Absatz
 * fälschlich mit dem ersten verschmelzen.
 */

export const HISTORY_LIMIT = 30

/**
 * Wie lange eine Tippfolge ohne Eingabe unterbrochen sein darf, bevor der
 * nächste Tastendruck einen neuen Verlaufsschritt beginnt. Ohne diese
 * Schranke wäre eine halbe Stunde Schreiben ein einziges „Rückgängig".
 */
export const TYPING_BREAK_MS = 2000

interface HistoryState {
  current: DocxDocument | null
  past: DocxDocument[]
  /** Das Merkmal des letzten `commit`, für das Zusammenfassen. */
  group: object | null
}

type HistoryAction =
  | { type: 'reset'; document: DocxDocument }
  | { type: 'commit'; document: DocxDocument; group?: object }
  | { type: 'undo' }

const EMPTY_STATE: HistoryState = { current: null, past: [], group: null }

function reduce(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'reset':
      return { current: action.document, past: [], group: null }

    case 'commit': {
      if (state.current === null) {
        return { current: action.document, past: [], group: action.group ?? null }
      }
      if (state.current === action.document) return state
      // Fortsetzung desselben Tipp-Laufs: der Stand wird ersetzt, kein
      // neuer Schritt angelegt.
      if (action.group !== undefined && action.group === state.group) {
        return { ...state, current: action.document }
      }
      const past = [...state.past, state.current]
      return {
        current: action.document,
        past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
        group: action.group ?? null,
      }
    }

    case 'undo': {
      const previous = state.past.at(-1)
      if (previous === undefined) return state
      // `group` fällt weg: Der nächste Tastendruck soll einen neuen Schritt
      // beginnen und nicht den gerade wiederhergestellten Stand überschreiben.
      return { current: previous, past: state.past.slice(0, -1), group: null }
    }
  }
}

export interface DocumentHistory {
  /** Der aktuelle Stand, `null` solange nichts geladen ist. */
  document: DocxDocument | null
  canUndo: boolean
  /** Ein neu geladenes Dokument: der Verlauf beginnt von vorn. */
  reset: (document: DocxDocument) => void
  /**
   * Ein geänderter Stand. `group` fasst aufeinanderfolgende Änderungen mit
   * demselben Objekt zu einem Verlaufsschritt zusammen.
   */
  commit: (document: DocxDocument, group?: object) => void
  undo: () => void
  /** Nur für Zusicherungen und Anzeigen: wie viele Schritte zurückliegen. */
  depth: number
}

export function useDocumentHistory(): DocumentHistory {
  const [state, dispatch] = useReducer(reduce, EMPTY_STATE)

  const reset = useCallback((document: DocxDocument) => {
    dispatch({ type: 'reset', document })
  }, [])
  const commit = useCallback((document: DocxDocument, group?: object) => {
    dispatch({ type: 'commit', document, group })
  }, [])
  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
  }, [])

  return useMemo(
    () => ({
      document: state.current,
      canUndo: state.past.length > 0,
      depth: state.past.length,
      reset,
      commit,
      undo,
    }),
    [state, reset, commit, undo],
  )
}
