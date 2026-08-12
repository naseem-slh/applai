import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeStorage, type FakeStorage } from '@/components/app/appContext.testutils'
import type { MarkAnchor, MarkSet } from '@/lib/storage/adapter'
import { createAnchor, letterFingerprint, type Mark } from './marks'
import { MARK_SAVE_DELAY_MS, MARK_SET_LIMIT, useMarks } from './useMarks'

const LETTER = 'Sehr geehrte Damen und Herren, ich bewerbe mich um die Stelle als Entwickler.'

function rangeOf(text: string, needle: string) {
  const from = text.indexOf(needle)
  if (from === -1) throw new Error(`„${needle}" steht nicht im Text.`)
  return { from, to: from + needle.length }
}

function anchorFor(needle: string, text = LETTER): MarkAnchor {
  return createAnchor(text, rangeOf(text, needle))
}

/**
 * Der Haken zusammen mit dem Zustand, den ihm sonst der Verlauf stellt.
 * So prüft ein Test den Weg — vormerken, speichern, wiederherstellen — und
 * nicht eine nachgebaute Zustandsverwaltung.
 */
function setup(
  storage: FakeStorage,
  letterText: string | null = LETTER,
  documentText = LETTER,
  keep = true,
) {
  return renderHook(() => {
    const [marks, setMarks] = useState<readonly Mark[]>([])
    return { marks, handle: useMarks({ storage, letterText, documentText, marks, setMarks, keep }) }
  })
}

async function seedMarkSet(
  storage: FakeStorage,
  anchors: MarkAnchor[],
  savedAt = 1,
  forText = LETTER,
): Promise<MarkSet> {
  const set: MarkSet = { id: await letterFingerprint(forText), anchors, savedAt }
  await storage.saveMarkSet(set)
  return set
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('vormerken und aufheben', () => {
  it('merkt eine Stelle vor', async () => {
    const { result } = setup(createFakeStorage())
    await waitFor(() => expect(result.current.handle.ready).toBe(true))

    act(() => result.current.handle.toggle(rangeOf(LETTER, 'ich bewerbe mich')))

    expect(result.current.marks).toHaveLength(1)
    expect(result.current.marks[0]?.anchor.text).toBe('ich bewerbe mich')
  })

  it('hebt eine deckungsgleiche Stelle wieder auf', async () => {
    const { result } = setup(createFakeStorage())
    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    const range = rangeOf(LETTER, 'ich bewerbe mich')

    act(() => result.current.handle.toggle(range))
    act(() => result.current.handle.toggle(range))

    expect(result.current.marks).toEqual([])
  })

  it('hakt eine Stelle ab, ohne sie zu entfernen', async () => {
    const { result } = setup(createFakeStorage())
    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    act(() => result.current.handle.toggle(rangeOf(LETTER, 'ich bewerbe mich')))
    const id = result.current.marks[0]?.id ?? ''

    act(() => result.current.handle.setDone(id, true))

    expect(result.current.marks).toHaveLength(1)
    expect(result.current.marks[0]?.done).toBe(true)
  })

  it('entfernt eine Stelle über die Liste', async () => {
    const { result } = setup(createFakeStorage())
    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    act(() => result.current.handle.toggle(rangeOf(LETTER, 'ich bewerbe mich')))
    const id = result.current.marks[0]?.id ?? ''

    act(() => result.current.handle.remove(id))

    expect(result.current.marks).toEqual([])
  })
})

describe('speichern', () => {
  it('legt die Anker nach der Verzögerung ab', async () => {
    const storage = createFakeStorage()
    const { result } = setup(storage)
    await waitFor(() => expect(result.current.handle.ready).toBe(true))

    act(() => result.current.handle.toggle(rangeOf(LETTER, 'ich bewerbe mich')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_SAVE_DELAY_MS)
    })

    const stored = await storage.loadMarkSet(await letterFingerprint(LETTER))
    expect(stored?.anchors).toEqual([anchorFor('ich bewerbe mich')])
  })

  it('löscht den Satz, wenn die letzte Stelle aufgehoben wird', async () => {
    const storage = createFakeStorage()
    await seedMarkSet(storage, [anchorFor('ich bewerbe mich')])
    const { result } = setup(storage)
    await waitFor(() => expect(result.current.handle.ready).toBe(true))

    act(() => result.current.handle.clearAll())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_SAVE_DELAY_MS)
    })

    expect(await storage.loadMarkSet(await letterFingerprint(LETTER))).toBeNull()
  })

  it('behält höchstens MARK_SET_LIMIT Sätze und wirft den ältesten weg', async () => {
    const storage = createFakeStorage()
    for (let index = 0; index < MARK_SET_LIMIT; index += 1) {
      await storage.saveMarkSet({ id: `fremd-${index}`, anchors: [], savedAt: index + 1 })
    }
    const { result } = setup(storage)
    await waitFor(() => expect(result.current.handle.ready).toBe(true))

    act(() => result.current.handle.toggle(rangeOf(LETTER, 'ich bewerbe mich')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_SAVE_DELAY_MS)
    })

    const sets = await storage.listMarkSets()
    expect(sets).toHaveLength(MARK_SET_LIMIT)
    expect(sets.map((set) => set.id)).not.toContain('fremd-0')
  })
})

describe('wiederherstellen', () => {
  it('setzt die Stellen des gemerkten Satzes', async () => {
    const storage = createFakeStorage()
    await seedMarkSet(storage, [anchorFor('ich bewerbe mich'), anchorFor('als Entwickler')])

    const { result } = setup(storage)

    await waitFor(() => expect(result.current.marks).toHaveLength(2))
    expect(result.current.handle.restore).toEqual({ restored: 2, total: 2, fromOtherLetter: false })
  })

  it('nennt die Anker, die nicht wiedergefunden wurden', async () => {
    const storage = createFakeStorage()
    const geändert = LETTER.replace('als Entwickler', 'als Projektleiterin')
    await seedMarkSet(storage, [anchorFor('ich bewerbe mich'), anchorFor('als Entwickler')], 1, geändert)

    const { result } = setup(storage, geändert, geändert)

    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    expect(result.current.marks).toHaveLength(1)
    expect(result.current.handle.unresolved.map((anchor) => anchor.text)).toEqual(['als Entwickler'])
  })

  it('verwirft einen nicht wiedergefundenen Anker auf Wunsch', async () => {
    const storage = createFakeStorage()
    const geändert = LETTER.replace('als Entwickler', 'als Projektleiterin')
    await seedMarkSet(storage, [anchorFor('als Entwickler')], 1, geändert)
    const { result } = setup(storage, geändert, geändert)
    await waitFor(() => expect(result.current.handle.unresolved).toHaveLength(1))

    act(() => result.current.handle.dismiss(result.current.handle.unresolved[0] as MarkAnchor))

    expect(result.current.handle.unresolved).toEqual([])
  })
})

describe('Rückfall auf ein früheres Anschreiben', () => {
  const ÜBERARBEITET = `Vorbemerkung. ${LETTER}`

  it('übernimmt den jüngsten Satz, wenn mehr als die Hälfte wiedergefunden wird', async () => {
    const storage = createFakeStorage()
    await storage.saveMarkSet({
      id: 'anderer-brief',
      anchors: [anchorFor('ich bewerbe mich'), anchorFor('als Entwickler')],
      savedAt: 5,
    })

    const { result } = setup(storage, ÜBERARBEITET, ÜBERARBEITET)

    await waitFor(() => expect(result.current.marks).toHaveLength(2))
    expect(result.current.handle.restore?.fromOtherLetter).toBe(true)
  })

  it('lässt den Rückfall aus, wenn die Hälfte oder weniger wiedergefunden wird', async () => {
    const storage = createFakeStorage()
    await storage.saveMarkSet({
      id: 'anderer-brief',
      anchors: [anchorFor('ich bewerbe mich'), { text: 'gibt es hier nicht', before: '', after: '', from: 0, to: 18 }],
      savedAt: 5,
    })

    const { result } = setup(storage, ÜBERARBEITET, ÜBERARBEITET)

    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    expect(result.current.marks).toEqual([])
    expect(result.current.handle.restore).toBeNull()
  })

  it('zieht den eigenen Satz dem jüngeren fremden vor', async () => {
    const storage = createFakeStorage()
    await seedMarkSet(storage, [anchorFor('ich bewerbe mich')], 1)
    await storage.saveMarkSet({ id: 'anderer-brief', anchors: [anchorFor('als Entwickler')], savedAt: 99 })

    const { result } = setup(storage)

    await waitFor(() => expect(result.current.marks).toHaveLength(1))
    expect(result.current.marks[0]?.anchor.text).toBe('ich bewerbe mich')
  })

  // „Nicht behalten" heißt nicht behalten: Ein liegengebliebener Satz käme
  // beim nächsten Öffnen zurück, obwohl der Nutzer das abgewählt hat.
  it('löscht den gemerkten Satz, sobald das Behalten abgewählt ist', async () => {
    const storage = createFakeStorage()
    await seedMarkSet(storage, [anchorFor('ich bewerbe mich')])

    const { result } = setup(storage, LETTER, LETTER, false)
    await waitFor(() => expect(result.current.handle.ready).toBe(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_SAVE_DELAY_MS)
    })

    expect(await storage.loadMarkSet(await letterFingerprint(LETTER))).toBeNull()
  })
})
