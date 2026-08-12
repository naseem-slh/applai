import { describe, expect, it } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import { ModelResponseError } from '@/lib/ai/modelJson'
import i18n from '@/lib/i18n/i18n'
import { aiErrorKey, isAbortError, VaultLockedError } from './aiErrorKey'

describe('aiErrorKey', () => {
  it('bildet jede Fehlerart auf ihren Schlüssel ab', () => {
    expect(aiErrorKey(new LlmError('invalid_key', 'openai', 'x'))).toBe('ai.errors.invalid_key')
    expect(aiErrorKey(new LlmError('rate_limit', 'openai', 'x'))).toBe('ai.errors.rate_limit')
    expect(aiErrorKey(new LlmError('network', 'anthropic', 'x'))).toBe('ai.errors.network')
    expect(aiErrorKey(new LlmError('blocked', 'anthropic', 'x'))).toBe('ai.errors.blocked')
    expect(aiErrorKey(new LlmError('unknown', 'openai', 'x'))).toBe('ai.errors.unknown')
  })

  it('nennt bei Gemini das kostenlose Tageskontingent, bei den anderen nicht', () => {
    expect(aiErrorKey(new LlmError('quota', 'gemini', 'x'))).toBe('ai.errors.quota_gemini')
    expect(aiErrorKey(new LlmError('quota', 'openai', 'x'))).toBe('ai.errors.quota')
  })

  it('unterscheidet eine unbrauchbare Modellantwort von einem Netzfehler', () => {
    expect(aiErrorKey(new ModelResponseError('Umformulierung', 'zwei statt drei'))).toBe(
      'ai.errors.model_response',
    )
  })

  it('unterscheidet den gesperrten Tresor von einem Fehler des Anbieters', () => {
    expect(aiErrorKey(new VaultLockedError())).toBe('vault.locked')
  })

  it('gibt jedem anderen Fehler die allgemeine Meldung, statt einen Ausnahmetext durchzureichen', () => {
    expect(aiErrorKey(new TypeError('x is not a function'))).toBe('ai.errors.unknown')
    expect(aiErrorKey('kaputt')).toBe('ai.errors.unknown')
  })

  it('reicht keinen Entwicklertext in die Oberfläche: jeder Schlüssel ist in beiden Sprachen übersetzt (G8)', () => {
    const errors: unknown[] = [
      new LlmError('invalid_key', 'openai', 'Schlüsseltext'),
      new LlmError('quota', 'gemini', 'Schlüsseltext'),
      new ModelResponseError('Umformulierung', 'Schlüsseltext'),
      new VaultLockedError(),
      new Error('Schlüsseltext'),
    ]
    for (const error of errors) {
      const key = aiErrorKey(error)
      for (const language of ['de', 'en'] as const) {
        const message = i18n.getFixedT(language)(key)
        expect(message).not.toBe(key)
        expect(message).not.toContain('Schlüsseltext')
      }
    }
  })
})

describe('isAbortError', () => {
  it('erkennt den vom Nutzer ausgelösten Abbruch', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isAbortError(controller.signal.reason)).toBe(true)
  })

  it('hält einen gewöhnlichen Fehler nicht für einen Abbruch', () => {
    expect(isAbortError(new LlmError('network', 'openai', 'x'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
