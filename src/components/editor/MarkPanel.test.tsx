import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MarkAnchor } from '@/lib/storage/adapter'
import i18n from '@/lib/i18n/i18n'
import { MarkPanel, type MarkPanelProps } from './MarkPanel'
import { createAnchor, type Mark } from './marks'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const TEXT = 'Sehr geehrte Damen und Herren, ich bewerbe mich um die Stelle als Entwickler.'

function markOn(needle: string, done = false): Mark {
  const from = TEXT.indexOf(needle)
  const range = { from, to: from + needle.length }
  return { id: needle, range, anchor: createAnchor(TEXT, range), current: needle, done }
}

function setup(overrides: Partial<MarkPanelProps> = {}) {
  const props: MarkPanelProps = {
    marks: [],
    unresolved: [],
    restore: null,
    activeId: null,
    onSelect: vi.fn(),
    onToggleDone: vi.fn(),
    onRemove: vi.fn(),
    onClearAll: vi.fn(),
    onDismiss: vi.fn(),
    defaultOpen: true,
    ...overrides,
  }
  render(<MarkPanel {...props} />)
  return props
}

describe('MarkPanel', () => {
  it('meldet, wenn nichts vorgemerkt ist', () => {
    setup()
    expect(screen.getByText(t('editor.marks.none'))).toBeInTheDocument()
  })

  it('zeigt jede Stelle nummeriert und im Wortlaut', () => {
    setup({ marks: [markOn('ich bewerbe mich'), markOn('als Entwickler')] })

    expect(
      screen.getByRole('button', {
        name: t('editor.marks.entry', { number: 1, text: 'ich bewerbe mich' }),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: t('editor.marks.entry', { number: 2, text: 'als Entwickler' }),
      }),
    ).toBeInTheDocument()
  })

  it('zeigt den Fortschritt', () => {
    setup({ marks: [markOn('ich bewerbe mich', true), markOn('als Entwickler')] })
    expect(screen.getByText(t('editor.marks.progress', { done: 1, total: 2 }))).toBeInTheDocument()
  })

  it('markiert die Stelle, die angeklickt wird', () => {
    const mark = markOn('ich bewerbe mich')
    const props = setup({ marks: [mark] })

    fireEvent.click(
      screen.getByRole('button', {
        name: t('editor.marks.entry', { number: 1, text: 'ich bewerbe mich' }),
      }),
    )

    expect(props.onSelect).toHaveBeenCalledWith(mark)
  })

  it('weist die gerade bearbeitete Stelle aus', () => {
    setup({ marks: [markOn('ich bewerbe mich')], activeId: 'ich bewerbe mich' })

    expect(
      screen.getByRole('button', {
        name: t('editor.marks.entry', { number: 1, text: 'ich bewerbe mich' }),
      }),
    ).toHaveAttribute('aria-current', 'true')
  })

  it('hakt eine Stelle ab, ohne sie zu entfernen', () => {
    const props = setup({ marks: [markOn('ich bewerbe mich')] })

    fireEvent.click(screen.getByRole('button', { name: t('editor.marks.done'), pressed: false }))

    expect(props.onToggleDone).toHaveBeenCalledWith('ich bewerbe mich', true)
    expect(props.onRemove).not.toHaveBeenCalled()
  })

  it('entfernt eine Stelle auf Wunsch', () => {
    const props = setup({ marks: [markOn('ich bewerbe mich')] })

    fireEvent.click(screen.getByRole('button', { name: t('editor.marks.remove') }))

    expect(props.onRemove).toHaveBeenCalledWith('ich bewerbe mich')
  })

  it('springt zur nächsten offenen Stelle', () => {
    const offen = markOn('als Entwickler')
    const props = setup({ marks: [markOn('ich bewerbe mich', true), offen] })

    fireEvent.click(screen.getByRole('button', { name: t('editor.marks.next') }))

    expect(props.onSelect).toHaveBeenCalledWith(offen)
  })

  it('bietet keinen Sprung an, wenn alles erledigt ist', () => {
    setup({ marks: [markOn('ich bewerbe mich', true)] })
    expect(screen.queryByRole('button', { name: t('editor.marks.next') })).not.toBeInTheDocument()
  })

  it('nennt die Auskunft zum Wiederherstellen', () => {
    setup({
      marks: [markOn('ich bewerbe mich')],
      restore: { restored: 1, total: 2, fromOtherLetter: false },
    })
    expect(
      screen.getByText(t('editor.marks.restored', { restored: 1, total: 2 })),
    ).toBeInTheDocument()
  })

  it('sagt dazu, wenn die Stellen von einem früheren Anschreiben stammen', () => {
    setup({
      marks: [markOn('ich bewerbe mich')],
      restore: { restored: 1, total: 1, fromOtherLetter: true },
    })
    expect(
      screen.getByText(t('editor.marks.restoredOther', { restored: 1, total: 1 })),
    ).toBeInTheDocument()
  })

  it('nennt nicht wiedergefundene Anker und lässt sie verwerfen', () => {
    const verloren: MarkAnchor = createAnchor(TEXT, { from: 0, to: 12 })
    const props = setup({ unresolved: [verloren] })

    expect(screen.getByText(t('editor.marks.unresolved.heading'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('editor.marks.unresolved.dismiss') }))

    expect(props.onDismiss).toHaveBeenCalledWith(verloren)
  })

  it('entfernt auf Wunsch alle Vormerkungen', () => {
    const props = setup({ marks: [markOn('ich bewerbe mich')] })

    fireEvent.click(screen.getByRole('button', { name: t('editor.marks.clearAll') }))

    expect(props.onClearAll).toHaveBeenCalled()
  })
})
