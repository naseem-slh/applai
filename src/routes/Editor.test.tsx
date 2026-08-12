// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHarness, type HarnessOptions } from '@/components/app/appContext.testutils'
import type { LoadedDocument } from '@/components/app/appContext'
import { PARAGRAPH_INDEX_ATTRIBUTE } from '@/components/editor/documentSelection'
import { parseDocx } from '@/lib/docx/parse'
import i18n from '@/lib/i18n/i18n'
import Editor from './Editor'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures')

let letterBytes: ArrayBuffer
let letterText: string
let specialBytes: ArrayBuffer
let specialText: string

async function fixtureBytes(fileName: string): Promise<ArrayBuffer> {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

beforeAll(async () => {
  letterBytes = await fixtureBytes('anschreiben.docx')
  letterText = (await parseDocx(letterBytes)).text
  specialBytes = await fixtureBytes('anschreiben-sonderfaelle.docx')
  specialText = (await parseDocx(specialBytes)).text
})

function letterDocument(overrides: Partial<LoadedDocument> = {}): LoadedDocument {
  return {
    fileName: 'anschreiben.docx',
    source: 'docx',
    docxBase: letterBytes,
    text: letterText,
    multiColumn: false,
    ...overrides,
  }
}

function setup(options: HarnessOptions = {}) {
  const harness = createHarness({
    session: {
      letter: letterDocument(),
      cv: null,
      jobAdText: 'Wir suchen eine Entwicklerin.',
      userName: 'Marlene Ostwald',
    },
    ...options,
  })

  const view = render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route path="/" element={<p>Einstiegsseite</p>} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
    { wrapper: harness.wrapper },
  )
  return { ...view, harness }
}

function paragraphElement(index: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}="${index}"]`)
  if (element === null) throw new Error(`Absatz ${index} nicht gefunden`)
  return element
}

/** Tippen, so weit jsdom es kann: Text setzen und die Eingabe melden. */
function type(index: number, text: string): void {
  const element = paragraphElement(index)
  element.textContent = text
  fireEvent.input(element)
}

/**
 * Cursor in einen Absatz setzen. jsdom löst `selectionchange` nicht selbst
 * aus (nachgemessen), deshalb wird es hier von Hand verschickt.
 */
function caretIn(index: number, offset = 0): void {
  const element = paragraphElement(index)
  const node = element.firstChild ?? element
  window.getSelection()?.setBaseAndExtent(node, offset, node, offset)
  fireEvent(document, new Event('selectionchange'))
}

function undoShortcut(): void {
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
}

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn(() => ({
    matches,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
  window.getSelection()?.removeAllRanges()
})

describe('Editor', () => {
  // Weitergabe aus 13c: kein nachgebauter Leerzustand, sondern dieselbe
  // Antwort wie der Wächter vor der Route.
  it('schickt einen Aufruf ohne Übergabestand zurück auf die Einstiegsseite', async () => {
    setup({ session: undefined })

    expect(await screen.findByText('Einstiegsseite')).toBeInTheDocument()
  })

  it('verlangt ein Anschreiben, wenn nur ein Lebenslauf vorliegt', async () => {
    setup({ session: { letter: null, cv: letterDocument(), userName: 'Marlene Ostwald' } })

    expect(await screen.findByText(t('editor.noLetter.heading'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('editor.backToStart') })).toBeInTheDocument()
  })

  it('meldet eine Datei, die sich nicht lesen lässt', async () => {
    setup({
      session: {
        letter: letterDocument({ docxBase: new ArrayBuffer(8) }),
        userName: 'Marlene Ostwald',
      },
    })

    expect(await screen.findByText(t('editor.failed.heading'))).toBeInTheDocument()
  })

  it('bringt kein eigenes <main> mit', async () => {
    const { container } = setup()

    await screen.findByRole('textbox')
    expect(container.querySelectorAll('main')).toHaveLength(0)
    expect(
      screen.getByRole('heading', { level: 1, name: t('routes.editor.heading') }),
    ).toBeInTheDocument()
  })

  it('zeigt das Anschreiben als ein bearbeitbares Feld mit allen Absätzen', async () => {
    setup()

    const box = await screen.findByRole('textbox')
    expect(box.querySelectorAll(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`)).toHaveLength(5)
    expect(paragraphElement(0)).toHaveTextContent('Sehr geehrte Damen und Herren,')
  })

  it('markiert auf Knopfdruck das ganze Dokument', async () => {
    setup()
    await screen.findByRole('textbox')

    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))

    expect(
      await screen.findByText(t('editor.selection.summary', { chars: letterText.length })),
    ).toBeInTheDocument()
  })

  it('markiert den Absatz, in dem der Cursor steht', async () => {
    setup()
    await screen.findByRole('textbox')

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))

    const paragraphText =
      'ich bewerbe mich hiermit um die ausgeschriebene Stelle. Meine Motivation ist hoch.'
    expect(
      await screen.findByText(t('editor.selection.summary', { chars: paragraphText.length })),
    ).toBeInTheDocument()
  })

  it('übernimmt eine Eingabe ins Modell und macht sie mit Strg+Z rückgängig', async () => {
    setup()
    await screen.findByRole('textbox')
    const original = paragraphElement(0).textContent

    type(0, 'Guten Tag,')

    // Das Modell hat die Änderung übernommen: Andernfalls schriebe die
    // Ansicht den Absatz beim nächsten Rendern auf den alten Text zurück.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('editor.undo') })).toBeEnabled()
    })
    expect(paragraphElement(0).textContent).toBe('Guten Tag,')

    undoShortcut()

    await waitFor(() => {
      expect(paragraphElement(0).textContent).toBe(original)
    })
  })

  it('fasst zusammenhängendes Tippen in einem Absatz zu einem Schritt zusammen', async () => {
    setup()
    await screen.findByRole('textbox')
    const original = paragraphElement(0).textContent

    type(0, 'Sehr geehrte Damen und Herren')
    type(0, 'Sehr geehrte Damen und Herre')
    type(0, 'Sehr geehrte Damen und Herr')

    undoShortcut()

    await waitFor(() => {
      expect(paragraphElement(0).textContent).toBe(original)
    })
    expect(screen.getByRole('button', { name: t('editor.undo') })).toBeDisabled()
  })

  it('trennt Eingaben in verschiedenen Absätzen in eigene Schritte', async () => {
    setup()
    await screen.findByRole('textbox')
    const first = paragraphElement(0).textContent

    type(0, 'Guten Tag,')
    type(1, 'Kurzer Text.')

    undoShortcut()

    await waitFor(() => {
      expect(paragraphElement(1).textContent).not.toBe('Kurzer Text.')
    })
    // Der erste Schritt steht noch, zurückgenommen wurde nur der zweite.
    expect(paragraphElement(0).textContent).toBe('Guten Tag,')
    expect(screen.getByRole('button', { name: t('editor.undo') })).toBeEnabled()

    undoShortcut()
    await waitFor(() => {
      expect(paragraphElement(0).textContent).toBe(first)
    })
  })

  it('sperrt Rückgängig, solange nichts geändert wurde', async () => {
    setup()
    await screen.findByRole('textbox')

    expect(screen.getByRole('button', { name: t('editor.undo') })).toBeDisabled()
  })

  it('nimmt auf einem schmalen Bildschirm die Feinmarkierung weg', async () => {
    stubMatchMedia(false)
    setup()

    expect(await screen.findByText(t('editor.selection.narrow'))).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.selection.currentParagraph') }),
    ).not.toBeInTheDocument()
    // „Ganzes Dokument" bleibt: Das ist der Weg, den `docs/spec.md` für
    // Mobilgeräte ausdrücklich offenhält.
    expect(
      screen.getByRole('button', { name: t('editor.selection.wholeDocument') }),
    ).toBeInTheDocument()
  })

  // Weitergabe aus Aufgabe 3, am ganzen Weg: markieren, und die Warnung
  // steht da, bevor irgendetwas ersetzt wurde.
  it('warnt beim Markieren über einen Absatz mit fester Einbettung hinweg', async () => {
    setup({
      session: {
        letter: letterDocument({ docxBase: specialBytes, text: specialText }),
        userName: 'Marlene Ostwald',
      },
    })
    await screen.findByRole('textbox')

    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))

    expect(await screen.findByText(t('editor.retained.heading'))).toBeInTheDocument()
    expect(
      screen.getByText(
        t('editor.retained.entry', {
          number: 2,
          reason: t('editor.retained.reason.embeddedContent'),
        }),
      ),
    ).toBeInTheDocument()
    // Und der Absatz ist im Text zu finden, nicht nur in der Meldung.
    expect(paragraphElement(1).className).toContain('border-[var(--color-warning)]')
  })

  it('sagt vor dem ersten Zwischenstand, dass alle 20 Sekunden gesichert wird', async () => {
    setup()
    await screen.findByRole('textbox')

    expect(screen.getByText(t('editor.draft.idle'))).toBeInTheDocument()
  })
})
