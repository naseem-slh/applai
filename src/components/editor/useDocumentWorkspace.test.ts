import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeStorage } from '@/components/app/appContext.testutils'
import { CV_DRAFT_ID, LETTER_DRAFT_ID, type LoadedDocument } from '@/components/app/appContext'
import { buildDocx, paragraphXml } from '@/lib/docx/docx.testutils'
import { useDocumentWorkspace, type DocumentWorkspaceOptions } from './useDocumentWorkspace'

/**
 * Die Zusage dieses Hakens: **Jedes Dokument hat seinen eigenen Zustand.**
 *
 * Sie ist der Grund, warum die Schale ihn zweimal aufruft, statt einen
 * gemeinsamen Arbeitsbereich umzuschalten. Bräche sie, verlöre ein Wechsel
 * zwischen Anschreiben und Lebenslauf den Rückgängig-Verlauf, die
 * vorgemerkten Stellen oder — am teuersten — den Entwurf.
 */

const BRIEF = 'Sehr geehrte Damen und Herren, ich bewerbe mich um die Stelle.'
const LEBENSLAUF = 'Berufserfahrung. Entwickelt Steuerungssoftware für die Fertigung.'

function loaded(text: string): LoadedDocument {
  return {
    fileName: 'unterlage.docx',
    source: 'docx',
    docxBase: buildDocx(paragraphXml(text)),
    text,
    multiColumn: false,
  }
}

function options(over: Partial<DocumentWorkspaceOptions> = {}): DocumentWorkspaceOptions {
  return {
    kind: 'letter',
    draftId: LETTER_DRAFT_ID,
    source: loaded(BRIEF),
    storage: createFakeStorage(),
    precise: true,
    keepMarks: false,
    ...over,
  }
}

describe('useDocumentWorkspace', () => {
  it('liest das hochgeladene Original ein und meldet danach fertig', async () => {
    const { result } = renderHook(() => useDocumentWorkspace(options()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failed).toBe(false)
    expect(result.current.document?.text).toBe(BRIEF)
  })

  it('tut nichts ohne Dokument — der Fall „nicht im Arbeitsumfang"', async () => {
    const { result } = renderHook(() => useDocumentWorkspace(options({ source: null })))

    expect(result.current.loading).toBe(false)
    expect(result.current.document).toBeNull()
    // Auch der Rückweg bleibt folgenlos, statt zu werfen.
    await expect(result.current.restoreOriginal()).resolves.toEqual({
      markIds: [],
      unresolved: 0,
    })
  })

  it('meldet eine unlesbare Datei, statt sie stillschweigend zu übergehen', async () => {
    const kaputt: LoadedDocument = { ...loaded(BRIEF), docxBase: new ArrayBuffer(8) }
    const { result } = renderHook(() => useDocumentWorkspace(options({ source: kaputt })))

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.document).toBeNull()
  })

  // Der Kern des Schnitts: zwei Aufrufe, zwei voneinander unabhängige Stände.
  it('hält zwei Dokumente getrennt — eigener Verlauf, eigener Entwurf', async () => {
    const storage = createFakeStorage()
    const brief = renderHook(() =>
      useDocumentWorkspace(options({ storage, source: loaded(BRIEF) })),
    )
    const lebenslauf = renderHook(() =>
      useDocumentWorkspace(
        options({
          storage,
          kind: 'cv',
          draftId: CV_DRAFT_ID,
          source: loaded(LEBENSLAUF),
        }),
      ),
    )

    await waitFor(() => expect(brief.result.current.document).not.toBeNull())
    await waitFor(() => expect(lebenslauf.result.current.document).not.toBeNull())

    expect(brief.result.current.document?.text).toBe(BRIEF)
    expect(lebenslauf.result.current.document?.text).toBe(LEBENSLAUF)
    expect(brief.result.current.kind).toBe('letter')
    expect(lebenslauf.result.current.kind).toBe('cv')

    // Kein gemeinsamer Verlauf: Was im einen geändert wird, lässt den
    // anderen unberührt.
    expect(brief.result.current.canUndo).toBe(false)
    expect(lebenslauf.result.current.canUndo).toBe(false)

    // Und kein gemeinsamer Entwurf: zwei Kennungen, zwei Datensätze.
    expect(LETTER_DRAFT_ID).not.toBe(CV_DRAFT_ID)
  })
})
