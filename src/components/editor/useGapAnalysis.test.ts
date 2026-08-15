import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import type { LlmProvider } from '@/lib/ai/provider'
import type { JobAd } from '@/lib/domain/jobAd'
import { useGapAnalysis, type GapAnalysisOptions } from './useGapAnalysis'

const JOB_AD: JobAd = {
  language: 'de',
  company: 'Musterwerk',
  position: 'Entwicklerin',
  contactPerson: null,
  salutation: null,
  requirements: [
    { text: 'Erfahrung mit TypeScript', kind: 'skill' },
    { text: 'Abgeschlossenes Studium', kind: 'education' },
  ],
  tone: 'sachlich',
}

const ANSWER = JSON.stringify({
  assessments: [
    { index: 0, status: 'covered', evidence: 'Fünf Jahre TypeScript im Lebenslauf' },
    { index: 1, status: 'missing', evidence: null },
  ],
})

function createProvider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'gemini',
    label: 'Gemini',
    model: 'test-modell',
    endpoint: 'https://generativelanguage.googleapis.com',
    generate: vi.fn(() => Promise.resolve(ANSWER)),
    ...overrides,
  }
}

function options(overrides: Partial<GapAnalysisOptions> = {}): GapAnalysisOptions {
  return {
    jobAd: JOB_AD,
    facts: 'Lebenslauf von Marlene Ostwald, fünf Jahre TypeScript.',
    provider: createProvider(),
    apiKey: 'test-key',
    privacy: { enabled: true, userName: 'Marlene Ostwald' },
    ...overrides,
  }
}

describe('useGapAnalysis', () => {
  it('fragt nichts, bis es angefordert wird', () => {
    const provider = createProvider()
    const { result } = renderHook(() => useGapAnalysis(options({ provider })))

    expect(result.current.status).toBe('idle')
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it('liefert genau einen Eintrag je Anforderung, in Eingabereihenfolge', async () => {
    const { result } = renderHook(() => useGapAnalysis(options()))

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0]!.requirement.text).toBe('Erfahrung mit TypeScript')
    expect(result.current.entries[0]!.status).toBe('covered')
    expect(result.current.entries[1]!.status).toBe('missing')
    expect(result.current.entries[1]!.evidence).toBeNull()
  })

  it('ersetzt persönliche Daten in der Faktenbasis vor dem Senden', async () => {
    const provider = createProvider()
    const { result } = renderHook(() => useGapAnalysis(options({ provider })))

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const sent = vi.mocked(provider.generate).mock.calls[0]![0].user
    expect(sent).not.toContain('Marlene Ostwald')
    expect(sent).toContain('[NAME]')
  })

  it('fragt gar nicht ohne Schlüssel oder ohne ausgewertete Anzeige', () => {
    const provider = createProvider()
    const withoutKey = renderHook(() => useGapAnalysis(options({ provider, apiKey: null })))
    act(() => withoutKey.result.current.run())

    const withoutAd = renderHook(() => useGapAnalysis(options({ provider, jobAd: null })))
    act(() => withoutAd.result.current.run())

    expect(provider.generate).not.toHaveBeenCalled()
    expect(withoutKey.result.current.status).toBe('idle')
  })

  it('meldet einen Fehler und lässt ihn wiederholen', async () => {
    const generate = vi
      .fn<LlmProvider['generate']>()
      .mockRejectedValueOnce(new LlmError('quota', 'gemini', 'aufgebraucht'))
      .mockResolvedValueOnce(ANSWER)
    const { result } = renderHook(() => useGapAnalysis(options({ provider: createProvider({ generate }) })))

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBeInstanceOf(LlmError)

    act(() => result.current.run())
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
    const { result, unmount } = renderHook(() => useGapAnalysis(options({ provider })))

    act(() => result.current.run())
    await waitFor(() => expect(seen).toBeDefined())

    unmount()

    expect(seen!.aborted).toBe(true)
  })

  it('behält seine Identität, wenn sich die Faktenbasis ändert', () => {
    const { result, rerender } = renderHook((props: GapAnalysisOptions) => useGapAnalysis(props), {
      initialProps: options(),
    })
    const first = result.current.run

    rerender(options({ facts: 'Ein anderer Lebenslauf.' }))

    expect(result.current.run).toBe(first)
  })
})
