import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('benennt den Abschnitt über seine Überschrift', () => {
    render(
      <SectionCard headingId="unterlagen" heading="Unterlagen">
        <p>Inhalt</p>
      </SectionCard>,
    )

    expect(screen.getByRole('region', { name: 'Unterlagen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Unterlagen' })).toBeInTheDocument()
  })

  it('kann die Überschrift eine Ebene tiefer setzen', () => {
    render(
      <SectionCard headingId="stil" heading="Stilprofil" headingLevel={3}>
        <p>Inhalt</p>
      </SectionCard>,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Stilprofil' })).toBeInTheDocument()
  })

  it('ist ohne Angabe hervorgehoben und lässt sich flach stellen', () => {
    // Die Vorgabe ist die der Schlüsseleinrichtung (`raised`); die
    // Einstellungen stellen ihre sechs Abschnitte flach, damit nicht
    // sechsmal „das hier ist wichtig" dasteht.
    const { rerender } = render(
      <SectionCard headingId="a" heading="A">
        <p>Inhalt</p>
      </SectionCard>,
    )
    expect(screen.getByRole('region', { name: 'A' }).className).toContain(
      '[--pop-height:10px]',
    )

    rerender(
      <SectionCard headingId="a" heading="A" variant="default">
        <p>Inhalt</p>
      </SectionCard>,
    )
    expect(screen.getByRole('region', { name: 'A' }).className).not.toContain(
      '[--pop-height:10px]',
    )
  })
})
