import { useCallback, useMemo, useReducer } from 'react'
import type { DocxDocument } from '@/lib/docx/model'
import type { Mark } from './marks'

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
 * **Die vorgemerkten Stellen fahren mit.** Ein Verlaufsstand ist nicht das
 * Dokument allein, sondern der {@link Workspace} aus Dokument **und**
 * Vormerkungen. Strg+Z stellt beides zusammen wieder her.
 *
 * Der billigere Weg wäre, die Stellen nach jedem Rückgängigmachen über ihren
 * Ankertext neu zu suchen. Er scheitert genau dort, wo es weh tut: Nach einer
 * übernommenen Variante steht der Ankertext nicht mehr im Brief, die Stelle
 * wäre nicht auffindbar und ginge verloren — und das wäre der Augenblick, in
 * dem der Nutzer sie am dringendsten braucht, denn er nimmt die Umformulierung
 * ja gerade zurück. Mitfahren kostet dagegen fast nichts: Ein unveränderter
 * Schritt teilt dieselbe Liste, es ist eine Referenz mehr je Stand.
 *
 * **Das Vormerken selbst ist kein Verlaufsschritt.** Dafür gibt es
 * `setMarks`; und auch `commit` legt keinen Schritt an, wenn sich nur die
 * Stellen ändern und das Dokument gleich bleibt. Strg+Z gehört dem Text.
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

/** Ein Verlaufsstand: der Text und die dazu vorgemerkten Stellen. */
interface Workspace {
  document: DocxDocument
  marks: readonly Mark[]
}

interface HistoryState {
  current: Workspace | null
  past: Workspace[]
  /** Das Merkmal des letzten `commit`, für das Zusammenfassen. */
  group: object | null
}

type HistoryAction =
  | { type: 'reset'; document: DocxDocument }
  | { type: 'commit'; document: DocxDocument; marks: readonly Mark[]; group?: object }
  | { type: 'marks'; marks: readonly Mark[] }
  | { type: 'undo' }

/**
 * Eine geteilte leere Liste statt eines frischen `[]` je Zustand: So bleibt
 * `marks` referenzgleich, solange nichts vorgemerkt ist, und Effekte, die
 * darauf horchen, laufen nicht bei jedem Rendern erneut.
 */
const NO_MARKS: readonly Mark[] = []

const EMPTY_STATE: HistoryState = { current: null, past: [], group: null }

function reduce(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'reset':
      return { current: { document: action.document, marks: NO_MARKS }, past: [], group: null }

    case 'commit': {
      const next: Workspace = { document: action.document, marks: action.marks }
      if (state.current === null) {
        return { current: next, past: [], group: action.group ?? null }
      }
      // Unverändertes Dokument: kein Schritt. Die Stellen werden trotzdem
      // übernommen — eine Änderung an ihnen allein gehört nicht in den
      // Verlauf (siehe oben), soll aber auch nicht verloren gehen.
      if (state.current.document === action.document) {
        return state.current.marks === action.marks ? state : { ...state, current: next }
      }
      // Fortsetzung desselben Tipp-Laufs: der Stand wird ersetzt, kein
      // neuer Schritt angelegt.
      if (action.group !== undefined && action.group === state.group) {
        return { ...state, current: next }
      }
      const past = [...state.past, state.current]
      return {
        current: next,
        past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
        group: action.group ?? null,
      }
    }

    case 'marks': {
      if (state.current === null) return state
      if (state.current.marks === action.marks) return state
      return { ...state, current: { ...state.current, marks: action.marks } }
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
  /** Die zu diesem Stand vorgemerkten Stellen. */
  marks: readonly Mark[]
  canUndo: boolean
  /** Ein neu geladenes Dokument: der Verlauf und die Stellen beginnen von vorn. */
  reset: (document: DocxDocument) => void
  /**
   * Ein geänderter Stand samt der dazu nachgeführten Stellen. `group` fasst
   * aufeinanderfolgende Änderungen mit demselben Objekt zu einem
   * Verlaufsschritt zusammen.
   */
  commit: (document: DocxDocument, marks: readonly Mark[], group?: object) => void
  /** Nur die Stellen ändern — vormerken, aufheben, abhaken. Kein Verlaufsschritt. */
  setMarks: (marks: readonly Mark[]) => void
  undo: () => void
  /** Nur für Zusicherungen und Anzeigen: wie viele Schritte zurückliegen. */
  depth: number
}

export function useDocumentHistory(): DocumentHistory {
  const [state, dispatch] = useReducer(reduce, EMPTY_STATE)

  const reset = useCallback((document: DocxDocument) => {
    dispatch({ type: 'reset', document })
  }, [])
  const commit = useCallback(
    (document: DocxDocument, marks: readonly Mark[], group?: object) => {
      dispatch({ type: 'commit', document, marks, group })
    },
    [],
  )
  const setMarks = useCallback((marks: readonly Mark[]) => {
    dispatch({ type: 'marks', marks })
  }, [])
  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
  }, [])

  return useMemo(
    () => ({
      document: state.current?.document ?? null,
      marks: state.current?.marks ?? NO_MARKS,
      canUndo: state.past.length > 0,
      depth: state.past.length,
      reset,
      commit,
      setMarks,
      undo,
    }),
    [state, reset, commit, setMarks, undo],
  )
}
