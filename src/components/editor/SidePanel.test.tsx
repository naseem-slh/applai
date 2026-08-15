import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SidePanel } from './SidePanel'

function setup(defaultOpen: boolean) {
  render(
    <SidePanel title="Briefkopf" badge={<span>2</span>} defaultOpen={defaultOpen}>
      <p>Inhalt des Bereichs</p>
    </SidePanel>,
  )
}

describe('SidePanel', () => {
  it('steht auf breiten Fenstern offen', () => {
    setup(true)

    expect(screen.getByRole('group')).toHaveAttribute('open')
    expect(screen.getByText('Inhalt des Bereichs')).toBeVisible()
  })

  it('ist auf schmalen Fenstern zugeklappt', () => {
    setup(false)

    expect(screen.getByRole('group')).not.toHaveAttribute('open')
  })

  // Das Auf- und Zuklappen selbst gehört dem Browser (jsdom setzt `open`
  // beim Klick auf `<summary>` nicht um). Geprüft wird deshalb der Aufbau,
  // von dem es abhängt: die Überschrift im `<summary>`, der Inhalt im
  // `<details>` daneben. Läge der Inhalt außerhalb, bliebe er im
  // zugeklappten Zustand sichtbar.
  it('legt Überschrift und Inhalt so, dass der Browser zuklappen kann', () => {
    setup(false)

    const details = screen.getByRole('group')
    const summary = details.querySelector('summary')
    expect(summary).not.toBeNull()
    expect(summary!.contains(screen.getByRole('heading', { level: 3 }))).toBe(true)

    const content = screen.getByText('Inhalt des Bereichs')
    expect(details.contains(content)).toBe(true)
    expect(summary!.contains(content)).toBe(false)
  })

  it('führt die Überschrift als solche, damit sie in der Überschriftenliste auftaucht', () => {
    setup(true)

    expect(screen.getByRole('heading', { level: 3, name: 'Briefkopf' })).toBeInTheDocument()
  })

  it('zeigt die Kurzauskunft in der Kopfzeile', () => {
    setup(true)

    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
