import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { PrivacyNotice } from './PrivacyNotice'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

// Die vier Punkte aus docs/spec.md („Erststart-Hinweis"). Steht hier
// ausgeschrieben, damit ein Wegfallen auffällt und nicht bloß eine
// Schleife über dieselbe Liste wie in der Komponente läuft.
const REQUIRED_ITEMS = ['provider', 'training', 'draft', 'delete'] as const

describe('PrivacyNotice', () => {
  it('nennt alle vier Punkte mit Überschrift und Erläuterung', () => {
    render(<PrivacyNotice onAccept={() => {}} />)

    for (const item of REQUIRED_ITEMS) {
      const titleKey = `onboarding.privacy.${item}.title`
      const bodyKey = `onboarding.privacy.${item}.body`
      expect(i18n.exists(titleKey)).toBe(true)
      expect(i18n.exists(bodyKey)).toBe(true)
      expect(screen.getByText(t(titleKey))).toBeInTheDocument()
      expect(screen.getByText(t(bodyKey))).toBeInTheDocument()
    }
  })

  it('sagt in beiden Sprachen ausdrücklich, dass der kostenlose Gemini-Tarif zum Training verwendet wird', () => {
    // Kein Textvergleich am gerenderten Baum allein: Die Aussage darf nicht
    // stillschweigend abgeschwächt werden, deshalb hängt der Test an den
    // Wörtern, um die es geht.
    const de = i18n.getFixedT('de')('onboarding.privacy.training.title')
    const en = i18n.getFixedT('en')('onboarding.privacy.training.title')
    expect(de).toMatch(/kostenlos/i)
    expect(de).toMatch(/Training/i)
    expect(en).toMatch(/free/i)
    expect(en).toMatch(/training/i)
    expect(de).not.toBe(en)
  })

  it('führt die Punkte als Beschreibungsliste, damit Überschrift und Erläuterung zusammengehören', () => {
    const { container } = render(<PrivacyNotice onAccept={() => {}} />)

    expect(container.querySelectorAll('dt')).toHaveLength(REQUIRED_ITEMS.length)
    expect(container.querySelectorAll('dd')).toHaveLength(REQUIRED_ITEMS.length)
  })

  it('benennt den Abschnitt über seine Überschrift', () => {
    render(<PrivacyNotice onAccept={() => {}} />)

    const heading = screen.getByRole('heading', {
      level: 2,
      name: t('onboarding.privacy.heading'),
    })
    expect(screen.getByRole('region', { name: t('onboarding.privacy.heading') })).toBeInTheDocument()
    expect(heading).toBeInTheDocument()
  })

  it('meldet die Kenntnisnahme — auch über die Tastatur', async () => {
    const user = userEvent.setup()
    const onAccept = vi.fn()
    render(<PrivacyNotice onAccept={onAccept} />)

    const button = screen.getByRole('button', { name: t('onboarding.privacy.accept') })
    await user.click(button)
    expect(onAccept).toHaveBeenCalledTimes(1)

    button.focus()
    await user.keyboard('{Enter}')
    expect(onAccept).toHaveBeenCalledTimes(2)
  })
})
