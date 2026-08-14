import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CvStyleProfile } from '@/lib/domain/cvStyleProfile'
import i18n from '@/lib/i18n/i18n'
import { CvStyleProfilePanel } from './CvStyleProfilePanel'
import { CV_DEFAULT_SLIDERS, type RewriteSliders } from './rewriteRequest'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const STYLE: CvStyleProfile = {
  bulletForm: 'verbFirst',
  tense: 'present',
  person: 'none',
  terminalPunctuation: false,
  bulletLength: 9,
  traits: ['nennt Ergebnisse mit Zahlen'],
  sample: 'Entwickelt Steuerungssoftware für die Fertigung',
}

function setup(sliders: RewriteSliders = CV_DEFAULT_SLIDERS) {
  const onChange = vi.fn()
  const onSlidersChange = vi.fn()
  render(
    <CvStyleProfilePanel
      style={STYLE}
      onChange={onChange}
      sliders={sliders}
      onSlidersChange={onSlidersChange}
      defaultOpen
    />,
  )
  return { onChange, onSlidersChange }
}

describe('CvStyleProfilePanel', () => {
  it('zeigt die gemessenen Werte an, ohne sie bearbeitbar zu machen', () => {
    setup()

    expect(screen.getByText(t('editor.cvStyle.person.none'))).toBeInTheDocument()
    expect(screen.getByText(t('editor.cvStyle.terminalPunctuation.no'))).toBeInTheDocument()
    expect(screen.getByText(t('editor.cvStyle.bulletLength', { words: 9 }))).toBeInTheDocument()

    // Der Beispieleintrag ist ein Zitat, maschinell gegen das Original
    // geprüft — ein bearbeitbares Zitat wäre keines.
    expect(screen.getByText(STYLE.sample)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(STYLE.sample)).toBeNull()
  })

  it('lässt Form und Zeitform berichtigen — beide sind Einschätzungen des Modells', () => {
    setup()

    expect(
      screen.getByRole('combobox', { name: t('editor.cvStyle.formLabel') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: t('editor.cvStyle.tenseLabel') }),
    ).toBeInTheDocument()
  })

  it('gibt die berichtigten Merkmale zeilenweise zurück und lässt Leerzeilen weg', () => {
    const { onChange } = setup()

    fireEvent.change(screen.getByRole('textbox', { name: t('editor.style.traitsLabel') }), {
      target: { value: 'kurze Einträge\n\n  nennt die Technik  ' },
    })

    expect(onChange).toHaveBeenCalledWith({
      ...STYLE,
      traits: ['kurze Einträge', 'nennt die Technik'],
    })
  })

  /**
   * `docs/spec.md`, „Stil": Am Lebenslauf gibt es nur die Länge. „Förmlich ↔
   * locker" beschreibt Prosa und hätte an einem Aufzählungspunkt nichts zu
   * greifen — ein Regler, der sichtbar nichts bewirkt, nimmt auch dem
   * danebenliegenden die Glaubwürdigkeit.
   */
  it('bietet nur den Längenregler an', () => {
    setup()

    expect(screen.getByRole('slider', { name: t('editor.style.lengthLabel') })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: t('editor.style.formalityLabel') })).toBeNull()
  })
})
