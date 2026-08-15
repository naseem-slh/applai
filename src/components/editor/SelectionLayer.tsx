import type { MouseEvent, ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { cn } from '@/lib/utils'
import type { EditorSelection } from './documentSelection'

/**
 * Die Karte „Auswahl" in der linken Spalte: was gerade markiert ist und was
 * damit geschehen kann.
 *
 * **Sie stand bis zur Übernahme der Attrappen als Leiste über dem Blatt.**
 * Das kostete zweierlei. Der Brief begann nicht mehr auf derselben Höhe wie
 * die Karten links und rechts, sondern erst unterhalb eines Streifens, der
 * über die ganze Mittelspalte lief. Und die Knöpfe standen nebeneinander in
 * einer Zeile, die bei 1280 px Fenster 630 px Inhalt in 592 px unterbringen
 * musste — die Reihe brach um, und die Leiste wuchs beim Markieren.
 *
 * Als Karte in der Spalte ist beides weg: Die Knöpfe stehen untereinander
 * und über die volle Spaltenbreite, jeder so breit wie der nächste, und die
 * Mittelspalte trägt nur noch das Blatt.
 *
 * **Die Reihenfolge der drei Knöpfe ist die Reihenfolge der Handlung.**
 * Zuerst das, was man mit der Markierung vorhat (`actions` — der Auslöser
 * für die Vorschläge, als einziger in der Akzentfarbe). Darunter das, was
 * die Markierung *setzt* (ganzes Dokument, aktueller Absatz). Ganz unten und
 * abgesetzt „Rückgängig": Es gehört zur Auswahl, ist aber die Gegenbewegung
 * zum Übernehmen und nicht Teil davon.
 *
 * **Es gibt keinen Knopf zum Vormerken.** Eine markierte Stelle *ist*
 * vorgemerkt — das Markieren selbst ist die Geste. Ein Klick in eine
 * vorgemerkte Stelle hebt sie wieder auf, eine überschneidende Markierung
 * ersetzt sie. Die Liste darunter (`MarkPanel`) zeigt, was daraus geworden
 * ist.
 *
 * **Die verrutschende Unterschriftsgrafik (Weitergabe aus Aufgabe 3).**
 * Ein Absatz, der ein Bild, eine Tabellenzelle oder einen Abschnittswechsel
 * trägt, wird beim Ersetzen nie entfernt — er behält seinen Platz, während
 * der Ersatztext die vorderen Absätze füllt. Das ist der bewusste Tausch
 * gegen Datenverlust, und er wird hier sichtbar gemacht: **sobald die
 * Markierung entsteht**, nicht erst, wenn die Grafik verrutscht ist. Der
 * Hinweis nennt den Absatz und den Grund; `DocumentView` hebt denselben
 * Absatz im Text hervor, damit der Nutzer ihn findet und seine Markierung
 * gegebenenfalls verkleinert.
 *
 * Das Rechnen selbst steht in `documentSelection.ts`, das Nachhalten in
 * `useDocumentSelection.ts`. Diese Datei zeigt nur an und löst aus — so
 * bleibt die Offset-Abbildung ohne Oberfläche prüfbar.
 */

export interface SelectionLayerProps {
  selection: EditorSelection | null
  /**
   * Ist die Feinmarkierung verfügbar? Mit dem Finger nicht (`docs/spec.md`:
   * „Nutzbar, aber ohne Feinmarkierung", siehe `usePrecisePointer`); dann
   * bleibt der Knopf „ganzes Dokument". Getippt werden darf trotzdem.
   */
  fineSelection: boolean
  /**
   * Darf das ganze Dokument auf einmal markiert werden?
   *
   * Beim Anschreiben ja (`docs/spec.md`, „Auswahl"). Beim **Lebenslauf
   * nicht**: Er ist eine Gliederung aus Überschriften, Datumsspalten und
   * Einträgen, und eine Umformulierung am Stück macht daraus Fließtext. Dort
   * wird absatzweise gewählt — mit der Maus gezogen oder, mit dem Finger,
   * durch Antippen des Absatzes.
   */
  allowWholeDocument?: boolean
  /** Absatz, in dem der Schreibcursor zuletzt stand. */
  caretParagraph: number | null
  onSelectWholeDocument: () => void
  onSelectParagraph: (index: number) => void
  /** Rückgängig — steht abgesetzt am Fuß der Knopfreihe. */
  onUndo: () => void
  canUndo: boolean
  /**
   * Was mit der Markierung geschehen soll (`VariantPopover` samt Auslöser).
   * Steht als Erstes und ist der einzige Knopf in der Akzentfarbe.
   *
   * Wer hier einen Knopf einhängt, verhindert an ihm das Voreingestellte des
   * `mousedown` (siehe unten) — sonst legt der Browser beim Klicken die
   * Markierung zusammen und die Hervorhebung im Text verschwindet, während
   * der Nutzer noch auswählt.
   */
  actions?: ReactNode
  /**
   * Ein dauerhafter Hinweis zum sichtbaren Dokument — heute der Beta-Vermerk
   * des Lebenslaufs. Kein `role="status"`: Er steht schon da, bevor der
   * Nutzer etwas tut.
   */
  notice?: ReactNode
  /** Der Zustand der Auswertungen. */
  status?: ReactNode
  /** Sicherungsstand und Anfragenzähler, als leise Zeile am Fuß. */
  footer?: ReactNode
}

export function SelectionLayer({
  selection,
  fineSelection,
  allowWholeDocument = true,
  caretParagraph,
  onSelectWholeDocument,
  onSelectParagraph,
  onUndo,
  canUndo,
  actions,
  notice,
  status,
  footer,
}: SelectionLayerProps) {
  const { t } = useTranslation()
  const headingId = useId()

  // Ein Klick in die Karte soll die Markierung im Text nicht zusammenlegen.
  // Der Zustand überlebt das ohnehin (`useDocumentSelection` beachtet nur
  // Änderungen innerhalb der Dokumentfläche), die sichtbare Hervorhebung
  // nicht.
  function keepSelection(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
  }

  const retained = selection?.inspection.retained.filter((entry) => entry.position > 0) ?? []
  const showsShiftWarning = selection?.inspection.mayShiftContent === true && retained.length > 0
  const showsParagraph = caretParagraph !== null && (fineSelection || !allowWholeDocument)

  return (
    <Card asChild variant="default" padding="md">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2
          id={headingId}
          className="flex items-baseline justify-between gap-3 font-display text-[length:var(--text-subheading-size)] font-semibold text-[var(--ink-strong)]"
        >
          {t('editor.selection.heading')}
          {selection !== null && (
            <span className={cn(FIELD_HINT_CLASS, 'font-sans font-normal tabular-nums')}>
              <span aria-hidden="true">
                {t('editor.selection.chars', { chars: selection.text.length })}
              </span>
              {/* Vorgelesen bleibt es der ganze Satz. Eine nackte Zahl wäre
                  als Ansage nicht zu verstehen. */}
              <span className="sr-only">
                {t('editor.selection.summary', { chars: selection.text.length })}
              </span>
            </span>
          )}
        </h2>

        {/* Dauerhafte Zustandsauskunft, deshalb `role="status"` und kein
            `role="alert"`: Sie steht schon da, bevor der Nutzer etwas tut. */}
        <div role="status" className="flex flex-col gap-2">
          {selection === null && (
            <p className={FIELD_HINT_CLASS}>
              {fineSelection
                ? t('editor.selection.none')
                : allowWholeDocument
                  ? t('editor.selection.touch')
                  : t('editor.selection.touchParagraph')}
            </p>
          )}
          {showsShiftWarning && <RetainedNote retained={retained} />}
        </div>

        {/* Untereinander und über die volle Breite: In einer Spalte von
            16rem stünde eine Reihe aus drei Knöpfen ohnehin nicht
            nebeneinander, und gleich breite Knöpfe untereinander lesen sich
            als eine Folge von Möglichkeiten statt als drei Fundstücke. */}
        <div className="flex flex-col gap-2">
          {actions}
          {allowWholeDocument && (
            <Button
              variant="secondary"
              className="w-full"
              onMouseDown={keepSelection}
              onClick={onSelectWholeDocument}
            >
              {t('editor.selection.wholeDocument')}
            </Button>
          )}
          {/* Der Absatzknopf erscheint mit einem genauen Zeigegerät immer —
              und ohne eines nur dort, wo „Ganzes Dokument" fehlt. Beim
              Anschreiben bleibt es damit bei der Zusage aus `docs/spec.md`
              („Mit dem Finger ist nur das ganze Dokument wählbar"); der
              Lebenslauf, der das ganze Dokument nicht anbietet, braucht
              dagegen unterwegs einen Weg, und das Antippen eines Absatzes
              ist er. */}
          {showsParagraph && (
            <Button
              variant="secondary"
              className="w-full"
              onMouseDown={keepSelection}
              onClick={() => onSelectParagraph(caretParagraph)}
            >
              {t('editor.selection.currentParagraph')}
            </Button>
          )}
          {/* Abgesetzt: Rückgängig gehört zur Auswahl, ist aber die
              Gegenbewegung zum Übernehmen und nicht Teil davon. */}
          <Button
            variant="ghost"
            className="mt-1 w-full"
            disabled={!canUndo}
            onClick={onUndo}
          >
            {t('editor.undo')}
          </Button>
        </div>

        {notice}
        {status}

        {/* Sicherungsstand und Anfragenzähler. Sie bleiben sichtbar, statt
            unterhalb einer Fensterbreite zu verschwinden: Ohne sie fehlt dem
            Nutzer die Bestätigung, dass sein Zwischenstand gesichert ist. */}
        {footer !== undefined && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-2 border-[var(--line-soft)] pt-3">
            {footer}
          </div>
        )}
      </section>
    </Card>
  )
}

/**
 * Der Vermerk auf festgehaltene Absätze.
 *
 * In der Karte steht nur, **dass** etwas stehen bleibt. Welcher Absatz es
 * ist, warum, und was man dagegen tun kann, steht im Popover: Das ist die
 * Auskunft, die vor stillem Datenverlust schützt, und sie darf nicht
 * verlorengehen, nur weil die Karte kurz sein soll.
 */
function RetainedNote({ retained }: { retained: EditorSelection['inspection']['retained'] }) {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // In `--error`, nicht in einer Warnfarbe: Sie muss als Fließtext
          // 4,5:1 erreichen (siehe DESIGN.md, Kontrast).
          className="focus-ring w-fit rounded-control text-left text-[length:var(--text-caption-size)] leading-[var(--text-caption-leading)] font-medium text-[var(--error)] underline decoration-dotted underline-offset-2"
          onMouseDown={(event) => event.preventDefault()}
        >
          {t('editor.retained.short', { count: retained.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-2">
        <p className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] font-medium text-[var(--error)]">
          {t('editor.retained.heading')}
        </p>
        <ul className={FIELD_HINT_CLASS}>
          {retained.map((entry) => (
            <li key={entry.index}>
              {t('editor.retained.entry', {
                number: entry.index + 1,
                reason: t(`editor.retained.reason.${entry.reason}`),
              })}
            </li>
          ))}
        </ul>
        <p className={FIELD_HINT_CLASS}>{t('editor.retained.body')}</p>
      </PopoverContent>
    </Popover>
  )
}
