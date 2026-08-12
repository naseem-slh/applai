import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { isAbortError } from '@/components/app/aiErrorKey'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import type { LlmProvider, ModelChoice } from '@/lib/ai/provider'

/**
 * Welches Modell Applai anfragt.
 *
 * **Warum die Auswahl dem Nutzer gehört.** Die kostenlosen Tarife decken
 * nicht jedes Modell ab, und für manche ist das Freikontingent null. Ein
 * fest verdrahtetes Modell macht die Anwendung dann unbenutzbar, ohne dass
 * jemand etwas dagegen tun könnte.
 *
 * **Die Liste kostet eine Anfrage und wird deshalb nur auf Knopfdruck
 * geholt.** Sie beim Öffnen der Einstellungen zu laden, hieße Kontingent
 * auszugeben, weil jemand die Sprache umstellen wollte.
 *
 * **Was die Liste nicht sagt.** Ob ein Modell im kostenlosen Tarif enthalten
 * ist — nachgesehen in der Modellreferenz, das Modell-Objekt trägt kein Feld
 * zu Tarif, Kontingent oder Preis. Der Hinweistext sagt das ausdrücklich,
 * statt eine Gewissheit vorzutäuschen. Ein Eingabefeld steht immer daneben:
 * Wer die Kennung kennt, ist nie auf die Liste angewiesen.
 */

export interface ModelPickerProps {
  /** Der Anbieter aus dem Tresor, mit dem heute gültigen Modell. */
  provider: LlmProvider
  /** `null`, solange der Tresor gesperrt ist. Dann lässt sich nichts laden. */
  apiKey: string | null
  /** Das gewählte Modell, `undefined` für die Voreinstellung des Anbieters. */
  value: string | undefined
  onChange: (model: string | undefined) => void
  /** Kennung der Beschriftung des Eingabefelds. */
  fieldId: string
}

export function ModelPicker({ provider, apiKey, value, onChange, fieldId }: ModelPickerProps) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<ModelChoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const load = provider.listModels
  async function loadModels(): Promise<void> {
    if (load === undefined || apiKey === null) return
    setLoading(true)
    setError(null)
    try {
      setChoices(await load(apiKey))
    } catch (caught) {
      if (!isAbortError(caught)) setError(caught)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={FIELD_HINT_CLASS}>{t('settings.model.hint')}</p>

      {/* Ohne diese Beschriftung hätte das Feld keinen zugänglichen Namen:
          Die Überschrift der Karte benennt den Abschnitt, nicht das
          Bedienelement darin. */}
      <label htmlFor={fieldId} className={FIELD_LABEL_CLASS}>
        {t('settings.model.label')}
      </label>
      <Input
        id={fieldId}
        value={value ?? ''}
        placeholder={provider.model}
        onChange={(event) => onChange(emptyToUndefined(event.target.value))}
      />
      <p className={FIELD_HINT_CLASS}>{t('settings.model.current', { model: provider.model })}</p>

      <div className="flex flex-wrap items-center gap-3">
        {load !== undefined && (
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || apiKey === null}
            onClick={() => void loadModels()}
          >
            {loading ? t('settings.model.loading') : t('settings.model.load')}
          </Button>
        )}
        {value !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            {t('settings.model.reset')}
          </Button>
        )}
        {load !== undefined && apiKey === null && (
          <p className={FIELD_HINT_CLASS}>{t('settings.model.needsKey')}</p>
        )}
      </div>

      {error !== null && <AiErrorNotice error={error} />}

      {choices !== null && choices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p role="status" className={FIELD_HINT_CLASS}>
            {t('settings.model.loaded', { count: choices.length })}
          </p>
          <Select value={value ?? provider.model} onValueChange={(next) => onChange(next)}>
            <SelectTrigger aria-label={t('settings.model.choose')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

/** Ein leeres Feld heißt „Voreinstellung", nicht „Modell mit leerem Namen". */
function emptyToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}
