import { fireEvent, render, screen } from '@testing-library/react'
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
  })

  it('zeigt den Umfang der Markierung als Zähler', () => {
    setup({ selection: selection({ text: 'Sehr geehrte Damen und Herren' }) })

    expect(screen.getByText(t('editor.selection.chars', { chars: 29 }))).toBeInTheDocument()
  })

  // Die Leiste behaelt eine feste Hoehe, also traegt sie den vollen Satz nur
  // fuer Hilfsmittel; sichtbar bleibt der Zaehler.
  it('nennt den Umfang auch im vollen Satz, für Hilfsmittel', () => {
    setup({ selection: selection({ text: 'Sehr geehrte Damen und Herren' }) })

    expect(screen.getByText(t('editor.selection.summary', { chars: 29 }))).toBeInTheDocument()
  })

  // Was markiert ist, zeigt der Brief selbst. Die Leiste wiederholt es nicht.
  it('zitiert den Wortlaut der Markierung nicht mehr', () => {
    setup({ selection: selection({ text: 'Sehr geehrte Damen und Herren' }) })

    expect(screen.queryByText(/Sehr geehrte Damen und Herren/)).not.toBeInTheDocument()
  })

  // Ein Klick in die vorgemerkte Stelle nimmt sie weg, ein Klick woanders im
  // Brief verlegt die Markierung. Ein eigener Knopf dafuer war ein zweiter
  // Handgriff fuer etwas, das der erste schon sagt — und er kostete in der
  // einen Zeile die Breite, die der Rest braucht.
  it('bietet keinen Knopf zum Aufheben der Markierung an', () => {
    setup({ selection: selection() })

    expect(screen.getAllByRole('button')).toHaveLength(1)
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

    // In der Zeile steht nur der kurze Vermerk, damit sie ihre Hoehe behaelt.
    expect(screen.getByRole('button', { name: t('editor.retained.short', { count: 1 }) })).toBeInTheDocument()
    expect(screen.queryByText(t('editor.retained.body'))).not.toBeInTheDocument()
  })

  it('nennt den festgehaltenen Absatz samt Grund, sobald man den Vermerk öffnet', async () => {
    setup({
      selection: selection({
        inspection: {
          affected: [4, 5, 6],
          retained: [{ index: 5, position: 1, reason: 'embeddedContent' }],
          mayShiftContent: true,
        },
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: t('editor.retained.short', { count: 1 }) }))

    expect(await screen.findByText(t('editor.retained.heading'))).toBeInTheDocument()
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

    expect(
      screen.queryByRole('button', { name: t('editor.retained.short', { count: 1 }) }),
    ).not.toBeInTheDocument()
  })

  // Anbaustelle für 14b.
  it('nimmt weitere Aktionen zur Markierung auf', () => {
    setup({ selection: selection(), actions: <button type="button">Umformulieren</button> })

    expect(screen.getByRole('button', { name: 'Umformulieren' })).toBeInTheDocument()
  })





})
