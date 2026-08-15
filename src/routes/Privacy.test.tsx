import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import de from '@/lib/i18n/locales/de.json'
import { PROVIDER_LINKS } from '@/components/onboarding/providerLinks'
import i18n from '@/lib/i18n/i18n'
import { PROVIDER_IDS } from '@/lib/storage/keyVault'
import Privacy from './Privacy'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

/** Die Seite trägt jetzt ihre eigene Kopfzeile mit dem Zurück-Knopf und
 *  braucht deshalb einen Router um sich herum. */
function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={['/datenschutz']}>
      <Privacy />
    </MemoryRouter>,
  )
}

describe('Privacy', () => {
  it('stellt den Kernsatz an den Anfang', () => {
    renderPrivacy()

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
    renderPrivacy()

    expect(screen.getByText(t('privacy.storage.key'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.drafts'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.applications'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.storage.delete'))).toBeInTheDocument()
  })

  it('sagt, dass persönliche Daten vor dem Senden ersetzt werden, und dass der freie Gemini-Tarif zum Training dient', () => {
    renderPrivacy()

    expect(screen.getByText(t('privacy.provider.anonymize'))).toBeInTheDocument()
    expect(screen.getByText(t('privacy.provider.training'))).toBeInTheDocument()
  })

  it('verweist auf die Bestimmungen aller drei Anbieter, aus derselben Quelle wie die Einrichtung', () => {
    renderPrivacy()

    for (const id of PROVIDER_IDS) {
      const link = screen.getByRole('link', { name: PROVIDER_LINKS[id].label })
      expect(link).toHaveAttribute('href', PROVIDER_LINKS[id].privacy)
      // Die Herkunft dieser Seite soll nicht im Zugriffslog eines Anbieters
      // landen, nur weil jemand seine Bestimmungen liest.
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('führt ein Impressum mit sichtbarem Platzhalter, statt Angaben zu erfinden', () => {
    renderPrivacy()

    expect(
      screen.getByRole('heading', { name: t('privacy.imprint.heading') }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(t('privacy.imprint.placeholder'))).toHaveLength(2)
  })

  it('gliedert sich in Abschnitte mit Überschriften', () => {
    renderPrivacy()

    expect(screen.getByRole('heading', { level: 1, name: t('privacy.heading') })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(6)
  })

  it('trägt eine eigene Kopfzeile mit Zurück-Knopf und Marke', () => {
    renderPrivacy()

    expect(screen.getByRole('link', { name: t('nav.back') })).toHaveAttribute('href', '/')
    expect(screen.getByTestId('wordmark')).toBeInTheDocument()
  })

  it('stellt die zwei Figuren in den Raum, nicht in die Karten', () => {
    // Als Kind einer Karte richtete sich eine Figur nach ihr aus und läse
    // sich als deren Beigabe. Und sie sagt nichts, was der Text nicht auch
    // sagt — für den Vorleser ist sie deshalb nicht da.
    renderPrivacy()

    const raum = screen.getByTestId('room-figures')
    expect(raum).toHaveAttribute('aria-hidden', 'true')
    for (const pose of ['schirm', 'inkognito']) {
      const figur = raum.querySelector(`[data-figure="${pose}"]`)
      expect(figur).not.toBeNull()
      expect(figur).toHaveAttribute('alt', '')
    }
  })

  it('lässt die Figuren weg, wo kein Platz für sie ist', () => {
    // Gemessen, nicht geschätzt: 780px Spalte plus Figur braucht 1140px.
    // Am Bildrand kleben wäre schlimmer als wegbleiben.
    renderPrivacy()

    for (const pose of ['schirm', 'inkognito']) {
      const figur = screen.getByTestId('room-figures').querySelector(`[data-figure="${pose}"]`)
      expect(figur?.className).toContain('hidden')
      expect(figur?.className).toContain('min-[1140px]:block')
    }
  })
})
