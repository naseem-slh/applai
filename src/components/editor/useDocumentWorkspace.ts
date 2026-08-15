import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { LoadedDocument } from '@/components/app/appContext'
import { parseDocx } from '@/lib/docx/parse'
import type { DocxDocument } from '@/lib/docx/model'
import { replaceRange, type Range as TextRange } from '@/lib/docx/replace'
import { detectLanguage } from '@/lib/domain/language'
import type { Variant } from '@/lib/domain/rewrite'
import type { StorageAdapter } from '@/lib/storage/adapter'
import { rangeToDomRange, type EditorSelection } from './documentSelection'
import { diffText } from './editableInput'
import { restoreMarks, shiftMarks, trimRange, type Mark } from './marks'
import { TYPING_BREAK_MS, useDocumentHistory } from './useDocumentHistory'
import { useDocumentSelection } from './useDocumentSelection'
import { useDraftAutosave, type DraftSaveState } from './useDraftAutosave'
import { useMarkHighlight } from './useMarkHighlight'
import { useProofreadingHighlight } from './useProofreadingHighlight'
import { findProofreadingIssues, type ProofreadingFinding } from './proofreading'
import { useMarks, type MarksHandle } from './useMarks'
import { useUnbackedClaims, type UnbackedClaimsHandle } from './useUnbackedClaims'

/**
 * Alles, was **ein** Dokument für sich hat: sein Verlauf, seine Markierung,
 * seine vorgemerkten Stellen, sein Entwurf, seine unbelegten Aussagen und der
 * eine Weg, auf dem sich sein Text ändert.
 *
 * **Warum das ein eigener Baustein ist.** Die Arbeitsfläche trägt seit dem
 * zweiten Bauabschnitt zwei Dokumente — Anschreiben und Lebenslauf. Der Rest
 * der Ansicht (Anzeige, Lückenliste, Wahrheitsmodus, Zielsprache, Export)
 * gehört dagegen der **Bewerbung** und gibt es genau einmal. Diese Grenze lag
 * schon vorher im Zustand von `Editor.tsx`, war aber nicht gezogen; hier ist
 * sie es.
 *
 * **Die Schale ruft diesen Haken zweimal auf, nicht die Anzeigebausteine.**
 * Einmal für den Brief, einmal für den Lebenslauf, mit `source: null` für
 * das, was nicht im Arbeitsumfang liegt. Zwei feste Aufrufe, keine Schleife —
 * die Reihenfolge der Haken bleibt über jedes Rendern gleich.
 *
 * Der Grund ist der Durchlauf („Nächste Ausschreibung"): Er läuft über beide
 * Dokumente und braucht beide Handles. Lägen die Haken in den
 * Anzeigebausteinen, müsste die Schale sie über Refs nach oben reichen — ein
 * Weg, auf dem der Zustand eines Renderdurchlaufs hinterherhinkt.
 *
 * **Was hier bewusst NICHT liegt: das Stilprofil und der Modellaufruf.** Brief
 * und Lebenslauf haben verschiedene Stilprofile mit verschiedenen Typen
 * (`StyleProfile` gegen `CvStyleProfile`). Sie liegen in der Schale, und die
 * Schale reicht die fertige Umformulierungsfunktion an die Anzeige weiter.
 * Ein Haken, der beide Formen kennen müsste, kennte damit auch beide
 * Prompt-Wege — und wäre genau der Sammelpunkt, den dieser Schnitt auflöst.
 */

export interface DocumentWorkspaceOptions {
  kind: 'letter' | 'cv'
  /** Siehe `appContext.ts` (`LETTER_DRAFT_ID`, `CV_DRAFT_ID`). */
  draftId: string
  /**
   * Das **hochgeladene** Original. `null`, wenn dieses Dokument nicht im
   * Arbeitsumfang liegt — dann tut dieser Haken nichts, hält aber seine
   * Hakenreihenfolge ein.
   */
  source: LoadedDocument | null
  storage: StorageAdapter
  /**
   * Liegt ein genaues Zeigegerät vor? Einmal in der Schale gemessen und
   * hereingereicht, nicht hier: Zwei Aufrufe des Hakens wären sonst zwei
   * Sätze Ereignis-Zuhörer für dieselbe Medienabfrage.
   */
  precise: boolean
  keepMarks: boolean
  /**
   * Nur der Brief: die Kennung der Anzeige, für die die selbsttätige
   * Briefkopf-Übernahme zuletzt gelaufen ist (`Draft.letterheadAppliedFor`).
   * Der Lebenslauf hat keinen Briefkopf und lässt das Feld leer — dieselbe
   * Zurückhaltung, die `useDraftAutosave` an dieser Stelle schon beschreibt.
   */
  letterheadAppliedFor?: string | null
}

export interface DocumentWorkspace {
  kind: 'letter' | 'cv'
  /** Die Fläche, die die Absätze trägt. */
  rootRef: RefObject<HTMLDivElement | null>
  document: DocxDocument | null
  /** `true`, solange das Original gelesen wird. `false` ohne Dokument. */
  loading: boolean
  /** Das Original ließ sich nicht lesen. */
  failed: boolean
  marks: readonly Mark[]
  markHandle: MarksHandle
  /** Die Vormerkung, die gerade markiert ist — für `aria-current` in der Liste. */
  activeMarkId: string | null
  selection: EditorSelection | null
  caretParagraph: number | null
  select: (range: TextRange) => void
  clear: () => void
  /** Eine Stelle aus der Liste anspringen: markieren und ins Bild rollen. */
  selectMark: (mark: Mark) => void
  /** Einen beliebigen Bereich anspringen — für die Liste der Textprüfung. */
  revealRange: (range: TextRange) => void
  canUndo: boolean
  undo: () => void
  commit: (document: DocxDocument, marks: readonly Mark[], group?: object) => void
  claims: UnbackedClaimsHandle
  /**
   * Die Sprache des Dokuments, einmal je Stand bestimmt. Sie entscheidet,
   * in welcher Sprache der Browser die Rechtschreibung prüft, wie eine
   * Vorlesesoftware den Text ausspricht — und welche Regeln die Textprüfung
   * anlegt.
   */
  language: 'de' | 'en'
  /** Was die Textprüfung im laufenden Stand gefunden hat. */
  proofreading: readonly ProofreadingFinding[]
  draft: DraftSaveState
  /** **Der eine Weg, auf dem sich der Text dieses Dokuments ändert.** */
  applyEdit: (
    range: TextRange,
    text: string,
    options?: { group?: object; completes?: boolean },
  ) => void
  applyVariant: (variant: Variant) => void
  restoreOriginal: () => Promise<{ markIds: string[]; unresolved: number }>
  handleParagraphInput: (index: number, text: string) => void
  /**
   * Einen Wert an der Markierung einsetzen — derselbe Weg wie die Übernahme
   * einer Variante, also ein eigener Verlaufsschritt. `null`, solange nichts
   * markiert ist; der Knopf ist dann gesperrt.
   */
  insertAtSelection: ((value: string) => void) | null
}

export function useDocumentWorkspace({
  kind,
  draftId,
  source,
  storage,
  precise,
  keepMarks,
  letterheadAppliedFor,
}: DocumentWorkspaceOptions): DocumentWorkspace {
  const rootRef = useRef<HTMLDivElement>(null)

  const { document: docx, marks, canUndo, reset, commit, setMarks, undo } = useDocumentHistory()
  const [loading, setLoading] = useState(source !== null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (source === null) return
    let cancelled = false
    void (async () => {
      try {
        const parsed = await parseDocx(source.docxBase)
        if (!cancelled) reset(parsed)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, reset])

  /**
   * **Markieren ist Vormerken.** Es gibt keinen eigenen Knopf: Wer eine
   * Textstelle markiert, hat sie damit vorgemerkt. Der Handgriff, den der
   * Nutzer ohnehin macht, sagt bereits alles; ein zweiter wäre eine
   * Wiederholung.
   *
   * Gerufen wird das erst, wenn die Markierung **fertig** ist (siehe
   * `onSettled`) — beim Ziehen meldet der Browser fortwährend
   * Zwischenstände, und jeden davon vorzumerken hieße, für einen Zug ein
   * Dutzend Stellen anzulegen.
   *
   * **Ein bloßer Klick hebt nichts mehr auf.** Er tat es einmal, und das war
   * in einem beschreibbaren Dokument der falsche Handgriff: Wer den
   * Schreibcursor in eine vorgemerkte Stelle setzt — um einen Tippfehler zu
   * berichtigen, um die gerade übernommene Formulierung zu lesen —, löschte
   * damit stillschweigend die Vormerkung. Aufheben lässt sich eine Stelle
   * weiterhin auf zwei Wegen, die beide ausdrücklich sind: noch einmal genau
   * dieselbe Stelle markieren, oder „Entfernen" in der Merkliste.
   */
  /**
   * Dokumenttext und Befunde für {@link settleSelection}.
   *
   * Über Referenzen und nicht über Abhängigkeiten: `settleSelection` hängt an
   * einem DOM-Zuhörer und muss stabil bleiben, sonst meldet sich der Zuhörer
   * bei jedem Rendern neu an. Dasselbe Vorgehen wie bei `markHandleRef`.
   */
  const documentTextRef = useRef<string | null>(null)
  const proofreadingRef = useRef<readonly ProofreadingFinding[]>([])

  const settleSelection = useCallback((range: TextRange | null) => {
    if (range === null || range.to === range.from) return

    // **Die Rechtschreibung hat Vorrang.** Ein Doppelklick wählt das Wort
    // aus, und Auswählen heißt hier Vormerken — wer aber auf ein rot
    // unterschlängeltes Wort doppelklickt, will die Korrektur sehen und
    // nicht eine Vormerkung anlegen. Von Hand über dieselbe Stelle gezogen
    // merkt weiterhin vor; das ist eine andere Geste und eine ausdrückliche.
    //
    // Verglichen wird gegen den **getrimmten** Bereich, weil `toggleMark`
    // ebenso trimmt: Ein Doppelklick nimmt in manchen Browsern das
    // Leerzeichen dahinter mit, und ohne das Trimmen ginge der Vergleich um
    // ein Zeichen daneben.
    const text = documentTextRef.current
    const trimmed = text === null ? range : (trimRange(text, range) ?? range)
    const onFinding = proofreadingRef.current.some(
      (finding) => finding.range.from === trimmed.from && finding.range.to === trimmed.to,
    )
    if (onFinding) return

    markHandleRef.current?.toggle(range)
  }, [])

  const { selection, caretParagraph, select, clear } = useDocumentSelection({
    rootRef,
    document: docx,
    trackPointerSelection: precise,
    onSettled: settleSelection,
  })

  const documentText = docx?.text ?? null
  // `settleSelection` hängt an einem Ereigniszuhörer und muss stabil
  // bleiben; die jeweils letzte Fassung reicht ihm.
  const marksRef = useRef<readonly Mark[]>(marks)
  marksRef.current = marks

  const markHandle = useMarks({
    storage,
    // Der Fingerabdruck kommt vom **hochgeladenen** Dokument, nicht vom
    // Arbeitsstand: Sonst läge der Satz nach jedem Tastendruck unter einer
    // neuen Kennung. Weil die Kennung der Fingerabdruck des Textes ist
    // (`MarkSet.id`, `adapter.ts`), bekommt der Lebenslauf seinen eigenen
    // Satz, ohne dass hier etwas zu unterscheiden wäre.
    letterText: source?.text ?? null,
    documentText,
    marks,
    setMarks,
    keep: keepMarks,
  })

  const markHandleRef = useRef(markHandle)
  markHandleRef.current = markHandle

  useMarkHighlight({ rootRef, marks })

  const draft = useDraftAutosave({
    storage,
    draftId,
    document: docx,
    enabled: docx !== null,
    letterheadAppliedFor,
  })

  const claims = useUnbackedClaims(docx)

  /**
   * Sprache und Textprüfung.
   *
   * Beides hängt am laufenden Stand, nicht am hochgeladenen: Der Nutzer soll
   * einen Befund verschwinden sehen, sobald er ihn behoben hat — dieselbe
   * Wahl wie bei der Fremdfirmen-Warnung.
   *
   * Ein `useMemo` genügt, eine Entprellung braucht es nicht: Der Durchlauf
   * ist reine Zeichenarbeit über wenige tausend Zeichen und läuft ohnehin
   * nur, wenn `docx` sich ändert — und das tut es je Bearbeitung einmal.
   */
  const language = useMemo(() => (docx === null ? 'de' : detectLanguage(docx.text)), [docx])
  const proofreading = useMemo(() => findProofreadingIssues(docx, language), [docx, language])

  documentTextRef.current = docx?.text ?? null
  proofreadingRef.current = proofreading

  useProofreadingHighlight({ rootRef, findings: proofreading })

  /**
   * **Der eine Weg, auf dem sich der Text ändert.**
   *
   * Tippen, eine übernommene Variante und ein eingesetztes Briefkopf-Feld
   * laufen alle hier hindurch: `replaceRange` bildet den neuen Stand,
   * `shiftMarks` führt die vorgemerkten Stellen nach, und beides geht in
   * **einem** `commit` in den Verlauf. Ein vierter Änderungsweg, der das
   * Nachführen vergäße, wäre der wahrscheinlichste Fehler dieser
   * Erweiterung — deshalb gibt es nur diesen einen.
   *
   * `completes` hakt die Vormerkung ab, die genau auf dem ersetzten Bereich
   * liegt. Welche das ist, wird **vor** dem Verschieben festgestellt:
   * danach ist ihr Bereich ein anderer.
   */
  const applyEdit = useCallback(
    (range: TextRange, text: string, options: { group?: object; completes?: boolean } = {}) => {
      if (docx === null) return
      const completed =
        options.completes === true
          ? (marks.find(
              (mark) => mark.range.from === range.from && mark.range.to === range.to,
            ) ?? null)
          : null

      const next = replaceRange(docx, range, text)
      const shifted = shiftMarks(marks, range, text.length, next.text)
      commit(
        next,
        completed === null
          ? shifted
          : shifted.map((mark) => (mark.id === completed.id ? { ...mark, done: true } : mark)),
        options.group,
      )
    },
    [docx, marks, commit],
  )

  /**
   * Eine übernommene Variante geht denselben Weg wie das Tippen:
   * `replaceRange` auf den Bereich der Markierung, dann `commit` **ohne**
   * Merkmal — sie ist ein eigener Verlaufsschritt und verschmilzt nicht mit
   * dem Tippen davor.
   *
   * Die unbelegten Aussagen werden **nach** dem Einsetzen angemeldet: Erst
   * dann stehen sie im Dokument, und nur dort findet `locateClaims` sie.
   */
  const applyVariant = useCallback(
    (variant: Variant) => {
      if (selection === null) return
      applyEdit(selection.range, variant.text, { completes: true })
      claims.add(variant.unbackedClaims)
      clear()
    },
    [selection, applyEdit, claims, clear],
  )

  /**
   * Zurück auf das hochgeladene Dokument — derselbe Weg, den das Betreten
   * der Arbeitsfläche geht (`parseDocx` + `reset`), und danach die
   * vorgemerkten Stellen neu gegen genau diesen Text gesetzt.
   *
   * Die Anker wurden seinerzeit auf dem Original gebildet und treffen hier
   * deshalb, sofern die Unterlage nicht ausgetauscht wurde. Was dennoch
   * nicht sitzt, wird gezählt und im Dialog gemeldet — vor der ersten
   * bezahlten Anfrage, nicht mitten im Lauf.
   *
   * Alle wiedergefundenen Stellen stehen wieder **offen**: Das Abgehakt-Sein
   * galt der vorigen Bewerbung, nicht der Stelle selbst.
   */
  const restoreOriginal = useCallback(async () => {
    if (source === null) return { markIds: [], unresolved: 0 }
    const anchors = marksRef.current.map((mark) => mark.anchor)
    const parsed = await parseDocx(source.docxBase)
    reset(parsed)
    const restored = restoreMarks(parsed.text, anchors, (index) => `mark-${index}`)
    setMarks(restored.marks)
    return {
      markIds: restored.marks.map((mark) => mark.id),
      unresolved: restored.unresolved.length,
    }
  }, [source, reset, setMarks])

  /**
   * Zusammenhängendes Tippen ist **ein** Verlaufsschritt. Der Lauf endet,
   * wenn der Absatz wechselt oder wenn länger als {@link TYPING_BREAK_MS}
   * nichts eingegeben wurde. Das Merkmal ist ein frisches Objekt je Lauf: An
   * seiner Identität erkennt die Historie den Zusammenhang, und ein späterer
   * zweiter Lauf im selben Absatz verschmilzt nicht mit dem ersten.
   */
  const typingRun = useRef<{ token: object; index: number; at: number } | null>(null)

  const typingToken = useCallback((index: number): object => {
    const now = Date.now()
    const run = typingRun.current
    if (run !== null && run.index === index && now - run.at <= TYPING_BREAK_MS) {
      run.at = now
      return run.token
    }
    const token = {}
    typingRun.current = { token, index, at: now }
    return token
  }, [])

  const handleParagraphInput = useCallback(
    (index: number, text: string) => {
      if (docx === null) return
      const paragraph = docx.paragraphs[index]
      if (paragraph === undefined || paragraph.text === text) return

      const edit = diffText(paragraph.text, text)
      applyEdit(
        { from: paragraph.start + edit.from, to: paragraph.start + edit.to },
        edit.insert,
        { group: typingToken(index) },
      )
    },
    [docx, applyEdit, typingToken],
  )

  const activeMarkId = useMemo(() => {
    if (selection === null) return null
    const active = marks.find(
      (mark) =>
        mark.range.from === selection.range.from && mark.range.to === selection.range.to,
    )
    return active?.id ?? null
  }, [marks, selection])

  /**
   * Einen Bereich anspringen: markieren und ins Bild rollen. Geteilt von der
   * Merkliste und der Textprüfung — beide zeigen eine Fundstelle in einer
   * Liste, und beide sollen beim Klick dasselbe tun.
   */
  const revealRange = useCallback(
    (range: TextRange) => {
      select(range)
      const root = rootRef.current
      if (root === null) return
      const element = rangeToDomRange(root, range)?.startContainer.parentElement ?? null
      // jsdom kennt `scrollIntoView` nicht; im Browser ist es immer da.
      if (typeof element?.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
    [select],
  )

  /**
   * Eine Stelle aus der Liste anspringen. Die Vormerkung wird dabei **nicht**
   * verbraucht — sie bleibt stehen, auch nachdem eine Variante übernommen
   * wurde.
   */
  const selectMark = useCallback((mark: Mark) => revealRange(mark.range), [revealRange])

  const insertAtSelection = useMemo(
    () =>
      docx === null || selection === null
        ? null
        : (value: string) => {
            applyEdit(selection.range, value)
            clear()
          },
    [docx, selection, applyEdit, clear],
  )

  return {
    kind,
    rootRef,
    document: docx,
    loading,
    failed,
    marks,
    markHandle,
    activeMarkId,
    selection,
    caretParagraph,
    select,
    clear,
    selectMark,
    revealRange,
    canUndo,
    undo,
    commit,
    claims,
    language,
    proofreading,
    draft,
    applyEdit,
    applyVariant,
    restoreOriginal,
    handleParagraphInput,
    insertAtSelection,
  }
}
