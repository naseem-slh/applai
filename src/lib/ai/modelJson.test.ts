import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ModelResponseError, parseModelJson } from './modelJson'

/**
 * Testschema, stellvertretend für `JobAdSchema` (Aufgabe 9) und die noch
 * kommenden Schemata der Aufgaben 10–12 — `parseModelJson` selbst kennt kein
 * konkretes Schema, das ist der ganze Sinn dieser Grenzfunktion (siehe
 * Übergabe-Notiz in `modelJson.ts`).
 */
const PersonSchema = z.object({
  name: z.string(),
  age: z.number().nullable(),
})

describe('parseModelJson', () => {
  it('parst eine saubere JSON-Antwort direkt', () => {
    const result = parseModelJson(PersonSchema, '{"name":"Ada","age":30}', 'Test')
    expect(result).toEqual({ name: 'Ada', age: 30 })
  })

  it('entfernt einen umschließenden Markdown-Codeblock (mit "json"-Sprachhinweis)', () => {
    const raw = '```json\n{"name":"Ada","age":30}\n```'
    expect(parseModelJson(PersonSchema, raw, 'Test')).toEqual({ name: 'Ada', age: 30 })
  })

  it('entfernt einen umschließenden Markdown-Codeblock ohne Sprachhinweis', () => {
    const raw = '```\n{"name":"Ada","age":30}\n```'
    expect(parseModelJson(PersonSchema, raw, 'Test')).toEqual({ name: 'Ada', age: 30 })
  })

  it('ignoriert Fließtext vor dem JSON', () => {
    const raw = 'Hier ist die Analyse:\n{"name":"Ada","age":30}'
    expect(parseModelJson(PersonSchema, raw, 'Test')).toEqual({ name: 'Ada', age: 30 })
  })

  it('ignoriert Fließtext nach dem JSON', () => {
    const raw = '{"name":"Ada","age":30}\nIch hoffe, das hilft!'
    expect(parseModelJson(PersonSchema, raw, 'Test')).toEqual({ name: 'Ada', age: 30 })
  })

  it('wirft bei abgeschnittenem/unvollständigem JSON eine ModelResponseError', () => {
    const raw = '{"name":"Ada","age":3'
    expect(() => parseModelJson(PersonSchema, raw, 'Test')).toThrow(ModelResponseError)
  })

  it('wirft bei komplett unauswertbarem Text eine ModelResponseError', () => {
    expect(() => parseModelJson(PersonSchema, 'Tut mir leid, das kann ich nicht beantworten.', 'Test')).toThrow(
      ModelResponseError,
    )
  })

  it('nennt bei einem Schema-Verstoß den Feldnamen in der Fehlermeldung', () => {
    const raw = '{"name":"Ada","age":"dreißig"}'
    try {
      parseModelJson(PersonSchema, raw, 'Test')
      expect.unreachable('hätte werfen müssen')
    } catch (error) {
      expect(error).toBeInstanceOf(ModelResponseError)
      expect((error as Error).message).toContain('age')
    }
  })

  it('nennt bei einem fehlenden Pflichtfeld dessen Namen', () => {
    const raw = '{"age":30}'
    try {
      parseModelJson(PersonSchema, raw, 'Test')
      expect.unreachable('hätte werfen müssen')
    } catch (error) {
      expect((error as Error).message).toContain('name')
    }
  })

  it('lässt unbekannte Zusatzfelder unbeanstandet weg, statt zu scheitern', () => {
    const raw = '{"name":"Ada","age":30,"confidence":0.87,"note":"unerwartetes Feld"}'
    expect(parseModelJson(PersonSchema, raw, 'Test')).toEqual({ name: 'Ada', age: 30 })
  })

  it('deckelt die im Fehlertext zitierte Rohantwort, statt sie vollständig zu übernehmen', () => {
    const huge = `{"name":"Ada","age":${'9'.repeat(8000)}`
    try {
      parseModelJson(PersonSchema, huge, 'Test')
      expect.unreachable('hätte werfen müssen')
    } catch (error) {
      const message = (error as Error).message
      expect(message.length).toBeLessThan(1000)
    }
  })

  it('trägt den übergebenen Kontext-Namen als Label', () => {
    try {
      parseModelJson(PersonSchema, 'kaputt', 'Stellenanzeigen-Analyse')
      expect.unreachable('hätte werfen müssen')
    } catch (error) {
      expect(error).toBeInstanceOf(ModelResponseError)
      expect((error as ModelResponseError).label).toBe('Stellenanzeigen-Analyse')
      expect((error as Error).message).toContain('Stellenanzeigen-Analyse')
    }
  })
})
