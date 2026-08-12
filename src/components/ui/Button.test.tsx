import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('bildet die Varianten auf unterschiedliche Farb-Token ab', () => {
    render(
      <>
        <Button variant="primary">Übernehmen</Button>
        <Button variant="danger">Löschen</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Übernehmen' })).toHaveClass(
      'bg-[var(--color-accent)]',
    )
    expect(screen.getByRole('button', { name: 'Löschen' })).toHaveClass(
      'bg-[var(--color-error)]',
    )
  })

  it('lässt eine übergebene Klasse die Variante überstimmen, statt sie zu ergänzen', () => {
    render(
      <Button variant="primary" className="bg-[var(--color-surface-alt)]">
        Abbrechen
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-[var(--color-surface-alt)]')
    expect(button).not.toHaveClass('bg-[var(--color-accent)]')
  })

  it('trägt in jeder Variante den gemeinsamen Fokusring', () => {
    render(<Button variant="ghost">Mehr</Button>)
    expect(screen.getByRole('button')).toHaveClass('focus-ring')
  })

  it('ist ohne Angabe kein Absendeknopf', () => {
    render(<Button>Weiter</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('löst im gesperrten Zustand nichts aus', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Exportieren
      </Button>,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('gibt mit asChild sein Aussehen an das Kind weiter, statt ein <button> zu erzeugen', () => {
    render(
      <Button asChild variant="primary">
        <a href="/editor">Zur Arbeitsfläche</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Zur Arbeitsfläche' })
    expect(link).toHaveClass('bg-[var(--color-accent)]')
    expect(link).not.toHaveAttribute('type')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
