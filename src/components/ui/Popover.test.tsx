import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './Popover'

function Beispiel() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Briefkopf prüfen</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p>Anschrift aus der Stellenausschreibung</p>
        <PopoverClose asChild>
          <Button variant="ghost">Übernehmen</Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  )
}

describe('Popover', () => {
  it('verknüpft den Auslöser mit dem Inhalt im Portal', () => {
    render(<Beispiel />)

    const trigger = screen.getByRole('button', { name: 'Briefkopf prüfen' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const content = screen.getByRole('dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    // Der Inhalt hängt am Dokument, nicht im Baum des Auslösers — sonst
    // würde ihn ein überlaufender Container beschneiden.
    expect(trigger.contains(content)).toBe(false)
  })

  it('schließt über den Schließknopf im Inhalt', () => {
    render(<Beispiel />)
    fireEvent.click(screen.getByRole('button', { name: 'Briefkopf prüfen' }))

    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
