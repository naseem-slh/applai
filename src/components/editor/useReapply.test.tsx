import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDocx } from '@/lib/docx/parse'
import { buildDocx, paragraphXml } from '@/lib/docx/docx.testutils'
import type { DocxDocument } from '@/lib/docx/model'
import { createAnchor, type Mark } from './marks'
import { useReapply, type ReapplyDocument, type ReapplyOptions } from './useReapply'
import { variant } from '@/lib/domain/rewrite.testutils'

const ERSTER = 'ich bewerbe mich hiermit auf Ihre Stelle'
const ZWEITER = 'Ich bringe Erfahrung aus dem Handwerk mit'

const VARIANTEN = [variant('neu eins'), variant('neu zwei'), variant('neu drei')]

let docx: DocxDocument
let marks: Mark[]

beforeEach(async () => {
  docx = await parseDocx(
    buildDocx(
      paragraphXml('Sehr geehrte Damen und Herren,') +
        paragraphXml(`${ERSTER}.`) +
        paragraphXml(`${ZWEITER}.`),
    ),
  )
  marks = [ERSTER, ZWEITER].map((text, index) => {
    const from = docx.text.indexOf(text)
    const range = { from, to: from + text.length }
    return {
      id: `mark-${index}`,
      range,
      anchor: createAnchor(docx.text, range),
      current: text,
      done: false,
    }
  })
})

/** Zwei unterscheidbare Auswertungen — gewartet wird auf die Identität. */
const ALTE_ANZEIGE = { company: 'Alt AG' }
const NEUE_ANZEIGE = { company: 'Neu GmbH' }

/** Eine Unterlage mit lauter Attrappen; einzelne davon lassen sich ersetzen. */
function dokument(over: Partial<ReapplyDocument> = {}): ReapplyDocument {
  return {
    kind: 'letter',
    docx,
    marks,
    rewrite: vi.fn().mockResolvedValue(VARIANTEN),
    applyEdit: vi.fn(),
    addClaims: vi.fn(),
    restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['mark-0', 'mark-1'], unresolved: 0 }),
    ...over,
  }
}

/**
 * Der Durchlauf mit **einer** Unterlage. Die Überschreibungen auf
 * Dokumentebene (`rewrite`, `applyEdit`, …) gehen an diese eine; wer zwei
 * braucht, reicht `documents` selbst herein.
 */
function optionen(
  over: Partial<ReapplyOptions> & Partial<ReapplyDocument> = {},
): ReapplyOptions {
  const { documents, setJobAdText, currentJobAdText, jobAd, ...perDocument } = over
  return {
    documents: documents ?? [dokument(perDocument)],
    setJobAdText: setJobAdText ?? vi.fn(),
    currentJobAdText: currentJobAdText ?? 'Die alte Anzeige',
    jobAd: jobAd ?? ALTE_ANZEIGE,
  }
}

/** Die erste (und meist einzige) Unterlage eines Durchlaufs. */
function brief(opts: ReapplyOptions): ReapplyDocument {
  const first = opts.documents[0]
  if (first === undefined) throw new Error('Der Durchlauf hat keine Unterlage.')
  return first
}

/**
 * Startet den Durchlauf und lässt die Auswertung der neuen Anzeige
 * eintreffen — genau der Weg, den die Arbeitsfläche geht.
 */
async function starteDurchlauf(opts: ReapplyOptions, mode: 'schnell' | 'waehlen') {
  const { result, rerender } = renderHook((props: ReapplyOptions) => useReapply(props), {
    initialProps: opts,
  })
  await act(async () => {
    result.current.start('Neue Anzeige', mode)
  })
  rerender({ ...opts, jobAd: NEUE_ANZEIGE })
  return result
}

describe('useReapply', () => {
  it('stellt erst das Original her und setzt dann die neue Anzeige', async () => {
    // Die Reihenfolge ist nicht beliebig: Der selbsttätige Briefkopf merkt
    // sich per Ref, für welche Anzeige er schon lief. Liefe er auf dem alten
    // Text, käme er auf dem hergestellten Original nie wieder zum Zug.
    const reihenfolge: string[] = []
    const opts = optionen({
      restoreOriginal: vi.fn(async () => {
        reihenfolge.push('original')
        return { markIds: ['mark-0', 'mark-1'], unresolved: 0 }
      }),
      setJobAdText: vi.fn(() => reihenfolge.push('anzeige')),
    })
    const { result } = renderHook(() => useReapply(opts))

    act(() => result.current.start('Neue Anzeige', 'schnell'))

    await waitFor(() => expect(reihenfolge).toEqual(['original', 'anzeige']))
  })

  it('wartet mit dem Umschreiben, bis die neue Anzeige ausgewertet ist', async () => {
    const opts = optionen()
    const { result, rerender } = renderHook((props: ReapplyOptions) => useReapply(props), {
      initialProps: opts,
    })

    await act(async () => {
      result.current.start('Neue Anzeige', 'schnell')
    })

    // Die Auswertung läuft noch: dieselbe `jobAd` wie beim Start.
    expect(result.current.state.status).toBe('anzeigeWirdGelesen')
    expect(brief(opts).rewrite).not.toHaveBeenCalled()

    rerender({ ...opts, jobAd: NEUE_ANZEIGE })

    await waitFor(() => expect(brief(opts).rewrite).toHaveBeenCalled())
  })

  it('setzt im Schnellmodus jede Stelle genau einmal ein', async () => {
    const opts = optionen()
    const result = await starteDurchlauf(opts, 'schnell')

    await waitFor(() => expect(result.current.state.status).toBe('fertig'))
    expect(brief(opts).applyEdit).toHaveBeenCalledTimes(2)
    expect(brief(opts).applyEdit).toHaveBeenNthCalledWith(1, marks[0].range, 'neu eins', {
      completes: true,
    })
    expect(brief(opts).applyEdit).toHaveBeenNthCalledWith(2, marks[1].range, 'neu eins', {
      completes: true,
    })
  })

  it('hält im Wählen-Modus an, statt zu übernehmen', async () => {
    const opts = optionen()
    const result = await starteDurchlauf(opts, 'waehlen')

    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'haelt', reason: 'wahl' }))
    expect(brief(opts).applyEdit).not.toHaveBeenCalled()
  })

  it('hält im Schnellmodus bei unbelegten Aussagen an (G10)', async () => {
    const opts = optionen({
      rewrite: vi.fn().mockResolvedValue([
        variant('erfunden', { unbackedClaims: ['Zehn Jahre Erfahrung'] }),
        ...VARIANTEN.slice(1),
      ]),
    })
    const result = await starteDurchlauf(opts, 'schnell')

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'haelt',
        reason: 'unbelegteAussagen',
      }),
    )
    expect(brief(opts).applyEdit).not.toHaveBeenCalled()
  })

  it('hält bei einem Fehler des Anbieters an und läuft nach „erneut" weiter', async () => {
    const rewrite = vi.fn().mockRejectedValueOnce(new Error('Netz weg')).mockResolvedValue(VARIANTEN)
    const opts = optionen({ rewrite })
    const result = await starteDurchlauf(opts, 'schnell')

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'haelt', reason: 'anbieterfehler' }),
    )

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('fertig'))
  })

  it('meldet die unbelegten Aussagen der übernommenen Variante an', async () => {
    const opts = optionen()
    const result = await starteDurchlauf(opts, 'waehlen')

    await waitFor(() => expect(result.current.state.status).toBe('haelt'))

    act(() => result.current.choose(variant('gewählt', { unbackedClaims: ['erfunden'] })))

    await waitFor(() => expect(brief(opts).addClaims).toHaveBeenCalledWith(['erfunden']))
  })

  it('bricht ab, ohne weitere Anfragen zu stellen', async () => {
    const opts = optionen()
    const result = await starteDurchlauf(opts, 'waehlen')

    await waitFor(() => expect(result.current.state.status).toBe('haelt'))

    act(() => result.current.cancel())

    expect(result.current.state.status).toBe('abgebrochen')
    expect(brief(opts).rewrite).toHaveBeenCalledTimes(1)
  })

  it('überspringt eine Stelle und arbeitet die nächste ab', async () => {
    const opts = optionen()
    const result = await starteDurchlauf(opts, 'waehlen')

    await waitFor(() => expect(result.current.state.status).toBe('haelt'))

    act(() => result.current.skip())

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'haelt', index: 1 }),
    )
    expect(brief(opts).applyEdit).not.toHaveBeenCalled()
  })

  // Dieselbe Anzeige erneut auswerten zu lassen wäre eine bezahlte Anfrage
  // für ein bekanntes Ergebnis — und die Auswertung liefe mangels Änderung
  // gar nicht erst an, sodass der Durchlauf ewig wartete.
  it('wartet nicht auf eine Auswertung, wenn die Anzeige dieselbe bleibt', async () => {
    const opts = optionen({ currentJobAdText: 'Dieselbe Anzeige' })
    const { result } = renderHook(() => useReapply(opts))

    await act(async () => {
      result.current.start('Dieselbe Anzeige', 'schnell')
    })

    await waitFor(() => expect(result.current.state.status).toBe('fertig'))
    expect(opts.setJobAdText).not.toHaveBeenCalled()
  })
})

/**
 * Der Durchlauf über zwei Unterlagen. Er ist **einer**: Die Anzeige wird
 * einmal ausgewertet, die Stellen hängen hintereinander, der Bericht zählt
 * einmal.
 */
describe('useReapply — zwei Unterlagen', () => {
  it('stellt beide Originale her und arbeitet Anschreiben vor Lebenslauf ab', async () => {
    const brief = dokument({
      restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['mark-0'], unresolved: 0 }),
    })
    const lebenslauf = dokument({
      kind: 'cv',
      restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['mark-1'], unresolved: 0 }),
    })
    const opts = optionen({ documents: [brief, lebenslauf] })
    const result = await starteDurchlauf(opts, 'schnell')

    await waitFor(() => expect(result.current.state.status).toBe('fertig'))

    expect(brief.restoreOriginal).toHaveBeenCalledTimes(1)
    expect(lebenslauf.restoreOriginal).toHaveBeenCalledTimes(1)
    // Jede Unterlage bekommt genau ihre eigene Stelle eingesetzt.
    expect(brief.applyEdit).toHaveBeenCalledTimes(1)
    expect(lebenslauf.applyEdit).toHaveBeenCalledTimes(1)
    expect(brief.applyEdit).toHaveBeenCalledWith(marks[0].range, 'neu eins', { completes: true })
    expect(lebenslauf.applyEdit).toHaveBeenCalledWith(marks[1].range, 'neu eins', {
      completes: true,
    })
  })

  it('fragt für jede Unterlage ihre eigene Umformulierung an', async () => {
    const brief = dokument({
      restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['mark-0'], unresolved: 0 }),
    })
    const lebenslauf = dokument({
      kind: 'cv',
      restoreOriginal: vi.fn().mockResolvedValue({ markIds: ['mark-1'], unresolved: 0 }),
    })
    const result = await starteDurchlauf(optionen({ documents: [brief, lebenslauf] }), 'schnell')

    await waitFor(() => expect(result.current.state.status).toBe('fertig'))

    expect(brief.rewrite).toHaveBeenCalledTimes(1)
    expect(lebenslauf.rewrite).toHaveBeenCalledTimes(1)
  })
})

/**
 * Die Faktenprüfung hält auch den Schnellmodus an. „Schnell" heißt „ohne
 * Rückfrage, wo nichts zu entscheiden ist" — eine verschobene Jahreszahl ist
 * etwas zu entscheiden.
 */
describe('useReapply — veränderte Zahlen', () => {
  it('hält im Schnellmodus an, statt eine veränderte Jahreszahl einzusetzen', async () => {
    const opts = optionen({
      rewrite: vi.fn().mockResolvedValue([
        variant('Von 2018 bis 2022', { figures: { added: ['2018'], removed: ['2019'] } }),
        ...VARIANTEN.slice(1),
      ]),
    })
    const result = await starteDurchlauf(opts, 'schnell')

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'haelt', reason: 'faktenGeaendert' }),
    )
    expect(brief(opts).applyEdit).not.toHaveBeenCalled()
  })
})
