import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Slider } from '@/components/ui/Slider'
import { Textarea } from '@/components/ui/Input'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import { SidePanel } from './SidePanel'
import { sliderStep, stepToSlider, SLIDER_STEP_COUNT, type RewriteSliders } from './rewriteRequest'

/**
 * Das aus dem vorhandenen Anschreiben abgeleitete Stilprofil — einsehbar,
 * korrigierbar, und mit den beiden Reglern, die den nächsten Auftrag an das
 * Modell formen.
 *
 * **Was korrigierbar ist und was nicht**, und warum das kein Zufall ist:
 *
 * - **Die Merkmale** (`traits`) sind Modellprosa über den eigenen Ton. Genau
 *   hier weiß der Nutzer es besser, und eine falsche Beobachtung geht sonst
 *   in jede weitere Umformulierung ein. Eine Zeile je Merkmal.
 * - **Der Beispielsatz** (`sample`) ist ein **Zitat** aus dem eigenen Brief,
 *   und Aufgabe 10 prüft das maschinell (`assertSampleIsVerbatim`). Ein
 *   bearbeitbares Zitat wäre keines mehr. Er steht deshalb nur da — wem er
 *   nicht gefällt, der ändert den Brief.
 * - **Satzlänge und Anredeform** sind **gemessen**, nicht geschätzt
 *   (`computeSentenceLength`, `detectAddress`, beide ohne Modell). Sie zu
 *   „korrigieren" hieße, eine Messung zu überschreiben; ändert sich der
 *   Text, ändern sie sich mit.
 * - **Die Förmlichkeit** ist der einzige Modellwert mit einer Zahl, und sie
 *   ist genau das, was der linke Regler einstellt (siehe
 *   `RewriteRequest.sliders`: `formality` **ersetzt** die abgeleitete
 *   Förmlichkeit im Prompt). Ein zweites Eingabefeld daneben wäre eine
 *   zweite Quelle für denselben Wert.
 *
 * **Die Regler sind keine Modelltemperatur.** Sie wirken ausschließlich über
 * den Prompt; `temperature` ist auf allen drei Anbietern wirkungslos oder
 * schädlich (siehe `lib/ai/provider.ts`). Deshalb auch benannte Stufen statt
 * einer Zahl von 0 bis 100 — „63" wäre hier ohne Bedeutung (DESIGN.md,
 * Abschnitt „Der Regler und seine Stufen").
 */

export interface StyleProfilePanelProps {
  style: StyleProfile
  onChange: (next: StyleProfile) => void
  sliders: RewriteSliders
  onSlidersChange: (next: RewriteSliders) => void
  defaultOpen: boolean
}

export function StyleProfilePanel({
  style,
  onChange,
  sliders,
  onSlidersChange,
  defaultOpen,
}: StyleProfilePanelProps) {
  const { t } = useTranslation()
  const prefix = useId()

  const formalitySteps = stepLabels(t, 'formality')
  const lengthSteps = stepLabels(t, 'length')

  return (
    <SidePanel title={t('editor.style.heading')} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-5">
        <Field
          id={`${prefix}-formality`}
          label={t('editor.style.formalityLabel')}
          hint={t('editor.style.formalityHint', { measured: Math.round(style.formality) })}
          labelledBy
        >
          {({ id, ...aria }) => (
            <Slider
              id={id}
              aria-labelledby={aria['aria-labelledby']}
              aria-describedby={aria['aria-describedby']}
              steps={formalitySteps}
              value={sliderStep(sliders.formality)}
              onValueChange={(step) =>
                onSlidersChange({ ...sliders, formality: stepToSlider(step) })
              }
            />
          )}
        </Field>

        <Field
          id={`${prefix}-length`}
          label={t('editor.style.lengthLabel')}
          hint={t('editor.style.lengthHint')}
          labelledBy
        >
          {({ id, ...aria }) => (
            <Slider
              id={id}
              aria-labelledby={aria['aria-labelledby']}
              aria-describedby={aria['aria-describedby']}
              steps={lengthSteps}
              value={sliderStep(sliders.length)}
              onValueChange={(step) => onSlidersChange({ ...sliders, length: stepToSlider(step) })}
            />
          )}
        </Field>

        <Field
          id={`${prefix}-traits`}
          label={t('editor.style.traitsLabel')}
          hint={t('editor.style.traitsHint')}
        >
          {({ id, ...aria }) => (
            <Textarea
              id={id}
              {...aria}
              rows={4}
              value={style.traits.join('\n')}
              onChange={(event) =>
                onChange({
                  ...style,
                  // Leere Zeilen fallen weg: `StyleProfile.traits` verlangt
                  // laut Zod-Grenze in Aufgabe 10 nicht-leere Einträge, und
                  // ein leeres Merkmal wäre im Prompt ein Aufzählungspunkt
                  // ohne Inhalt.
                  traits: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line !== ''),
                })
              }
            />
          )}
        </Field>

        <dl className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.style.measured.address')}</dt>
            <dd className="text-[var(--color-ink)]">
              {t(`editor.style.address.${style.address}`)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.style.measured.sentenceLength')}</dt>
            <dd className="text-[var(--color-ink)]">
              {t('editor.style.sentenceLength', { words: style.sentenceLength.toFixed(1) })}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.style.measured.sample')}</dt>
            <dd className="text-[var(--color-ink)]">
              <q>{style.sample}</q>
            </dd>
          </div>
        </dl>
      </div>
    </SidePanel>
  )
}

/** Die Beschriftungen der fünf Stufen, links nach rechts. */
function stepLabels(
  t: (key: string) => string,
  slider: 'formality' | 'length',
): readonly [string, string, ...string[]] {
  const labels = Array.from({ length: SLIDER_STEP_COUNT }, (_, step) =>
    t(`editor.style.${slider}Steps.${step}`),
  )
  // Der Typ des Primitivs verlangt mindestens zwei Stufen; `SLIDER_STEP_COUNT`
  // ist eine Konstante > 2, die Zusicherung ist also nur für den Compiler.
  return labels as unknown as readonly [string, string, ...string[]]
}
