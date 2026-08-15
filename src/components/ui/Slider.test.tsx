import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Slider, type SliderProps } from './Slider'

const TON = [
  'förmlich',
  'eher förmlich',
  'neutral',
  'eher locker',
  'locker',
] as const

describe('Slider', () => {
  it('sagt die Stufe als Text an, nicht als Zahl', () => {
    render(<Slider steps={TON} defaultValue={2} aria-label="Tonfall" />)

    const thumb = screen.getByRole('slider', { name: 'Tonfall' })
    expect(thumb).toHaveAttribute('aria-valuetext', 'neutral')
    expect(thumb).toHaveAttribute('aria-valuenow', '2')
    expect(thumb).toHaveAttribute('aria-valuemin', '0')
    expect(thumb).toHaveAttribute('aria-valuemax', '4')
  })

  it('zeigt beide Enden und die aktuelle Stufe auch sehend an', () => {
    render(<Slider steps={TON} defaultValue={2} aria-label="Tonfall" />)

    // Die Enden benennen die Achse, die Mitte den Stand. Ohne das sieht man
    // nur einen Griff irgendwo auf einer Schiene und kann bei fünf Stufen
    // nicht ablesen, ob „eher förmlich" oder „neutral" gewählt ist.
    expect(screen.getByText('förmlich')).toBeInTheDocument()
    expect(screen.getByText('locker')).toBeInTheDocument()
    expect(screen.getByText('neutral')).toBeInTheDocument()
  })

  it('hält die sichtbare Beschriftung aus der Ansage heraus', () => {
    render(<Slider steps={TON} defaultValue={2} aria-label="Tonfall" />)

    // Dieselbe Auskunft steht bereits als aria-valuetext am Griff. Ohne
    // aria-hidden läse die Vorlesesoftware sie im Lesemodus ein zweites Mal.
    expect(screen.getByText('neutral').closest('[aria-hidden="true"]')).not.toBe(
      null,
    )
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'neutral',
    )
  })

  it('rückt mit der Pfeiltaste um genau eine Stufe weiter und zieht Ansage und Beschriftung nach', () => {
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
    expect(screen.getByText('eher locker')).toBeInTheDocument()
  })

  it('bleibt an den Enden stehen und nennt das Ende dort zweimal', () => {
    render(<Slider steps={TON} defaultValue={4} aria-label="Tonfall" />)

    const thumb = screen.getByRole('slider')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(thumb).toHaveAttribute('aria-valuetext', 'locker')

    // Am Anschlag trägt dasselbe Wort beide Rollen: rechtes Ende der Achse
    // und aktueller Stand. Bewusst so — es liest sich als Bestätigung.
    expect(screen.getAllByText('locker')).toHaveLength(2)
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

  it('lässt vom Typ her keine einzelne Stufe zu', () => {
    const zuWenig = ['nur eine'] as const

    // @ts-expect-error Eine einzelne Stufe ist kein Regler: max wäre 0 (nichts
    // zu bewegen) oder 1 — dann meldete eine Pfeiltaste den Wert 1 nach außen,
    // zu dem es keine Stufe gibt. Der Typ verhindert das; dieser Test hält es
    // fest, weil tsc die Testdateien mitprüft (tsconfig.test.json).
    const props: SliderProps = { steps: zuWenig }

    expect(props.steps).toHaveLength(1)
  })
})
