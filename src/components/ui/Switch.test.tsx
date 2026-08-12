import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('meldet seinen Zustand als role="switch" mit aria-checked', () => {
    render(<Switch aria-label="Anonymisierung" />)

    const control = screen.getByRole('switch', { name: 'Anonymisierung' })
    expect(control).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(control)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('nimmt seinen Namen auch aus einer sichtbaren Beschriftung daneben', () => {
    render(
      <>
        <span id="wahrheitsmodus">Freier Modus</span>
        <Switch aria-labelledby="wahrheitsmodus" />
      </>,
    )

    expect(
      screen.getByRole('switch', { name: 'Freier Modus' }),
    ).toBeInTheDocument()
  })

  it('lässt sich gesperrt nicht umlegen', () => {
    const onCheckedChange = vi.fn()
    render(
      <Switch disabled aria-label="Anonymisierung" onCheckedChange={onCheckedChange} />,
    )

    const control = screen.getByRole('switch')
    fireEvent.click(control)

    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control).toHaveAttribute('aria-checked', 'false')
  })
})
