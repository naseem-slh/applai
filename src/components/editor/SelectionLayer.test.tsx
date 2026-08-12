import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { SelectionLayer } from './SelectionLayer'
import type { EditorSelection } from './documentSelection'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function selection(overrides: Partial<EditorSelection> = {}): EditorSelection {
  return {
    range: { from: 0, to: 5 },
    text: 'Alpha',
    contextBefore: '',
    contextAfter: '',
    hasContent: true,
    inspection: { affected: [0], retained: [], mayShiftContent: false },
    ...overrides,
  }
}

function setup(overrides: Partial<Parameters<typeof SelectionLayer>[0]> = {}) {
  const props = {
    selection: null,
    fineSelection: true,
    caretParagraph: null,
    onSelectWholeDocument: vi.fn(),
    onSelectParagraph: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  }
  render(<SelectionLayer {...props} />)
  return props
}

describe('SelectionLayer', () => {
  it('bietet „ganzes Dokument" immer an', () => {
    const props = setup()

    screen.getByRole('button', { name: t('editor.selection.wholeDocument') }).click()

    expect(props.onSelectWholeDocument).toHaveBeenCalledTimes(1)
  })

  it('bietet den aktuellen Absatz an, sobald der Cursor in einem steht', () => {
    const props = setup({ caretParagraph: 3 })

    screen.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()

    expect(props.onSelectParagraph).toHaveBeenCalledWith(3)
  })

  it('bietet den aktuellen Absatz nicht an, solange der Cursor nirgends steht', () => {
    setup()

    expect(
      screen.queryByRole('button', { name: t('editor.selection.currentParagraph') }),
    ).not.toBeInTheDocument()
  })

  it('bietet mit einem groben Zeigegerät nur das ganze Dokument an', () => {
    setup({ fineSelection: false, caretParagraph: 2 })

    expect(screen.getByRole('button', { name: t('editor.selection.wholeDocument') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.selection.currentParagraph') }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(t('editor.selection.touch'))).toBeInTheDocument()
  })

  it('sagt ohne Markierung, wie eine entsteht', () => {
    setup()

    expect(screen.getByText(t('editor.selection.none'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.selection.clear') }),
    ).not.toBeInTheDocument()
  })

  it('nennt Umfang und Anfang der Markierung', () => {
    setup({ selection: selection({ text: 'Sehr geehrte Damen und Herren' }) })

    expect(screen.getByText(t('editor.selection.summary', { chars: 29 }))).toBeInTheDocument()
    expect(
      screen.getByText(t('editor.selection.preview', { text: 'Sehr geehrte Damen und Herren' })),
    ).toBeInTheDocument()
  })

  it('kürzt eine lange Markierung in der Vorschau', () => {
    setup({ selection: selection({ text: 'a'.repeat(200) }) })

    expect(
      screen.getByText(t('editor.selection.preview', { text: `${'a'.repeat(90)}…` })),
    ).toBeInTheDocument()
  })

  it('lässt die Markierung wieder aufheben', () => {
    const props = setup({ selection: selection() })

    screen.getByRole('button', { name: t('editor.selection.clear') }).click()

    expect(props.onClear).toHaveBeenCalledTimes(1)
  })

  // Weitergabe aus Aufgabe 3: Der Nutzer erfährt es, bevor etwas verrutscht.
  it('warnt vor einem festgehaltenen Absatz und nennt ihn samt Grund', () => {
    setup({
      selection: selection({
        inspection: {
          affected: [4, 5, 6],
          retained: [{ index: 5, position: 1, reason: 'embeddedContent' }],
          mayShiftContent: true,
        },
      }),
    })

    expect(screen.getByText(t('editor.retained.heading'))).toBeInTheDocument()
    expect(
      screen.getByText(
        t('editor.retained.entry', {
          number: 6,
          reason: t('editor.retained.reason.embeddedContent'),
        }),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(t('editor.retained.body'))).toBeInTheDocument()
  })

  it('warnt nicht, wenn der festgehaltene Absatz der erste betroffene ist', () => {
    setup({
      selection: selection({
        inspection: {
          affected: [4],
          retained: [{ index: 4, position: 0, reason: 'tableCell' }],
          mayShiftContent: false,
        },
      }),
    })

    expect(screen.queryByText(t('editor.retained.heading'))).not.toBeInTheDocument()
  })

  // Anbaustelle für 14b.
  it('nimmt weitere Aktionen zur Markierung auf', () => {
    setup({ selection: selection(), actions: <button type="button">Umformulieren</button> })

    expect(screen.getByRole('button', { name: 'Umformulieren' })).toBeInTheDocument()
  })

  it('bietet das Vormerken an, sobald etwas markiert ist', () => {
    const onToggle = vi.fn()
    setup({ selection: selection(), markAction: { releases: false, replaces: [], onToggle } })

    screen.getByRole('button', { name: t('editor.marks.add') }).click()

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('nennt den Knopf „aufheben", wenn die Markierung deckungsgleich ist', () => {
    setup({ selection: selection(), markAction: { releases: true, replaces: [], onToggle: vi.fn() } })

    expect(screen.getByRole('button', { name: t('editor.marks.release') })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('editor.marks.add') })).not.toBeInTheDocument()
  })

  it('kündigt an, welche Vormerkung ersetzt würde', () => {
    setup({ selection: selection(), markAction: { releases: false, replaces: [2], onToggle: vi.fn() } })

    expect(screen.getByText(t('editor.marks.replaces', { number: 2 }))).toBeInTheDocument()
  })

  it('bietet das Vormerken nicht an, solange nur Leerraum markiert ist', () => {
    setup({
      selection: selection({ text: '   ', hasContent: false }),
      markAction: { releases: false, replaces: [], onToggle: vi.fn() },
    })

    expect(screen.queryByRole('button', { name: t('editor.marks.add') })).not.toBeInTheDocument()
  })

  it('bietet das Vormerken nicht an, solange nichts markiert ist', () => {
    setup({ markAction: { releases: false, replaces: [], onToggle: vi.fn() } })

    expect(screen.queryByRole('button', { name: t('editor.marks.add') })).not.toBeInTheDocument()
  })
})
