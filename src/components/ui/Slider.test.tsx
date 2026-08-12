import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from './Slider'

const TON = ['förmlich', 'eher förmlich', 'neutral', 'eher locker', 'locker']

describe('Slider', () => {
  it('sagt die Stufe als Text an, nicht als Zahl', () => {
    render(<Slider steps={TON} defaultValue={2} aria-label="Tonfall" />)

    const thumb = screen.getByRole('slider', { name: 'Tonfall' })
    expect(thumb).toHaveAttribute('aria-valuetext', 'neutral')
    expect(thumb).toHaveAttribute('aria-valuenow', '2')
    expect(thumb).toHaveAttribute('aria-valuemin', '0')
    expect(thumb).toHaveAttribute('aria-valuemax', '4')
  })

  it('rückt mit der Pfeiltaste um genau eine Stufe weiter und zieht die Ansage nach', () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        steps={TON}
        defaultValue={2}
        aria-label="Tonfall"
        onValueChange={onValueChange}
      />,
    )

    const thumb = screen.getByRole('slider')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })

    expect(onValueChange).toHaveBeenCalledWith(3)
    expect(thumb).toHaveAttribute('aria-valuetext', 'eher locker')
  })

  it('bleibt an den Enden stehen', () => {
    render(<Slider steps={TON} defaultValue={4} aria-label="Tonfall" />)

    const thumb = screen.getByRole('slider')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(thumb).toHaveAttribute('aria-valuetext', 'locker')
  })

  it('folgt im gesteuerten Betrieb dem Wert von außen', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(
      <Slider
        steps={TON}
        value={0}
        aria-label="Tonfall"
        onValueChange={onValueChange}
      />,
    )

    const thumb = screen.getByRole('slider')
    fireEvent.keyDown(thumb, { key: 'End' })

    // Die Meldung geht nach außen, der angezeigte Wert bleibt, bis der
    // Aufrufer ihn ändert.
    expect(onValueChange).toHaveBeenCalledWith(4)
    expect(thumb).toHaveAttribute('aria-valuetext', 'förmlich')

    rerender(
      <Slider
        steps={TON}
        value={4}
        aria-label="Tonfall"
        onValueChange={onValueChange}
      />,
    )
    expect(thumb).toHaveAttribute('aria-valuetext', 'locker')
  })

  it('bewegt sich gesperrt nicht', () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        steps={TON}
        defaultValue={1}
        disabled
        aria-label="Tonfall"
        onValueChange={onValueChange}
      />,
    )

    const thumb = screen.getByRole('slider')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })

    expect(onValueChange).not.toHaveBeenCalled()
    expect(thumb).toHaveAttribute('aria-valuetext', 'eher förmlich')
  })
})
