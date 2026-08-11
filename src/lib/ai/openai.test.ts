import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from './errors'
import { OPENAI_ENDPOINT, OPENAI_MODEL, createOpenAiProvider } from './openai'

const REQUEST = {
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

describe('OpenAI-Adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('id, label und endpoint sind korrekt gesetzt', () => {
    const provider = createOpenAiProvider()
    expect(provider.id).toBe('openai')
    expect(provider.label.length).toBeGreaterThan(0)
    expect(provider.endpoint).toBe('https://api.openai.com')
  })

  it('erzeugt die richtige Anfrage-Struktur gegen die Responses-API: URL, Kopfzeilen und Rumpf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Antworttext' }] }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAiProvider()
    const result = await provider.generate({ ...REQUEST, temperature: 0.6, maxTokens: 500 }, 'mein-api-schluessel')

    expect(result).toBe('Antworttext')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${OPENAI_ENDPOINT}/v1/responses`)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers['authorization']).toBe('Bearer mein-api-schluessel')

    const body = JSON.parse(init.body as string) as {
      model: string
      input: { role: string; content: string }[]
      temperature?: number
      max_output_tokens?: number
      text?: { format: { type: string } }
    }
    expect(body.model).toBe(OPENAI_MODEL)
    expect(body.input).toEqual([
      { role: 'system', content: REQUEST.system },
      { role: 'user', content: REQUEST.user },
    ])
    expect(body.temperature).toBe(0.6)
    expect(body.max_output_tokens).toBe(500)
    expect(body.text).toBeUndefined()
  })

  it('setzt text.format auf json_object, wenn json: true angefordert wird', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAiProvider()
    await provider.generate({ ...REQUEST, json: true }, 'schluessel')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { text?: { format: { type: string } } }
    expect(body.text).toEqual({ format: { type: 'json_object' } })
  })

  it('HTTP 401 → invalid_key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { type: 'authentication_error', message: 'ungültig' } })),
    )

    const provider = createOpenAiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('invalid_key')
    expect(error?.provider).toBe('openai')
  })

  it('HTTP 429 (ohne insufficient_quota) → rate_limit mit retryAfterMs aus dem Retry-After-Header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(429, { error: { message: 'Rate limit reached for requests' } }, { 'retry-after': '7' }),
      ),
    )

    const provider = createOpenAiProvider(vi.fn().mockResolvedValue(undefined))
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('rate_limit')
    expect(error?.retryAfterMs).toBe(7_000)
  })

  it('HTTP 429 mit error.type = insufficient_quota → quota, ohne Wiederholungsversuch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { error: { type: 'insufficient_quota', message: 'Guthaben aufgebraucht' } }))
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const provider = createOpenAiProvider(sleep)
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('quota')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('ein Netzfehler (fetch wirft) → network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const provider = createOpenAiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('network')
    expect(error?.provider).toBe('openai')
  })

  it('bei rate_limit wird genau einmal wiederholt und der zweite (erfolgreiche) Versuch geliefert', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'rate limited' } }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Erfolg' }] }] }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const provider = createOpenAiProvider(sleep)
    const result = await provider.generate(REQUEST, 'schluessel')

    expect(result).toBe('Erfolg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2_000)
  })

  it('eine Ablehnung (refusal-Inhaltsblock) → blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'kann ich nicht' }] }] }),
      ),
    )

    const provider = createOpenAiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('blocked')
  })

  it('eine per Inhaltsfilter abgebrochene Antwort (incomplete_details.reason = content_filter) → blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { output: [], incomplete_details: { reason: 'content_filter' } })),
    )

    const provider = createOpenAiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('blocked')
  })

  it('ein unerwarteter HTTP-Status → unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: 'Serverfehler' } })))

    const provider = createOpenAiProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('unknown')
  })
})
