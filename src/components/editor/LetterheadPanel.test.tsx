import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Letterhead } from '@/lib/domain/letterhead'
import i18n from '@/lib/i18n/i18n'
import { LetterheadPanel } from './LetterheadPanel'
import type { ForeignCompanies } from './foreignCompanies'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const LETTERHEAD: Letterhead = {
  recipient: 'Musterwerk Solutions GmbH',
  date: '12. August 2026',
  subject: 'Bewerbung als Entwicklerin',
  salutation: 'Sehr geehrte Damen und Herren',
}

const NO_FOREIGN: ForeignCompanies = { hits: [], paragraphs: [] }

interface SetupOptions {
  letterhead?: Letterhead
  onInsert?: ((value: string) => void) | null
  foreign?: ForeignCompanies
}

function setup(options: SetupOptions = {}) {
  const onChange = vi.fn()
  const onInsert = options.onInsert === undefined ? vi.fn() : options.onInsert
  render(
    <LetterheadPanel
      letterhead={options.letterhead ?? LETTERHEAD}
      onChange={onChange}
      onInsert={onInsert}
      foreign={options.foreign ?? NO_FOREIGN}
      defaultOpen
    />,
  )
  return { onChange, onInsert }
}

describe('LetterheadPanel', () => {
  it('zeigt die vier Felder vorbefüllt', () => {
    setup()

    expect(screen.getByLabelText(t('editor.letterhead.fields.recipient'))).toHaveValue(
      LETTERHEAD.recipient,
    )
    expect(screen.getByLabelText(t('editor.letterhead.fields.date'))).toHaveValue(LETTERHEAD.date)
    expect(screen.getByLabelText(t('editor.letterhead.fields.subject'))).toHaveValue(
      LETTERHEAD.subject,
    )
    expect(screen.getByLabelText(t('editor.letterhead.fields.salutation'))).toHaveValue(
      LETTERHEAD.salutation,
    )
  })

  it('meldet eine Korrektur an den Aufrufer, statt sie selbst zu halten', () => {
    const { onChange } = setup()

    fireEvent.change(screen.getByLabelText(t('editor.letterhead.fields.subject')), {
      target: { value: 'Bewerbung als Teamleiterin' },
    })

    expect(onChange).toHaveBeenCalledWith({ ...LETTERHEAD, subject: 'Bewerbung als Teamleiterin' })
  })

  it('setzt genau das Feld ein, dessen Knopf gedrückt wurde', () => {
    const { onInsert } = setup()

    const buttons = screen.getAllByRole('button', { name: t('editor.letterhead.insert') })
    fireEvent.click(buttons[3]!)

    expect(onInsert).toHaveBeenCalledWith(LETTERHEAD.salutation)
  })

  it('sperrt das Einsetzen ohne Markierung und sagt, was zu tun ist', () => {
    setup({ onInsert: null })

    for (const button of screen.getAllByRole('button', { name: t('editor.letterhead.insert') })) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByText(t('editor.letterhead.insertHintNoSelection'))).toBeInTheDocument()
  })

  it('sperrt das Einsetzen eines leeren Feldes', () => {
    setup({ letterhead: { ...LETTERHEAD, recipient: '   ' } })

    const buttons = screen.getAllByRole('button', { name: t('editor.letterhead.insert') })
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).toBeEnabled()
  })

  it('sagt nichts über fremde Firmen, solange keine im Brief steht', () => {
    setup()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('nennt jeden fremden Firmennamen samt Absatz', () => {
    setup({
      foreign: {
        hits: [
          { name: 'Bosch', index: 46, paragraph: 1 },
          { name: 'Bosch', index: 120, paragraph: 3 },
        ],
        paragraphs: [1, 3],
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      t('editor.letterhead.foreign.heading', { count: 2 }),
    )
    expect(
      screen.getByText(t('editor.letterhead.foreign.entry', { name: 'Bosch', number: 2 })),
    ).toBeInTheDocument()
    expect(
      screen.getByText(t('editor.letterhead.foreign.entry', { name: 'Bosch', number: 4 })),
    ).toBeInTheDocument()
  })
})
