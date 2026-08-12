import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { Button } from './Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './Dialog'

function Beispiel() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Entwurf verwerfen</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Entwurf verwerfen?</DialogTitle>
        <DialogDescription>
          Die Änderungen am Anschreiben gehen dabei verloren.
        </DialogDescription>
        <DialogFooter>
          <Button variant="danger">Verwerfen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('nimmt seinen zugänglichen Namen aus dem Titel', () => {
    render(<Beispiel />)
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }))

    expect(
      screen.getByRole('dialog', { name: 'Entwurf verwerfen?' }),
    ).toBeInTheDocument()
  })

  it('beschriftet den Schließknopf aus i18next statt aus fest verdrahtetem Text', () => {
    render(<Beispiel />)
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }))

    const expected = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')(
      'ui.dialog.close',
    )
    expect(screen.getByRole('button', { name: expected })).toBeInTheDocument()
  })

  it('lässt den Namen des Schließknopfes überschreiben', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="Hinweis schließen">
          <DialogTitle>Hinweis</DialogTitle>
        </DialogContent>
      </Dialog>,
    )

    expect(
      screen.getByRole('button', { name: 'Hinweis schließen' }),
    ).toBeInTheDocument()
  })

  it('schließt auf Escape', () => {
    render(<Beispiel />)
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
