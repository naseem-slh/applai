import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { DraftStatus } from './DraftStatus'

const language = i18n.resolvedLanguage ?? 'de'
const t = i18n.getFixedT(language)

function relative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(value, unit)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('DraftStatus', () => {
  it('nennt vor dem ersten Sichern die Zusage', () => {
    render(<DraftStatus state={{ status: 'idle' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(t('editor.draft.idle'))
  })

  it('sagt während des Sicherns nicht, dass gesichert wurde', () => {
    render(<DraftStatus state={{ status: 'saving' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(t('editor.draft.saving'))
  })

  it('meldet einen frischen Zwischenstand ohne Zeitangabe', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T10:00:00Z'))

    render(<DraftStatus state={{ status: 'saved', at: Date.now() }} />)

    expect(screen.getByRole('status')).toHaveTextContent(t('editor.draft.savedJustNow'))
  })

  it('rechnet die Zeit seit dem erfolgreichen Sichern in Minuten um', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T10:00:00Z'))
    const savedAt = Date.now() - 2 * 60 * 1000

    render(<DraftStatus state={{ status: 'saved', at: savedAt }} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      t('editor.draft.saved', { when: relative(-2, 'minute') }),
    )
  })

  it('rundet Sekunden auf zehn, statt eine Genauigkeit vorzutäuschen', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T10:00:00Z'))
    const savedAt = Date.now() - 37 * 1000

    render(<DraftStatus state={{ status: 'saved', at: savedAt }} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      t('editor.draft.saved', { when: relative(-30, 'second') }),
    )
  })

  // Die Auflage aus dem Auftrag: Wenn das Sichern scheitert, darf keine
  // relative Zeitangabe stehenbleiben, die einen Zwischenstand behauptet.
  it('nennt bei einem Fehlschlag keine Zeit, sondern den Fehlschlag', () => {
    render(<DraftStatus state={{ status: 'failed' }} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(t('editor.draft.failed'))
    expect(status.textContent).not.toContain(t('editor.draft.savedJustNow'))
    expect(status.textContent).not.toMatch(/\d/)
  })
})
