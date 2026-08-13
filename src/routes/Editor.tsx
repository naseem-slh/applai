import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { ApiUsageStatus } from '@/components/app/ApiUsageStatus'
import { VaultLockedError } from '@/components/app/aiErrorKey'
import { LETTER_DRAFT_ID, useApp, type StartSession } from '@/components/app/appContext'
import { ClaimGuard } from '@/components/editor/ClaimGuard'
import { DocumentView } from '@/components/editor/DocumentView'
import { DraftStatus } from '@/components/editor/DraftStatus'
import { ExportBar } from '@/components/editor/ExportBar'
import { GapList } from '@/components/editor/GapList'
import { LanguagePrompt } from '@/components/editor/LanguagePrompt'
import { LetterheadPanel } from '@/components/editor/LetterheadPanel'
import { applyLetterhead, type LetterheadApplication } from '@/components/editor/letterheadApply'
import { MarkPanel } from '@/components/editor/MarkPanel'
import { SelectionLayer } from '@/components/editor/SelectionLayer'
import { StyleProfilePanel } from '@/components/editor/StyleProfilePanel'
import { TruthModeSwitch } from '@/components/editor/TruthModeSwitch'
import { VariantPopover } from '@/components/editor/VariantPopover'
import {
  paragraphRange,
  rangeToDomRange,
  wholeDocumentRange,
  type EditorSelection,
} from '@/components/editor/documentSelection'
import { diffText } from '@/components/editor/editableInput'
import { findForeignCompanies } from '@/components/editor/foreignCompanies'
import { shiftMarks, type Mark } from '@/components/editor/marks'
import {
  buildRewriteRequest,
  defaultSliders,
  factsFrom,
  type RewriteSliders,
} from '@/components/editor/rewriteRequest'
import { TYPING_BREAK_MS, useDocumentHistory } from '@/components/editor/useDocumentHistory'
import { useDocumentSelection } from '@/components/editor/useDocumentSelection'
import { useDraftAutosave } from '@/components/editor/useDraftAutosave'
import { useGapAnalysis } from '@/components/editor/useGapAnalysis'
import { useLetterAnalysis } from '@/components/editor/useLetterAnalysis'
import { useMarkHighlight } from '@/components/editor/useMarkHighlight'
import { useMarks } from '@/components/editor/useMarks'
import { usePrecisePointer } from '@/components/editor/usePrecisePointer'
import { useUnbackedClaims } from '@/components/editor/useUnbackedClaims'
import { useWideViewport } from '@/components/editor/useWideViewport'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { providerFor, withSignal } from '@/lib/ai/provider'
import { isoDate } from '@/lib/export/docx'
import { parseDocx } from '@/lib/docx/parse'
import type { JobAd } from '@/lib/domain/jobAd'
import { detectLanguage } from '@/lib/domain/language'
import { suggestLetterhead, type Letterhead } from '@/lib/domain/letterhead'
import { rewriteSelection, type Variant } from '@/lib/domain/rewrite'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import { replaceRange, type Range as TextRange } from '@/lib/docx/replace'
import type { TruthMode } from '@/lib/storage/adapter'
import { cn } from '@/lib/utils'

/**
 * Die Arbeitsfläche: das Anschreiben als Dokument, die freie Markierung und
 * der Verlauf.
 *
 * Was hier zusammenläuft:
 *
 * - `DocumentView` zeigt die Absätze und nimmt Eingaben entgegen. Jede
 *   Eingabe geht als **kleinste** Textänderung (`diffText`) über
 *   `replaceRange` ins Modell, nicht als Neuschreiben des ganzen Absatzes;
 *   sonst verlöre er seine Formatierung.
 * - `SelectionLayer` zeigt, was markiert ist, und bietet „ganzes Dokument"
 *   sowie „aktueller Absatz" an.
 * - `useDocumentHistory` hält die Zustände für Strg+Z, `useDraftAutosave`
 *   sichert alle 20 Sekunden.
 * - `useLetterAnalysis` liest beim Betreten einmal die Stellenanzeige und
 *   das Stilprofil (14b) — beides braucht `rewriteSelection` als
 *   Pflichtfeld.
 * - `useMarks` und `MarkPanel` halten die vorgemerkten Stellen: mehrere
 *   Textstellen gleichzeitig, eine nach der anderen umformuliert, und je
 *   Anschreiben gemerkt.
 * - `VariantPopover` fragt nach drei Formulierungen, `TruthModeSwitch`
 *   verschiebt die Wahrheitsgrenze, `useUnbackedClaims` und `ClaimGuard`
 *   halten Markierung, Einzelbestätigung und Exportsperre des freien Modus
 *   (G10).
 *
 * **Anbaustelle für 14c** steht unten im Aufbau: die Spalte neben dem
 * Dokument für Briefkopf, Lückenliste und Stilprofil.
 *
 * **Der Modellaufruf wird hier zusammengesetzt, nicht in der Überlagerung.**
 * `VariantPopover` bekommt eine fertige Funktion und kennt weder Anbieter
 * noch Schlüssel noch Anonymisierung; hier laufen Sitzung, Einstellungen und
 * Tresor ohnehin zusammen.
 *
 * Kein eigenes `<main>`: Das steht einmal in `AppLayout` um den `<Outlet />`.
 */

export default function Editor() {
  const { session } = useApp()

  // `/editor` liegt hinter `RequireSession` (siehe `App.tsx`): Ohne
  // Übergabestand wird umgeleitet, bevor diese Ansicht rendert. Der
  // Compiler kennt diesen Wächter nicht, deshalb steht die Frage hier
  // trotzdem. Beantwortet wird sie mit derselben Umleitung, nicht mit einem
  // nachgebauten Leerzustand: Ein erfundenes `StartSession` hätte einen
  // leeren `userName`, und genau das verbietet Übergabe 1 (siehe
  // `appContext.ts`).
  if (session === null) return <Navigate to="/" replace />
  return <EditorWorkspace session={session} />
}

function EditorWorkspace({ session }: { session: StartSession }) {
  const { t } = useTranslation()
  const { storage, keyVault, settings, updateSettings } = useApp()
  const headingId = useId()
  const claimsHeadingId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const { document: docx, marks, canUndo, reset, commit, setMarks, undo } = useDocumentHistory()
  const precise = usePrecisePointer()
  // Nur für den Anfangszustand der aufklappbaren Bereiche, siehe dort.
  const wide = useWideViewport()
  const [loading, setLoading] = useState(session.letter !== null)
  const [failed, setFailed] = useState(false)

  const letter = session.letter
  useEffect(() => {
    if (letter === null) return
    let cancelled = false
    void (async () => {
      try {
        const parsed = await parseDocx(letter.docxBase)
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
  }, [letter, reset])

  /**
   * **Markieren ist Vormerken.** Es gibt keinen eigenen Knopf mehr: Wer eine
   * Textstelle markiert, hat sie damit vorgemerkt, und ein Klick hinein
   * hebt sie wieder auf. Der Handgriff, den der Nutzer ohnehin macht, sagt
   * bereits alles; ein zweiter wäre eine Wiederholung.
   *
   * Gerufen wird das erst, wenn die Markierung **fertig** ist (siehe
   * `onSettled`) — beim Ziehen meldet der Browser fortwährend
   * Zwischenstände, und jeden davon vorzumerken hieße, für einen Zug ein
   * Dutzend Stellen anzulegen.
   *
   * `toggleMark` erledigt den Rest: deckungsgleich hebt auf, überschneidend
   * ersetzt (siehe `marks.ts`).
   */
  const settleSelection = useCallback(
    (range: TextRange | null) => {
      if (range === null) return
      if (range.to > range.from) {
        markHandleRef.current?.toggle(range)
        return
      }
      // Zusammengefallen: ein Klick. Liegt er in einer vorgemerkten Stelle,
      // nimmt er sie weg. Der Schreibcursor steht danach trotzdem dort, und
      // der nächste Klick verhält sich wieder gewöhnlich.
      const hit = marksRef.current.find(
        (mark) => mark.range.from <= range.from && range.from <= mark.range.to,
      )
      if (hit !== undefined) markHandleRef.current?.remove(hit.id)
    },
    [],
  )

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
    // Der Fingerabdruck kommt vom **hochgeladenen** Brief, nicht vom
    // Arbeitsstand: Sonst läge der Satz nach jedem Tastendruck unter einer
    // neuen Kennung.
    letterText: letter?.text ?? null,
    documentText,
    marks,
    setMarks,
    keep: settings.keepMarks === true,
  })

  const markHandleRef = useRef(markHandle)
  markHandleRef.current = markHandle

  useMarkHighlight({ rootRef, marks })

  const draft = useDraftAutosave({
    storage,
    draftId: LETTER_DRAFT_ID,
    document: docx,
    enabled: docx !== null,
  })

  // Der Anbieter kommt aus dem Tresor, nicht aus den Einstellungen: Er
  // gehört zum Schlüssel (ein Gemini-Schlüssel spricht nicht mit OpenAI),
  // und `Settings.provider` führt ihn nur mit, damit er in der
  // Sicherungsdatei steht (siehe `Settings.tsx`).
  const vaultProvider = keyVault.vault?.getProvider() ?? null
  const apiKey = keyVault.vault?.getKey() ?? null
  // Das Modell kommt aus den Einstellungen, der Anbieter aus dem Tresor.
  // `useMemo`, weil `providerFor` bei jedem Aufruf ein neues Objekt baut und
  // die Auswertung an der Identität des Anbieters hängt.
  const chosenChain = settings.modelChain?.[vaultProvider ?? 'gemini']
  const provider = useMemo(
    () => (vaultProvider === null ? null : providerFor(vaultProvider, chosenChain)),
    [vaultProvider, chosenChain],
  )

  const privacy = useMemo(
    () => ({ enabled: settings.anonymize, userName: session.userName }),
    [settings.anonymize, session.userName],
  )

  const analysis = useLetterAnalysis({
    jobAdText: session.jobAdText,
    letterText: letter?.text ?? '',
    provider,
    apiKey,
    privacy,
    storage,
  })

  const claims = useUnbackedClaims(docx)

  /**
   * Die Sprache des vorhandenen Anschreibens, deterministisch erkannt
   * (Aufgabe 9, kein Modellaufruf). Gemessen wird am **hochgeladenen** Text,
   * nicht am Arbeitsstand: Sonst könnte eine einzelne übersetzte Textstelle
   * die erkannte Sprache des ganzen Briefes kippen und damit die
   * Zielsprache für alles Weitere.
   */
  const letterLanguage = useMemo<'de' | 'en'>(
    () => detectLanguage(letter?.text ?? ''),
    [letter],
  )

  /**
   * Die Zielsprache der Umformulierung.
   *
   * `docs/spec.md`: „Zielsprache = Sprache der Anzeige. **Nachfrage nur bei
   * Abweichung.**" Beides steckt in diesen zwei Zuständen: Angefangen wird
   * bei der Sprache des Briefes (dabei bleibt es, solange die Anzeige
   * dieselbe hat), und weicht die Anzeige ab, entscheidet der Nutzer einmal
   * im Dialog. Bis er entschieden hat, wird nichts übersetzt.
   */
  const [targetLanguage, setTargetLanguage] = useState<'de' | 'en' | null>(null)
  const [languageAsked, setLanguageAsked] = useState(false)

  const adLanguage = analysis.jobAd?.language ?? null
  const languageDiffers = adLanguage !== null && adLanguage !== letterLanguage
  const askingLanguage = languageDiffers && !languageAsked

  useEffect(() => {
    // Stimmen die Sprachen überein, ist die Frage beantwortet, ohne dass sie
    // gestellt wurde — der Regelfall darf nichts verlangen.
    if (adLanguage !== null && !languageDiffers) setTargetLanguage(letterLanguage)
  }, [adLanguage, languageDiffers, letterLanguage])

  /** Die Faktenbasis: hochgeladener Lebenslauf und hochgeladenes Anschreiben. */
  const facts = useMemo(
    () => factsFrom({ cv: session.cv?.text ?? null, letter: letter?.text ?? null }),
    [session.cv, letter],
  )

  /**
   * Das korrigierte Stilprofil und die Reglerstellung.
   *
   * Beide beginnen bei dem, was die Auswertung geliefert hat, und gehören ab
   * dann dem Nutzer: `StyleProfilePanel` schreibt hier hinein, und
   * `buildRewriteRequest` liest von hier, nicht mehr aus `analysis`. Die
   * Übernahme läuft über einen Effekt und nicht über einen Anfangswert, weil
   * die Auswertung erst nach dem ersten Rendern ankommt.
   */
  const [style, setStyle] = useState<StyleProfile | null>(null)
  const [sliders, setSliders] = useState<RewriteSliders | null>(null)

  const derivedStyle = analysis.style
  useEffect(() => {
    if (derivedStyle === null) return
    setStyle(derivedStyle)
    setSliders(defaultSliders(derivedStyle))
  }, [derivedStyle])

  /**
   * Der Briefkopfvorschlag (Aufgabe 12, ohne KI). `today` entsteht einmal je
   * Auswertung; ein bei jedem Rendern neues `new Date()` würde den Vorschlag
   * unaufhörlich neu berechnen und die Korrekturen des Nutzers überschreiben.
   *
   * Ein Wechsel der Oberflächensprache erzeugt den Vorschlag dagegen
   * absichtlich neu: Datum und Betreff sind sprachabhängig, und ein
   * deutscher Betreff in einer englischen Oberfläche wäre das falschere
   * Ergebnis als eine verlorene Korrektur — die Wahl trifft der Nutzer
   * bewusst, mitten in der Arbeit am Brief so gut wie nie.
   */
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null)
  /**
   * Zu welcher `jobAd` der aktuelle `letterhead`-Stand gehört — eigener
   * Zustand statt eines Refs, damit er sich mit `letterhead` in **demselben**
   * Rendervorgang aktualisiert (React fasst beide `setState`-Aufrufe im
   * Effekt unten zu einem einzigen Nachrendern zusammen). Ein Ref wäre hier
   * zu schnell: Er änderte sich schon im selben Durchlauf, in dem dieser
   * Effekt läuft, während `letterhead` selbst erst beim nächsten Rendern den
   * neuen Vorschlag trüge — die Übernahme unten läse dann eine `jobAd`, die
   * nicht mehr zu ihrem `letterhead` passt.
   */
  const [letterheadFor, setLetterheadFor] = useState<JobAd | null>(null)

  const { jobAd } = analysis
  const uiLanguage = settings.uiLanguage
  useEffect(() => {
    if (jobAd === null) return
    setLetterhead(suggestLetterhead(jobAd, uiLanguage, new Date()))
    setLetterheadFor(jobAd)
  }, [jobAd, uiLanguage])

  /**
   * Die Fremdfirmen-Warnung, am **laufenden** Dokumentstand: Sie soll
   * verschwinden, sobald der Name berichtigt ist.
   */
  const [knownCompanies, setKnownCompanies] = useState<string[]>([])
  // Abgeschlossen, gleich ob mit oder ohne Ergebnis: Die selbsttätige
  // Übernahme des Briefkopfs wartet darauf, sonst fände sie nie einen
  // Empfänger — siehe der Effekt weiter unten.
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    void storage
      .listApplications()
      .then((applications) => {
        if (!cancelled) {
          setKnownCompanies(applications.map((entry) => entry.company))
          setCompaniesLoaded(true)
        }
      })
      .catch(() => {
        // Ein nicht erreichbarer Speicher ist bereits über
        // `storageUnavailable` sichtbar (siehe `AppProvider`). Ohne Liste
        // gibt es hier schlicht nichts zu warnen — geladen ist der Zustand
        // trotzdem, sonst bliebe die selbsttätige Übernahme für immer aus.
        if (!cancelled) setCompaniesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage])

  /**
   * Die selbsttätige Übernahme des Briefkopfs.
   *
   * **Einmal je Stellenanzeige**, nicht einmal überhaupt: Der Ref merkt sich
   * die `jobAd`, für die bereits übernommen wurde. Analysiert der Nutzer zu
   * demselben Brief eine zweite Anzeige, soll erneut übernommen werden —
   * dann steht im Briefkopf ja die vorige Firma und er ist selbst der alte
   * Briefkopf geworden. Dass `docx`, `marks` und `letterhead` in der
   * Abhängigkeitsliste stehen, ist unschädlich: Der Ref-Vergleich lässt den
   * Rumpf je Anzeige nur einmal durchlaufen, und dann mit den Werten dieses
   * Rendervorgangs.
   *
   * Gewartet wird auf `companiesLoaded`: Ohne die Liste früherer Firmen gibt
   * es keinen Anker für den Empfänger, und ein zu früher Lauf fände ihn nie.
   *
   * **Und auf `letterheadFor`**: Der Vorschlagseffekt oben setzt `letterhead`
   * und `letterheadFor` zusammen, aber erst beim **nächsten** Rendern. Ändert
   * sich `jobAd`, läuft dieser Effekt schon einmal mit der neuen `jobAd` und
   * dem noch alten `letterhead` — ohne die Wache würde der veraltete
   * Briefkopf (samt alter Firma) übernommen, und der Ref oben markierte die
   * neue Anzeige fälschlich als erledigt, sodass der richtige Briefkopf nie
   * mehr zum Zug käme.
   */
  const appliedFor = useRef<JobAd | null>(null)
  const [application, setApplication] = useState<LetterheadApplication | null>(null)
  useEffect(() => {
    if (docx === null || jobAd === null || letterhead === null || !companiesLoaded) return
    // Siehe oben: `letterhead` muss zur laufenden `jobAd` gehören.
    if (letterheadFor !== jobAd) return
    if (appliedFor.current === jobAd) return
    appliedFor.current = jobAd

    const result = applyLetterhead(docx, letterhead, marks, knownCompanies, jobAd.company)
    setApplication(result)
    if (result.changes.length > 0) commit(result.document, result.marks)
  }, [docx, jobAd, letterhead, letterheadFor, marks, knownCompanies, companiesLoaded, commit])

  /**
   * Rückgängig nimmt auch den Bericht mit: Er bezeichnet Änderungen, die es
   * danach nicht mehr gibt.
   */
  const undoAll = useCallback(() => {
    undo()
    setApplication(null)
  }, [undo])

  const foreign = useMemo(
    () => findForeignCompanies(docx, jobAd?.company ?? null, knownCompanies),
    [docx, jobAd, knownCompanies],
  )

  const gaps = useGapAnalysis({ jobAd, facts, provider, apiKey, privacy })

  const rewrite = useCallback(
    async (current: EditorSelection, signal: AbortSignal): Promise<Variant[]> => {
      // Nicht erreichbar, solange `ready` unten den Knopf sperrt — aber der
      // Typ weiß das nicht, und ein stiller Rückgabewert wäre schlechter als
      // ein sichtbarer Fehler.
      if (
        jobAd === null ||
        style === null ||
        sliders === null ||
        targetLanguage === null ||
        provider === null
      ) {
        throw new Error('Umformulierung ohne Auswertung, Zielsprache oder Anbieter angefordert.')
      }

      // Der Schlüssel wird **jetzt** gelesen, nicht beim Rendern: Der Tresor
      // sperrt sich nach der Untätigkeitsfrist selbst und meldet das an
      // niemanden (siehe `VaultLockedError`). Ein beim Rendern
      // eingeschlossener Schlüssel ginge sonst noch los, nachdem der Tresor
      // ihn vergessen hat. `refresh()` bringt den gesperrten Zustand
      // zugleich in die Oberfläche, wo er hingehört.
      const key = keyVault.vault?.getKey() ?? null
      if (key === null) {
        keyVault.refresh()
        throw new VaultLockedError()
      }

      return rewriteSelection(
        buildRewriteRequest({
          selection: current,
          jobAd,
          style,
          facts,
          truthMode: settings.truthMode,
          targetLanguage,
          sliders,
        }),
        withSignal(provider, signal),
        key,
        privacy,
      )
    },
    [
      jobAd,
      style,
      sliders,
      targetLanguage,
      provider,
      keyVault,
      facts,
      settings.truthMode,
      privacy,
    ],
  )

  /**
   * **Der eine Weg, auf dem sich der Brieftext ändert.**
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
   * Einsetzen eines Briefkopf-Feldes an der Markierung — derselbe Weg wie
   * die Übernahme einer Variante, also ein eigener Verlaufsschritt.
   * `null`, solange nichts markiert ist; der Knopf ist dann gesperrt.
   */
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

  /**
   * Nach dem Word-Export: Bewerbung eintragen und den Zwischenstand löschen
   * (`docs/spec.md`: „gelöscht nach Export oder nach 7 Tagen"). Nur der
   * Word-Download löst das aus — warum, steht in `ExportBar`.
   *
   * Beide Schritte werden **einzeln** versucht und beide Fehler
   * verschluckt: Der Brief ist zu diesem Zeitpunkt bereits erzeugt, und ein
   * gescheiterter Listeneintrag darf ihn nicht als Fehlschlag erscheinen
   * lassen. Ein nicht gelöschter Entwurf läuft ohnehin nach sieben Tagen ab
   * (`purgeExpiredDrafts`).
   */
  const handleExported = useCallback(() => {
    void storage
      .addApplication({
        company: jobAd?.company ?? '',
        position: jobAd?.position ?? '',
        date: isoDate(new Date()),
      })
      .catch(() => {})
    void storage.deleteDraft(LETTER_DRAFT_ID).catch(() => {})
  }, [storage, jobAd])

  const changeTruthMode = useCallback(
    (next: TruthMode) => {
      // Scheitert das Speichern, bleibt der bisherige Modus stehen (siehe
      // `updateSettings`). Sichtbar ist das an der Auswahlliste selbst, die
      // dann nicht umspringt — eine zweite Meldung an dieser Stelle wäre
      // eine Doppelung der Einstellungen-Ansicht.
      void updateSettings({ truthMode: next }).catch(() => {})
    },
    [updateSettings],
  )

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

  // Strg+Z am Fenster, nicht an der Dokumentfläche: Der Verlauf soll auch
  // dann greifen, wenn der Fokus auf einem Knopf der Leiste steht. Eingabe-
  // und Textfelder behalten ihr eigenes Rückgängig; 14c bringt welche mit.
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key.toLowerCase() !== 'z') return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      undoAll()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undoAll])

  /** Die Vormerkung, die gerade markiert ist — für `aria-current` in der Liste. */
  const activeMarkId = useMemo(() => {
    if (selection === null) return null
    const active = marks.find(
      (mark) =>
        mark.range.from === selection.range.from && mark.range.to === selection.range.to,
    )
    return active?.id ?? null
  }, [marks, selection])

  /**
   * Eine Stelle aus der Liste anspringen: markieren und ins Bild rollen.
   * Die Vormerkung wird dabei **nicht** verbraucht — sie bleibt stehen, auch
   * nachdem eine Variante übernommen wurde.
   */
  const selectMark = useCallback(
    (mark: Mark) => {
      select(mark.range)
      const root = rootRef.current
      if (root === null) return
      const element = rangeToDomRange(root, mark.range)?.startContainer.parentElement ?? null
      // jsdom kennt `scrollIntoView` nicht; im Browser ist es immer da.
      if (typeof element?.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
    [select],
  )

  const heading = (
    <h1 className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]">
      {t('routes.editor.heading')}
    </h1>
  )

  /** Rahmen für die Zustände, die keine Arbeitsfläche sind (kein Brief,
   *  Fehler, Ladevorgang). Sie sind Lesestoff, keine Werkbank, und stehen
   *  deshalb in einer ruhigen Spalte statt im Dreispalter darunter. */
  const state = (children: ReactNode) => (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">{children}</div>
    </div>
  )

  const backToStart = (
    <Button asChild variant="secondary" className="self-start">
      <Link to="/">{t('editor.backToStart')}</Link>
    </Button>
  )

  // Die Einstiegsseite lässt „Anschreiben **oder** Lebenslauf" zu; im ersten
  // Bauabschnitt wird aber nur das Anschreiben bearbeitet (`docs/spec.md`,
  // „Reihenfolge"). Das ist ein echter Zustand des Produkts, kein
  // nachgebauter Leerzustand.
  if (letter === null) {
    return state(
      <>
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-ink)]">{t('editor.noLetter.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.noLetter.body')}</p>
          {backToStart}
        </Card>
      </>,
    )
  }

  if (failed) {
    return state(
      <>
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-error)]">{t('editor.failed.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.failed.body')}</p>
          {backToStart}
        </Card>
      </>,
    )
  }

  if (loading || docx === null) {
    return state(
      <>
        {heading}
        <p role="status" className={FIELD_HINT_CLASS}>
          {t('editor.loading')}
        </p>
      </>,
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Den Titel trägt der Schrittreiter in der Kopfzeile bereits sichtbar.
          Hier bleibt er für Vorlesesoftware stehen, damit die Ansicht eine
          Ebene-1-Überschrift behält, ohne sie zweimal zu zeigen. */}
      <h1 className="sr-only">{t('routes.editor.heading')}</h1>

      {/* Drei Spalten über die volle Fensterbreite: links, was die Anzeige
          verlangt und was vorgemerkt ist, in der Mitte der Brief, rechts die
          Stellschrauben und die Ausgabe.

          **Die Reihenfolge im Aufbau ist eine andere als die im Bild.** Der
          Brief steht im HTML zuerst, damit Tastatur und Vorlesesoftware
          zuerst an das Dokument kommen; die Spalten werden erst über
          `col-start` an ihren Platz gesetzt. Das war schon vorher so.

          Bis `xl` liegen beide Spalten zusammen rechts, weil ein Brief
          zwischen zwei Spalten sonst zu schmal würde. `xl:contents` löst den
          Sammelbehälter dann auf, und seine beiden Bereiche werden selbst zu
          Rasterfeldern — so steht jeder Bereich genau einmal im Aufbau statt
          zweimal für zwei Fensterbreiten.

          `grid-rows-[minmax(0,1fr)]`: Ohne das wächst die Rasterzeile mit
          ihrem Inhalt, und der Rahmen mit `lg:overflow-hidden` schneidet ab,
          ohne dass man an den Rest kommt. */}
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          'lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)]',
          'xl:grid-cols-[19rem_minmax(0,1fr)_21rem]',
        )}
      >
        <section
          aria-labelledby={headingId}
          className="flex min-h-0 flex-col lg:col-start-1 lg:row-start-1 xl:col-start-2"
        >
          <h2 id={headingId} className="sr-only">
            {t('editor.document.heading')}
          </h2>

          {/* Die Leiste steht fest über dem Blatt, statt mitzublättern: Der
              Bereich darunter blättert für sich, also braucht sie kein
              `sticky` mehr. */}
          <div className="flex flex-none flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2.5 lg:px-6">
            {/* **Eine Zeile (Variante A).** Vorher wuchs die Leiste beim
                Markieren von 87 auf bis zu 237 px, weil Knoepfe und Zeilen je
                nach Zustand kamen und gingen; der Brief darunter sprang bei
                jeder Markierung. Jetzt wechselt der Inhalt seinen Zustand,
                nicht sein Mass (siehe `SelectionLayer`).

                **Warum der Umbruch trotzdem bleibt.** Gemessen im Browser:
                Die Markierungsleiste braucht 630 px, die Mittelspalte hat bei
                einem Fenster von 1280 px aber nur 592 px. In einer Zeile geht
                das nicht auf, und beide Auswege waren schlechter als ein
                Umbruch: Laesst man die linke Seite nachgeben (`flex-1` setzt
                die Basis auf 0), wird sie auf 47 px zusammengedrueckt und ihre
                Knoepfe schieben sich unter die rechte Gruppe, die dann Klicks
                abfaengt. Blendet man die Auskuenfte aus, fehlt dem Nutzer die
                Bestaetigung, dass sein Zwischenstand gesichert ist.

                Also bricht die Reihe um, wenn der Platz nicht reicht: eine
                Zeile ab etwa 1330 px Fensterbreite, darunter zwei. Das Mass
                haengt dann an der Breite, nicht mehr am Zustand der
                Markierung — und genau darum ging es. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-[16rem] flex-1">
                <SelectionLayer
                  selection={selection}
                  fineSelection={precise}
                  caretParagraph={caretParagraph}
                  onSelectWholeDocument={() => select(wholeDocumentRange(docx))}
                  onSelectParagraph={(index) => {
                    const range = paragraphRange(docx, index)
                    if (range !== null) {
                      select(range)
                      markHandle.toggle(range)
                    }
                  }}
                        actions={
                    <VariantPopover
                      selection={selection}
                      rewrite={rewrite}
                      ready={analysis.status === 'ready'}
                      onApply={applyVariant}
                    />
                  }
                />
              </div>
              {/* „Rueckgaengig" ist eine Handlung und behaelt ihre Breite.
                  Sicherungsstand und Anfragenzaehler sind leise Auskuenfte und
                  geben als einzige nach, wenn die Spalte eng wird: Sie kuerzen
                  mit Auslassungspunkten, statt die Zeile umbrechen zu lassen.

                  **Warum sie nicht einfach verschwinden.** Der erste Versuch
                  blendete sie unterhalb von 48rem aus. Das nimmt dem Nutzer
                  die Bestaetigung, dass sein Zwischenstand gesichert ist —
                  `happy-path.spec.ts` hat genau das gemeldet. Gekuerzt bleibt
                  der Text im Baum, sichtbar und auffindbar. */}
              <div className="flex shrink-0 items-center gap-3">
                <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undoAll}>
                  {t('editor.undo')}
                </Button>
                <span className="flex min-w-0 items-center gap-3 [&>p]:truncate">
                  <DraftStatus state={draft} />
                  <ApiUsageStatus />
                </span>
              </div>
            </div>

            <AnalysisStatus analysis={analysis} hasKey={apiKey !== null} />
          </div>

          {/* Der Bereich, der das Blatt trägt. Er blättert für sich; die
              Seite als Ganzes steht still.

              `tabIndex={0}`, weil er blättert: Ein Blätterbereich muss mit
              der Tastatur erreichbar sein, sonst kommt niemand ohne Maus an
              den Text unterhalb der Fensterkante (WCAG 2.1.1, axe-Regel
              `scrollable-region-focusable`, Wirkung „serious"). Die
              Dokumentfläche darin ist zwar fokussierbar, zählt aber nicht:
              Ein `contenteditable` ohne eigenes `tabindex` meldet
              `tabIndex === -1` und steht damit nicht in der Tabulatorfolge.
              Mit dem Halt hier blättert Bild-auf und Bild-ab den Brief, ohne
              dass der Schreibcursor in den Text gesetzt werden muss. */}
          <div
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col items-center gap-5 px-4 py-6 lg:overflow-y-auto lg:px-8"
          >
            {/* `data-print-document`: Beim Drucken bleibt genau diese Karte
                stehen, alles andere wird ausgeblendet (siehe
                `lib/export/print.css`). Die Markierung sitzt an der Karte und
                nicht an der Fläche darin, damit der Rand des Blattes mitgeht. */}
            {/* Der Brief ist eine **Seite**, kein Textblock in einer Karte.
                `max-w-[72ch]` war eine Zeilenlängenregel und hatte mit dem
                Dokument nichts zu tun: In der Mitte blieben daneben rund
                290 px leer, während die Seitenspalten Beschriftungen
                abschnitten. Jetzt gilt das Seitenverhältnis von A4
                (210:297) bei höchstens 900 px Breite, und der Innenabstand
                ist der Seitenrand des Drucks: 2 cm auf 21 cm sind 9,5 %.

                In Prozent, nicht in rem, damit der Rand mitschrumpft, wenn
                das Blatt schmaler wird, statt den Satzspiegel zu erdrücken.
                Bei 900 px bleiben 722 px Text, rund 75 Zeichen je Zeile. */}
            {/* Nur noch Hülle und Druckmarke: Das Blatt selbst ist jede
                einzelne Seite in `DocumentView`. Die feste Höhe aus
                `aspect-[210/297]` ist weg — sie klemmte den Brief auf eine
                Seitenhöhe, und alles darüber stand auf dem Hintergrund. */}
            <div data-print-document className="w-full max-w-[900px]">
              <DocumentView
                rootRef={rootRef}
                paragraphs={docx.paragraphs}
                // Auch mit dem Finger: Die Checkliste nimmt auf schmalen
                // Geräten nur die **Feinmarkierung** weg, nicht das Tippen.
                editable
                labelledBy={headingId}
                // Die Sprache des Briefs, deterministisch erkannt (Aufgabe 9,
                // kein Modellaufruf). Sie entscheidet, in welcher Sprache der
                // Browser die Rechtschreibung prüft und eine Vorlesesoftware
                // den Text ausspricht.
                language={detectLanguage(docx.text)}
                // Nur die Absätze, die die Leiste auch benennt (`position > 0`,
                // siehe `SelectionLayer`). Eine Kontur ohne ein Wort dazu wäre
                // eine Bedeutung, die allein an der Farbe hinge.
                retainedParagraphs={
                  selection?.inspection.retained
                    .filter((entry) => entry.position > 0)
                    .map((entry) => entry.index) ?? []
                }
                // Absätze mit einer unbestätigten unbelegten Aussage (freier
                // Modus). Der Wortlaut steht in `ClaimGuard` darunter.
                claimParagraphs={claims.pendingParagraphs}
                // Fremdfirmen-Treffer bekommen dieselbe Behandlung wie die
                // unbelegten Aussagen (siehe `foreignCompanies.ts`).
                foreignParagraphs={foreign.paragraphs}
                // Absätze, in denen der Briefkopf selbsttätig übernommen
                // wurde. Eigene Farbe, kein Fehler.
                letterheadParagraphs={application?.changes.map((change) => change.paragraph) ?? []}
                onParagraphInput={handleParagraphInput}
                // `rounded-lg` statt der Vorgabe `rounded-md`: Der Fokusring
                // folgt dem Radius seines Elements und soll dem Blatt folgen,
                // nicht daneben liegen.
                // Der Seitenrand sitzt jetzt an den Seiten selbst; hier
                // bleibt nur der Fokusring, der dem Blatt folgen soll.
                className="rounded-lg"
                // Lange Leerlaufstrecken aus der Word-Datei ergeben auf
                // Papier Sinn und kosten auf dem Bildschirm nur Weg. Das
                // Dokument bleibt unangetastet, nur die Darstellung fällt
                // zusammen.
                collapseBlankRuns
              />
            </div>

            {/* Die unbelegten Aussagen stehen unter dem Blatt, nicht in einer
                Spalte: Sie gehören zu diesem Brief und zu keiner Stellschraube. */}
            <div className="w-full max-w-[900px]">
              <ClaimGuard
                claims={claims.located}
                onConfirm={claims.confirm}
                headingId={claimsHeadingId}
              />
            </div>
          </div>
        </section>

        {/* Sammelbehälter der beiden Spalten, siehe `xl:contents` oben. */}
        <div
          className={cn(
            'flex min-h-0 flex-col border-[var(--color-border)]',
            'lg:col-start-2 lg:row-start-1 lg:overflow-y-auto lg:border-l',
            'xl:contents',
          )}
        >
          <aside
            aria-label={t('editor.sidePanel.reference')}
              // `[&>*]:shrink-0`: In einer Spalte mit eigenem Blättern
              // dürfen die Kinder standardmäßig schrumpfen — und sie tun es,
              // statt die Spalte blättern zu lassen. Sichtbar war das daran,
              // dass „Briefkopf" zu einem Streifen gequetscht unter
              // „Schreibstil" lag und dessen Textfeld unten abgeschnitten
              // war. Ein Bereich muss seine natürliche Höhe behalten; scrollen
              // soll die Spalte.
            className={cn(
              'flex flex-col gap-3 border-t border-[var(--color-border)] p-4 lg:border-t-0',
              'xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-r',
              '[&>*]:shrink-0',
            )}
          >
            <MarkPanel
              marks={marks}
              unresolved={markHandle.unresolved}
              restore={markHandle.restore}
              activeId={activeMarkId}
          keep={settings.keepMarks === true}
          onKeepChange={(next) => {
            // Scheitert das Speichern, bleibt der Schalter stehen, wo er
            // war — dieselbe Behandlung wie beim Wahrheitsmodus.
            void updateSettings({ keepMarks: next }).catch(() => {})
          }}
              onSelect={selectMark}
              onToggleDone={markHandle.setDone}
              onRemove={markHandle.remove}
              onClearAll={markHandle.clearAll}
              onDismiss={markHandle.dismiss}
              // Als einziger Bereich beginnt die Merkliste auch auf schmalen
              // Geräten offen, sobald etwas darin steht.
              //
              // Vormerken kann man mit dem Finger nicht: Dafür braucht es die
              // Feinmarkierung, und die gibt es nur mit einem genauen
              // Zeigegerät (`docs/spec.md`, `usePrecisePointer`). Eine bereits
              // vorgemerkte Stelle anzutippen und umformulieren zu lassen geht
              // aber sehr wohl. Unterwegs ist die wiederhergestellte Liste
              // damit das Einzige, was die Anwendung überhaupt brauchbar
              // macht — und wäre ausgerechnet der Bereich, den man erst unter
              // dreien hervorklappen müsste.
              //
              // Leer bleibt sie zu: Eine aufgeklappte Fläche, in der „Noch
              // nichts vorgemerkt" steht, kostet auf einem Telefon nur Platz.
              defaultOpen={wide || marks.length > 0 || markHandle.unresolved.length > 0}
            />
            {analysis.jobAd !== null && (
              // Beginnt immer zugeklappt, auch auf breiten Geräten: Die
              // Anforderungen sind Nachschlagestoff für zwischendurch, nicht
              // der Einstieg in die Arbeit. Aufgeklappt schöben sie die
              // Merkliste nach unten, mit der man tatsächlich arbeitet.
              <GapList requirements={analysis.jobAd.requirements} gaps={gaps} defaultOpen={false} />
            )}
          </aside>

          <aside
            aria-label={t('editor.sidePanel.label')}
            className={cn(
              'flex flex-col gap-3 border-t border-[var(--color-border)] p-4',
              'xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l',
              // Siehe die Spalte links: sonst quetschen sich die Bereiche
              // gegenseitig, statt dass die Spalte blättert.
              '[&>*]:shrink-0',
            )}
          >
            {/* Der Wahrheitsmodus stand bisher unter der Markierungsleiste.
                Er gilt für die ganze Sitzung und nicht für diese eine
                Markierung, gehört also zu den Stellschrauben. */}
            <TruthModeSwitch value={settings.truthMode} onChange={changeTruthMode} />
            {letterhead !== null && (
              <LetterheadPanel
                letterhead={letterhead}
                onChange={setLetterhead}
                onInsert={insertAtSelection}
                foreign={foreign}
                application={application}
                onDismissApplication={() => setApplication(null)}
                defaultOpen={wide}
              />
            )}
            {style !== null && sliders !== null && (
              <StyleProfilePanel
                style={style}
                onChange={setStyle}
                sliders={sliders}
                onSlidersChange={setSliders}
                defaultOpen={wide}
              />
            )}
            {/* Die Ausgabe sitzt am Fuß der Spalte: Sie ist das Ende der
                Arbeit und soll nicht zwischen den Stellschrauben stehen. */}
            <div className="mt-auto pt-3">
              <ExportBar
                document={docx}
                company={jobAd?.company ?? null}
                blocked={claims.exportBlocked}
                onExported={handleExported}
              />
            </div>
          </aside>
        </div>
      </div>

      {adLanguage !== null && (
        <LanguagePrompt
          open={askingLanguage}
          adLanguage={adLanguage}
          letterLanguage={letterLanguage}
          onDecide={(target) => {
            setTargetLanguage(target)
            setLanguageAsked(true)
          }}
        />
      )}
    </div>
  )
}

/**
 * Der Zustand der beiden Auswertungen, in einem Satz.
 *
 * Sie laufen im Hintergrund und ohne sie gibt es keine Varianten — deshalb
 * muss dastehen, woran es liegt, wenn der Knopf gesperrt ist. Der Fehlertext
 * kommt aus `aiErrorKey`, nie aus der Ausnahme selbst (G8).
 *
 * Im Erfolgsfall steht hier **nichts**. Was gelesen wurde, zeigt 14c in der
 * Seitenspalte; eine Erfolgsmeldung dazwischen wäre eine Zeile, die nur beim
 * ersten Mal etwas sagt.
 */
function AnalysisStatus({
  analysis,
  hasKey,
}: {
  analysis: ReturnType<typeof useLetterAnalysis>
  hasKey: boolean
}) {
  const { t } = useTranslation()

  if (analysis.status === 'ready') return null

  if (analysis.status === 'idle') {
    // Ohne Schlüssel im Arbeitsspeicher ist der Tresor gesperrt oder leer.
    // Die Einstiegsseite führt durch beides; hier steht nur, warum die
    // Arbeitsfläche gerade nichts fragen kann.
    return hasKey ? null : (
      <p role="status" className={FIELD_HINT_CLASS}>
        {t('vault.locked')}
      </p>
    )
  }

  if (analysis.status === 'loading') {
    return (
      <p role="status" className={FIELD_HINT_CLASS}>
        {t('editor.analysis.loading')}
      </p>
    )
  }

  return (
    <AiErrorNotice
      error={analysis.error}
      onRetry={analysis.retry}
      retryLabel={t('editor.analysis.retry')}
    />
  )
}
