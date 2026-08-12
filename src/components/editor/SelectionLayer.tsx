import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
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
 * **Das Vormerken sitzt hier und nicht in der Liste.** Vorgemerkt wird
 * immer die *laufende* Markierung, und die entsteht am Text — der Knopf
 * gehört an die Stelle, an der schon steht, was markiert ist. Die Liste in
 * der Seitenspalte (`MarkPanel`) zeigt danach, was daraus geworden ist.
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

/**
 * Was ein Druck auf „vormerken" mit der laufenden Markierung täte. Die
 * Leiste rechnet das nicht selbst aus — sie kennt die Vormerkungen nicht,
 * und die Umschaltregel steht geprüft in `marks.ts`.
 */
export interface MarkAction {
  /** Deckungsgleich mit einer Vormerkung: Der Knopf hebt sie auf. */
  releases: boolean
  /** Nummern der Vormerkungen (wie in der Liste), die ersetzt würden. */
  replaces: readonly number[]
  onToggle: () => void
}

export interface SelectionLayerProps {
  selection: EditorSelection | null
  /**
   * Ist die Feinmarkierung verfügbar? Mit dem Finger nicht (`docs/spec.md`:
   * „Nutzbar, aber ohne Feinmarkierung", siehe `usePrecisePointer`); dann
   * bleibt der Knopf „ganzes Dokument". Getippt werden darf trotzdem.
   */
  fineSelection: boolean
  /** Absatz, in dem der Schreibcursor zuletzt stand. */
  caretParagraph: number | null
  onSelectWholeDocument: () => void
  onSelectParagraph: (index: number) => void
  onClear: () => void
  /**
   * Das Vormerken der laufenden Markierung. Fehlt es, kommt der Knopf gar
   * nicht vor — so bleibt die Leiste ohne Vormerkungen genau die, die sie
   * vorher war.
   */
  markAction?: MarkAction | null
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

/** Wie viele Zeichen der Markierung in der Leiste zitiert werden. */
const PREVIEW_LENGTH = 90

export function SelectionLayer({
  selection,
  fineSelection,
  caretParagraph,
  onSelectWholeDocument,
  onSelectParagraph,
  onClear,
  markAction = null,
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

  // Ohne Inhalt gibt es nichts vorzumerken — dieselbe Schranke, an der auch
  // das Umformulieren hängt (siehe `EditorSelection.hasContent`).
  const canMark = markAction !== null && selection !== null && selection.hasContent

  const retained = selection?.inspection.retained.filter((entry) => entry.position > 0) ?? []
  const showsShiftWarning = selection?.inspection.mayShiftContent === true && retained.length > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onMouseDown={keepSelection} onClick={onSelectWholeDocument}>
          {t('editor.selection.wholeDocument')}
        </Button>
        {fineSelection && caretParagraph !== null && (
          <Button
            variant="secondary"
            size="sm"
            onMouseDown={keepSelection}
            onClick={() => onSelectParagraph(caretParagraph)}
          >
            {t('editor.selection.currentParagraph')}
          </Button>
        )}
        {canMark && (
          <Button
            variant="secondary"
            size="sm"
            onMouseDown={keepSelection}
            onClick={markAction.onToggle}
          >
            {markAction.releases ? t('editor.marks.release') : t('editor.marks.add')}
          </Button>
        )}
        {selection !== null && (
          <Button variant="ghost" size="sm" onMouseDown={keepSelection} onClick={onClear}>
            {t('editor.selection.clear')}
          </Button>
        )}
        {actions}
      </div>

      {/* Dauerhafte Zustandsauskunft, deshalb `role="status"` und kein
          `role="alert"`: Sie steht schon da, bevor der Nutzer etwas tut. */}
      <div role="status" className="flex flex-col gap-1">
        {selection === null ? (
          <p className={FIELD_HINT_CLASS}>
            {fineSelection ? t('editor.selection.none') : t('editor.selection.touch')}
          </p>
        ) : (
          <>
            <p className={cn(FIELD_HINT_CLASS, 'text-[var(--color-ink)]')}>
              {t('editor.selection.summary', { chars: selection.text.length })}
            </p>
            <p className={FIELD_HINT_CLASS}>
              {t('editor.selection.preview', { text: preview(selection.text) })}
            </p>
          </>
        )}

        {canMark &&
          markAction.replaces.length > 0 &&
          markAction.replaces.map((number) => (
            <p key={number} className={FIELD_HINT_CLASS}>
              {t('editor.marks.replaces', { number })}
            </p>
          ))}

        {showsShiftWarning && (
          // In `--color-error`, nicht in `--color-warning`: Letzteres
          // erreicht auf keiner hellen Fläche 4,5:1 (siehe DESIGN.md). Als
          // Konturfarbe am hervorgehobenen Absatz bleibt es zulässig.
          <div className="mt-2 flex flex-col gap-1">
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
          </div>
        )}
      </div>
    </div>
  )
}

function preview(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= PREVIEW_LENGTH ? single : `${single.slice(0, PREVIEW_LENGTH)}…`
}
