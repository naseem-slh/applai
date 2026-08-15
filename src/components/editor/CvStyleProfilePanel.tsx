import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Textarea } from '@/components/ui/Input'
import type { BulletForm, BulletTense, CvStyleProfile } from '@/lib/domain/cvStyleProfile'
import { SidePanel } from './SidePanel'
import { sliderStep, stepToSlider, SLIDER_STEP_COUNT, type RewriteSliders } from './rewriteRequest'

/**
 * Das aus dem vorhandenen Lebenslauf abgeleitete Stilprofil.
 *
 * Dieselbe Aufteilung wie beim Anschreiben (`StyleProfilePanel`), nur mit
 * anderen Feldern — und mit **einem** Regler statt zweien:
 *
 * - **Form und Zeitform** kommen vom Modell und sind eine Einschätzung. Genau
 *   dort weiß der Nutzer es besser, wenn sie danebenliegt, und eine falsche
 *   Einschätzung ginge sonst in jede Umformulierung ein. Beide sind deshalb
 *   Auswahllisten, keine Anzeigen.
 * - **Die Merkmale** sind Modellprosa und aus demselben Grund bearbeitbar.
 * - **Person, Schlusszeichen und Länge** sind **gemessen**
 *   (`detectPerson`, `detectTerminalPunctuation`, `computeBulletLength`, alle
 *   ohne Modell). Sie zu „korrigieren" hieße, eine Messung zu überschreiben;
 *   ändert sich das Dokument, ändern sie sich mit.
 * - **Der Beispieleintrag** ist ein **Zitat**, maschinell gegen das Original
 *   geprüft (`assertSampleIsVerbatim`). Ein bearbeitbares Zitat wäre keines.
 *
 * **Nur der Längenregler.** „Förmlich ↔ locker" beschreibt Prosa; an einem
 * Aufzählungspunkt hat es nichts zu greifen, und ein Regler, der sichtbar
 * nichts bewirkt, nimmt auch dem danebenliegenden die Glaubwürdigkeit
 * (`docs/spec.md`, „Stil"). Die Form trägt hier das Profil.
 */

export interface CvStyleProfilePanelProps {
  style: CvStyleProfile
  onChange: (next: CvStyleProfile) => void
  sliders: RewriteSliders
  onSlidersChange: (next: RewriteSliders) => void
  defaultOpen: boolean
}

const BULLET_FORMS: readonly BulletForm[] = ['verbFirst', 'nounPhrase', 'mixed']
const TENSES: readonly BulletTense[] = ['present', 'past', 'mixed']

export function CvStyleProfilePanel({
  style,
  onChange,
  sliders,
  onSlidersChange,
  defaultOpen,
}: CvStyleProfilePanelProps) {
  const { t } = useTranslation()
  const prefix = useId()

  const lengthSteps = stepLabels(t)

  return (
    <SidePanel title={t('editor.cvStyle.heading')} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-5">
        <Field id={`${prefix}-form`} label={t('editor.cvStyle.formLabel')} labelledBy>
          {({ id, ...aria }) => (
            <Select
              value={style.bulletForm}
              onValueChange={(next) => onChange({ ...style, bulletForm: next as BulletForm })}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BULLET_FORMS.map((form) => (
                  <SelectItem key={form} value={form}>
                    {t(`editor.cvStyle.form.${form}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field id={`${prefix}-tense`} label={t('editor.cvStyle.tenseLabel')} labelledBy>
          {({ id, ...aria }) => (
            <Select
              value={style.tense}
              onValueChange={(next) => onChange({ ...style, tense: next as BulletTense })}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENSES.map((tense) => (
                  <SelectItem key={tense} value={tense}>
                    {t(`editor.cvStyle.tense.${tense}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field id={`${prefix}-length`} label={t('editor.style.lengthLabel')} labelledBy>
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
          hint={t('editor.cvStyle.traitsHint')}
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
                  // Leere Zeilen fallen weg, wie beim Anschreiben: Ein leeres
                  // Merkmal wäre im Prompt ein Aufzählungspunkt ohne Inhalt.
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
            <dt className={FIELD_HINT_CLASS}>{t('editor.cvStyle.measured.person')}</dt>
            <dd className="text-[var(--color-ink)]">
              {t(`editor.cvStyle.person.${style.person}`)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.cvStyle.measured.terminalPunctuation')}</dt>
            <dd className="text-[var(--color-ink)]">
              {t(
                `editor.cvStyle.terminalPunctuation.${style.terminalPunctuation ? 'yes' : 'no'}`,
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.cvStyle.measured.bulletLength')}</dt>
            <dd className="text-[var(--color-ink)]">
              {t('editor.cvStyle.bulletLength', { words: style.bulletLength })}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={FIELD_HINT_CLASS}>{t('editor.cvStyle.measured.sample')}</dt>
            <dd className="text-[var(--color-ink)]">
              <q>{style.sample}</q>
            </dd>
          </div>
        </dl>
      </div>
    </SidePanel>
  )
}

/** Die Beschriftungen der fünf Stufen des Längenreglers, links nach rechts. */
function stepLabels(t: (key: string) => string): readonly [string, string, ...string[]] {
  const labels = Array.from({ length: SLIDER_STEP_COUNT }, (_, step) =>
    t(`editor.style.lengthSteps.${step}`),
  )
  // Siehe `StyleProfilePanel`: Der Typ des Primitivs verlangt mindestens zwei
  // Stufen, `SLIDER_STEP_COUNT` ist eine Konstante > 2.
  return labels as unknown as readonly [string, string, ...string[]]
}
