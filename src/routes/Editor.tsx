import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { LETTER_DRAFT_ID, useApp, type StartSession } from '@/components/app/appContext'
import { DocumentView } from '@/components/editor/DocumentView'
import { DraftStatus } from '@/components/editor/DraftStatus'
import { SelectionLayer } from '@/components/editor/SelectionLayer'
import { paragraphRange, wholeDocumentRange } from '@/components/editor/documentSelection'
import { diffText } from '@/components/editor/editableInput'
import { TYPING_BREAK_MS, useDocumentHistory } from '@/components/editor/useDocumentHistory'
import { useDocumentSelection } from '@/components/editor/useDocumentSelection'
import { useDraftAutosave } from '@/components/editor/useDraftAutosave'
import { useWideViewport } from '@/components/editor/useWideViewport'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { parseDocx } from '@/lib/docx/parse'
import { detectLanguage } from '@/lib/domain/language'
import { replaceRange } from '@/lib/docx/replace'

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
 *
 * **Anbaustellen für 14b und 14c** stehen unten im Aufbau: die Knopfreihe
 * der Markierungsleiste (`actions`) für Variantenvorschlag und
 * Wahrheitsmodus, und die Spalte neben dem Dokument für Briefkopf,
 * Lückenliste und Stilprofil.
 *
 * **Kein Anbieteraufruf in dieser Aufgabe.** Die Arbeitsfläche liest,
 * markiert und sichert; gefragt wird das Modell erst in 14b.
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
  const { storage } = useApp()
  const headingId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const { document: docx, canUndo, reset, commit, undo } = useDocumentHistory()
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

  const { selection, caretParagraph, select, clear } = useDocumentSelection({
    rootRef,
    document: docx,
    trackPointerSelection: wide,
  })

  const draft = useDraftAutosave({
    storage,
    draftId: LETTER_DRAFT_ID,
    document: docx,
    enabled: docx !== null,
  })

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
      <p className="max-w-[65ch]">{wide ? t('editor.intro') : t('editor.introNarrow')}</p>

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

          {/* Anbaustelle 14b: `actions={<VariantPopover selection={selection} … />}`.
              Der Anbau bekommt dieselbe `EditorSelection` samt gekapptem
              Kontext und schreibt eine übernommene Variante über denselben
              Weg wie das Tippen (`replaceRange` und `commit`). */}
          <SelectionLayer
            selection={selection}
            fineSelection={wide}
            caretParagraph={caretParagraph}
            onSelectWholeDocument={() => select(wholeDocumentRange(docx))}
            onSelectParagraph={(index) => {
              const range = paragraphRange(docx, index)
              if (range !== null) select(range)
            }}
            onClear={clear}
          />
        </div>

        <Card variant="raised" padding="none">
          <DocumentView
            rootRef={rootRef}
            paragraphs={docx.paragraphs}
            editable={wide}
            labelledBy={headingId}
            // Die Sprache des Briefs, deterministisch erkannt (Aufgabe 9,
            // kein Modellaufruf). Sie entscheidet, in welcher Sprache der
            // Browser die Rechtschreibung prüft und eine Vorlesesoftware
            // den Text ausspricht — ohne sie liest ein englisch
            // eingestellter Browser ein deutsches Anschreiben englisch vor
            // und unterstreicht jedes Wort rot.
            language={detectLanguage(docx.text)}
            retainedParagraphs={selection?.inspection.retained.map((entry) => entry.index) ?? []}
            onParagraphInput={handleParagraphInput}
            // `rounded-lg` statt der Vorgabe `rounded-md`: Der Fokusring
            // folgt dem Radius seines Elements und soll dem Blatt folgen,
            // nicht daneben liegen.
            className="rounded-lg px-6 py-8 md:px-10 md:py-12"
          />
        </Card>
      </section>
    </div>
  )
}
