import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ModelResponseError, nullableFactString, parseModelJson, truncateForError } from './modelJson'

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

/**
 * Fix-Runde 1 (siehe task-9-report.md, Review-Fund "Critical"): Platzhalter-
 * Wörter, mit denen Modelle "kein Wert vorhanden" statt JSON-`null`
 * schreiben, müssen ebenfalls zu `null` normalisiert werden — sonst
 * erreicht z. B. "unbekannt" das Programm ununterscheidbar von einem
 * echten Firmennamen.
 */
describe('nullableFactString', () => {
  it('lässt null unverändert', () => {
    expect(nullableFactString.parse(null)).toBeNull()
  })

  it('macht eine leere oder reine Leerraum-Zeichenkette zu null', () => {
    expect(nullableFactString.parse('')).toBeNull()
    expect(nullableFactString.parse('   ')).toBeNull()
  })

  it('trimmt und übernimmt einen echten Wert unverändert', () => {
    expect(nullableFactString.parse('  Musterwerk Solutions GmbH  ')).toBe('Musterwerk Solutions GmbH')
  })

  it.each(['N/A', 'n/a', 'unbekannt', '-', 'null', 'k.A.', 'TBD', 'unknown'])(
    'macht das bekannte Platzhalterwort "%s" zu null',
    (placeholder) => {
      expect(nullableFactString.parse(placeholder)).toBeNull()
    },
  )

  it.each(['NA', 'Unbekannt', ' unknown ', 'K.A.', 'Tbd', 'None', 'Nicht angegeben', 'Keine Angabe'])(
    'erkennt das Platzhalterwort "%s" unabhängig von Groß-/Kleinschreibung und umgebendem Leerraum',
    (placeholder) => {
      expect(nullableFactString.parse(placeholder)).toBeNull()
    },
  )

  it('behandelt einen Platzhalter nur als ganzen Wert, niemals als Teilstring', () => {
    // "unknown" steckt hier drin, ist aber nicht der gesamte Wert – ein
    // echter, wenn auch seltener Firmenname muss erhalten bleiben.
    expect(nullableFactString.parse('Unknown Origins GmbH')).toBe('Unknown Origins GmbH')
    expect(nullableFactString.parse('k.A. Solutions AG')).toBe('k.A. Solutions AG')
    expect(nullableFactString.parse('Firma TBD Consulting')).toBe('Firma TBD Consulting')
  })
})

/**
 * Fix-Runde 1, Aufgabe 10 (siehe task-10-report.md): `truncateForError`
 * wurde exportiert, weil `domain/styleProfile.ts` (Aufgabe 10) denselben
 * Kürzungsbedarf für "sample" hat wie diese Datei für die Rohantwort. Kurzer
 * Schutz-Test, damit ein künftiger Umbau (Aufgabe 11/12) nicht unbemerkt das
 * Verhalten ändert, auf das jetzt mehrere Module sich verlassen.
 */
describe('truncateForError', () => {
  it('lässt einen kurzen Text unverändert', () => {
    expect(truncateForError('Ein kurzer Text.')).toBe('Ein kurzer Text.')
  })

  it('trimmt Leerraum vor der Längenprüfung', () => {
    expect(truncateForError('   Text mit Leerraum drumherum.   ')).toBe('Text mit Leerraum drumherum.')
  })

  it('kürzt einen Text über 300 Zeichen und hängt eine Ellipse an', () => {
    const long = 'a'.repeat(400)
    const result = truncateForError(long)
    expect(result.length).toBe(301)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('a'.repeat(300))).toBe(true)
  })
})
