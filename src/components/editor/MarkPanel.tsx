import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { CheckIcon, XIcon } from '@/components/ui/icons'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import type { MarkAnchor } from '@/lib/storage/adapter'
import { cn } from '@/lib/utils'
import { SidePanel } from './SidePanel'
import type { Mark } from './marks'
import type { MarksRestore } from './useMarks'

/**
 * Die Merkliste: welche Stellen des Briefes für diese Ausschreibung
 * angepasst werden sollen, in Dokumentreihenfolge.
 *
 * **Eine Vormerkung wird nicht verbraucht.** Sie anzuklicken macht sie zur
 * laufenden Markierung, und eine übernommene Variante hakt sie nur ab —
 * beides lässt sie stehen. Aufgehoben wird sie im Text (ein Klick hinein)
 * oder hier über „Entfernen"; auf einem Gerät ohne Feinmarkierung ist diese
 * Liste der einzige Weg.
 *
 * **Der Schalter ist die einzige Entscheidung, die hier getroffen wird.**
 * Die Stellen tragen den Wortlaut des Briefes in sich; sie über die Sitzung
 * hinaus aufzubewahren ist deshalb nichts, was ungefragt geschehen sollte.
 * Steht er aus, wird nichts gespeichert und ein bereits gemerkter Satz
 * gelöscht.
 *
 * **Die Nummern sind Positionen, keine Kennungen.** Sie zählen die Stellen
 * von oben nach unten durch; kommt eine dazwischen hinzu, rücken die
 * folgenden nach. Genau das ist gewollt: Der Nutzer sucht die dritte Stelle
 * von oben, nicht die Stelle mit der Kennung 3.
 *
 * **Die Nummer trägt den Stand.** Tangerine heißt offen, Minze mit Haken
 * heißt erledigt — dieselben zwei Farben, die überall in dieser Oberfläche
 * dasselbe sagen. Ein Wort daneben wäre dieselbe Auskunft ein zweites Mal.
 * Für den, der die Farben nicht unterscheidet, steht sie trotzdem im Text:
 * Der Zähler in der Kopfzeile nennt „1 / 3", und der Haken ist eine Form,
 * keine Färbung.
 */

/** Wie viele Zeichen einer Stelle in der Liste stehen. */
const PREVIEW_LENGTH = 60

export interface MarkPanelProps {
  marks: readonly Mark[]
  /** Anker, die im Brief nicht mehr auffindbar sind. */
  unresolved: readonly MarkAnchor[]
  /** Was beim Betreten wiederhergestellt wurde, `null` wenn nichts. */
  restore: MarksRestore | null
  /** Die Stelle, die gerade markiert ist. */
  activeId: string | null
  /** Sollen die Stellen für die nächste Bewerbung erhalten bleiben? */
  keep: boolean
  onKeepChange: (keep: boolean) => void
  onSelect: (mark: Mark) => void
  onToggleDone: (id: string, done: boolean) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onDismiss: (anchor: MarkAnchor) => void
  defaultOpen: boolean
}

export function MarkPanel({
  marks,
  unresolved,
  restore,
  activeId,
  keep,
  onKeepChange,
  onSelect,
  onToggleDone,
  onRemove,
  onClearAll,
  onDismiss,
  defaultOpen,
}: MarkPanelProps) {
  const { t } = useTranslation()
  const keepId = useId()

  const done = marks.filter((mark) => mark.done).length
  const nextOpen = marks.find((mark) => !mark.done) ?? null

  return (
    <SidePanel
      title={t('editor.marks.heading')}
      // „1 / 3" statt „3 Stellen": Zugeklappt bleibt der Zähler stehen, und
      // was man im Vorbeigehen wissen will, ist nicht wie viele es sind,
      // sondern wie viele noch offen sind.
      badge={
        marks.length === 0 ? null : (
          <span className={cn(FIELD_HINT_CLASS, 'tabular-nums')}>
            {t('editor.marks.tally', { done, total: marks.length })}
          </span>
        )
      }
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span id={keepId} className={FIELD_HINT_CLASS}>
            {t('editor.marks.keep')}
          </span>
          <Switch checked={keep} aria-labelledby={keepId} onCheckedChange={onKeepChange} />
        </div>

        {/* Dauerhafte Zustandsauskunft, deshalb `role="status"`: Sie steht
            schon da, bevor der Nutzer etwas tut. */}
        <div role="status" className="flex flex-col gap-1">
          {restore !== null && (
            <p className={FIELD_HINT_CLASS}>
              {restore.fromOtherLetter
                ? t('editor.marks.restoredOther', {
                    restored: restore.restored,
                    total: restore.total,
                  })
                : t('editor.marks.restored', { restored: restore.restored, total: restore.total })}
            </p>
          )}
          {/* „0 von 2 erledigt" stand hier und sagte dasselbe wie der
              Zähler „0 / 2" in der Kopfzeile daneben. Geblieben ist der
              Leerzustand — der hat keinen Zähler, der für ihn spräche. */}
          {marks.length === 0 && <p className={FIELD_HINT_CLASS}>{t('editor.marks.none')}</p>}
        </div>

        {marks.length > 0 && (
          <ol className="flex flex-col gap-2">
            {marks.map((mark, index) => (
              <li key={mark.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  // `aria-current` statt einer bloßen Umrandung: Welche
                  // Stelle gerade bearbeitet wird, muss auch eine
                  // Vorlesesoftware sagen können.
                  aria-current={mark.id === activeId ? 'true' : undefined}
                  onClick={() => onSelect(mark)}
                  className={cn(
                    'focus-ring flex w-full items-start gap-2.5 rounded-control border-[3px] px-3 py-2',
                    'text-left text-[length:var(--text-body-sm-size)] leading-[1.45] transition-colors',
                    'bg-[var(--field)]',
                    mark.id === activeId
                      ? 'border-[var(--accent-line)] bg-[var(--accent-wash)]'
                      : 'border-[var(--line-soft)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-wash)]',
                    mark.done ? 'text-[var(--muted)]' : 'text-[var(--ink)]',
                  )}
                >
                  {/* Die Nummer trägt den Stand: tangerine offen, Minze mit
                      Haken erledigt. Sie zählt Positionen, keine Kennungen —
                      kommt eine Stelle dazwischen hinzu, rücken die folgenden
                      nach. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-px grid size-[22px] shrink-0 place-items-center rounded-pill border-2',
                      'border-[var(--line)] font-display font-semibold tabular-nums',
                      'text-[length:var(--text-label-size)]',
                      mark.done
                        ? 'bg-[var(--done)] text-[var(--done-ink)]'
                        : 'bg-[var(--accent)] text-[var(--accent-ink)]',
                    )}
                  >
                    {mark.done ? <CheckIcon className="size-3" /> : index + 1}
                  </span>
                  {/* Sichtbar steht nur der Wortlaut: Die Nummer steht schon
                      in der Marke daneben, und zweimal dieselbe Ziffer in
                      einer Zeile liest sich als Fehler. Vorgelesen bleibt es
                      der ganze Satz — die Marke ist für den Vorleser nicht
                      da.

                      Zwei Zeilen und nicht mehr: In einer 16rem breiten
                      Spalte wären sechzig Zeichen vier Zeilen, und die Liste
                      wäre nicht mehr zu überfliegen. Wer den vollen Wortlaut
                      sucht, klickt die Stelle an und findet sie im Brief. */}
                  <span className="min-w-0">
                    <span className="sr-only">
                      {t('editor.marks.entry', { number: index + 1, text: preview(mark.current) })}
                    </span>
                    <span aria-hidden="true" className="line-clamp-2">
                      {preview(mark.current)}
                    </span>
                  </span>
                </button>

                {/* **Nur an der Stelle, an der gerade gearbeitet wird.**
                    Zwei Sinnbilder an jeder Zeile nahmen einer 16rem breiten
                    Spalte siebzig Pixel, und der Wortlaut, um den es geht,
                    blieb auf drei Wörter zusammengedrückt. An allen anderen
                    Zeilen steht deshalb nur, was die Attrappe zeigt: die
                    Nummer und der Text.

                    Verloren geht dabei nichts: Eine Stelle wird angeklickt,
                    bevor man etwas mit ihr vorhat — auch mit dem Finger, wo
                    diese Liste der einzige Weg ist, eine Vormerkung wieder
                    aufzuheben. */}
                {mark.id === activeId && (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-pressed={mark.done}
                    aria-label={t('editor.marks.done')}
                    onClick={() => onToggleDone(mark.id, !mark.done)}
                    className={cn(mark.done && 'text-[var(--done-text)]')}
                  >
                    <CheckIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={t('editor.marks.remove')}
                    onClick={() => onRemove(mark.id)}
                  >
                    <XIcon />
                  </Button>
                </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {marks.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
            {nextOpen !== null && (
              <Button variant="secondary" size="sm" onClick={() => onSelect(nextOpen)}>
                {t('editor.marks.next')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              {t('editor.marks.clearAll')}
            </Button>
          </div>
        )}

        {unresolved.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink)]">
              {t('editor.marks.unresolved.heading')}
            </p>
            <p className={FIELD_HINT_CLASS}>{t('editor.marks.unresolved.body')}</p>
            <ul className="flex flex-col gap-2">
              {unresolved.map((anchor, index) => (
                <li key={`${index}-${anchor.text}`} className="flex flex-col gap-1">
                  <p className={FIELD_HINT_CLASS}>
                    {t('editor.marks.entry', { number: index + 1, text: preview(anchor.text) })}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => onDismiss(anchor)}
                  >
                    {t('editor.marks.unresolved.dismiss')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SidePanel>
  )
}

function preview(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= PREVIEW_LENGTH ? single : `${single.slice(0, PREVIEW_LENGTH)}…`
}
