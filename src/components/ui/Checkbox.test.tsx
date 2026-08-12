import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

/**
 * Was hier geprüft wird, ist nicht Radix, sondern die Zusagen, die dieses
 * Primitiv der Oberfläche macht: eine Rolle, die den Zustand trägt, ein
 * Zustand, der nicht allein an der Farbe hängt, und ein Weg über die
 * Tastatur, der derselbe ist wie der mit der Maus.
 */
describe('Checkbox', () => {
  it('meldet sich als Kontrollkästchen mit seinem Zustand', () => {
    render(<Checkbox checked aria-label="Behalten" onCheckedChange={() => {}} />)

    expect(screen.getByRole('checkbox', { name: 'Behalten' })).toBeChecked()
  })

  it('schaltet mit der Maus um', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox checked={false} aria-label="Behalten" onCheckedChange={onCheckedChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'Behalten' }))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('schaltet mit der Leertaste um, ohne dass die Maus nötig wäre', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox checked={false} aria-label="Behalten" onCheckedChange={onCheckedChange} />)

    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Behalten' })).toHaveFocus()
    await user.keyboard(' ')

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('bleibt im gesperrten Zustand unbedienbar', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(
      <Checkbox checked={false} disabled aria-label="Behalten" onCheckedChange={onCheckedChange} />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Behalten' }))

    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('trägt den unbestimmten Zustand als solchen vor, nicht als „aus"', () => {
    render(<Checkbox checked="indeterminate" aria-label="Behalten" onCheckedChange={() => {}} />)

    expect(screen.getByRole('checkbox', { name: 'Behalten' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    )
  })
})
