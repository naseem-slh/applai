import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './Select'

// Radix' Auswahlliste arbeitet mit Zeigererfassung und scrollt den
// gewählten Eintrag in den sichtbaren Bereich. Beides kennt jsdom nicht;
// die Ersatzfunktionen stehen bewusst nur hier und nicht in setupTests.ts.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function Beispiel({ disabled = false }: { disabled?: boolean } = {}) {
  return (
    <Select disabled={disabled}>
      <SelectTrigger aria-label="Anbieter">
        <SelectValue placeholder="Anbieter wählen" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="gemini">Gemini</SelectItem>
        <SelectItem value="openai">OpenAI</SelectItem>
        <SelectItem value="anthropic" disabled>
          Anthropic
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select', () => {
  it('zeigt den Platzhalter in der zurückgenommenen Farbe, solange nichts gewählt ist', () => {
    render(<Beispiel />)

    const trigger = screen.getByRole('combobox', { name: 'Anbieter' })
    expect(trigger).toHaveTextContent('Anbieter wählen')
    expect(trigger).toHaveAttribute('data-placeholder')
  })

  it('öffnet die Liste und übernimmt die Wahl in den Auslöser', () => {
    const onValueChange = vi.fn()
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Anbieter">
          <SelectValue placeholder="Anbieter wählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gemini">Gemini</SelectItem>
          <SelectItem value="openai">OpenAI</SelectItem>
        </SelectContent>
      </Select>,
    )

    const trigger = screen.getByRole('combobox')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })

    fireEvent.click(screen.getByRole('option', { name: 'OpenAI' }))

    expect(onValueChange).toHaveBeenCalledWith('openai')
    expect(trigger).toHaveTextContent('OpenAI')
    expect(trigger).not.toHaveAttribute('data-placeholder')
  })

  it('lässt gesperrte Einträge nicht anwählen', () => {
    const onValueChange = vi.fn()
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Anbieter">
          <SelectValue placeholder="Anbieter wählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gemini">Gemini</SelectItem>
          <SelectItem value="anthropic" disabled>
            Anthropic
          </SelectItem>
        </SelectContent>
      </Select>,
    )

    fireEvent.pointerDown(screen.getByRole('combobox'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })

    const gesperrt = screen.getByRole('option', { name: 'Anthropic' })
    expect(gesperrt).toHaveAttribute('data-disabled')
    fireEvent.click(gesperrt)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('öffnet gesperrt gar nicht erst', () => {
    render(<Beispiel disabled />)

    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeDisabled()
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
