import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import de from '@/lib/i18n/locales/de.json'
import { PROVIDER_LINKS } from '@/components/onboarding/providerLinks'
import i18n from '@/lib/i18n/i18n'
import { PROVIDER_IDS } from '@/lib/storage/keyVault'
import Privacy from './Privacy'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

describe('Privacy', () => {
  it('stellt den Kernsatz an den Anfang', () => {
    render(<Privacy />)

    expect(screen.getByText(t('privacy.lead'))).toBeInTheDocument()
  })

  // Der Wortlaut aus der Aufgabenstellung, gegen die deutsche Fassung
  // geprüft — der Test läuft je nach Maschine in der einen oder anderen
  // Sprache, die Zusage steht aber im Deutschen.
  it('sagt im Kernsatz, dass nichts auf einem Server gespeichert wird', () => {
    expect(de.privacy.lead).toContain('speichert nichts auf einem Server')
    expect(de.privacy.lead).toContain('ausschließlich in Ihrem Browser')
  })

  it('nennt alles, was der Browser ablegt', () => {
    render(<Privacy />)

    expect(screen.getByText(t('privacy.storage.key'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.drafts'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.applications'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.delete'))).toBeInTheDocument()
  })

  it('sagt, dass persönliche Daten vor dem Senden ersetzt werden, und dass der freie Gemini-Tarif zum Training dient', () => {
    render(<Privacy />)

    expect(screen.getByText(t('privacy.provider.anonymize'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.provider.training'))).toBeInTheDocument()
  })

  it('verweist auf die Bestimmungen aller drei Anbieter, aus derselben Quelle wie die Einrichtung', () => {
    render(<Privacy />)

    for (const id of PROVIDER_IDS) {
      const link = screen.getByRole('link', { name: PROVIDER_LINKS[id].label })
      expect(link).toHaveAttribute('href', PROVIDER_LINKS[id].privacy)
      // Die Herkunft dieser Seite soll nicht im Zugriffslog eines Anbieters
      // landen, nur weil jemand seine Bestimmungen liest.
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('führt ein Impressum mit sichtbarem Platzhalter, statt Angaben zu erfinden', () => {
    render(<Privacy />)

    expect(
      screen.getByRole('heading', { name: t('privacy.imprint.heading') }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(t('privacy.imprint.placeholder'))).toHaveLength(2)
  })

  it('gliedert sich in Abschnitte mit Überschriften', () => {
    render(<Privacy />)

    expect(screen.getByRole('heading', { level: 1, name: t('privacy.heading') })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(6)
  })
})
