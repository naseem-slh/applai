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

  it('trägt in der Kopfzeile den Ablauf aus zwei Schritten', () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const t = i18n.getFixedT(language)
    const navigation = screen.getByRole('navigation', { name: t('nav.label') })

    expect(navigation).toBeInTheDocument()
    // Beide Schritte stehen da, damit von Anfang an sichtbar ist, was noch
    // kommt. Nur benannt sind sie, nicht beide begehbar — siehe unten.
    expect(navigation).toHaveTextContent(t('nav.start'))
    expect(navigation).toHaveTextContent(t('nav.editor'))
  })

  // Die Arbeitsfläche hängt an einem Übergabestand der Einstiegsseite
  // (`RequireSession`). Beim ersten Start gibt es keinen, also darf der
  // zweite Schritt zwar dastehen, aber nicht anklickbar sein: Ein Verweis,
  // der nur auf eine Umleitung führt, ist eine Sackgasse mit Umweg.
  it('sperrt den zweiten Schritt, solange es keinen Übergabestand gibt', () => {
    render(<App />)

    const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')
    const navigation = screen.getByRole('navigation', { name: t('nav.label') })

    expect(navigation.querySelectorAll('a')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: t('nav.editor') })).toBeNull()
  })

  // Die Datenschutzerklärung muss von jeder Seite aus erreichbar sein — auch
  // bevor irgendetwas hochgeladen wurde.
  it('führt den Datenschutz in der Kopfzeile, aber außerhalb des Ablaufs', () => {
    render(<App />)

    const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')
    const link = screen.getByRole('link', { name: t('nav.privacy') })

    expect(link).toHaveAttribute('href', '/datenschutz')
    // Erreichbar ja, Teil des Ablaufs nein: Datenschutz und Einstellungen
    // tragen keine Schrittziffer und stehen außerhalb der Navigation.
    expect(screen.getByRole('navigation', { name: t('nav.label') }).contains(link)).toBe(false)
  })

  it('beginnt beim ersten Start mit dem Datenschutzhinweis', async () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const heading = i18n.getFixedT(language)('onboarding.privacy.heading')

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })
})
