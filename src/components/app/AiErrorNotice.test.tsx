import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import i18n from '@/lib/i18n/i18n'
import { AiErrorNotice, RATE_LIMIT_COOLDOWN_MS } from './AiErrorNotice'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

describe('AiErrorNotice', () => {
  it('zeigt die übersetzte Meldung zur Fehlerart', () => {
    render(<AiErrorNotice error={new LlmError('network', 'gemini', 'egal')} />)
    expect(screen.getByRole('alert')).toHaveTextContent(t('ai.errors.network'))
  })

  it('zeigt den Wortlaut des Anbieters als aufklappbare Auskunft', () => {
    render(
      <AiErrorNotice
        error={
          new LlmError('rate_limit', 'gemini', 'egal', undefined, {
            providerMessage: 'Quota exceeded for requests per day.',
          })
        }
      />,
    )

    expect(screen.getByText(t('ai.errors.providerDetails'))).toBeInTheDocument()
    expect(screen.getByText('Quota exceeded for requests per day.')).toBeInTheDocument()
  })

  it('lässt die Auskunft weg, wenn der Anbieter nichts mitgeschickt hat', () => {
    render(<AiErrorNotice error={new LlmError('network', 'gemini', 'egal')} />)
    expect(screen.queryByText(t('ai.errors.providerDetails'))).not.toBeInTheDocument()
  })
})

describe('AiErrorNotice — Wiederholung', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('bietet den Knopf sofort an, wenn die Fehlerart nichts mit der Anfragerate zu tun hat', () => {
    const onRetry = vi.fn()
    render(
      <AiErrorNotice
        error={new LlmError('network', 'gemini', 'egal')}
        onRetry={onRetry}
        retryLabel="Nochmal"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nochmal' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('sperrt den Knopf nach einer Ratenbegrenzung und nennt die verbleibende Zeit', () => {
    render(
      <AiErrorNotice
        error={new LlmError('rate_limit', 'gemini', 'egal', 30_000)}
        onRetry={vi.fn()}
        retryLabel="Nochmal"
      />,
    )

    expect(screen.getByRole('button', { name: t('ai.errors.retryIn', { seconds: 30 }) })).toBeDisabled()
  })

  it('zählt herunter und gibt den Knopf frei, wenn die Zeit um ist', () => {
    const onRetry = vi.fn()
    render(
      <AiErrorNotice
        error={new LlmError('rate_limit', 'gemini', 'egal', 3_000)}
        onRetry={onRetry}
        retryLabel="Nochmal"
      />,
    )

    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    const button = screen.getByRole('button', { name: 'Nochmal' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('nimmt eine Vorgabe, wenn der Anbieter keine Wartezeit genannt hat', () => {
    render(
      <AiErrorNotice
        error={new LlmError('rate_limit', 'gemini', 'egal')}
        onRetry={vi.fn()}
        retryLabel="Nochmal"
      />,
    )

    expect(
      screen.getByRole('button', { name: t('ai.errors.retryIn', { seconds: RATE_LIMIT_COOLDOWN_MS / 1000 }) }),
    ).toBeDisabled()
  })

  it('bietet bei aufgebrauchtem Kontingent gar keine Wiederholung an', () => {
    render(
      <AiErrorNotice
        error={new LlmError('quota', 'gemini', 'egal')}
        onRetry={vi.fn()}
        retryLabel="Nochmal"
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
