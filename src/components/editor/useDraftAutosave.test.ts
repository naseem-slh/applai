// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeStorage, type FakeStorage } from '@/components/app/appContext.testutils'
import { LETTER_DRAFT_ID } from '@/components/app/appContext'
import type { DocxDocument } from '@/lib/docx/model'
import { parseDocx } from '@/lib/docx/parse'
import { replaceRange } from '@/lib/docx/replace'
import { AUTOSAVE_INTERVAL_MS, useDraftAutosave } from './useDraftAutosave'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadLetter(): Promise<DocxDocument> {
  const buffer = await readFile(join(FIXTURES_DIR, 'anschreiben.docx'))
  return parseDocx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}

/** Lässt den Zeitgeber laufen und wartet auf alles, was er angestoßen hat. */
async function tick(times = 1): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS * times)
  })
}

function mount(storage: FakeStorage, document: DocxDocument | null) {
  return renderHook(
    (props: { document: DocxDocument | null }) =>
      useDraftAutosave({ storage, draftId: LETTER_DRAFT_ID, document: props.document }),
    { initialProps: { document } },
  )
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('meldet vor dem ersten Sichern nur die Zusage', async () => {
    const storage = createFakeStorage()
    const letter = await loadLetter()
    const { result } = mount(storage, letter)

    expect(result.current).toEqual({ status: 'idle' })
  })

  it('sichert nichts, solange sich nichts geändert hat', async () => {
    const storage = createFakeStorage()
    const letter = await loadLetter()
    mount(storage, letter)

    await tick(3)

    // Das geladene Dokument gilt als gesichert: Die Einstiegsseite hat es
    // beim Weitergehen abgelegt.
    expect(storage.saveDraft).not.toHaveBeenCalled()
  })

  it('sichert eine Änderung nach 20 Sekunden und meldet erst danach Erfolg', async () => {
    const storage = createFakeStorage()
    const letter = await loadLetter()
    const changed = replaceRange(letter, { from: 0, to: 4 }, 'Hallo')
    const { result, rerender } = mount(storage, letter)

    rerender({ document: changed })
    expect(storage.saveDraft).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')

    await tick()

    expect(storage.saveDraft).toHaveBeenCalledTimes(1)
    const draft = storage.state.drafts.get(LETTER_DRAFT_ID)
    expect(draft?.text).toBe(changed.text)
    expect(draft?.docxBase.byteLength).toBeGreaterThan(0)
    expect(result.current).toEqual({ status: 'saved', at: draft?.savedAt })
  })

  it('sichert denselben Stand kein zweites Mal', async () => {
    const storage = createFakeStorage()
    const letter = await loadLetter()
    const { rerender } = mount(storage, letter)

    rerender({ document: replaceRange(letter, { from: 0, to: 4 }, 'Hallo') })
    await tick()
    await tick(2)

    expect(storage.saveDraft).toHaveBeenCalledTimes(1)
  })

  it('behauptet keinen Zwischenstand, wenn das Sichern fehlschlägt', async () => {
    const storage = createFakeStorage()
    storage.saveDraft = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    const letter = await loadLetter()
    const { result, rerender } = mount(storage, letter)

    rerender({ document: replaceRange(letter, { from: 0, to: 4 }, 'Hallo') })
    await tick()

    // Kein Zeitstempel, an dem sich eine „gesichert vor …"-Anzeige
    // festmachen ließe: Der Zustand trägt gar keinen.
    expect(result.current).toEqual({ status: 'failed' })
  })

  it('versucht es beim nächsten Durchgang erneut und meldet dann Erfolg', async () => {
    const storage = createFakeStorage()
    const failing = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    storage.saveDraft = failing
    const letter = await loadLetter()
    const { result, rerender } = mount(storage, letter)

    rerender({ document: replaceRange(letter, { from: 0, to: 4 }, 'Hallo') })
    await tick()
    expect(result.current.status).toBe('failed')

    storage.saveDraft = vi.fn(() => Promise.resolve())
    await tick()

    expect(result.current.status).toBe('saved')
  })

  it('sichert beim Verlassen der Ansicht, was noch offen ist', async () => {
    const storage = createFakeStorage()
    const letter = await loadLetter()
    const { rerender, unmount } = mount(storage, letter)

    rerender({ document: replaceRange(letter, { from: 0, to: 4 }, 'Hallo') })
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(storage.saveDraft).toHaveBeenCalledTimes(1)
  })
})
