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
})
