import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import type { ReapplyState } from '@/lib/domain/reapply'

/**
 * Der Durchlauf, während er läuft — und was er hinterlassen hat.
 *
 * **Kein Balken, keine Prozentzahl.** „Stelle 3 von 7" ist die ganze
 * Auskunft, die es ehrlich gibt: Wie lange eine Anfrage dauert, weiß
 * niemand, und ein Balken, der das behauptet, erfindet Genauigkeit. Dieselbe
 * Begründung trägt die Lückenliste, die einen Prozentwert ausdrücklich
 * ablehnt.
 *
 * **Der Fortschritt ist eine Höflichkeitsmeldung** (`role="status"`,
 * `aria-live="polite"`): Die Stelle wechselt ohne Zutun des Nutzers, und wer
 * den Brief vorlesen lässt, bekäme davon sonst nichts mit. `polite` und
 * nicht `assertive` — es unterbricht nichts, es begleitet nur.
 *
 * **Beim Wählen gibt es kein „Erneut versuchen".** Dort ist nichts
 * schiefgegangen; der Weg weiter ist die Variantenauswahl im Brief selbst.
 * Ein Knopf daneben wäre eine zweite Anfrage für dasselbe Ergebnis.
 */

export interface ReapplyStatusProps {
  state: ReapplyState
  onRetry: () => void
  onSkip: () => void
  onCancel: () => void
}

export function ReapplyStatus({ state, onRetry, onSkip, onCancel }: ReapplyStatusProps) {
  const { t } = useTranslation()

  if (state.status === 'bereit') return null

  if (state.status === 'fertig' || state.status === 'abgebrochen') {
    return (
      <Card variant="subtle" padding="md" className="mt-3">
        <div className="flex flex-col gap-1">
          {state.status === 'abgebrochen' && (
            <p className="text-[var(--color-ink)]">{t('editor.reapply.stopped')}</p>
          )}
          <p className="text-[var(--color-ink)]">
            {t('editor.reapply.done', { count: state.applied })}
          </p>
          {state.skipped.length > 0 && (
            <p className={FIELD_HINT_CLASS}>
              {t('editor.reapply.skipped', { count: state.skipped.length })}
            </p>
          )}
        </div>
      </Card>
    )
  }

  const halt = state.status === 'haelt' ? state : null

  return (
    <Card variant="subtle" padding="md" className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          {state.status === 'anzeigeWirdGelesen' ? (
            <p className="text-[var(--color-ink)]">{t('editor.reapply.reading')}</p>
          ) : (
            <p className="text-[var(--color-ink)]">
              {t('editor.reapply.progress', {
                current: state.index + 1,
                total: state.steps.length,
              })}
            </p>
          )}
          {halt !== null && (
            <p className={FIELD_HINT_CLASS}>{t(`editor.reapply.halt.${halt.reason}`)}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {halt !== null && halt.reason !== 'wahl' && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('editor.reapply.retry')}
            </Button>
          )}
          {halt !== null && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              {t('editor.reapply.skip')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('editor.reapply.stop')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
