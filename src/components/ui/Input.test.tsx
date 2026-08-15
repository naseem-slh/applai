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
    // Dieselbe Polsterung und Kontur wie der Auslöser der Auswahlliste —
    // daran hängt, dass Feld und Auswahl nebeneinander als eine Bauform
    // gelesen werden (siehe DESIGN.md).
    expect(field.className).toContain('py-3')
    expect(field.className).toContain('border-[var(--line-soft)]')
    expect(field.className).toContain('rounded-control')
  })

  it('lässt eine von außen übergebene Klasse gegen die Vorgabe gewinnen', () => {
    // Der cn()-Vertrag aus 13a: tailwind-merge löst die Polsterung auf,
    // statt sie zu überlagern.
    render(<Input aria-label="Kurz" className="py-1" />)

    const field = screen.getByLabelText('Kurz')
    expect(field.className).toContain('py-1')
    expect(field.className).not.toContain('py-3')
  })
})

describe('Textarea', () => {
  it('ist ein mehrzeiliges Feld mit Grundhöhe und Ziehgriff', () => {
    render(<Textarea aria-label="Anzeige" rows={4} />)

    const field = screen.getByLabelText('Anzeige')
    expect(field.tagName).toBe('TEXTAREA')
    expect(field).toHaveAttribute('rows', '4')
    expect(field.className).toContain('min-h-[150px]')
    expect(field.className).toContain('resize-y')
  })

  it('wächst nicht mit dem Inhalt', () => {
    // Eine eingefügte Stellenausschreibung ist mehrere tausend Zeichen
    // lang; ein mitwachsendes Feld schöbe den Weiter-Knopf aus dem Bild.
    render(<Textarea aria-label="Anzeige" />)

    expect(screen.getByLabelText('Anzeige').className).not.toContain('field-sizing-content')
  })
})
