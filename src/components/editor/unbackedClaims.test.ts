import { describe, expect, it } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import {
  claimParagraphs,
  findClaimRange,
  isExportBlocked,
  locateClaims,
  normalizeClaim,
  type LocatedClaim,
  type UnbackedClaim,
} from './unbackedClaims'

/**
 * Ein Dokumentmodell nur mit dem, was diese Datei liest: Absatztexte und
 * ihre Offsets. Absätze werden — wie in `parse.ts` — mit `\n` verbunden.
 */
function fakeDocument(texts: string[]): DocxDocument {
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return {
      index,
      node: null as unknown as Element,
      text,
      runs: [],
      start,
      end: start + text.length,
    }
  })
  return {
    zip: {},
    doc: null as unknown as XMLDocument,
    paragraphs,
    text: texts.join('\n'),
  }
}

function claim(text: string, confirmed = false): UnbackedClaim {
  return { id: `c-${text.slice(0, 8)}`, text, confirmed }
}

describe('normalizeClaim', () => {
  it('zieht jede Leerraumfolge auf ein Leerzeichen zusammen und schneidet die Ränder ab', () => {
    expect(normalizeClaim('  drei \n\t Jahre   Erfahrung \n')).toBe('drei Jahre Erfahrung')
  })
})

describe('findClaimRange', () => {
  it('findet eine Aussage und liefert Original-Offsets, aus denen der Wortlaut zurückzuschneiden ist', () => {
    const text = 'Guten Tag. Ich leite seit drei Jahren ein Team. Mit freundlichen Grüßen'
    const range = findClaimRange(text, 'leite seit drei Jahren ein Team')

    expect(range).not.toBeNull()
    expect(text.slice(range!.from, range!.to)).toBe('leite seit drei Jahren ein Team')
  })

  it('findet eine Aussage auch über einen Zeilenumbruch hinweg — Aufgabe 11 prüft die Wörtlichkeit ebenfalls nur nach Leerraum-Normalisierung', () => {
    const text = 'Ich leite seit\ndrei Jahren   ein Team.'
    const range = findClaimRange(text, 'leite seit drei Jahren ein Team')

    expect(range).not.toBeNull()
    expect(text.slice(range!.from, range!.to)).toBe('leite seit\ndrei Jahren   ein Team')
  })

  it('zieht den Leerraum hinter einer Aussage am Textende nicht mit in den Bereich', () => {
    const text = 'Ich leite ein Team\n\n'
    const range = findClaimRange(text, 'leite ein Team')

    expect(range).toEqual({ from: 4, to: 18 })
    expect(text.slice(range!.from, range!.to)).toBe('leite ein Team')
  })

  it('liefert null, wenn die Aussage nicht mehr im Text steht — genau das hebt die Sperre auf', () => {
    expect(findClaimRange('Ich habe ein Team begleitet.', 'leite seit drei Jahren ein Team')).toBeNull()
  })

  it('liefert null für eine leere Aussage, statt den Anfang des Dokuments zu treffen', () => {
    expect(findClaimRange('Irgendein Text', '   ')).toBeNull()
  })

  it('findet das erste Vorkommen, wenn derselbe Wortlaut mehrfach dasteht', () => {
    const text = 'Ein Team. Noch ein Satz. Ein Team.'
    expect(findClaimRange(text, 'Ein Team')).toEqual({ from: 0, to: 8 })
  })
})

describe('claimParagraphs', () => {
  const docx = fakeDocument(['Erster Absatz', 'Zweiter Absatz', 'Dritter Absatz'])

  it('nennt genau den Absatz, in dem die Aussage steht', () => {
    const range = findClaimRange(docx.text, 'Zweiter')
    expect(claimParagraphs(docx, range!)).toEqual([1])
  })

  it('nennt beide Absätze, wenn die Aussage über eine Absatzgrenze reicht', () => {
    const range = findClaimRange(docx.text, 'Absatz Zweiter')
    expect(claimParagraphs(docx, range!)).toEqual([0, 1])
  })

  it('zieht den Nachbarabsatz nicht mit hinein, wenn die Aussage genau am Absatzende endet', () => {
    const range = findClaimRange(docx.text, 'Erster Absatz')
    expect(claimParagraphs(docx, range!)).toEqual([0])
  })
})

describe('locateClaims', () => {
  const docx = fakeDocument(['Ich leite ein Team.', 'Ich spreche fließend Finnisch.'])

  it('behält nur die Aussagen, die noch im Dokument stehen', () => {
    const located = locateClaims(docx, [
      claim('leite ein Team'),
      claim('habe in Kanada studiert'),
      claim('spreche fließend Finnisch'),
    ])

    expect(located.map((entry) => entry.text)).toEqual([
      'leite ein Team',
      'spreche fließend Finnisch',
    ])
    expect(located[0]!.paragraphs).toEqual([0])
    expect(located[1]!.paragraphs).toEqual([1])
  })

  it('reicht die Bestätigung unverändert durch', () => {
    const located = locateClaims(docx, [claim('leite ein Team', true)])
    expect(located[0]!.confirmed).toBe(true)
  })

  it('liefert nichts, solange kein Dokument geladen ist', () => {
    expect(locateClaims(null, [claim('leite ein Team')])).toEqual([])
  })
})

describe('isExportBlocked', () => {
  const located = (text: string, confirmed: boolean): LocatedClaim => ({
    ...claim(text, confirmed),
    range: { from: 0, to: text.length },
    paragraphs: [0],
  })

  it('sperrt, solange eine aufgefundene Aussage unbestätigt ist', () => {
    expect(isExportBlocked([located('a', true), located('b', false)])).toBe(true)
  })

  it('gibt frei, wenn jede aufgefundene Aussage bestätigt ist', () => {
    expect(isExportBlocked([located('a', true), located('b', true)])).toBe(false)
  })

  it('gibt frei, wenn gar keine Aussage mehr im Dokument steht', () => {
    expect(isExportBlocked([])).toBe(false)
  })
})
