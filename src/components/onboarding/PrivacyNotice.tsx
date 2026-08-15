import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

/**
 * Der Erststart-Hinweis: vier Tatsachen im Klartext, bevor irgendetwas
 * eingegeben wird.
 *
 * Bewusst **kein Dialog**, sondern ein Abschnitt der Seite. Ein Dialog wäre
 * eine Unterbrechung mit Fokusfalle und ließe sich mit Escape wegdrücken,
 * ohne gelesen zu sein; die vier Punkte sind aber der Text, um den es geht,
 * und keine Rückfrage. Der Dialog bleibt dem vorbehalten, wofür DESIGN.md
 * ihn vorsieht — Bestätigungen wie „Entwurf verwerfen".
 *
 * **Wann er erscheint, sagt `usePrivacyNotice()`** — die Komponente selbst
 * entscheidet es nicht. Aufgabe 13c hängt die beiden Enden zusammen:
 *
 * ```tsx
 * const keyVault = useKeyVault()
 * const privacy = usePrivacyNotice(keyVault.status)
 * return privacy.visible
 *   ? <PrivacyNotice onAccept={privacy.accept} />
 *   : <KeySetup keyVault={keyVault} />
 * ```
 *
 * Die Regel und ihre Begründung stehen dort, samt der Entscheidung gegen ein
 * dauerhaft gespeichertes „gelesen"-Kennzeichen.
 *
 * Die Überschrift ist ein `h2`. Die `h1` der Seite gehört der Ansicht, die
 * diesen Abschnitt einbettet.
 */

/** Die vier Punkte aus `docs/spec.md` („Erststart-Hinweis") in fester Reihenfolge. */
const NOTICE_ITEMS = ['provider', 'training', 'draft', 'delete'] as const

export interface PrivacyNoticeProps {
  /** Wird ausgelöst, wenn der Nutzer den Hinweis zur Kenntnis genommen hat. */
  onAccept: () => void
  className?: string
}

export function PrivacyNotice({ onAccept, className }: PrivacyNoticeProps) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <Card
      asChild
      variant="raised"
      padding="lg"
      // Feste Breite, kein Abstandstoken: die Lesebreite folgt dem Text.
      className={cn('max-w-2xl', className)}
    >
      <section aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]"
        >
          {t('onboarding.privacy.heading')}
        </h2>
        <p className="mt-3">{t('onboarding.privacy.intro')}</p>

        <dl className="mt-6 divide-y divide-[var(--color-border)]">
          {NOTICE_ITEMS.map((item) => (
            <div key={item} className="py-4 first:pt-0 last:pb-0">
              <dt className="font-medium text-[var(--color-ink-strong)]">
                {t(`onboarding.privacy.${item}.title`)}
              </dt>
              {/* --color-muted ist hier zulässig: die Karte liegt auf
                  --color-surface-raised (siehe Kontrastregel in DESIGN.md). */}
              <dd className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-muted)]">
                {t(`onboarding.privacy.${item}.body`)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex justify-end">
          <Button variant="primary" size="lg" onClick={onAccept}>
            {t('onboarding.privacy.accept')}
          </Button>
        </div>
      </section>
    </Card>
  )
}
