import { useMemo } from 'react'
import { Figure } from '@/components/app/Figures'
import { readDocumentFormat } from '@/lib/docx/format'
import { ClaimGuard } from './ClaimGuard'
import { DocumentView } from './DocumentView'
import { ProofreadingMenu } from './ProofreadingMenu'
import type { DocumentWorkspace } from './useDocumentWorkspace'
import { sheetSize } from './zoom'

/**
 * Die mittlere Spalte: das Blatt und die unbelegten Aussagen darunter.
 *
 * **Sonst nichts.** Die Leiste, die hier bis zur Übernahme der Attrappen
 * stand, ist zur Karte „Auswahl" in der linken Spalte geworden
 * (`SelectionLayer`). Die Mittelspalte beginnt damit auf derselben Höhe wie
 * die Karten links und rechts, und der Brief steht allein da — so, wie er
 * beim Empfänger auch allein dasteht.
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
  foreignParagraphs?: readonly number[]
  letterheadParagraphs?: readonly number[]
  /**
   * Der Maßstab des Blattes in Prozent (25–100).
   *
   * Kommt von außen, weil beide Unterlagen sich einen Wert teilen: Die
   * Schale hält ihn und sichert ihn in den Einstellungen.
   */
  zoom: number
}

export function DocumentColumn({
  workspace,
  headingId,
  claimsHeadingId,
  heading,
  foreignParagraphs = [],
  letterheadParagraphs = [],
  zoom,
}: DocumentColumnProps) {
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
      {/* Der Halter für den Maßstabsregler: Er liegt **neben** dem
          blätternden Bereich, nicht darin, damit die Leiste beim Blättern
          stehenbleibt statt mit dem Brief nach oben zu wandern. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Die Spähende über der Blattkante.
            ------------------------------------------------------------------
            Ihre Vorlage bringt eine eigene Mauer mit, einen Querstrich; der
            ist beim Zuschnitt entfernt worden (siehe `assets.py`), damit die
            **Oberkante des Blattes** die Mauer ist. Was unterhalb des Strichs
            übrig blieb, sind die Finger — die liegen nun auf dem Papier.

            **Alle drei Maße sind Anteile der Blattbreite, keine Pixel.** Die
            Attrappe setzt sie mit 175px auf ein 1080px breites Blatt: 16,2 %
            breit, 9 % vom rechten Rand. Als Anteil geschrieben geht sie am
            Maßstabsregler mit — bei 40 % ist das Blatt kleiner und sie mit
            ihm, statt als Riesin daneben zu stehen.

            **Senkrecht sitzt sie über `bottom` und eine Verschiebung um sich
            selbst.** Der Kasten hier ist null Pixel hoch und liegt genau auf
            der Oberkante des Blattes; `bottom-0` stellt sie darauf.
            `translate-y-[8.69%]` schiebt sie um denselben Anteil ihrer
            **eigenen** Höhe wieder herunter, den ihre Mauer vom unteren Bildrand
            entfernt ist (die Kante sitzt bei 91,31 % der Höhe). Eine Rechnung
            in `top` ginge nicht: Ein Prozentwert löste sich dort gegen die
            Höhe des Kastens auf, und die ist null.

            Sie steht **neben** dem blätternden Bereich, nicht darin: Dort
            schnitte seine Kante ihr den Kopf ab. Die 24px Verschiebung holen
            die Polsterung nach, mit der der Bereich beginnt. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-[3] px-4 print:hidden lg:px-8"
        >
          <div style={sheetSize(zoom)} className="relative mx-auto h-0 translate-y-6">
            <Figure
              pose="spaehenOben"
              className="right-[9%] bottom-0 w-[16.2%] translate-y-[8.69%]"
            />
          </div>
        </div>

        <div
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col items-center gap-5 px-4 py-6 lg:overflow-y-auto lg:px-8"
        >
          {/* `data-print-document`: Beim Drucken bleibt genau diese Karte
              stehen, alles andere wird ausgeblendet (siehe
              `lib/export/print.css`). Die Markierung sitzt an der Karte und
              nicht an der Fläche darin, damit der Rand des Blattes mitgeht.

              Der Brief ist eine **Seite**, kein Textblock in einer Karte:
              Es gilt das Seitenverhältnis von A4. Nur noch Hülle und
              Druckmarke — das Blatt selbst ist jede einzelne Seite in
              `DocumentView`.

              **Hier greift der Maßstab, und nur hier.** Aus dieser Breite
              misst `DocumentView` sein `--pt`, und an `--pt` hängt jedes Maß
              des Briefes (siehe `documentStyle.ts`). Den Kasten schmaler zu
              machen verkleinert deshalb Blatt, Schrift, Ränder und
              schwebende Objekte in einem Zug — ohne `transform`, das
              Cursorsetzung und Trefferprüfung verschöbe. Die vormaligen
              `w-full max-w-[900px]` stehen jetzt als Maße in `zoom.ts`.

              Die Breite steht als **Stilangabe** am Element und schlägt
              damit jede Regel aus einer Datei. Für den Druck ist das eigens
              behandelt: `print.css` setzt sie mit `!important` zurück, sonst
              käme ein auf 60 % gezogener Brief auch auf 60 % aufs Papier. */}
          <div data-print-document style={sheetSize(zoom)}>
            {/* Der Klick auf eine Wellenlinie der Textprüfung. Er
                liegt hier und nicht in `DocumentView`, weil die Fläche
                dokumentunabhängig bleiben soll — und weil der Behälter das
                Ereignis ohnehin sieht, es steigt aus den Absätzen auf. */}
            <ProofreadingMenu
              findings={workspace.proofreading}
              rootRef={workspace.rootRef}
              // Über `applyEdit`, den einen Weg, auf dem sich der Text
              // ändert: So gehen Verlauf, Rückgängig und das Nachführen der
              // vorgemerkten Stellen von selbst mit.
              onApply={(finding) => workspace.applyEdit(finding.range, finding.suggestion)}
            >
              <DocumentView
                rootRef={workspace.rootRef}
                paragraphs={docx.paragraphs}
                // Auch mit dem Finger: Die Checkliste nimmt auf schmalen
                // Geräten nur die **Feinmarkierung** weg, nicht das Tippen.
                editable
                labelledBy={headingId}
                // Die Sprache des Dokuments, deterministisch erkannt (Aufgabe 9,
                // kein Modellaufruf). Sie entscheidet, in welcher Sprache der
                // Browser die Rechtschreibung prüft, wie eine Vorlesesoftware
                // den Text ausspricht — und welche Regeln die Textprüfung
                // anlegt. Bestimmt wird sie im Arbeitsbereich, damit sie nicht
                // zweimal je Bearbeitung über den ganzen Text läuft.
                language={workspace.language}
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
                // `rounded-lg` statt der Vorgabe `rounded-md`: der Radius
                // des Blattes.
                className="rounded-lg"
                // Damit die Fläche den Brief zeigt, wie er beim Empfänger
                // ankommt: in seiner Schrift, mit seinen Einzügen, auf seinem
                // Satzspiegel.
                format={format}
              />
            </ProofreadingMenu>
          </div>

          {/* Die unbelegten Aussagen stehen unter dem Blatt, nicht in einer
              Spalte: Sie gehören zu diesem Dokument und zu keiner Stellschraube.

              **Ohne Maßstab.** Sie sind eine Auskunft der Oberfläche und kein
              Abbild des Briefes; bei 25 % wären sie 225 px breit und nicht
              mehr zu lesen. Dass sie damit breiter stehen können als das
              herausgezoomte Blatt, ist gewollt — es sind zwei verschiedene
              Dinge. */}
          <div className="w-full max-w-[900px]">
            <ClaimGuard
              claims={workspace.claims.located}
              onConfirm={workspace.claims.confirm}
              headingId={claimsHeadingId}
            />
          </div>
        </div>

      </div>
    </>
  )
}
