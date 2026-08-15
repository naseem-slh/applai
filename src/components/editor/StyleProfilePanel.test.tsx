import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import i18n from '@/lib/i18n/i18n'
import { StyleProfilePanel } from './StyleProfilePanel'
import { defaultSliders, type RewriteSliders } from './rewriteRequest'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const STYLE: StyleProfile = {
  formality: 72,
  sentenceLength: 14.25,
  address: 'sie',
  traits: ['knappe Hauptsätze', 'nennt Ergebnisse mit Zahlen'],
  sample: 'Ich schreibe Ihnen wegen der ausgeschriebenen Stelle.',
}

function setup(sliders: RewriteSliders = defaultSliders(STYLE)) {
  const onChange = vi.fn()
  const onSlidersChange = vi.fn()
  render(
    <StyleProfilePanel
      style={STYLE}
      onChange={onChange}
      sliders={sliders}
      onSlidersChange={onSlidersChange}
      defaultOpen
    />,
  )
  return { onChange, onSlidersChange }
}

describe('StyleProfilePanel', () => {
  it('zeigt die gemessenen Werte an, ohne sie bearbeitbar zu machen', () => {
    setup()

    expect(screen.getByText(t('editor.style.address.sie'))).toBeInTheDocument()
    expect(
      screen.getByText(t('editor.style.sentenceLength', { words: '14.3' })),
    ).toBeInTheDocument()
    // Der Beispielsatz ist ein Zitat aus dem eigenen Brief (Aufgabe 10 prüft
    // das wörtlich); ein bearbeitbares Zitat wäre keines mehr.
    expect(screen.getByText(STYLE.sample)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(STYLE.sample)).not.toBeInTheDocument()
  })

  it('lässt die Merkmale berichtigen, eine Zeile je Merkmal', () => {
    const { onChange } = setup()

    const field = screen.getByLabelText(t('editor.style.traitsLabel'))
    expect(field).toHaveValue('knappe Hauptsätze\nnennt Ergebnisse mit Zahlen')

    fireEvent.change(field, { target: { value: 'kurze Sätze\n\n  duzt nie  ' } })

    expect(onChange).toHaveBeenCalledWith({ ...STYLE, traits: ['kurze Sätze', 'duzt nie'] })
  })

  it('nennt die abgeleitete Förmlichkeit und stellt den Regler auf die nächste Stufe', () => {
    setup()

    expect(screen.getByText(t('editor.style.formalityHint', { measured: 72 }))).toBeInTheDocument()
    // 72 von 100 liegt bei fünf Stufen auf „eher förmlich".
    expect(screen.getByRole('slider', { name: t('editor.style.formalityLabel') })).toHaveAttribute(
      'aria-valuetext',
      t('editor.style.formalitySteps.3'),
    )
  })

  it('meldet eine Reglerbewegung als Wert zwischen 0 und 100', () => {
    const { onSlidersChange } = setup({ formality: 50, length: 50 })

    const slider = screen.getByRole('slider', { name: t('editor.style.lengthLabel') })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    expect(onSlidersChange).toHaveBeenCalledWith({ formality: 50, length: 75 })
  })

  it('beschriftet beide Regler mit benannten Stufen, nicht mit einer Zahl', () => {
    setup({ formality: 0, length: 100 })

    expect(screen.getByRole('slider', { name: t('editor.style.formalityLabel') })).toHaveAttribute(
      'aria-valuetext',
      t('editor.style.formalitySteps.0'),
    )
    expect(screen.getByRole('slider', { name: t('editor.style.lengthLabel') })).toHaveAttribute(
      'aria-valuetext',
      t('editor.style.lengthSteps.4'),
    )
  })
})
