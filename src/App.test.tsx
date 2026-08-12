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

  it('trägt eine einzeilige Kopfzeile mit den beiden Zielen der Anwendung', () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const label = i18n.getFixedT(language)('nav.label')
    const navigation = screen.getByRole('navigation', { name: label })

    expect(navigation).toBeInTheDocument()
    // Drei Verweise insgesamt: der Name der Anwendung und die zwei Ziele
    // der Navigation. Die Arbeitsfläche ist erst über die Einstiegsseite
    // erreichbar und gehört nicht in die Kopfzeile.
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(navigation.querySelectorAll('a')).toHaveLength(2)
  })

  it('beginnt beim ersten Start mit dem Datenschutzhinweis', async () => {
    render(<App />)

    const language = i18n.resolvedLanguage ?? 'de'
    const heading = i18n.getFixedT(language)('onboarding.privacy.heading')

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })
})
