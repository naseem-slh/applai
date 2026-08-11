import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RATE_LIMIT_RETRY_MS,
  LlmError,
  RETRY_AFTER_CAP_MS,
  isAbortError,
  parseRetryAfterMs,
  withSingleRateLimitRetry,
} from './errors'

describe('LlmError', () => {
  it('trägt Fehlerart, Anbieter und optionale Wartezeit und ist eine echte Error-Instanz', () => {
    const error = new LlmError('rate_limit', 'gemini', 'Testnachricht', 1234)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(LlmError)
    expect(error.name).toBe('LlmError')
    expect(error.kind).toBe('rate_limit')
    expect(error.provider).toBe('gemini')
    expect(error.message).toBe('Testnachricht')
    expect(error.retryAfterMs).toBe(1234)
  })

  it('retryAfterMs bleibt undefined, wenn es nicht übergeben wird', () => {
    const error = new LlmError('invalid_key', 'openai', 'Testnachricht')
    expect(error.retryAfterMs).toBeUndefined()
  })
})

describe('parseRetryAfterMs', () => {
  const NOW = Date.parse('2026-08-11T12:00:00.000Z')

  it('liest die Sekunden-Form (Ganzzahl) und wandelt in Millisekunden um', () => {
    expect(parseRetryAfterMs('30', NOW)).toBe(30_000)
  })

  it('liest führende/folgende Leerzeichen der Sekunden-Form korrekt', () => {
    expect(parseRetryAfterMs('  5 ', NOW)).toBe(5_000)
  })

  it('liest die HTTP-Datums-Form und berechnet die Differenz zu "jetzt"', () => {
    const future = new Date(NOW + 45_000).toUTCString()
    expect(parseRetryAfterMs(future, NOW)).toBe(45_000)
  })

  it('liegt das HTTP-Datum in der Vergangenheit, wird 0 geliefert statt eines negativen Werts', () => {
    const past = new Date(NOW - 10_000).toUTCString()
    expect(parseRetryAfterMs(past, NOW)).toBe(0)
  })

  it('behandelt einen nicht auswertbaren Wert als abwesend (undefined), nicht als 0', () => {
    expect(parseRetryAfterMs('kein-gueltiger-wert', NOW)).toBeUndefined()
  })

  it('liefert undefined bei fehlendem Header (null)', () => {
    expect(parseRetryAfterMs(null, NOW)).toBeUndefined()
  })

  it('liefert undefined bei leerem String', () => {
    expect(parseRetryAfterMs('', NOW)).toBeUndefined()
  })

  it('deckelt eine übergroße Sekunden-Angabe auf RETRY_AFTER_CAP_MS', () => {
    expect(parseRetryAfterMs('999999', NOW)).toBe(RETRY_AFTER_CAP_MS)
  })

  it('deckelt ein weit in der Zukunft liegendes HTTP-Datum auf RETRY_AFTER_CAP_MS', () => {
    const farFuture = new Date(NOW + 999_999_000).toUTCString()
    expect(parseRetryAfterMs(farFuture, NOW)).toBe(RETRY_AFTER_CAP_MS)
  })
})

describe('withSingleRateLimitRetry', () => {
  it('wiederholt bei rate_limit genau einmal und liefert das Ergebnis des zweiten Versuchs', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'zu viele Anfragen', 5_000))
      .mockResolvedValueOnce('Ergebnis nach Wiederholung')
    const sleep = vi.fn().mockResolvedValue(undefined)

    const result = await withSingleRateLimitRetry(attempt, sleep)

    expect(result).toBe('Ergebnis nach Wiederholung')
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(5_000)
  })

  it('nutzt DEFAULT_RATE_LIMIT_RETRY_MS, wenn der Fehler keine retryAfterMs mitbringt', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limit', 'openai', 'zu viele Anfragen'))
      .mockResolvedValueOnce('ok')
    const sleep = vi.fn().mockResolvedValue(undefined)

    await withSingleRateLimitRetry(attempt, sleep)

    expect(sleep).toHaveBeenCalledWith(DEFAULT_RATE_LIMIT_RETRY_MS)
  })

  it('wiederholt NICHT bei invalid_key, quota, blocked, network oder unknown', async () => {
    const kinds = ['invalid_key', 'quota', 'blocked', 'network', 'unknown'] as const
    for (const kind of kinds) {
      const attempt = vi.fn().mockRejectedValueOnce(new LlmError(kind, 'anthropic', 'Fehler'))
      const sleep = vi.fn().mockResolvedValue(undefined)

      await expect(withSingleRateLimitRetry(attempt, sleep)).rejects.toMatchObject({ kind })
      expect(attempt).toHaveBeenCalledTimes(1)
      expect(sleep).not.toHaveBeenCalled()
    }
  })

  it('wiederholt bei einem zweiten rate_limit-Fehler nicht noch einmal — genau ein Versuch mehr, keine Schleife', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'erster Fehler', 1_000))
      .mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'zweiter Fehler', 2_000))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withSingleRateLimitRetry(attempt, sleep)).rejects.toMatchObject({ message: 'zweiter Fehler' })
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('reicht Fehler, die keine LlmError sind (z. B. ein Abbruch), unverändert und ohne Wiederholung durch', async () => {
    const abortError = new DOMException('Abgebrochen', 'AbortError')
    const attempt = vi.fn().mockRejectedValueOnce(abortError)
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withSingleRateLimitRetry(attempt, sleep)).rejects.toBe(abortError)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('wartet in Tests nie wirklich — die injizierte sleep-Funktion steuert die Wartezeit', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'x', 60_000))
      .mockResolvedValueOnce('ok')
    let sleepResolve: (() => void) | undefined
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          sleepResolve = resolve
        }),
    )

    const resultPromise = withSingleRateLimitRetry(attempt, sleep)
    // Dem ersten (abgelehnten) Versuch Gelegenheit geben, den catch-Zweig zu
    // erreichen, bevor wir prüfen — ohne echtes Warten (kein setTimeout/Timer
    // beteiligt, nur ein Mikrotask-Tick).
    await Promise.resolve()
    await Promise.resolve()
    expect(sleep).toHaveBeenCalledWith(60_000)
    sleepResolve?.()

    await expect(resultPromise).resolves.toBe('ok')
  })
})

describe('isAbortError', () => {
  it('erkennt eine DOMException mit name "AbortError"', () => {
    expect(isAbortError(new DOMException('Abgebrochen', 'AbortError'))).toBe(true)
  })

  it('erkennt ein Error-Objekt mit name "AbortError"', () => {
    const error = new Error('Abgebrochen')
    error.name = 'AbortError'
    expect(isAbortError(error)).toBe(true)
  })

  it('verneint für gewöhnliche Fehler und Nicht-Fehler-Werte', () => {
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAbortError('ein String')).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})
