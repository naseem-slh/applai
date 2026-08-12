import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createFakeStorage, type FakeStorage } from '@/components/app/appContext.testutils'
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
    model: 'test-modell',
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
    storage: createFakeStorage(),
    ...overrides,
  }
}

/** Wartet, bis der Haken fertig ist — auch wenn er gar nichts gefragt hat. */
async function ready(result: { current: { status: string } }): Promise<void> {
  await waitFor(() => expect(result.current.status).toBe('ready'))
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

  it('legt beide Auswertungen ab, damit sie nicht zweimal bezahlt werden', async () => {
    const storage: FakeStorage = createFakeStorage()
    const props = options({ storage })
    const { result } = renderHook(() => useLetterAnalysis(props))

    await ready(result)

    expect(await storage.listCachedAnalyses()).toHaveLength(2)
  })

  // Der teuerste Posten der Anwendung: Beim bloßen Neuladen wurde bisher
  // beides erneut gefragt, in der Entwicklung wegen StrictMode sogar
  // doppelt. Auf einem Tarif, der Anfragen am Tag zählt, kaufte das nichts.
  it('fragt beim zweiten Mal gar nicht mehr, wenn Anzeige und Brief dieselben sind', async () => {
    const storage: FakeStorage = createFakeStorage()
    const firstProps = options({ storage })
    const first = renderHook(() => useLetterAnalysis(firstProps))
    await ready(first.result)
    first.unmount()

    const provider = createProvider()
    const secondProps = options({ storage, provider })
    const second = renderHook(() => useLetterAnalysis(secondProps))
    await ready(second.result)

    expect(provider.generate).not.toHaveBeenCalled()
    expect(second.result.current.jobAd?.company).toBe('Siemens')
    expect(second.result.current.style?.traits).toEqual(['sachlich', 'knapp'])
  })

  it('fragt die Anzeige neu, wenn ihr Text ein anderer ist, den Brief aber nicht', async () => {
    const storage: FakeStorage = createFakeStorage()
    const firstProps = options({ storage })
    const first = renderHook(() => useLetterAnalysis(firstProps))
    await ready(first.result)
    first.unmount()

    const provider = createProvider()
    const secondProps = options({ storage, provider, jobAdText: 'Eine ganz andere Anzeige.' })
    const second = renderHook(() => useLetterAnalysis(secondProps))
    await ready(second.result)

    // Genau ein Aufruf: die Anzeige. Das Stilprofil kam aus dem Speicher.
    expect(provider.generate).toHaveBeenCalledTimes(1)
  })

  it('benutzt den Eintrag eines anderen Modells nicht', async () => {
    const storage: FakeStorage = createFakeStorage()
    const firstProps = options({ storage })
    const first = renderHook(() => useLetterAnalysis(firstProps))
    await ready(first.result)
    first.unmount()

    const provider = createProvider({ model: 'anderes-modell' })
    const secondProps = options({ storage, provider })
    const second = renderHook(() => useLetterAnalysis(secondProps))
    await ready(second.result)

    expect(provider.generate).toHaveBeenCalledTimes(2)
  })

  it('fragt neu, wenn der Speicher Unbrauchbares enthält, statt daran zu scheitern', async () => {
    const storage: FakeStorage = createFakeStorage()
    const firstProps = options({ storage })
    const first = renderHook(() => useLetterAnalysis(firstProps))
    await ready(first.result)
    first.unmount()

    // Ein Eintrag, der die Form nicht mehr hält — etwa aus einer älteren
    // Fassung, deren Versionsnummer jemand zu erhöhen vergessen hat.
    for (const entry of await storage.listCachedAnalyses()) {
      await storage.saveCachedAnalysis({ ...entry, value: { kaputt: true } })
    }

    const provider = createProvider()
    const secondProps = options({ storage, provider })
    const second = renderHook(() => useLetterAnalysis(secondProps))
    await ready(second.result)

    expect(provider.generate).toHaveBeenCalledTimes(2)
    expect(second.result.current.jobAd?.company).toBe('Siemens')
  })
})
