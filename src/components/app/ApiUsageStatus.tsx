import { useTranslation } from 'react-i18next'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { useApiUsage } from './useApiUsage'

/**
 * Was diese Sitzung den Anbieter gekostet hat.
 *
 * Steht neben dem Sicherungsstand über dem Brief, in derselben leisen
 * Schrift: Es ist eine Auskunft, keine Warnung. Sichtbar wird sie erst ab
 * der ersten Anfrage — „0 Anfragen" ist keine Nachricht.
 *
 * Der Sinn ist, dass der Nutzer den Preis seiner Arbeitsschritte **während**
 * der Arbeit sieht statt hinterher. Die kostenlosen Tarife zählen Anfragen,
 * und wer nicht mitzählt, merkt das Ende des Kontingents erst, wenn nichts
 * mehr geht.
 */
export function ApiUsageStatus() {
  const { t } = useTranslation()
  const usage = useApiUsage()

  if (usage.requests === 0) return null

  return (
    <p role="status" className={FIELD_HINT_CLASS}>
      {t('ai.usage.requests', { count: usage.requests })}
    </p>
  )
}

