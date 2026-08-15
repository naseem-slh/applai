import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LlmError,
  RETRY_AFTER_CAP_MS,
  fetchOrNetworkError,
  isAbortError,
  parseRetryAfterMs,
  realSleep,
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

  it('trägt den Wortlaut des Anbieters mit, damit die Oberfläche ihn zeigen kann', () => {
    const error = new LlmError('rate_limit', 'gemini', 'Testnachricht', undefined, {
      providerMessage: 'Quota exceeded for quota metric ... per day',
    })
    expect(error.providerMessage).toBe('Quota exceeded for quota metric ... per day')
  })

  it('providerMessage bleibt undefined, wenn der Anbieter nichts mitgeschickt hat', () => {
    expect(new LlmError('network', 'gemini', 'Testnachricht').providerMessage).toBeUndefined()
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
    // Kein Signal übergeben -> withSingleRateLimitRetry reicht `undefined` an sleep weiter.
    expect(sleep).toHaveBeenCalledWith(5_000, undefined)
  })

  // Früher wurde hier blind nach zwei Sekunden wiederholt. Bei einer
  // Minutengrenze — Geminis kostenloser Tarif erlaubt fünf Anfragen je
  // Minute — fällt dieser Versuch zwangsläufig in dasselbe geschlossene
  // Fenster: Er kann nicht gelingen und verdoppelt nur den Verbrauch.
  it('wiederholt NICHT, wenn der Anbieter keine Wartezeit genannt hat', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValue(new LlmError('rate_limit', 'openai', 'zu viele Anfragen'))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withSingleRateLimitRetry(attempt, sleep)).rejects.toBeInstanceOf(LlmError)

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('wiederholt auch dann nicht, wenn der Anbieter 0 Millisekunden nennt — das ist keine Wartezeit', async () => {
    const attempt = vi.fn().mockRejectedValue(new LlmError('rate_limit', 'gemini', 'zu viele', 0))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withSingleRateLimitRetry(attempt, sleep)).rejects.toBeInstanceOf(LlmError)

    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('reicht ein übergebenes AbortSignal unverändert an die sleep-Funktion weiter', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'zu viele Anfragen', 5_000))
      .mockResolvedValueOnce('ok')
    const sleep = vi.fn().mockResolvedValue(undefined)
    const controller = new AbortController()

    await withSingleRateLimitRetry(attempt, sleep, controller.signal)

    expect(sleep).toHaveBeenCalledWith(5_000, controller.signal)
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
    expect(sleep).toHaveBeenCalledWith(60_000, undefined)
    sleepResolve?.()

    await expect(resultPromise).resolves.toBe('ok')
  })

  // Fix-Runde 1, Important 1: ein Abbruch während der Wartezeit vor dem
  // Wiederholungsversuch muss sofort ablehnen, ohne die volle Wartezeit
  // (hier 60s, RETRY_AFTER_CAP_MS) verstreichen zu lassen. Nutzt bewusst die
  // echte `realSleep`, nicht einen Mock, um den tatsächlichen Produktionspfad
  // zu beweisen — mit Vitests Fake-Timern, damit dabei nie wirklich gewartet
  // wird.
  it('bricht während der echten Wartezeit (realSleep) sofort ab, ohne die volle Wartezeit verstreichen zu lassen', async () => {
    vi.useFakeTimers()
    try {
      const attempt = vi.fn().mockRejectedValueOnce(new LlmError('rate_limit', 'gemini', 'x', 60_000))
      const controller = new AbortController()

      const resultPromise = withSingleRateLimitRetry(attempt, realSleep, controller.signal)
      const rejection = expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })

      // 0ms fortschalten: löst keinen Timer aus, spült aber die Mikrotasks
      // zwischen dem abgelehnten ersten Versuch und dem Aufruf von
      // realSleep(60_000, signal) — danach ist der Abbruch-Listener sicher
      // registriert.
      await vi.advanceTimersByTimeAsync(0)
      controller.abort()

      await rejection
      // Kein zweiter Versuch: der Abbruch hat die Wartezeit beendet, bevor
      // attempt() erneut aufgerufen wurde.
      expect(attempt).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('realSleep', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('löst nach ms auf, wenn kein Signal übergeben wird', async () => {
    vi.useFakeTimers()
    const promise = realSleep(1_000)
    let resolved = false
    void promise.then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(true)
  })

  it('lehnt sofort ab, wenn das Signal bereits vor dem Aufruf abgebrochen wurde — ganz ohne Timer', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(realSleep(60_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('lehnt sofort ab, sobald das Signal während der Wartezeit abbricht, ohne die volle Zeit verstreichen zu lassen', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()

    const promise = realSleep(60_000, controller.signal)
    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })

    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await rejection
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

// Fix-Runde 1, Important 2: gemeinsamer fetch-Wrapper statt dreifach
// dupliziertem try/catch in gemini.ts/openai.ts/anthropic.ts.
describe('fetchOrNetworkError', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('liefert die Response unverändert, wenn fetch erfolgreich war — unabhängig von response.ok', async () => {
    const response = { ok: false, status: 500 } as unknown as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(fetchOrNetworkError('https://example.test', {}, 'gemini', 'Gemini')).resolves.toBe(response)
  })

  it('verpackt einen echten Netzfehler in LlmError("network", ...)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await fetchOrNetworkError('https://example.test', {}, 'openai', 'OpenAI').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error).toBeInstanceOf(LlmError)
    expect(error?.kind).toBe('network')
    expect(error?.provider).toBe('openai')
  })

  it('reicht einen Abbruch (AbortError) unverändert durch, ohne ihn in LlmError zu verpacken', async () => {
    const abortError = new DOMException('Abgebrochen', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(fetchOrNetworkError('https://example.test', {}, 'anthropic', 'Anthropic')).rejects.toBe(abortError)
  })
})
