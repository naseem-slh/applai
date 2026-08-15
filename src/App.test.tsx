// `fake-indexeddb` als Testdoppel: `App` erzeugt seit Aufgabe 13c den
// echten Speicheradapter und den echten Schlüsseltresor, und beide sprechen
// mit IndexedDB, das jsdom nicht mitbringt. Ohne das Doppel liefe die
// Anwendung hier in ihrem Ausfallpfad statt in ihrem Normalfall.
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import i18n from './lib/i18n/i18n'

describe('App', () => {
  it('rendert die Startseite mit einer aus i18next übersetzten Überschrift', () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const expectedHeading = i18n.getFixedT(language)('routes.start.heading')

    expect(
      screen.getByRole('heading', { name: expectedHeading }),
    ).toBeInTheDocument()
  })

  // Der Schrittanzeiger ist mit der Übernahme der Attrappen weggefallen: Er
  // zählte Schritte, die sich von selbst zählen. Auf der Einstiegsseite
  // steht, was fehlt; auf der Arbeitsfläche steht der Brief. Eine Ziffer
  // davor sagte nichts dazu — und eine gemeinsame Kopfzeile gibt es nicht
  // mehr, weil jede Ansicht eine andere braucht.
  it('baut keine gemeinsame Kopfzeile mit Ablaufnavigation mehr', () => {
    render(<App />)

    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  // Die Datenschutzerklärung trägt das Impressum und muss nach § 5 DDG von
  // jeder Seite aus erreichbar sein — auch bevor irgendetwas hochgeladen
  // wurde. Die Attrappen kennen den Verweis nicht: Sie sind Einzelseiten und
  // haben nie modelliert, wie man zwischen ihnen wechselt.
  it('hält Datenschutz und Einstellungen von jeder Seite aus erreichbar', () => {
    render(<App />)

    const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

    expect(screen.getByRole('link', { name: t('nav.privacy') })).toHaveAttribute(
      'href',
      '/datenschutz',
    )
    expect(screen.getByRole('link', { name: t('nav.settings') })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  // Die Arbeitsfläche hängt an einem Übergabestand der Einstiegsseite
  // (`RequireSession`). Beim ersten Start gibt es keinen — und keinen
  // Verweis dorthin, der nur auf eine Umleitung führte.
  it('bietet ohne Übergabestand keinen Weg auf die Arbeitsfläche an', () => {
    render(<App />)

    expect(screen.queryByRole('link', { name: '/editor' })).toBeNull()
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('/editor')
    }
  })

  it('beginnt beim ersten Start mit dem Datenschutzhinweis', async () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const heading = i18n.getFixedT(language)('onboarding.privacy.heading')

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })
})
