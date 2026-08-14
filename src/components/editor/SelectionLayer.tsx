import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { cn } from '@/lib/utils'
import type { EditorSelection } from './documentSelection'

/**
 * Die Leiste über dem Dokument: was gerade markiert ist, wie man etwas
 * markiert, und der Hinweis auf die eine Nebenwirkung, die eine Markierung
 * über mehrere Absätze haben kann.
 *
 * Das Rechnen selbst steht in `documentSelection.ts`, das Nachhalten in
 * `useDocumentSelection.ts`. Diese Datei zeigt nur an und löst aus — so
 * bleibt die Offset-Abbildung ohne Oberfläche prüfbar.
 *
 * **Eine Zeile mit fester Hoehe (Variante A).** Die Leiste waechst und
 * schrumpft nicht mehr, waehrend markiert wird: Sie stand vorher zwischen 87
 * und 237 px, je nach Zustand, und schob den Brief bei jeder Markierung ein
 * Stueck nach unten. Deshalb steht hier genau eine Reihe, deren Hoehe die
 * Knopfreihe bestimmt. Was zustandsabhaengig ist, wechselt seinen Inhalt,
 * nicht sein Mass:
 *
 * - Der Umfang ist eine Umschaltgruppe, ein Bedienelement statt zweier
 *   gleichrangiger Knoepfe.
 * - Aus zwei Zeilen Prosa wird ein Zaehler. Was markiert ist, zeigt der Brief
 *   selbst; die Leiste hat es nur wiederholt. Der volle Satz bleibt fuer
 *   Hilfsmittel erhalten (`sr-only`), damit die Ansage nicht auf eine nackte
 *   Zahl zusammenfaellt.
 * - Der Hinweis auf festgehaltene Absaetze steht als kurzer Vermerk in der
 *   Zeile; die Einzelheiten kommen im Popover dazu (siehe `RetainedNote`).
 * - Es gibt keinen Knopf zum Aufheben. Ein Klick in die vorgemerkte Stelle
 *   nimmt sie weg, ein Klick woanders im Brief verlegt die Markierung; der
 *   Knopf war derselbe zweite Handgriff, den schon das Vormerken losgeworden
 *   ist, und er kostete die Breite, die der Rest der Zeile braucht.
 *
 * **Es gibt keinen Knopf zum Vormerken mehr.** Eine markierte Stelle *ist*
 * vorgemerkt — das Markieren selbst ist die Geste. Ein Klick in eine
 * vorgemerkte Stelle hebt sie wieder auf, eine überschneidende Markierung
 * ersetzt sie. Ein eigener Knopf wäre ein zweiter Handgriff für etwas, das
 * der erste schon gesagt hat. Die Liste in der Seitenspalte (`MarkPanel`)
 * zeigt, was daraus geworden ist.
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
  /**
   * Anbau für Aufgabe 14b: Was mit der Markierung geschehen soll
   * (`VariantPopover` samt Auslöser). Steht am Ende der Knopfreihe und
   * bekommt dieselbe `EditorSelection`, die hier angezeigt wird.
   *
   * Wer dort einen Knopf einhängt, verhindert an ihm das Voreingestellte
   * des `mousedown` (siehe unten) — sonst legt der Browser beim Klicken die
   * Markierung zusammen und die Hervorhebung im Text verschwindet, während
   * der Nutzer noch auswählt.
   */
  actions?: ReactNode
}

export function SelectionLayer({
  selection,
  fineSelection,
  allowWholeDocument = true,
  caretParagraph,
  onSelectWholeDocument,
  onSelectParagraph,
  actions,
}: SelectionLayerProps) {
  const { t } = useTranslation()

  // Ein Klick in die Leiste soll die Markierung im Text nicht zusammenlegen.
  // Der Zustand überlebt das ohnehin (`useDocumentSelection` beachtet nur
  // Änderungen innerhalb der Dokumentfläche), die sichtbare Hervorhebung
  // nicht.
  function keepSelection(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
  }

  const retained = selection?.inspection.retained.filter((entry) => entry.position > 0) ?? []
  const showsShiftWarning = selection?.inspection.mayShiftContent === true && retained.length > 0

  return (
    // `min-h-8` haelt das Mass der Zeile auch dann, wenn rechts nichts steht:
    // Die Knopfreihe ist 2rem hoch, und genau so hoch bleibt die Leiste.
    <div className="flex min-h-8 items-center gap-3">
      {/* Der Umfang als eine Umschaltgruppe. Die Aussenkontur sitzt am
          Rahmen, die Knoepfe darin geben ihre eigene ab, damit die Gruppe
          als ein Bedienelement gelesen wird und nicht als zwei. */}
      <div className="flex shrink-0 overflow-hidden rounded-md border border-[var(--color-control-border)]">
        {allowWholeDocument && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-none border-0"
            onMouseDown={keepSelection}
            onClick={onSelectWholeDocument}
          >
            {t('editor.selection.wholeDocument')}
          </Button>
        )}
        {/* Der Absatzknopf erscheint mit einem genauen Zeigegerät immer — und
            ohne eines nur dort, wo „Ganzes Dokument" fehlt. Beim Anschreiben
            bleibt es damit bei der Zusage aus `docs/spec.md` („Mit dem Finger
            ist nur das ganze Dokument wählbar"); der Lebenslauf, der das
            ganze Dokument nicht anbietet, braucht dagegen unterwegs einen
            Weg, und das Antippen eines Absatzes ist er. */}
        {caretParagraph !== null && (fineSelection || !allowWholeDocument) && (
          // Sichtbar steht „Absatz", der Name bleibt „Aktueller Absatz":
          // In der Zeile zaehlt jede Breite, vorgelesen zaehlt die Bedeutung.
          <Button
            variant="secondary"
            size="sm"
            className={cn(
              'rounded-none border-0',
              allowWholeDocument && 'border-l border-[var(--color-control-border)]',
            )}
            aria-label={t('editor.selection.currentParagraph')}
            onMouseDown={keepSelection}
            onClick={() => onSelectParagraph(caretParagraph)}
          >
            {t('editor.selection.paragraphShort')}
          </Button>
        )}
      </div>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--color-border)]" />

      {/* Dauerhafte Zustandsauskunft, deshalb `role="status"` und kein
          `role="alert"`: Sie steht schon da, bevor der Nutzer etwas tut.
          `min-w-0` ist noetig, damit der Hinweis kuerzen darf statt die
          Zeile aufzublaehen. */}
      <div role="status" className="flex min-w-0 flex-1 items-center gap-2">
        {selection === null ? (
          <p className={cn(FIELD_HINT_CLASS, 'truncate')}>
            {fineSelection
              ? t('editor.selection.none')
              : allowWholeDocument
                ? t('editor.selection.touch')
                : t('editor.selection.touchParagraph')}
          </p>
        ) : (
          <>
            <p className="inline-flex h-6 shrink-0 items-center rounded-sm bg-[var(--color-accent-soft)] px-2 text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-accent-text)] tabular-nums">
              <span aria-hidden="true">
                {t('editor.selection.chars', { chars: selection.text.length })}
              </span>
              {/* Vorgelesen bleibt es der ganze Satz. Eine nackte Zahl waere
                  als Ansage nicht zu verstehen. */}
              <span className="sr-only">
                {t('editor.selection.summary', { chars: selection.text.length })}
              </span>
            </p>
            {showsShiftWarning && <RetainedNote retained={retained} />}
          </>
        )}
      </div>

      {actions}
    </div>
  )
}

/**
 * Der Vermerk auf festgehaltene Absaetze.
 *
 * In der Zeile steht nur, **dass** etwas stehen bleibt, damit die Leiste ihr
 * Mass behaelt. Welcher Absatz es ist, warum, und was man dagegen tun kann,
 * steht im Popover: Das ist die Auskunft, die vor stillem Datenverlust
 * schuetzt, und sie darf nicht verlorengehen, nur weil die Zeile kurz sein
 * soll.
 */
function RetainedNote({ retained }: { retained: EditorSelection['inspection']['retained'] }) {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // In `--color-error`, nicht in `--color-warning`: Letzteres
          // erreicht auf keiner hellen Flaeche 4,5:1 (siehe DESIGN.md). Als
          // Konturfarbe am hervorgehobenen Absatz bleibt es zulaessig.
          className="focus-ring shrink-0 truncate rounded-sm text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] font-medium text-[var(--color-error)] underline decoration-dotted underline-offset-2"
          onMouseDown={(event) => event.preventDefault()}
        >
          {t('editor.retained.short', { count: retained.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-2">
        <p className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] font-medium text-[var(--color-error)]">
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
