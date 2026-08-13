import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocx, paragraphXml } from '@/lib/docx/docx.testutils'
import type { DocxDocument } from '@/lib/docx/model'
import { parseDocx } from '@/lib/docx/parse'
import type { Letterhead } from '@/lib/domain/letterhead'
import { applyLetterhead } from './letterheadApply'
import type { Mark } from './marks'

/**
 * Für die Alles-oder-nichts-Regel muss eine Ersetzung mitten im Stapel
 * scheitern. `vi.mock` wird hochgezogen, der Zähler deshalb über
 * `vi.hoisted`. Ohne gesetztes `failOnCall` reicht die Attrappe unverändert
 * an die echte Umsetzung durch — alle übrigen Tests dieser Datei laufen
 * gegen das Original.
 */
const replaceState = vi.hoisted(() => ({ calls: 0, failOnCall: 0 }))

vi.mock('@/lib/docx/replace', async () => {
  const actual = await vi.importActual<typeof import('@/lib/docx/replace')>('@/lib/docx/replace')
  return {
    ...actual,
    replaceRange: (...args: Parameters<typeof actual.replaceRange>) => {
      replaceState.calls += 1
      if (replaceState.calls === replaceState.failOnCall) throw new Error('Absturz im Stapel')
      return actual.replaceRange(...args)
    },
  }
})

beforeEach(() => {
  replaceState.calls = 0
  replaceState.failOnCall = 0
})

const LETTERHEAD: Letterhead = {
  recipient: 'Neue Beispiel AG',
  date: '13.08.2026',
  subject: 'Bewerbung als Disponentin',
  salutation: 'Sehr geehrter Herr Dr. Meier,',
}

// parseDocx liest asynchron (siehe src/lib/docx/parse.ts), deshalb ist
// dieser Aufbauhelfer selbst asynchron und wird an jeder Aufrufstelle
// abgewartet.
function brief(): Promise<DocxDocument> {
  return parseDocx(
    buildDocx(
      [
        paragraphXml('Alte Muster GmbH'),
        paragraphXml('Musterstraße 12'),
        paragraphXml('Berlin, 14.03.2026'),
        paragraphXml('Bewerbung als Sachbearbeiterin'),
        paragraphXml('Sehr geehrte Frau Klein,'),
        paragraphXml('mit großem Interesse habe ich Ihre Anzeige gelesen.'),
      ].join(''),
    ),
  )
}

describe('applyLetterhead', () => {
  it('setzt alle gefundenen Felder und lässt die Anschrift stehen', async () => {
    const result = applyLetterhead(await brief(), LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.document.text).toContain('Neue Beispiel AG')
    expect(result.document.text).toContain('Musterstraße 12')
    expect(result.document.text).toContain('Berlin, 13.08.2026')
    expect(result.document.text).toContain('Sehr geehrter Herr Dr. Meier,')
    expect(result.document.text).not.toContain('Alte Muster GmbH')
    expect(result.document.text).not.toContain('14.03.2026')
  })

  it('meldet je Feld, was vorher und was nachher dort steht', async () => {
    const result = applyLetterhead(await brief(), LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.changes).toEqual([
      { field: 'recipient', paragraph: 0, previous: 'Alte Muster GmbH', next: 'Neue Beispiel AG' },
      { field: 'date', paragraph: 2, previous: '14.03.2026', next: '13.08.2026' },
      {
        field: 'subject',
        paragraph: 3,
        previous: 'Bewerbung als Sachbearbeiterin',
        next: 'Bewerbung als Disponentin',
      },
      {
        field: 'salutation',
        paragraph: 4,
        previous: 'Sehr geehrte Frau Klein,',
        next: 'Sehr geehrter Herr Dr. Meier,',
      },
    ])
    expect(result.missing).toEqual([])
  })

  it('überspringt ein leeres Feld, statt den alten Text zu löschen', async () => {
    const ohneFirma: Letterhead = { ...LETTERHEAD, recipient: '' }

    const result = applyLetterhead(await brief(), ohneFirma, [], ['Alte Muster GmbH'], null)

    expect(result.document.text).toContain('Alte Muster GmbH')
    expect(result.missing).toContain('recipient')
    expect(result.changes.some((change) => change.field === 'recipient')).toBe(false)
  })

  /**
   * Befund 4: Ist der alte Wortlaut bereits zeichengleich mit dem neuen,
   * ist nichts zu tun — ein Verlaufsschritt und ein Bericht „X → X" für
   * nichts wären irreführend. Das Feld ist trotzdem gefunden worden
   * (gehört also nicht nach `missing`, das hieße „nicht gefunden"), zählt
   * aber auch nicht als `changes`, sondern eigens als `unchanged`.
   */
  it('überspringt ein Feld, dessen Wortlaut bereits zeichengleich mit dem Vorschlag ist', async () => {
    const gleicheAnrede: Letterhead = { ...LETTERHEAD, salutation: 'Sehr geehrte Frau Klein,' }

    const result = applyLetterhead(await brief(), gleicheAnrede, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.changes.some((change) => change.field === 'salutation')).toBe(false)
    expect(result.missing).not.toContain('salutation')
    expect(result.unchanged).toContain('salutation')
    expect(result.document.text).toContain('Sehr geehrte Frau Klein,')
  })

  it('meldet vollständig unveränderte Felder weder als geändert noch als fehlend', async () => {
    const original = await brief()
    const identisch: Letterhead = {
      recipient: 'Alte Muster GmbH',
      date: '14.03.2026',
      subject: 'Bewerbung als Sachbearbeiterin',
      salutation: 'Sehr geehrte Frau Klein,',
    }

    const result = applyLetterhead(original, identisch, [], ['Alte Muster GmbH'], null)

    expect(result.document).toBe(original)
    expect(result.changes).toEqual([])
    expect(result.missing).toEqual([])
    expect([...result.unchanged].sort()).toEqual(['date', 'recipient', 'salutation', 'subject'])
  })

  it('lässt das Dokument unberührt, wenn nichts gefunden wurde', async () => {
    const nurText = await parseDocx(buildDocx(paragraphXml('Nur ein Satz ohne jeden Briefkopf.')))

    const result = applyLetterhead(nurText, LETTERHEAD, [], [], null)

    expect(result.document).toBe(nurText)
    expect(result.changes).toEqual([])
    expect(result.missing).toEqual(['recipient', 'date', 'subject', 'salutation'])
  })

  it('lässt das Dokument unberührt, wenn eine Ersetzung mitten im Stapel scheitert', async () => {
    replaceState.failOnCall = 2
    const original = await brief()

    const result = applyLetterhead(original, LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.document).toBe(original)
    expect(result.changes).toEqual([])
    expect(original.text).toContain('Alte Muster GmbH')
  })

  it('führt die Vormerkungen mit', async () => {
    const original = await brief()
    const from = original.text.indexOf('mit großem Interesse')
    const marks: Mark[] = [
      {
        id: 'm1',
        range: { from, to: from + 'mit großem Interesse'.length },
        anchor: {
          text: 'mit großem Interesse',
          before: '',
          after: '',
          from,
          to: from + 'mit großem Interesse'.length,
        },
        current: 'mit großem Interesse',
        done: false,
      },
    ]

    const result = applyLetterhead(original, LETTERHEAD, marks, ['Alte Muster GmbH'], 'Neue Beispiel AG')
    const moved = result.marks[0]

    expect(result.document.text.slice(moved?.range.from, moved?.range.to)).toBe('mit großem Interesse')
  })
})
