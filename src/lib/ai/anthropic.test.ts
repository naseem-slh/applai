import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from './errors'
import {
  ANTHROPIC_ENDPOINT,
  ANTHROPIC_MODEL,
  ANTHROPIC_VERSION,
  createAnthropicProvider,
} from './anthropic'
import { mockFetchResponse } from './mockFetchResponse'

const REQUEST = {
  system: 'Du bist ein hilfreicher Assistent.',
  user: 'Formuliere den ersten Satz um.',
}

describe('Anthropic-Adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('id, label und endpoint sind korrekt gesetzt', () => {
    const provider = createAnthropicProvider()
    expect(provider.id).toBe('anthropic')
    expect(provider.label.length).toBeGreaterThan(0)
    expect(provider.endpoint).toBe('https://api.anthropic.com')
  })

  it('erzeugt die richtige Anfrage-Struktur: URL, Kopfzeilen (inkl. Browserzugriffs-Header) und Rumpf', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: [{ type: 'text', text: 'Antworttext' }], stop_reason: 'end_turn' }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createAnthropicProvider()
    const result = await provider.generate({ ...REQUEST, temperature: 0.5, maxTokens: 900 }, 'mein-api-schluessel')

    expect(result).toBe('Antworttext')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${ANTHROPIC_ENDPOINT}/v1/messages`)
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-api-key']).toBe('mein-api-schluessel')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    // Direkter Browserzugriff: siehe Aufgabenstellung — ohne diesen Header
    // lehnt Anthropic CORS-Anfragen aus dem Browser ab (bestätigt gegen die
    // aktuelle Dokumentation, siehe task-7-report.md).
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')

    const body = JSON.parse(init.body as string) as {
      model: string
      max_tokens: number
      system: string
      messages: { role: string; content: string }[]
    }
    expect(body.model).toBe(ANTHROPIC_MODEL)
    expect(body.max_tokens).toBe(900)
    expect(body.system).toBe(REQUEST.system)
    expect(body.messages).toEqual([{ role: 'user', content: REQUEST.user }])
  })

  // Fix-Runde 1, Important (temperature): ein von der Vorgabe abweichender
  // Wert liefert auf ANTHROPIC_MODEL laut aktueller Anthropic-Dokumentation
  // einen HTTP-400-Fehler ("Sampling parameters rejected") — siehe
  // LlmRequest.temperature in provider.ts.
  it('sendet niemals temperature, auch wenn LlmRequest.temperature gesetzt ist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn' }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createAnthropicProvider()
    await provider.generate({ ...REQUEST, temperature: 0.9 }, 'schluessel')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect('temperature' in body).toBe(false)
  })

  it('setzt einen sinnvollen Standardwert für max_tokens, wenn maxTokens nicht angegeben ist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn' }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createAnthropicProvider()
    await provider.generate(REQUEST, 'schluessel')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { max_tokens: number }
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('hängt bei json: true eine Anweisung an das Systemprompt an, da Anthropic ohne Schema keinen schemafreien JSON-Modus kennt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createAnthropicProvider()
    await provider.generate({ ...REQUEST, json: true }, 'schluessel')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { system: string }
    expect(body.system.startsWith(REQUEST.system)).toBe(true)
    expect(body.system.toLowerCase()).toContain('json')
    expect(body.system.length).toBeGreaterThan(REQUEST.system.length)
  })

  it('HTTP 401 → invalid_key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse(401, { error: { type: 'authentication_error', message: 'ungültig' } })),
    )

    const provider = createAnthropicProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('invalid_key')
    expect(error?.provider).toBe('anthropic')
  })

  it('HTTP 429 → rate_limit mit retryAfterMs aus dem Retry-After-Header (HTTP-Datums-Form)', async () => {
    const retryAt = new Date(Date.now() + 20_000).toUTCString()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockFetchResponse(429, { error: { type: 'rate_limit_error', message: 'zu viele Anfragen' } }, { 'retry-after': retryAt }),
      ),
    )

    const provider = createAnthropicProvider(vi.fn().mockResolvedValue(undefined))
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('rate_limit')
    // Toleranz für die Testlaufzeit zwischen new Date() oben und dem
    // tatsächlichen Parsen in parseRetryAfterMs.
    expect(error?.retryAfterMs).toBeGreaterThan(15_000)
    expect(error?.retryAfterMs).toBeLessThanOrEqual(20_000)
  })

  it('ein Netzfehler (fetch wirft) → network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const provider = createAnthropicProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('network')
    expect(error?.provider).toBe('anthropic')
  })

  it('bei rate_limit wird genau einmal wiederholt und der zweite (erfolgreiche) Versuch geliefert', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse(429, { error: { type: 'rate_limit_error' } }, { 'retry-after': '4' }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, { content: [{ type: 'text', text: 'Erfolg' }], stop_reason: 'end_turn' }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const provider = createAnthropicProvider(sleep)
    const result = await provider.generate(REQUEST, 'schluessel')

    expect(result).toBe('Erfolg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(4_000, undefined)
  })

  it('stop_reason "refusal" → blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse(200, { content: [], stop_reason: 'refusal' })),
    )

    const provider = createAnthropicProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('blocked')
  })

  it('ein unerwarteter HTTP-Status → unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(529, { error: { message: 'überlastet' } })))

    const provider = createAnthropicProvider()
    const error = await provider.generate(REQUEST, 'schluessel').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('unknown')
  })
})
