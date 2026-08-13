import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { AppLayout } from './AppLayout'
import { createHarness, type HarnessOptions } from './appContext.testutils'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function renderLayout(options: HarnessOptions = {}) {
  const harness = createHarness(options)
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppLayout />
    </MemoryRouter>,
    { wrapper: harness.wrapper },
  )
  return harness
}

describe('AppLayout', () => {
  // Die Marke führt zurück auf die Einstiegsseite. Ihren Namen trägt der
  // Schriftzug, nicht das Zeichen daneben.
  it('führt mit der Marke zurück auf die Einstiegsseite', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: t('app.name') })).toHaveAttribute('href', '/')
  })

  it('zeigt das Logo neben dem Schriftzug', () => {
    renderLayout()

    const marke = screen.getByRole('link', { name: t('app.name') })
    const logo = marke.querySelector('img')

    expect(logo).not.toBeNull()
    expect(logo?.getAttribute('src')).toContain('logo')
  })

  // Das Zeichen sagt dasselbe wie der Schriftzug daneben. Zweimal derselbe
  // Name wäre für Hilfsmittel nur Lärm, deshalb bleibt es ohne Textalternative.
  it('lässt das Logo aus dem Namen der Marke heraus', () => {
    renderLayout()

    const marke = screen.getByRole('link', { name: t('app.name') })
    const logo = marke.querySelector('img')

    expect(logo).toHaveAttribute('alt', '')
    expect(within(marke).getByText(t('app.name'))).toBeInTheDocument()
  })

  // Ohne feste Masse springt die Kopfzeile, sobald das Bild eintrifft.
  it('gibt dem Logo feste Masse, damit die Kopfzeile nicht springt', () => {
    renderLayout()

    const logo = screen.getByRole('link', { name: t('app.name') }).querySelector('img')

    expect(logo).toHaveAttribute('width')
    expect(logo).toHaveAttribute('height')
  })
})
