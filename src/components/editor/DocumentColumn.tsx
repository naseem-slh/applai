import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiUsageStatus } from '@/components/app/ApiUsageStatus'
import { Button } from '@/components/ui/Button'
import { readDocumentFormat } from '@/lib/docx/format'
import { detectLanguage } from '@/lib/domain/language'
import type { Variant } from '@/lib/domain/rewrite'
import { ClaimGuard } from './ClaimGuard'
import { DocumentView } from './DocumentView'
import { DraftStatus } from './DraftStatus'
import { SelectionLayer } from './SelectionLayer'
import { VariantPopover } from './VariantPopover'
import { paragraphRange, wholeDocumentRange, type EditorSelection } from './documentSelection'
import type { DocumentWorkspace } from './useDocumentWorkspace'

/**
 * Die mittlere Spalte: das Blatt, die Leiste darüber und die unbelegten
 * Aussagen darunter.
 *
 * **Dokumentunabhängig.** Sie zeigt, was ihr `workspace` hält — Anschreiben
 * oder Lebenslauf. Was die beiden unterscheidet, kommt als Eigenschaft
 * herein: die Überschrift, ob „Ganzes Dokument" angeboten wird, welche
 * Absätze fremd oder vom Briefkopf berührt sind, und die fertige
 * Umformulierungsfunktion (die Schale setzt sie zusammen, weil nur sie das
 * Stilprofil beider Dokumente kennt).
 */

export interface DocumentColumnProps {
  workspace: DocumentWorkspace
  /** Kennung der Überschrift, die diese Fläche benennt. */
  headingId: string
  claimsHeadingId: string
  /** Sichtbarer Name des Dokuments — nur für Vorlesesoftware. */
  heading: string
  /** Liegt ein genaues Zeigegerät vor? Siehe `usePrecisePointer`. */
  fineSelection: boolean
  /** Darf das ganze Dokument auf einmal markiert werden? Beim Lebenslauf nicht. */
  allowWholeDocument?: boolean
  rewrite: (selection: EditorSelection, signal: AbortSignal) => Promise<Variant[]>
  /** Sind Anzeige und Stilprofil ausgewertet? Sonst bleibt der Knopf gesperrt. */
  rewriteReady: boolean
  /** Rückgängig — die Schale komponiert es, weil sie den Briefkopfbericht mitnimmt. */
  onUndo: () => void
  foreignParagraphs?: readonly number[]
  letterheadParagraphs?: readonly number[]
  /**
   * Ein dauerhafter Hinweis zu diesem Dokument, unter der Leiste — heute der
   * Beta-Vermerk des Lebenslaufs. Kein `role="status"`: Er steht schon da,
   * bevor der Nutzer etwas tut, und ist keine Meldung auf eine Handlung hin.
   */
  notice?: ReactNode
  /** Der Zustand der Auswertungen, unter der Leiste. */
  status?: ReactNode
}

export function DocumentColumn({
  workspace,
  headingId,
  claimsHeadingId,
  heading,
  fineSelection,
  allowWholeDocument = true,
  rewrite,
  rewriteReady,
  onUndo,
  foreignParagraphs = [],
  letterheadParagraphs = [],
  notice,
  status,
}: DocumentColumnProps) {
  const { t } = useTranslation()
  const docx = workspace.document

  /**
   * Die Formatierung des Dokuments, neu gelesen nach jeder Bearbeitung.
   *
   * Das ist tragbar, weil der teure Teil — Formatvorlagen und Design — am
   * Archiv hängt und nicht am Bearbeitungsstand (`readFormatContext`). Übrig
   * bleibt ein Durchgang über die bereits geparsten Absatzknoten.
   *
   * **Scheitert es, zeigt die Fläche Rohtext.** Ein Dokument, dessen
   * Formatierung sich nicht lesen lässt, soll lesbar und bearbeitbar
   * bleiben; ohne Brief steht der Bewerber ganz ohne da.
   */
  const format = useMemo(() => {
    if (docx === null) return null
    try {
      return readDocumentFormat(docx)
    } catch {
      return null
    }
  }, [docx])

  if (docx === null) return null

  return (
    <>
      <h2 id={headingId} className="sr-only">
        {heading}
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
              selection={workspace.selection}
              fineSelection={fineSelection}
              allowWholeDocument={allowWholeDocument}
              caretParagraph={workspace.caretParagraph}
              onSelectWholeDocument={() => workspace.select(wholeDocumentRange(docx))}
              onSelectParagraph={(index) => {
                const range = paragraphRange(docx, index)
                if (range !== null) {
                  workspace.select(range)
                  workspace.markHandle.toggle(range)
                }
              }}
              actions={
                <VariantPopover
                  selection={workspace.selection}
                  rewrite={rewrite}
                  ready={rewriteReady}
                  onApply={workspace.applyVariant}
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
            <Button variant="ghost" size="sm" disabled={!workspace.canUndo} onClick={onUndo}>
              {t('editor.undo')}
            </Button>
            <span className="flex min-w-0 items-center gap-3 [&>p]:truncate">
              <DraftStatus state={workspace.draft} />
              <ApiUsageStatus />
            </span>
          </div>
        </div>

        {notice}
        {status}
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
            nicht an der Fläche darin, damit der Rand des Blattes mitgeht.

            Der Brief ist eine **Seite**, kein Textblock in einer Karte:
            Es gilt das Seitenverhältnis von A4 bei höchstens 900 px
            Breite. Nur noch Hülle und Druckmarke — das Blatt selbst ist
            jede einzelne Seite in `DocumentView`. */}
        <div data-print-document className="w-full max-w-[900px]">
          <DocumentView
            rootRef={workspace.rootRef}
            paragraphs={docx.paragraphs}
            // Auch mit dem Finger: Die Checkliste nimmt auf schmalen
            // Geräten nur die **Feinmarkierung** weg, nicht das Tippen.
            editable
            labelledBy={headingId}
            // Die Sprache des Dokuments, deterministisch erkannt (Aufgabe 9,
            // kein Modellaufruf). Sie entscheidet, in welcher Sprache der
            // Browser die Rechtschreibung prüft und eine Vorlesesoftware
            // den Text ausspricht.
            language={detectLanguage(docx.text)}
            // Nur die Absätze, die die Leiste auch benennt (`position > 0`,
            // siehe `SelectionLayer`). Eine Kontur ohne ein Wort dazu wäre
            // eine Bedeutung, die allein an der Farbe hinge.
            retainedParagraphs={
              workspace.selection?.inspection.retained
                .filter((entry) => entry.position > 0)
                .map((entry) => entry.index) ?? []
            }
            // Absätze mit einer unbestätigten unbelegten Aussage (freier
            // Modus). Der Wortlaut steht in `ClaimGuard` darunter.
            claimParagraphs={workspace.claims.pendingParagraphs}
            // Fremdfirmen-Treffer bekommen dieselbe Behandlung wie die
            // unbelegten Aussagen (siehe `foreignCompanies.ts`).
            foreignParagraphs={foreignParagraphs}
            // Absätze, in denen der Briefkopf selbsttätig übernommen
            // wurde. Eigene Farbe, kein Fehler.
            letterheadParagraphs={letterheadParagraphs}
            onParagraphInput={workspace.handleParagraphInput}
            // `rounded-lg` statt der Vorgabe `rounded-md`: Der Fokusring
            // folgt dem Radius seines Elements und soll dem Blatt folgen,
            // nicht daneben liegen.
            className="rounded-lg"
            // Damit die Fläche den Brief zeigt, wie er beim Empfänger
            // ankommt: in seiner Schrift, mit seinen Einzügen, auf seinem
            // Satzspiegel.
            format={format}
          />
        </div>

        {/* Die unbelegten Aussagen stehen unter dem Blatt, nicht in einer
            Spalte: Sie gehören zu diesem Dokument und zu keiner Stellschraube. */}
        <div className="w-full max-w-[900px]">
          <ClaimGuard
            claims={workspace.claims.located}
            onConfirm={workspace.claims.confirm}
            headingId={claimsHeadingId}
          />
        </div>
      </div>
    </>
  )
}
