import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { AppLayout } from './AppLayout'
import { createHarness, type HarnessOptions } from './appContext.testutils'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function renderLayout(pfad = '/', options: HarnessOptions = {}) {
  const harness = createHarness(options)
  render(
    <MemoryRouter initialEntries={[pfad]}>
      <AppLayout />
    </MemoryRouter>,
    { wrapper: harness.wrapper },
  )
  return harness
}

describe('AppLayout', () => {
  it('legt jede Ansicht auf das linierte Blatt', () => {
    renderLayout()

    const raum = screen.getByTestId('room')
    expect(raum).toHaveClass('room-paper')
    // Der Raum ist Zier: kein Name, keine Zeigerereignisse, unterste Ebene.
    expect(raum).toHaveAttribute('aria-hidden', 'true')
    expect(raum).toHaveClass('pointer-events-none')
    expect(raum).toHaveClass('z-0')
  })

  it('baut keine gemeinsame Kopfzeile mehr', () => {
    // Jede Ansicht bringt ihre eigene mit — eine, die all das zugleich sein
    // müsste, wäre überall ein Kompromiss.
    renderLayout()

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('hält Datenschutz und Einstellungen von jeder Ansicht aus erreichbar', () => {
    // Der Datenschutz trägt das Impressum (§ 5 DDG), und die Einstellungen
    // wären sonst nur über die Arbeitsfläche zu finden — die ohne Unterlagen
    // gesperrt ist.
    renderLayout()

    expect(screen.getByRole('link', { name: t('nav.privacy') })).toHaveAttribute(
      'href',
      '/datenschutz',
    )
    expect(screen.getByRole('link', { name: t('nav.settings') })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('lässt den Verweis auf die Seite weg, auf der man schon steht', () => {
    renderLayout('/datenschutz')

    expect(screen.queryByRole('link', { name: t('nav.privacy') })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('nav.settings') })).toBeInTheDocument()
  })
})
