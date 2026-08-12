import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { LanguagePrompt } from './LanguagePrompt'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function setup(options: { open?: boolean; ad?: 'de' | 'en'; letter?: 'de' | 'en' } = {}) {
  const onDecide = vi.fn()
  render(
    <LanguagePrompt
      open={options.open ?? true}
      adLanguage={options.ad ?? 'en'}
      letterLanguage={options.letter ?? 'de'}
      onDecide={onDecide}
    />,
  )
  return { onDecide }
}

describe('LanguagePrompt', () => {
  // docs/spec.md: „Nachfrage nur bei Abweichung." Der geschlossene Zustand
  // ist der Regelfall und darf nichts anzeigen.
  it('zeigt nichts, solange nicht gefragt wird', () => {
    setup({ open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('nennt beide Sprachen und bietet beide Wege an', () => {
    setup({ ad: 'en', letter: 'de' })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(
      t('editor.language.intro', {
        ad: t('editor.language.names.en'),
        letter: t('editor.language.names.de'),
      }),
    )
    expect(
      screen.getByRole('button', {
        name: t('editor.language.keep', { language: t('editor.language.names.de') }),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: t('editor.language.switch', { language: t('editor.language.names.en') }),
      }),
    ).toBeInTheDocument()
  })

  it('weist beim Vorschlag Englisch auf die abweichenden Gepflogenheiten hin', () => {
    setup({ ad: 'en', letter: 'de' })

    expect(screen.getByText(t('editor.language.customs.heading'))).toBeInTheDocument()
    expect(screen.getByText(t('editor.language.customs.body'))).toBeInTheDocument()
  })

  it('erwähnt die Gepflogenheiten nicht, wenn ins Deutsche gewechselt werden soll', () => {
    setup({ ad: 'de', letter: 'en' })

    expect(screen.queryByText(t('editor.language.customs.heading'))).not.toBeInTheDocument()
  })

  it('meldet die Zielsprache der Anzeige, wenn gewechselt wird', () => {
    const { onDecide } = setup({ ad: 'en', letter: 'de' })

    fireEvent.click(
      screen.getByRole('button', {
        name: t('editor.language.switch', { language: t('editor.language.names.en') }),
      }),
    )

    expect(onDecide).toHaveBeenCalledWith('en')
  })

  it('bleibt bei der Sprache des Briefes, wenn abgelehnt wird', () => {
    const { onDecide } = setup({ ad: 'en', letter: 'de' })

    fireEvent.click(
      screen.getByRole('button', {
        name: t('editor.language.keep', { language: t('editor.language.names.de') }),
      }),
    )

    expect(onDecide).toHaveBeenCalledWith('de')
  })

  // Wegklicken ist keine Zustimmung: Ohne Entscheidung würde sonst übersetzt.
  it('wertet Escape als „bei der Sprache des Briefes bleiben"', () => {
    const { onDecide } = setup({ ad: 'en', letter: 'de' })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onDecide).toHaveBeenCalledWith('de')
  })
})
