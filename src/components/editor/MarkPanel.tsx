import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
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
 * **Die Farbe im Text trägt hier keine Bedeutung.** Welche Stellen
 * vorgemerkt und welche erledigt sind, steht in dieser Liste im Wort —
 * die Hinterlegung im Brief (`useMarkHighlight`) ist die zweite Spur, nicht
 * die einzige (DESIGN.md, „Kontrast").
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
      badge={<span className={FIELD_HINT_CLASS}>{t('editor.marks.count', { count: marks.length })}</span>}
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
          {marks.length === 0 ? (
            <p className={FIELD_HINT_CLASS}>{t('editor.marks.none')}</p>
          ) : (
            <p className={cn(FIELD_HINT_CLASS, 'text-[var(--color-ink)]')}>
              {t('editor.marks.progress', { done, total: marks.length })}
            </p>
          )}
        </div>

        {marks.length > 0 && (
          <ol className="flex flex-col gap-3">
            {marks.map((mark, index) => (
              <li key={mark.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  // `aria-current` statt einer bloßen Umrandung: Welche
                  // Stelle gerade bearbeitet wird, muss auch eine
                  // Vorlesesoftware sagen können.
                  aria-current={mark.id === activeId ? 'true' : undefined}
                  onClick={() => onSelect(mark)}
                  className={cn(
                    'rounded-md px-2 py-1 text-left text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]',
                    'hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring-color)]',
                    mark.done ? 'text-[var(--color-muted)] line-through' : 'text-[var(--color-ink)]',
                    mark.id === activeId && 'bg-[var(--color-surface-hover)] font-medium',
                  )}
                >
                  {t('editor.marks.entry', { number: index + 1, text: preview(mark.current) })}
                </button>
                <div className="flex flex-wrap gap-2 pl-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={mark.done}
                    onClick={() => onToggleDone(mark.id, !mark.done)}
                  >
                    {t('editor.marks.done')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(mark.id)}>
                    {t('editor.marks.remove')}
                  </Button>
                </div>
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
