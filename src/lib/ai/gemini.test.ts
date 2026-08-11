import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from './errors'
import { GEMINI_ENDPOINT, GEMINI_MODEL, createGeminiProvider } from './gemini'

const REQUEST: Parameters<ReturnType<typeof createGeminiProvider>['generate']>[0] = {
  system: 'Du bist ein hilfreicher Assistent.',
  user: 'Formuliere den ersten Satz um.',
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const headerEntries = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerEntries.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Response
}

describe('Gemini-Adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('id, label und endpoint sind korrekt gesetzt', () => {
    const provider = createGeminiProvider()
    expect(provider.id).toBe('gemini')
    expect(provider.label.length).toBeGreaterThan(0)
    expect(provider.endpoint).toBe('https://generativelanguage.googleapis.com')
  })

  it('erzeugt die richtige Anfrage-Struktur: URL, Kopfzeilen und Rumpf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Antworttext' }] }, finishReason: 'STOP' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = createGeminiProvider()
    const result = await provider.generate({ ...REQUEST, temperature: 0.4, maxTokens: 800 }, 'mein-api-schluessel')

    expect(result).toBe('Antworttext')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(`${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent`)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-goog-api-key']).toBe('mein-api-schluessel')

    const body = JSON.parse(init.body as string) as {
      contents: { role: string; parts: { text: string }[] }[]
      systemInstruction: { parts: { text: string }[] }
      generationConfig: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string }
    }
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: REQUEST.user }] }])
    expect(body.systemInstruction).toEqual({ parts: [{ text: REQUEST.system }] })
    expect(body.generationConfig.temperature).toBe(0.4)
    expect(body.generationConfig.maxOutputTokens).toBe(800)
    expect(body.generationConfig.responseMimeType).toBeUndefined()
  })

  it('setzt responseMimeType auf application/json, wenn json: true angefordert wird', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createGeminiProvider()
    await provider.generate({ ...REQUEST, json: true }, 'schluessel')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { generationConfig: { responseMimeType?: string } }
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('HTTP 401 → invalid_key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: { code: 'authentication', message: 'API key not valid.' } }),
      ),
    )

    const provider = createGeminiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error).toBeInstanceOf(LlmError)
    expect(error?.kind).toBe('invalid_key')
    expect(error?.provider).toBe('gemini')
  })

  it('HTTP 429 (rate_limit_exceeded) → rate_limit mit retryAfterMs aus dem Retry-After-Header (Sekunden-Form)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          429,
          { error: { code: 'rate_limit_exceeded', message: 'zu viele Anfragen' } },
          { 'retry-after': '12' },
        ),
      ),
    )

    const provider = createGeminiProvider(vi.fn().mockResolvedValue(undefined))
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    // Zwei Versuche liefen (einmal Wiederholung), beide 429 → am Ende schlägt der Aufruf fehl.
    expect(error).toBeInstanceOf(LlmError)
    expect(error?.kind).toBe('rate_limit')
    expect(error?.retryAfterMs).toBe(12_000)
  })

  it('HTTP 429 (quota_exceeded) → quota, ohne Wiederholungsversuch (fetch nur einmal aufgerufen)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(429, { error: { code: 'quota_exceeded', message: 'Tageskontingent aufgebraucht' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const provider = createGeminiProvider(sleep)
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('quota')
    expect(error?.provider).toBe('gemini')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('ein Netzfehler (fetch wirft) → network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const provider = createGeminiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error).toBeInstanceOf(LlmError)
    expect(error?.kind).toBe('network')
    expect(error?.provider).toBe('gemini')
  })

  it('bei rate_limit wird genau einmal wiederholt und der zweite (erfolgreiche) Versuch geliefert', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, { error: { code: 'rate_limit_exceeded' } }, { 'retry-after': '3' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'Erfolg beim zweiten Versuch' }] } }] }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const provider = createGeminiProvider(sleep)
    const result = await provider.generate(REQUEST, 'schluessel')

    expect(result).toBe('Erfolg beim zweiten Versuch')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(3_000)
  })

  it('blockiert die Anfrage selbst (promptFeedback.blockReason) → blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] })),
    )

    const provider = createGeminiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('blocked')
  })

  it('blockiert die Antwort (finishReason SAFETY) → blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'SAFETY' }] }),
      ),
    )

    const provider = createGeminiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('blocked')
  })

  it('ein unerwarteter HTTP-Status → unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: 'Serverfehler' } })))

    const provider = createGeminiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('unknown')
  })
})
