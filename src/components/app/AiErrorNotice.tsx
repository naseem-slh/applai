import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { LlmError } from '@/lib/ai/errors'
import { aiErrorKey } from './aiErrorKey'

/**
 * Ein fehlgeschlagener Modellaufruf, wie er dem Nutzer gezeigt wird: die
 * übersetzte Fehlerart, die Auskunft des Anbieters im Wortlaut, und ein
 * Knopf, der erst wieder drückbar ist, wenn ein erneuter Versuch überhaupt
 * gelingen kann.
 *
 * **Warum es diesen Baustein gibt.** Drei Stellen zeigten dieselbe Meldung
 * (Auswertung, Lückenliste, Variantenvorschlag), jede für sich, und alle
 * drei zeigten zu wenig: Der Nutzer las „Der Anbieter ist gerade
 * überlastet. Bitte in Kürze erneut versuchen", drückte in Kürze erneut, und
 * bekam dieselbe Meldung — sein Tageskontingent war aufgebraucht, und davon
 * stand nichts da. Die Erklärung hatte der Anbieter mitgeschickt; Applai
 * hatte sie weggeworfen.
 *
 * **Der Wortlaut des Anbieters ist kein Oberflächentext.** Er steht
 * unübersetzt in einem aufklappbaren Bereich, ausdrücklich als Zitat
 * gekennzeichnet — so wie der Brieftext des Nutzers auch nicht übersetzt
 * wird. G8 gilt für die Sprache **der Anwendung**, nicht für fremde Inhalte,
 * die sie anzeigt.
 *
 * **Der gesperrte Knopf ist kein Gängeln.** Bei einer Ratenbegrenzung
 * verschlimmert jeder sofortige Versuch die Lage: Er zählt gegen dasselbe
 * Zeitfenster, das gerade voll ist. Der Knopf sagt deshalb, wie lange noch,
 * statt eine Handlung anzubieten, die nicht gelingen kann.
 */

/**
 * Wie lange nach einer Ratenbegrenzung gewartet wird, wenn der Anbieter
 * keine Zeit genannt hat.
 *
 * Eine Minute, weil Ratenbegrenzungen üblicherweise in Minutenfenstern
 * gezählt werden — Geminis kostenloser Tarif etwa erlaubt eine einstellige
 * Zahl Anfragen je Minute. Kürzer zu warten hieße, das Fenster noch einmal
 * zu treffen und das Kontingent weiter zu verbrauchen.
 */
export const RATE_LIMIT_COOLDOWN_MS = 60_000

export interface AiErrorNoticeProps {
  error: unknown
  /** Fehlt es, wird kein Knopf angeboten. */
  onRetry?: () => void
  /** Beschriftung des Knopfes. Die Aufrufer nennen die Handlung verschieden. */
  retryLabel?: string
  className?: string
}

export function AiErrorNotice({ error, onRetry, retryLabel, className }: AiErrorNoticeProps) {
  const { t } = useTranslation()
  const remaining = useCooldown(error)

  const providerMessage = error instanceof LlmError ? error.providerMessage : undefined
  // Ein aufgebrauchtes Kontingent füllt sich nicht durch Drücken. Der Knopf
  // entfällt dann ganz, statt gesperrt dazustehen und Hoffnung zu machen.
  const exhausted = error instanceof LlmError && error.kind === 'quota'
  const showsRetry = onRetry !== undefined && retryLabel !== undefined && !exhausted

  return (
    <div className={className}>
      <p role="alert" className="text-[length:var(--text-body-sm-size)] text-[var(--color-error)]">
        {t(aiErrorKey(error))}
      </p>

      {providerMessage !== undefined && providerMessage !== '' && (
        <details className="mt-2">
          <summary className={`${FIELD_HINT_CLASS} cursor-pointer select-none`}>
            {t('ai.errors.providerDetails')}
          </summary>
          {/* `lang` fehlt bewusst nicht: Der Text kommt vom Anbieter und ist
              in aller Regel englisch, auch in einer deutschen Oberfläche.
              Ohne diese Angabe spräche eine Vorlesesoftware ihn deutsch aus. */}
          <p lang="en" className={`${FIELD_HINT_CLASS} mt-1 break-words`}>
            {providerMessage}
          </p>
        </details>
      )}

      {showsRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={remaining > 0}
          onClick={onRetry}
        >
          {remaining > 0 ? t('ai.errors.retryIn', { seconds: Math.ceil(remaining / 1000) }) : retryLabel}
        </Button>
      )}
    </div>
  )
}

/**
 * Die verbleibende Sperrzeit in Millisekunden, `0` sobald wieder gedrückt
 * werden darf. Läuft nur bei `rate_limit` — jede andere Fehlerart ist
 * entweder sofort wieder versuchbar oder gar nicht.
 */
function useCooldown(error: unknown): number {
  const rateLimited = error instanceof LlmError && error.kind === 'rate_limit'
  const waitMs = rateLimited ? (error.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS) : 0
  const [remaining, setRemaining] = useState(waitMs)

  // Ein neuer Fehler beginnt eine neue Sperre — auch dann, wenn er dieselbe
  // Art hat wie der vorige.
  useEffect(() => {
    setRemaining(waitMs)
    if (waitMs <= 0) return

    const startedAt = Date.now()
    const timer = setInterval(() => {
      const left = waitMs - (Date.now() - startedAt)
      setRemaining(left > 0 ? left : 0)
      if (left <= 0) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [error, waitMs])

  return remaining
}
