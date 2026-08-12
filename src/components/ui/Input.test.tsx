import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input, Textarea } from './Input'

describe('Input', () => {
  it('ist ohne Angabe ein Textfeld und reicht jede weitere Eigenschaft durch', () => {
    render(<Input aria-label="Name" defaultValue="Adem Yıldız" maxLength={40} />)

    const field = screen.getByLabelText('Name')
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveValue('Adem Yıldız')
    expect(field).toHaveAttribute('maxlength', '40')
  })

  it('nimmt einen anderen Typ an, ohne die Gestalt zu ändern', () => {
    render(<Input aria-label="Passwort" type="password" />)

    const field = screen.getByLabelText('Passwort')
    expect(field).toHaveAttribute('type', 'password')
    // Dieselbe Höhe und Kontur wie der Auslöser der Auswahlliste — daran
    // hängt, dass Feld und Auswahl nebeneinander als eine Bauform gelesen
    // werden (siehe DESIGN.md).
    expect(field.className).toContain('h-10')
    expect(field.className).toContain('border-[var(--color-control-border)]')
  })

  it('lässt eine von außen übergebene Klasse gegen die Vorgabe gewinnen', () => {
    // Der cn()-Vertrag aus 13a: tailwind-merge löst die Höhe auf, statt sie
    // zu überlagern.
    render(<Input aria-label="Kurz" className="h-8" />)

    const field = screen.getByLabelText('Kurz')
    expect(field.className).toContain('h-8')
    expect(field.className).not.toContain('h-10')
  })
})

describe('Textarea', () => {
  it('ist ein mehrzeiliges Feld mit Grundhöhe und Ziehgriff', () => {
    render(<Textarea aria-label="Anzeige" rows={4} />)

    const field = screen.getByLabelText('Anzeige')
    expect(field.tagName).toBe('TEXTAREA')
    expect(field).toHaveAttribute('rows', '4')
    expect(field.className).toContain('min-h-32')
    expect(field.className).toContain('resize-y')
  })

  it('wächst nicht mit dem Inhalt', () => {
    // Eine eingefügte Stellenausschreibung ist mehrere tausend Zeichen
    // lang; ein mitwachsendes Feld schöbe den Weiter-Knopf aus dem Bild.
    render(<Textarea aria-label="Anzeige" />)

    expect(screen.getByLabelText('Anzeige').className).not.toContain('field-sizing-content')
  })
})
