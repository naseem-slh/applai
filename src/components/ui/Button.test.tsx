import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('gibt jedem Knopf außer dem Warnknopf dasselbe Aussehen', () => {
    render(
      <>
        <Button variant="primary">Übernehmen</Button>
        <Button variant="secondary">Zurück</Button>
        <Button variant="ghost">Rückgängig</Button>
        <Button variant="danger">Löschen</Button>
      </>,
    )

    // Helle Fläche in Ruhe, ganz orange unter dem Zeiger — und zwar überall
    // gleich. Die Rangfolge sagt in dieser Oberfläche der Platz, nicht die
    // Farbe (siehe Kopfkommentar in `Button.tsx`).
    for (const name of ['Übernehmen', 'Zurück', 'Rückgängig']) {
      const knopf = screen.getByRole('button', { name })
      expect(knopf).toHaveClass('bg-[var(--field)]')
      expect(knopf).toHaveClass('not-disabled:hover:bg-[var(--accent)]')
      expect(knopf).toHaveClass('not-disabled:hover:text-[var(--accent-ink)]')
    }

    // Der Warnknopf ist der eine, der nicht orange wird: Im Augenblick des
    // Klickens soll die Farbe warnen und nicht anbieten.
    const loeschen = screen.getByRole('button', { name: 'Löschen' })
    expect(loeschen).toHaveClass('bg-[var(--error)]')
    expect(loeschen).toHaveClass('not-disabled:hover:bg-[var(--error-deep)]')
    expect(loeschen).not.toHaveClass('not-disabled:hover:bg-[var(--accent)]')
  })

  it('lässt eine übergebene Klasse die Variante überstimmen, statt sie zu ergänzen', () => {
    render(
      <Button variant="danger" className="bg-[var(--field)]">
        Abbrechen
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-[var(--field)]')
    expect(button).not.toHaveClass('bg-[var(--error)]')
  })

  it('trägt in jeder Variante den gemeinsamen Fokusring', () => {
    render(<Button variant="ghost">Mehr</Button>)
    expect(screen.getByRole('button')).toHaveClass('focus-ring')
  })

  it('trägt in jeder Variante dieselbe harte Kante mit Druckpunkt', () => {
    // Die Mechanik unterscheidet die Varianten nicht, und seit dem einen
    // Aussehen unterscheidet sie außer dem Warnknopf ohnehin nichts mehr.
    // Ein Knopf ohne `pop-press` fühlte sich anders an als seine Nachbarn und
    // wäre sofort als Fremdkörper zu erkennen.
    render(
      <>
        <Button variant="primary">Weiter</Button>
        <Button variant="secondary">Zurück</Button>
        <Button variant="ghost">Rückgängig</Button>
        <Button variant="danger">Löschen</Button>
      </>,
    )

    for (const name of ['Weiter', 'Zurück', 'Rückgängig', 'Löschen']) {
      expect(screen.getByRole('button', { name })).toHaveClass('pop-press')
    }
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
    expect(link).toHaveClass('bg-[var(--field)]')
    expect(link).not.toHaveAttribute('type')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
