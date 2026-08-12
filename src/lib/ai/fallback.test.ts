import { describe, expect, it, vi } from 'vitest'
import { LlmError, type LlmErrorKind } from './errors'
import { withModelFallback } from './fallback'
import type { LlmProvider } from './provider'

// Alles, was keine Zeichenkette ist, gilt als Fehlschlag. Bewusst nicht
// `instanceof Error`: Eine `DOMException` ist in jsdom keine Error-Instanz,
// und genau sie steht für den Abbruch durch den Nutzer.
function stub(model: string, answer: unknown): LlmProvider {
  return {
    id: 'gemini',
    label: 'Gemini',
    model,
    endpoint: 'https://generativelanguage.googleapis.com',
    generate: vi.fn(() =>
      typeof answer === 'string' ? Promise.resolve(answer) : Promise.reject(answer),
    ),
  }
}

const REQUEST = { system: 'S', user: 'U' }

function limited(model: string, kind: LlmErrorKind = 'rate_limit'): LlmProvider {
  return stub(model, new LlmError(kind, 'gemini', 'erschöpft'))
}

describe('withModelFallback', () => {
  it('nimmt das erste Modell, solange es antwortet', async () => {
    const second = limited('zweitwahl')
    const chain = withModelFallback([stub('erstwahl', 'gut'), second])

    expect(await chain.generate(REQUEST, 'k')).toBe('gut')
    expect(second.generate).not.toHaveBeenCalled()
  })

  it('geht weiter, wenn das Kontingent des ersten erschöpft ist', async () => {
    const chain = withModelFallback([limited('erstwahl', 'quota'), stub('zweitwahl', 'gut')])
    expect(await chain.generate(REQUEST, 'k')).toBe('gut')
  })

  it('geht über beliebig viele Modelle', async () => {
    const chain = withModelFallback([
      limited('eins'),
      limited('zwei'),
      limited('drei'),
      stub('vier', 'endlich'),
    ])
    expect(await chain.generate(REQUEST, 'k')).toBe('endlich')
  })

  it('probiert auch nach einer unerwarteten Antwort weiter — ein falscher Modellname ist so einer', async () => {
    const chain = withModelFallback([limited('tippfehler', 'unknown'), stub('zweitwahl', 'gut')])
    expect(await chain.generate(REQUEST, 'k')).toBe('gut')
  })

  // Kein anderes Modell repariert einen ungültigen Schlüssel. Die Kette
  // durchzugehen verbrennte nur je eine Anfrage und verzögerte die Meldung,
  // die der Nutzer braucht.
  it.each(['invalid_key', 'network', 'blocked'] as const)(
    'bricht bei %s sofort ab, statt die Kette zu verbrennen',
    async (kind) => {
      const second = limited('zweitwahl')
      const chain = withModelFallback([limited('erstwahl', kind), second])

      await expect(chain.generate(REQUEST, 'k')).rejects.toBeInstanceOf(LlmError)
      expect(second.generate).not.toHaveBeenCalled()
    },
  )

  it('reicht einen Abbruch des Nutzers unverändert durch', async () => {
    const abort = new DOMException('Abgebrochen', 'AbortError')
    const second = limited('zweitwahl')
    const chain = withModelFallback([stub('erstwahl', abort), second])

    await expect(chain.generate(REQUEST, 'k')).rejects.toThrow('Abgebrochen')
    expect(second.generate).not.toHaveBeenCalled()
  })

  // Der letzte Fehler ist der aussagekräftigste: Er beschreibt, woran es
  // beim letzten Versuch lag, statt bei einem längst überholten.
  it('meldet den Fehler des letzten Modells, wenn keines mehr übrig ist', async () => {
    const chain = withModelFallback([limited('eins'), limited('zwei', 'quota')])

    const error = await chain.generate(REQUEST, 'k').then(
      () => null,
      (reason: unknown) => reason as LlmError,
    )

    expect(error?.kind).toBe('quota')
  })

  it('nennt sich nach seinem ersten Modell', () => {
    expect(withModelFallback([stub('erstwahl', 'x'), stub('zweitwahl', 'y')]).model).toBe('erstwahl')
  })

  it('gibt einen einzelnen Anbieter unverändert zurück', () => {
    const only = stub('einzig', 'x')
    expect(withModelFallback([only])).toBe(only)
  })
})
