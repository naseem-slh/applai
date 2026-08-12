import { describe, expect, it } from 'vitest'
import type { MarkAnchor } from '@/lib/storage/adapter'
import {
  createAnchor,
  letterFingerprint,
  MARK_CONTEXT_CHARS,
  overlappingMarks,
  relocate,
  restoreMarks,
  shiftMarks,
  toggleMark,
  trimRange,
  type Mark,
} from './marks'

const LETTER = 'Sehr geehrte Damen und Herren, ich bewerbe mich um die Stelle als Entwickler.'

/** Der Bereich eines Wortlauts im Text — spart das Zählen von Zeichen im Test. */
function rangeOf(text: string, needle: string) {
  const from = text.indexOf(needle)
  if (from === -1) throw new Error(`„${needle}" steht nicht im Text.`)
  return { from, to: from + needle.length }
}

/** Eine Vormerkung auf einen Wortlaut, so wie `toggleMark` sie anlegen würde. */
function markOn(text: string, needle: string, id = needle): Mark {
  const range = rangeOf(text, needle)
  return { id, range, anchor: needle, current: needle, done: false }
}

describe('trimRange', () => {
  it('schneidet Leerraum an beiden Enden der Auswahl ab', () => {
    const text = 'ab  cd  ef'
    expect(trimRange(text, { from: 2, to: 8 })).toEqual(rangeOf(text, 'cd'))
  })

  it('gibt null zurück, wenn die Auswahl nur aus Leerraum besteht', () => {
    expect(trimRange('ab   cd', { from: 2, to: 5 })).toBeNull()
  })
})

describe('toggleMark', () => {
  it('legt eine Vormerkung an, wenn sich nichts überschneidet', () => {
    const next = toggleMark([], LETTER, rangeOf(LETTER, 'ich bewerbe mich'), 'm1')
    expect(next).toEqual([
      {
        id: 'm1',
        range: rangeOf(LETTER, 'ich bewerbe mich'),
        anchor: 'ich bewerbe mich',
        current: 'ich bewerbe mich',
        done: false,
      },
    ])
  })

  it('hebt eine deckungsgleiche Vormerkung wieder auf', () => {
    const existing = markOn(LETTER, 'ich bewerbe mich')
    expect(toggleMark([existing], LETTER, existing.range, 'm2')).toEqual([])
  })

  it('hebt auch dann auf, wenn die Auswahl Leerraum an den Rändern mitnimmt', () => {
    const existing = markOn(LETTER, 'ich bewerbe mich')
    const sloppy = { from: existing.range.from - 1, to: existing.range.to + 1 }
    expect(toggleMark([existing], LETTER, sloppy, 'm2')).toEqual([])
  })

  it('ersetzt eine überschneidende Vormerkung durch die neue', () => {
    const existing = markOn(LETTER, 'ich bewerbe mich')
    const next = toggleMark([existing], LETTER, rangeOf(LETTER, 'mich um die Stelle'), 'm2')
    expect(next.map((entry) => entry.anchor)).toEqual(['mich um die Stelle'])
    expect(next[0]?.id).toBe('m2')
  })

  it('lässt eine angrenzende Vormerkung stehen', () => {
    const before = markOn(LETTER, 'Sehr geehrte Damen und Herren,')
    const touching = rangeOf(LETTER, ' ich bewerbe mich')
    expect(toggleMark([before], LETTER, touching, 'm2')).toHaveLength(2)
  })

  it('tut nichts bei einer Auswahl aus reinem Leerraum', () => {
    const existing = [markOn(LETTER, 'ich bewerbe mich')]
    const space = LETTER.indexOf('ich bewerbe') - 1
    expect(toggleMark(existing, LETTER, { from: space, to: space + 1 }, 'm2')).toEqual(existing)
  })

  it('hält die Liste nach Position sortiert', () => {
    const late = markOn(LETTER, 'als Entwickler')
    const next = toggleMark([late], LETTER, rangeOf(LETTER, 'Sehr geehrte'), 'm2')
    expect(next.map((entry) => entry.anchor)).toEqual(['Sehr geehrte', 'als Entwickler'])
  })
})

describe('overlappingMarks', () => {
  it('nennt die Vormerkungen, die eine Auswahl überschneidet', () => {
    const marks = [markOn(LETTER, 'ich bewerbe mich'), markOn(LETTER, 'als Entwickler')]
    const hit = overlappingMarks(marks, rangeOf(LETTER, 'mich um die Stelle'))
    expect(hit.map((entry) => entry.anchor)).toEqual(['ich bewerbe mich'])
  })

  it('zählt eine Berührung an der Grenze nicht als Überschneidung', () => {
    const marks = [markOn(LETTER, 'Sehr geehrte Damen und Herren,')]
    expect(overlappingMarks(marks, rangeOf(LETTER, ' ich bewerbe'))).toEqual([])
  })
})

describe('createAnchor', () => {
  it('nimmt Wortlaut, Bereich und den Text ringsherum auf', () => {
    const anchor = createAnchor(LETTER, rangeOf(LETTER, 'ich bewerbe mich'))
    expect(anchor.text).toBe('ich bewerbe mich')
    expect(anchor.before).toBe('Sehr geehrte Damen und Herren, ')
    expect(anchor.after).toBe(' um die Stelle als Entwickler.')
  })

  it('kappt den Kontext auf beiden Seiten', () => {
    const long = `${'a'.repeat(200)}KERN${'b'.repeat(200)}`
    const anchor = createAnchor(long, { from: 200, to: 204 })
    expect(anchor.before).toHaveLength(MARK_CONTEXT_CHARS)
    expect(anchor.after).toHaveLength(MARK_CONTEXT_CHARS)
  })
})

describe('relocate', () => {
  const anchor = (over: Partial<MarkAnchor> = {}): MarkAnchor => ({
    text: 'gute Kenntnisse',
    before: '',
    after: '',
    from: 0,
    to: 15,
    ...over,
  })

  it('nimmt die alte Position, wenn dort noch derselbe Wortlaut steht', () => {
    const text = 'gute Kenntnisse in Java und gute Kenntnisse in Python.'
    expect(relocate(text, anchor())).toEqual({ from: 0, to: 15 })
  })

  it('findet die verschobene Stelle über ihren Wortlaut', () => {
    const text = 'Vorwort. gute Kenntnisse in Java.'
    expect(relocate(text, anchor())).toEqual(rangeOf(text, 'gute Kenntnisse'))
  })

  it('löst mehrere Vorkommen über den Kontext auf', () => {
    const text = 'B: gute Kenntnisse in Python. A: gute Kenntnisse in Java.'
    const second = text.lastIndexOf('gute Kenntnisse')
    const found = relocate(text, anchor({ before: 'A: ', after: ' in Java.' }))
    expect(found).toEqual({ from: second, to: second + 'gute Kenntnisse'.length })
  })

  it('gibt null zurück, wenn der Wortlaut nicht mehr vorkommt', () => {
    expect(relocate('Ein ganz anderer Brief.', anchor())).toBeNull()
  })

  it('gibt null zurück, wenn der Kontext nicht entscheidet', () => {
    const text = 'x gute Kenntnisse y x gute Kenntnisse y'
    expect(relocate(text, anchor({ before: 'x ', after: ' y' }))).toBeNull()
  })
})

describe('restoreMarks', () => {
  it('trennt wiedergefundene Anker von verlorenen', () => {
    const text = 'Vorwort. ich bewerbe mich um die Stelle.'
    const found = createAnchor(LETTER, rangeOf(LETTER, 'ich bewerbe mich'))
    const lost = createAnchor(LETTER, rangeOf(LETTER, 'als Entwickler'))

    const restored = restoreMarks(text, [found, lost], (index) => `m${index}`)

    expect(restored.marks.map((entry) => entry.anchor)).toEqual(['ich bewerbe mich'])
    expect(restored.marks[0]?.range).toEqual(rangeOf(text, 'ich bewerbe mich'))
    expect(restored.unresolved).toEqual([lost])
  })

  it('lässt einen Anker aus, der auf eine bereits belegte Stelle zeigt', () => {
    const text = 'ich bewerbe mich um die Stelle.'
    const first = createAnchor(LETTER, rangeOf(LETTER, 'ich bewerbe mich'))
    const overlapping = createAnchor(LETTER, rangeOf(LETTER, 'mich um die Stelle'))

    const restored = restoreMarks(text, [first, overlapping], (index) => `m${index}`)

    expect(restored.marks.map((entry) => entry.anchor)).toEqual(['ich bewerbe mich'])
    expect(restored.unresolved).toEqual([overlapping])
  })

  it('beginnt jede wiederhergestellte Stelle als offen', () => {
    const found = createAnchor(LETTER, rangeOf(LETTER, 'ich bewerbe mich'))
    const restored = restoreMarks(LETTER, [found], () => 'm0')
    expect(restored.marks[0]?.done).toBe(false)
  })
})

describe('shiftMarks', () => {
  const text = 'eins zwei drei'

  it('lässt eine Vormerkung vor der Änderung unberührt', () => {
    const marks = [markOn(text, 'eins')]
    const next = shiftMarks(marks, rangeOf(text, 'drei'), 4, 'eins zwei vier')
    expect(next[0]?.range).toEqual({ from: 0, to: 4 })
  })

  it('verschiebt eine Vormerkung hinter der Änderung', () => {
    const marks = [markOn(text, 'drei')]
    const next = shiftMarks(marks, rangeOf(text, 'eins'), 6, 'eins++ zwei drei')
    expect(next[0]?.range).toEqual(rangeOf('eins++ zwei drei', 'drei'))
  })

  it('lässt eine Vormerkung mit dem Tippen darin wachsen', () => {
    const marks = [markOn(text, 'zwei')]
    const next = shiftMarks(marks, { from: 9, to: 9 }, 2, 'eins zweixy drei')
    expect(next[0]?.range).toEqual({ from: 5, to: 11 })
    expect(next[0]?.current).toBe('zweixy')
  })

  it('lässt eine Einfügung genau auf dem Anfang vor der Vormerkung liegen', () => {
    const marks = [markOn(text, 'zwei')]
    const next = shiftMarks(marks, { from: 5, to: 5 }, 2, 'eins xyzwei drei')
    expect(next[0]?.range).toEqual(rangeOf('eins xyzwei drei', 'zwei'))
    expect(next[0]?.current).toBe('zwei')
  })

  it('entfernt eine vollständig überschriebene Vormerkung', () => {
    const marks = [markOn(text, 'zwei')]
    expect(shiftMarks(marks, { from: 4, to: 9 }, 0, 'eins drei')).toEqual([])
  })

  it('beschneidet eine teilweise überschriebene Vormerkung', () => {
    const marks = [markOn(text, 'zwei drei')]
    const next = shiftMarks(marks, rangeOf(text, 'zwei '), 0, 'eins drei')
    expect(next[0]?.range).toEqual(rangeOf('eins drei', 'drei'))
    expect(next[0]?.current).toBe('drei')
  })

  it('führt den angezeigten Wortlaut nach, ohne den Anker zu ändern', () => {
    const marks = [markOn(text, 'zwei')]
    const next = shiftMarks(marks, rangeOf(text, 'zwei'), 4, 'eins ZWEI drei')
    expect(next[0]?.current).toBe('ZWEI')
    expect(next[0]?.anchor).toBe('zwei')
  })
})

describe('letterFingerprint', () => {
  it('liefert denselben Abdruck für denselben Text mit anderem Leerraum', async () => {
    const [a, b] = await Promise.all([
      letterFingerprint('Sehr geehrte  Damen\n\nund Herren'),
      letterFingerprint('  Sehr geehrte Damen und Herren '),
    ])
    expect(a).toBe(b)
  })

  it('liefert verschiedene Abdrücke für verschiedene Briefe', async () => {
    const [a, b] = await Promise.all([letterFingerprint('Brief A'), letterFingerprint('Brief B')])
    expect(a).not.toBe(b)
  })
})
