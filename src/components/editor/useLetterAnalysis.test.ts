import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import type { LlmProvider } from '@/lib/ai/provider'
import { useLetterAnalysis, type LetterAnalysisOptions } from './useLetterAnalysis'

const JOB_AD_ANSWER = JSON.stringify({
  language: 'de',
  company: 'Siemens',
  position: 'Entwicklerin',
  // Ohne Ansprechpartner MUSS die Anrede null sein (Aufgabe 9, G10).
  contactPerson: null,
  salutation: null,
  requirements: [{ text: 'Erfahrung mit TypeScript', kind: 'skill' }],
  tone: 'sachlich',
})

const STYLE_ANSWER = JSON.stringify({
  formality: 80,
  traits: ['sachlich', 'knapp'],
  // Muss wörtlich im übergebenen Anschreiben stehen (Aufgabe 10).
  sample: 'Ich schreibe Ihnen wegen der Stelle.',
})

const LETTER_TEXT = 'Marlene Ostwald\nmarlene@example.org\n\nIch schreibe Ihnen wegen der Stelle.'

/** Welcher der beiden gleichzeitigen Aufrufe ist das? */
function isJobAdCall(req: { system: string }): boolean {
  return req.system.startsWith('Du analysierst eine Stellenanzeige')
}

/**
 * Ein Anbieter, der auf den Systemprompt schaut und je nach Aufgabe
 * antwortet. Beide Aufrufe laufen gleichzeitig; eine Reihenfolge-Attrappe
 * (erst diese, dann jene Antwort) würde nur die Reihenfolge prüfen, die der
 * Haken gerade zufällig hat.
 */
function createProvider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'gemini',
    label: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com',
    generate: vi.fn((req: { system: string; user: string }) =>
      Promise.resolve(isJobAdCall(req) ? JOB_AD_ANSWER : STYLE_ANSWER),
    ),
    ...overrides,
  }
}

function options(overrides: Partial<LetterAnalysisOptions> = {}): LetterAnalysisOptions {
  return {
    jobAdText: 'Wir suchen eine Entwicklerin bei Siemens.',
    letterText: LETTER_TEXT,
    provider: createProvider(),
    apiKey: 'test-key',
    privacy: { enabled: true, userName: 'Marlene Ostwald' },
    ...overrides,
  }
}

describe('useLetterAnalysis', () => {
  it('wertet Anzeige und Stilprofil beim Laden aus', async () => {
    const { result } = renderHook((props: LetterAnalysisOptions) => useLetterAnalysis(props), {
      initialProps: options(),
    })

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.jobAd?.company).toBe('Siemens')
    expect(result.current.style?.traits).toEqual(['sachlich', 'knapp'])
    expect(result.current.error).toBeNull()
  })

  it('fragt gar nicht, solange kein Schlüssel im Arbeitsspeicher liegt', () => {
    const provider = createProvider()
    const { result } = renderHook(() => useLetterAnalysis(options({ provider, apiKey: null })))

    expect(result.current.status).toBe('idle')
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it('ersetzt persönliche Daten im Anschreiben vor dem Senden und tauscht sie im Ergebnis zurück', async () => {
    const provider = createProvider({
      generate: vi.fn((req: { system: string; user: string }) => {
        if (isJobAdCall(req)) return Promise.resolve(JOB_AD_ANSWER)
        // Das Modell sieht den Platzhalter und zitiert ihn wörtlich zurück
        // (Aufgabe 10 prüft `sample` gegen genau diesen Text).
        return Promise.resolve(
          JSON.stringify({
            formality: 80,
            traits: ['schreibt als [NAME]'],
            sample: 'Ich schreibe Ihnen wegen der Stelle.',
          }),
        )
      }),
    })

    const { result } = renderHook(() => useLetterAnalysis(options({ provider })))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const styleCall = vi
      .mocked(provider.generate)
      .mock.calls.find(([req]) => !isJobAdCall(req))
    expect(styleCall![0].user).not.toContain('Marlene Ostwald')
    expect(styleCall![0].user).toContain('[NAME]')
    expect(result.current.style?.traits).toEqual(['schreibt als Marlene Ostwald'])
  })

  it('sendet den Klartext, wenn die Anonymisierung abgeschaltet ist', async () => {
    const provider = createProvider()
    const { result } = renderHook(() =>
      useLetterAnalysis(options({ provider, privacy: { enabled: false, userName: 'Marlene Ostwald' } })),
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const styleCall = vi
      .mocked(provider.generate)
      .mock.calls.find(([req]) => !isJobAdCall(req))
    expect(styleCall![0].user).toContain('Marlene Ostwald')
  })

  it('meldet einen Fehler, ohne den Entwicklertext zu behalten, und versucht es auf Wunsch erneut', async () => {
    let calls = 0
    const provider = createProvider({
      generate: vi.fn((req: { system: string; user: string }) => {
        calls++
        if (calls <= 2) return Promise.reject(new LlmError('rate_limit', 'gemini', 'zu viele'))
        return Promise.resolve(isJobAdCall(req) ? JOB_AD_ANSWER : STYLE_ANSWER)
      }),
    })

    const { result } = renderHook(() => useLetterAnalysis(options({ provider })))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBeInstanceOf(LlmError)

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeNull()
  })

  it('bricht einen laufenden Aufruf ab, wenn die Ansicht verlassen wird', async () => {
    let seen: AbortSignal | undefined
    const provider = createProvider({
      generate: vi.fn(
        (_req, _key, signal?: AbortSignal) =>
          new Promise<string>(() => {
            seen = signal
          }),
      ),
    })

    const { unmount } = renderHook(() => useLetterAnalysis(options({ provider })))
    await waitFor(() => expect(seen).toBeDefined())
    expect(seen!.aborted).toBe(false)

    unmount()

    expect(seen!.aborted).toBe(true)
  })
})
