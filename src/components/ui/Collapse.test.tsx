import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLLAPSE_CLOSE_MS, Collapse } from './Collapse'

afterEach(() => {
  vi.useRealTimers()
})

function huelle() {
  const treffer = document.querySelector('[data-open]')
  if (treffer === null) throw new Error('keine Hülle')
  return treffer
}

describe('Collapse', () => {
  it('zeigt offen seinen Inhalt', () => {
    render(
      <Collapse open>
        <p>Inhalt</p>
      </Collapse>,
    )

    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    expect(huelle()).toHaveAttribute('data-open', 'true')
    expect(huelle()).not.toHaveAttribute('inert')
  })

  it('baut geschlossen gar nichts auf — und klappt beim Laden auch nichts zu', () => {
    vi.useFakeTimers()
    render(
      <Collapse open={false}>
        <p>Inhalt</p>
      </Collapse>,
    )

    expect(screen.queryByText('Inhalt')).toBeNull()
    act(() => vi.advanceTimersByTime(COLLAPSE_CLOSE_MS * 2))
    expect(screen.queryByText('Inhalt')).toBeNull()
  })

  it('hält den Inhalt fest, bis die Bewegung durch ist', () => {
    // Der Grund, warum es dieses Teil gibt: Ein `{bedingung && …}` nimmt den
    // Inhalt im selben Durchlauf weg, und dann hat das Raster nichts mehr,
    // woran es schrumpfen könnte.
    vi.useFakeTimers()
    const { rerender } = render(
      <Collapse open>
        <p>Inhalt</p>
      </Collapse>,
    )

    rerender(<Collapse open={false}>{null}</Collapse>)

    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    expect(huelle()).toHaveAttribute('data-open', 'false')
    // Was zugeht, ist für Tastatur und Vorleser sofort weg.
    expect(huelle()).toHaveAttribute('inert')

    act(() => vi.advanceTimersByTime(COLLAPSE_CLOSE_MS - 20))
    expect(screen.getByText('Inhalt')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(40))
    expect(screen.queryByText('Inhalt')).toBeNull()
  })

  it('nimmt den Inhalt zurück, wenn es mitten im Zugehen wieder aufgeht', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <Collapse open>
        <p>Inhalt</p>
      </Collapse>,
    )
    rerender(<Collapse open={false}>{null}</Collapse>)
    act(() => vi.advanceTimersByTime(100))
    rerender(
      <Collapse open>
        <p>Inhalt</p>
      </Collapse>,
    )

    act(() => vi.advanceTimersByTime(COLLAPSE_CLOSE_MS * 2))
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    expect(huelle()).toHaveAttribute('data-open', 'true')
  })

  it('lässt die Uhr und die Klasse dieselbe Zahl nennen', () => {
    // Tailwind liest Klassennamen aus dem Quelltext; die Dauer steht deshalb
    // zweimal da. Läuft die Uhr früher ab als die Bewegung, verschwindet der
    // Inhalt mittendrin.
    render(<Collapse open={false}>{null}</Collapse>)

    expect(huelle().className).toContain(`duration-[${COLLAPSE_CLOSE_MS}ms]`)
  })
})
