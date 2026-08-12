import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { aiErrorKey, VaultLockedError } from '@/components/app/aiErrorKey'
import { LETTER_DRAFT_ID, useApp, type StartSession } from '@/components/app/appContext'
import { ClaimGuard } from '@/components/editor/ClaimGuard'
import { DocumentView } from '@/components/editor/DocumentView'
import { DraftStatus } from '@/components/editor/DraftStatus'
import { SelectionLayer } from '@/components/editor/SelectionLayer'
import { TruthModeSwitch } from '@/components/editor/TruthModeSwitch'
import { VariantPopover } from '@/components/editor/VariantPopover'
import {
  paragraphRange,
  wholeDocumentRange,
  type EditorSelection,
} from '@/components/editor/documentSelection'
import { diffText } from '@/components/editor/editableInput'
import {
  buildRewriteRequest,
  defaultSliders,
  factsFrom,
} from '@/components/editor/rewriteRequest'
import { TYPING_BREAK_MS, useDocumentHistory } from '@/components/editor/useDocumentHistory'
import { useDocumentSelection } from '@/components/editor/useDocumentSelection'
import { useDraftAutosave } from '@/components/editor/useDraftAutosave'
import { useLetterAnalysis } from '@/components/editor/useLetterAnalysis'
import { usePrecisePointer } from '@/components/editor/usePrecisePointer'
import { useUnbackedClaims } from '@/components/editor/useUnbackedClaims'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { PROVIDERS, withSignal } from '@/lib/ai/provider'
import { parseDocx } from '@/lib/docx/parse'
import { detectLanguage } from '@/lib/domain/language'
import { rewriteSelection, type Variant } from '@/lib/domain/rewrite'
import { replaceRange } from '@/lib/docx/replace'
import type { TruthMode } from '@/lib/storage/adapter'

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

  const { document: docx, canUndo, reset, commit, undo } = useDocumentHistory()
  const precise = usePrecisePointer()
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

  const { selection, caretParagraph, select, clear } = useDocumentSelection({
    rootRef,
    document: docx,
    trackPointerSelection: precise,
  })

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
  const provider = vaultProvider === null ? null : PROVIDERS[vaultProvider]

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
  })

  const claims = useUnbackedClaims(docx)

  /**
   * Die Zielsprache der Umformulierung.
   *
   * `docs/spec.md` sagt: „Zielsprache = Sprache der Anzeige. Nachfrage nur
   * bei Abweichung." Die Nachfrage ist 14c. Bis dahin steht hier die Sprache
   * des **Anschreibens**, nicht die der Anzeige — sonst würde eine englische
   * Anzeige den deutschen Brief übersetzen lassen, ohne dass jemand gefragt
   * hätte, und genau das verbietet derselbe Satz. 14c ersetzt die Konstante
   * durch den Zustand, den der Dialog setzt; alles darunter bleibt, wie es
   * ist.
   */
  const targetLanguage = useMemo(
    () => (docx === null ? 'de' : detectLanguage(docx.text)),
    [docx],
  )

  /** Die Faktenbasis: hochgeladener Lebenslauf und hochgeladenes Anschreiben. */
  const facts = useMemo(
    () => factsFrom({ cv: session.cv?.text ?? null, letter: letter?.text ?? null }),
    [session.cv, letter],
  )

  const { jobAd, style } = analysis
  const rewrite = useCallback(
    async (current: EditorSelection, signal: AbortSignal): Promise<Variant[]> => {
      // Nicht erreichbar, solange `ready` unten den Knopf sperrt — aber der
      // Typ weiß das nicht, und ein stiller Rückgabewert wäre schlechter als
      // ein sichtbarer Fehler.
      if (jobAd === null || style === null || provider === null) {
        throw new Error('Umformulierung ohne Auswertung oder ohne Anbieter angefordert.')
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
          sliders: defaultSliders(style),
        }),
        withSignal(provider, signal),
        key,
        privacy,
      )
    },
    [jobAd, style, provider, keyVault, facts, settings.truthMode, targetLanguage, privacy],
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
      if (docx === null || selection === null) return
      commit(replaceRange(docx, selection.range, variant.text))
      claims.add(variant.unbackedClaims)
      clear()
    },
    [docx, selection, commit, claims, clear],
  )

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
      commit(
        replaceRange(
          docx,
          { from: paragraph.start + edit.from, to: paragraph.start + edit.to },
          edit.insert,
        ),
        typingToken(index),
      )
    },
    [docx, commit, typingToken],
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
      undo()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo])

  const heading = (
    <h1 className="text-[length:var(--text-display-size)] leading-[var(--text-display-leading)] font-semibold tracking-[var(--text-display-tracking)] text-[var(--color-ink-strong)]">
      {t('routes.editor.heading')}
    </h1>
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
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-ink)]">{t('editor.noLetter.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.noLetter.body')}</p>
          {backToStart}
        </Card>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-error)]">{t('editor.failed.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.failed.body')}</p>
          {backToStart}
        </Card>
      </div>
    )
  }

  if (loading || docx === null) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <p role="status" className={FIELD_HINT_CLASS}>
          {t('editor.loading')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {heading}
      <p className="max-w-[65ch]">{precise ? t('editor.intro') : t('editor.introTouch')}</p>

      {/* Anbaustelle 14c: Briefkopf, Lückenliste und Stilprofil kommen als
          ruhige Spalte neben das Dokument. Dafür wird aus diesem `<section>`
          ein Raster (`lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6`);
          die Dokumentspalte bleibt, wie sie ist. */}
      {/* Die Spalte ist so breit wie das Blatt darin: Werkzeugleiste,
          Überschrift und Dokument stehen auf derselben Kante wie die
          Überschrift der Seite, und der Blick bleibt beim Brief. */}
      <section aria-labelledby={headingId} className="flex w-full max-w-[72ch] flex-col gap-4">
        <h2
          id={headingId}
          className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]"
        >
          {t('editor.document.heading')}
        </h2>

        {/* Die Leiste bleibt beim Blättern stehen. Ohne eigenen z-Index: Ein
            klebendes Element ist positioniert und liegt damit von selbst
            über dem Fließtext darunter (DESIGN.md vergibt z-Indizes nur an
            Überlagerungen). */}
        <div className="sticky top-0 flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undo}>
              {t('editor.undo')}
            </Button>
            <DraftStatus state={draft} />
          </div>

          <SelectionLayer
            selection={selection}
            fineSelection={precise}
            caretParagraph={caretParagraph}
            onSelectWholeDocument={() => select(wholeDocumentRange(docx))}
            onSelectParagraph={(index) => {
              const range = paragraphRange(docx, index)
              if (range !== null) select(range)
            }}
            onClear={clear}
            actions={
              <VariantPopover
                selection={selection}
                rewrite={rewrite}
                ready={analysis.status === 'ready'}
                onApply={applyVariant}
              />
            }
          />

          {/* Der Wahrheitsmodus steht unter der Markierungsleiste, nicht in
              ihr: Er gilt für die ganze Sitzung, nicht für diese eine
              Markierung. */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TruthModeSwitch value={settings.truthMode} onChange={changeTruthMode} />
            <AnalysisStatus analysis={analysis} hasKey={apiKey !== null} />
          </div>
        </div>

        <Card variant="raised" padding="none">
          <DocumentView
            rootRef={rootRef}
            paragraphs={docx.paragraphs}
            // Auch mit dem Finger: Die Checkliste nimmt auf schmalen
            // Geräten nur die **Feinmarkierung** weg, nicht das Tippen. Ein
            // Anschreiben, das sich unterwegs nicht einmal an einer Stelle
            // berichtigen ließe, wäre weniger wert als eine ungenaue
            // Einfügestelle; die Absatzfolge schützt ohnehin die Prüfung in
            // `DocumentView`, nicht die Gerätefrage.
            editable
            labelledBy={headingId}
            // Die Sprache des Briefs, deterministisch erkannt (Aufgabe 9,
            // kein Modellaufruf). Sie entscheidet, in welcher Sprache der
            // Browser die Rechtschreibung prüft und eine Vorlesesoftware
            // den Text ausspricht — ohne sie liest ein englisch
            // eingestellter Browser ein deutsches Anschreiben englisch vor
            // und unterstreicht jedes Wort rot.
            language={detectLanguage(docx.text)}
            // Nur die Absätze, die die Leiste auch benennt (`position > 0`,
            // siehe `SelectionLayer`). Eine Kontur ohne ein Wort dazu wäre
            // eine Bedeutung, die allein an der Farbe hinge — genau das,
            // was `DESIGN.md` verbietet.
            retainedParagraphs={
              selection?.inspection.retained
                .filter((entry) => entry.position > 0)
                .map((entry) => entry.index) ?? []
            }
            // Absätze mit einer unbestätigten unbelegten Aussage (freier
            // Modus). Der Wortlaut steht in `ClaimGuard` darunter — die
            // Kontur allein wäre eine Bedeutung, die nur an der Farbe hinge.
            claimParagraphs={claims.pendingParagraphs}
            onParagraphInput={handleParagraphInput}
            // `rounded-lg` statt der Vorgabe `rounded-md`: Der Fokusring
            // folgt dem Radius seines Elements und soll dem Blatt folgen,
            // nicht daneben liegen.
            className="rounded-lg px-6 py-8 md:px-10 md:py-12"
          />
        </Card>

        <ClaimGuard
          claims={claims.located}
          onConfirm={claims.confirm}
          headingId={claimsHeadingId}
        />
      </section>
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
    <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-[length:var(--text-body-sm-size)] text-[var(--color-error)]">
        {t(aiErrorKey(analysis.error))}
      </p>
      <Button variant="secondary" size="sm" onClick={analysis.retry}>
        {t('editor.analysis.retry')}
      </Button>
    </div>
  )
}
