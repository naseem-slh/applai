import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { isAbortError } from '@/components/app/aiErrorKey'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { filterModels } from '@/lib/ai/modelFilter'
import type { LlmProvider, ModelChoice } from '@/lib/ai/provider'
import { cn } from '@/lib/utils'

/**
 * Welche Modelle Applai anfragt, in welcher Reihenfolge.
 *
 * **Warum eine Reihenfolge und nicht ein Modell.** Die kostenlosen
 * Kontingente zählen je Modell. Ist das erste erschöpft, führt das zweite
 * die Arbeit weiter, statt den Nutzer bis zum nächsten Tag stehen zu lassen.
 * Gewechselt wird auf das Signal des Anbieters hin (HTTP 429), nicht auf
 * eine Vorhersage — den Verbrauch gibt Google an einen API-Schlüssel nicht
 * heraus (siehe `lib/ai/fallback.ts`).
 *
 * **Die Liste kostet eine Anfrage und wird nur auf Knopfdruck geholt.** Sie
 * beim Öffnen der Einstellungen zu laden, hieße Kontingent auszugeben, weil
 * jemand die Sprache umstellen wollte.
 *
 * **Was die Liste nicht sagt.** Ob ein Modell im kostenlosen Tarif enthalten
 * ist — das Modell-Objekt der API trägt kein Feld zu Tarif, Kontingent oder
 * Preis. Gezeigt werden deshalb nur Modelle, die Text ausgeben, und im
 * kostenlosen Tarif ohne Pro; das ist eine Heuristik über Namen und
 * jederzeit abschaltbar (siehe `lib/ai/modelFilter.ts`).
 */

export interface ModelPickerProps {
  /** Der Anbieter mit seinem **voreingestellten** Modell und der Modellliste. */
  provider: LlmProvider
  /** `null`, solange der Tresor gesperrt ist. Dann lässt sich nichts laden. */
  apiKey: string | null
  /** Die gewählte Reihenfolge. Leer heißt: Voreinstellung des Anbieters. */
  chain: readonly string[]
  onChange: (chain: string[]) => void
  fieldId: string
  /** Beim kostenlosen Tarif bleiben Pro-Modelle aus der Liste. */
  paidKey: boolean
}

export function ModelPicker({
  provider,
  apiKey,
  chain,
  onChange,
  fieldId,
  paidKey,
}: ModelPickerProps) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<ModelChoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [draft, setDraft] = useState('')
  // Der Notausgang aus der Heuristik: Sie beurteilt fremde Namen und wird
  // eines Tages danebenliegen. Dann darf sie nicht das Modell verstecken,
  // das gerade gebraucht wird.
  const [showAll, setShowAll] = useState(false)

  const shown =
    choices === null ? null : showAll ? choices : filterModels(choices, { includePro: paidKey })

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

  /** Doppelte Einträge bringen nichts: Das zweite Mal scheitert genauso. */
  function add(model: string): void {
    const trimmed = model.trim()
    if (trimmed === '' || chain.includes(trimmed)) return
    onChange([...chain, trimmed])
    setDraft('')
  }

  /**
   * Die ganze geladene Liste als Kette übernehmen.
   *
   * Der Grund, warum es diesen Knopf gibt und keine im Programm
   * hinterlegte Kette: Jeder Modellname, der fest im Code stünde, wäre ein
   * Datum, an dem Applai aufhört zu arbeiten — Anbieter benennen Modelle um
   * und stellen sie ab. Die Namen kommen deshalb aus der Liste des
   * Anbieters selbst und sind damit immer die von heute.
   */
  function addAll(models: readonly ModelChoice[]): void {
    const added = models.map((entry) => entry.id).filter((id) => !chain.includes(id))
    if (added.length === 0) return
    onChange([...chain, ...added])
  }

  function moveUp(index: number): void {
    if (index === 0) return
    const next = [...chain]
    const moved = next[index]
    const above = next[index - 1]
    if (moved === undefined || above === undefined) return
    next[index - 1] = moved
    next[index] = above
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Vier Absätze standen hier untereinander: warum die Anbieterliste
          nichts über den Tarif sagt, wie die Kette arbeitet, dass keines
          gewählt ist, und welches voreingestellt ist. Zusammen 60 Wörter
          über zwei Eingabefeldern.

          Geblieben ist der eine Satz zur Kette, weil ohne ihn die
          Reihenfolge der Liste nichts bedeutet. Die Erklärung zum Tarif
          interessiert einmal und liegt hinter einem Verweis; welches
          Modell gerade greift, steht in einer Zeile statt in zweien. */}
      <p className={FIELD_HINT_CLASS}>{t('settings.model.chainHint')}</p>

      {chain.length === 0 ? (
        <p className={FIELD_HINT_CLASS}>
          {t('settings.model.empty')} {t('settings.model.current', { model: provider.model })}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {chain.map((model, index) => (
            <li key={model} className="flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
                {t('settings.model.entry', { position: index + 1, model })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => moveUp(index)}
              >
                {t('settings.model.moveUp')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(chain.filter((entry) => entry !== model))}
              >
                {t('settings.model.removeEntry')}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <details>
        <summary
          className={cn(
            'focus-ring w-fit cursor-pointer list-none rounded-sm',
            'text-[length:var(--text-body-sm-size)] text-[var(--color-accent-text)]',
          )}
        >
          {t('settings.model.why')}
        </summary>
        <p className={cn('mt-1 max-w-[60ch]', FIELD_HINT_CLASS)}>{t('settings.model.hint')}</p>
      </details>

      <label htmlFor={fieldId} className={FIELD_LABEL_CLASS}>
        {t('settings.model.label')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={fieldId}
          value={draft}
          placeholder={provider.model}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button variant="secondary" size="sm" onClick={() => add(draft)}>
          {t('settings.model.add')}
        </Button>
      </div>

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
        {chain.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            {t('settings.model.reset')}
          </Button>
        )}
        {load !== undefined && apiKey === null && (
          <p className={FIELD_HINT_CLASS}>{t('settings.model.needsKey')}</p>
        )}
      </div>

      {error !== null && <AiErrorNotice error={error} />}

      {shown !== null && shown.length > 0 && (
        <div className="flex flex-col gap-2">
          <p role="status" className={FIELD_HINT_CLASS}>
            {t('settings.model.loaded', { count: shown.length })}
          </p>
          <p className={FIELD_HINT_CLASS}>{t('settings.model.filtered')}</p>
          <ul className="flex flex-wrap gap-2">
            {shown.map((choice) => (
              <li key={choice.id}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={chain.includes(choice.id)}
                  onClick={() => add(choice.id)}
                  // Der Modellname muss im zugänglichen Namen stehen: Ein
                  // bloßes „Modell hinzufügen" klänge bei jedem Knopf gleich
                  // und wäre für eine Vorlesesoftware nicht zu unterscheiden.
                  aria-label={t('settings.model.addLabel', { model: choice.label })}
                >
                  {choice.label}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => addAll(shown)}
          >
            {t('settings.model.addAll')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-pressed={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {t('settings.model.showAll')}
          </Button>
        </div>
      )}
    </div>
  )
}
