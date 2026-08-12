// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeVault,
  createHarness,
  type HarnessOptions,
} from '@/components/app/appContext.testutils'
import type { LoadedDocument } from '@/components/app/appContext'
import { PARAGRAPH_INDEX_ATTRIBUTE } from '@/components/editor/documentSelection'
import { mockFetchResponse } from '@/lib/ai/mockFetchResponse'
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

/**
 * Das primäre Zeigegerät (siehe `usePrecisePointer`). `coarse` ist der
 * Finger: Dann fällt die Feinmarkierung weg, das Tippen nicht.
 */
function stubPointer(coarse: boolean): void {
  window.matchMedia = vi.fn(() => ({
    matches: coarse,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
  window.getSelection()?.removeAllRanges()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// 14b — Modellaufrufe der Arbeitsfläche
// ---------------------------------------------------------------------------
//
// Geantwortet wird auf der Ebene von `fetch`, nicht durch ein Verstellen von
// `PROVIDERS` oder der Domänenfunktionen: Dann läuft der ganze Weg mit, den
// die Ansicht tatsächlich geht — Anonymisierung, Anbieter-Adapter, Zod-Grenze
// und die Prüfungen aus Aufgabe 11. Ein verstelltes `rewriteSelection` würde
// genau die Zusagen überspringen, um derentwillen es sie gibt.

/** Der Satz, den das Stilprofil als Beleg zitiert. Steht wörtlich im Fixture. */
const STYLE_SAMPLE = 'ich bewerbe mich hiermit um die ausgeschriebene Stelle.'

const JOB_AD_REPLY = {
  language: 'de',
  company: 'Musterwerk Solutions',
  position: 'Entwicklerin',
  contactPerson: null,
  salutation: null,
  requirements: [{ text: 'Erfahrung mit TypeScript', kind: 'skill' }],
  tone: 'sachlich',
}

const STYLE_REPLY = {
  formality: 70,
  traits: ['knappe Hauptsätze'],
  sample: STYLE_SAMPLE,
}

const VARIANT_TEXTS = [
  'Ich bewerbe mich um die ausgeschriebene Stelle und bringe viel Freude mit.',
  'Auf die ausgeschriebene Stelle bewerbe ich mich mit Nachdruck.',
  'Die ausgeschriebene Stelle passt genau zu meinem bisherigen Weg.',
]

interface FetchStubOptions {
  /** Die drei Varianten der Umformulierungs-Antwort. */
  variants?: { text: string; unbackedClaims: string[] }[]
  /** Antwort auf die Auswertung von Anzeige und Stilprofil unterdrücken. */
  failAnalysis?: boolean
}

/**
 * Beantwortet die drei möglichen Anfragen anhand des Systemprompts. Gemini
 * ist der Anbieter im Tresor, deshalb die Gemini-Hülle
 * (`candidates[0].content.parts[0].text`).
 */
function stubFetch(options: FetchStubOptions = {}) {
  const variants =
    options.variants ?? VARIANT_TEXTS.map((text) => ({ text, unbackedClaims: [] }))

  const calls: { system: string; user: string }[] = []
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: { text: string }[] }
      contents: { parts: { text: string }[] }[]
    }
    const system = body.systemInstruction.parts[0]!.text
    const user = body.contents[0]!.parts[0]!.text
    calls.push({ system, user })

    if (system.startsWith('Du analysierst eine Stellenanzeige')) {
      if (options.failAnalysis) return Promise.resolve(mockFetchResponse(401, {}))
      return Promise.resolve(geminiReply(JOB_AD_REPLY))
    }
    if (system.startsWith('Du analysierst den Schreibstil')) {
      if (options.failAnalysis) return Promise.resolve(mockFetchResponse(401, {}))
      return Promise.resolve(geminiReply(STYLE_REPLY))
    }
    return Promise.resolve(geminiReply({ variants }))
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function geminiReply(payload: unknown): Response {
  return mockFetchResponse(200, {
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
  })
}

/** Eine Sitzung mit entsperrtem Gemini-Schlüssel im Tresor. */
function unlockedVault() {
  return createFakeVault({
    getKey: vi.fn(() => 'test-key'),
    getProvider: vi.fn((): 'gemini' => 'gemini'),
  })
}

async function openVariants(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: t('editor.variants.trigger') }))
}

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

  it('nimmt einem groben Zeigegerät die Feinmarkierung weg, das Tippen aber nicht', async () => {
    stubPointer(true)
    setup()

    expect(await screen.findByText(t('editor.selection.touch'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.selection.currentParagraph') }),
    ).not.toBeInTheDocument()
    // „Ganzes Dokument" bleibt: Das ist der Weg, den `docs/spec.md` für
    // Mobilgeräte ausdrücklich offenhält.
    expect(
      screen.getByRole('button', { name: t('editor.selection.wholeDocument') }),
    ).toBeInTheDocument()

    // Und das Anschreiben bleibt beschreibbar. Die Checkliste nimmt nur die
    // Feinmarkierung weg; ein Brief, der sich unterwegs nicht einmal an
    // einer Stelle berichtigen ließe, wäre weniger wert als eine ungenaue
    // Einfügestelle.
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    type(0, 'Guten Tag,')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('editor.undo') })).toBeEnabled()
    })
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

  // Die Kontur im Text und der Hinweis in der Leiste sagen dasselbe: Ein
  // festgehaltener Absatz, der als **erster** betroffen ist, verrutscht
  // nicht (er bekommt immer ein Segment des Ersatztextes) und wird deshalb
  // auch nicht hervorgehoben. Sonst stünde eine Kontur im Text, über die
  // die Leiste kein Wort verliert, und die Bedeutung hinge allein an der
  // Farbe (DESIGN.md).
  it('hebt keinen Absatz hervor, über den die Leiste nichts sagt', async () => {
    setup({
      session: {
        letter: letterDocument({ docxBase: specialBytes, text: specialText }),
        userName: 'Marlene Ostwald',
      },
    })
    await screen.findByRole('textbox')

    // Absatz 3 („Zelle") ist der letzte einer Tabellenzelle und wird nie
    // entfernt — als einziger betroffener Absatz verrutscht dabei nichts.
    caretIn(2, 1)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))

    expect(
      await screen.findByText(t('editor.selection.summary', { chars: 'Zelle'.length })),
    ).toBeInTheDocument()
    expect(screen.queryByText(t('editor.retained.heading'))).not.toBeInTheDocument()
    expect(paragraphElement(2).className).toContain('border-transparent')
  })

  it('sagt vor dem ersten Zwischenstand, dass alle 20 Sekunden gesichert wird', async () => {
    setup()
    await screen.findByRole('textbox')

    expect(screen.getByText(t('editor.draft.idle'))).toBeInTheDocument()
  })
})

describe('Editor — Varianten (14b)', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
  })

  it('fragt beim Betreten Anzeige und Stilprofil ab und gibt danach den Knopf frei', async () => {
    const { calls } = stubFetch()
    setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')

    await waitFor(() =>
      expect(screen.queryByText(t('editor.analysis.loading'))).not.toBeInTheDocument(),
    )
    expect(calls).toHaveLength(2)
    expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeDisabled()

    // Erst mit einer Markierung ist der Knopf frei.
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeEnabled(),
    )
  })

  it('sagt während der Auswertung, worauf gewartet wird, und sperrt den Knopf solange', async () => {
    // Ein Anbieter, der nicht antwortet: Nur so bleibt der Wartezustand
    // stehen, während der Test hinschaut.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')

    expect(screen.getByText(t('editor.analysis.loading'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))
    expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeDisabled()
  })

  it('fragt gar nicht, solange der Tresor gesperrt ist, und sagt warum', async () => {
    const { fetchMock } = stubFetch()
    setup({ status: 'locked' })
    await screen.findByRole('textbox')

    expect(screen.getByText(t('vault.locked'))).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('meldet eine gescheiterte Auswertung übersetzt und versucht sie auf Wunsch erneut', async () => {
    stubFetch({ failAnalysis: true })
    setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t('ai.errors.invalid_key')),
    )

    // Jetzt antwortet der Anbieter wieder.
    stubFetch()
    fireEvent.click(screen.getByRole('button', { name: t('editor.analysis.retry') }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  // Der Kernpunkt der Aufgabe: Die übernommene Variante steht danach im
  // Dokument, nicht nur im DOM.
  it('übernimmt eine Variante in den Dokumenttext und macht das mit Strg+Z rückgängig', async () => {
    stubFetch()
    setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')
    const original = paragraphElement(1).textContent

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()

    await screen.findByText(VARIANT_TEXTS[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)

    await waitFor(() => expect(paragraphElement(1).textContent).toBe(VARIANT_TEXTS[0]))

    undoShortcut()

    await waitFor(() => expect(paragraphElement(1).textContent).toBe(original))
  })

  it('schickt die Auswahl mit ihrem Kontext, aber ohne den Klarnamen an den Anbieter', async () => {
    const { calls } = stubFetch()
    setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)

    const rewriteCall = calls.at(-1)!
    expect(rewriteCall.user).toContain('ich bewerbe mich hiermit')
    expect(rewriteCall.user).toContain('Sehr geehrte Damen und Herren,')
    expect(rewriteCall.user).not.toContain('Marlene Ostwald')
  })

  // Die Exportsperre aus G10, am ganzen Weg: Modus umstellen, Variante mit
  // einer unbelegten Aussage übernehmen, Sperre steht — bestätigen, Sperre
  // fällt.
  it('sperrt den Export, solange eine unbelegte Aussage unbestätigt im Brief steht', async () => {
    stubFetch({
      variants: [
        {
          text: 'Ich spreche fließend Finnisch und bringe Freude mit.',
          unbackedClaims: ['spreche fließend Finnisch'],
        },
        { text: VARIANT_TEXTS[1]!, unbackedClaims: [] },
        { text: VARIANT_TEXTS[2]!, unbackedClaims: [] },
      ],
    })
    setup({ vault: unlockedVault(), settings: { truthMode: 'free' } })
    await screen.findByRole('textbox')

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()

    await screen.findByText('Ich spreche fließend Finnisch und bringe Freude mit.')
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)

    // Die Sperre steht, die Aussage ist im Wortlaut genannt, und der Absatz
    // im Text ist markiert.
    const blocked = await screen.findByText(t('editor.claims.blocked', { count: 1 }))
    expect(blocked).toBeInTheDocument()
    expect(screen.getByText('spreche fließend Finnisch')).toBeInTheDocument()
    expect(paragraphElement(1).className).toContain('border-[var(--color-error)]')

    fireEvent.click(screen.getByRole('button', { name: t('editor.claims.confirm') }))

    expect(await screen.findByText(t('editor.claims.released'))).toBeInTheDocument()
    expect(paragraphElement(1).className).not.toContain('border-[var(--color-error)]')
  })

  it('nimmt die Sperre zurück, sobald die Aussage nicht mehr im Brief steht', async () => {
    stubFetch({
      variants: [
        {
          text: 'Ich spreche fließend Finnisch.',
          unbackedClaims: ['spreche fließend Finnisch'],
        },
        { text: VARIANT_TEXTS[1]!, unbackedClaims: [] },
        { text: VARIANT_TEXTS[2]!, unbackedClaims: [] },
      ],
    })
    setup({ vault: unlockedVault(), settings: { truthMode: 'free' } })
    await screen.findByRole('textbox')

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText('Ich spreche fließend Finnisch.')
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)
    await screen.findByText(t('editor.claims.blocked', { count: 1 }))

    // Von Hand überschrieben: Damit ist die Aussage weg, und mit ihr die
    // Sperre — ohne dass irgendetwas nachgeführt werden müsste.
    type(1, 'Ich lerne gerade Finnisch.')

    await waitFor(() =>
      expect(screen.queryByText(t('editor.claims.blocked', { count: 1 }))).not.toBeInTheDocument(),
    )
  })

  // Der Tresor sperrt sich nach der Untätigkeitsfrist still — ohne Ereignis
  // und ohne Rendern (siehe `VaultLockedError`). Sobald irgendetwas die
  // Ansicht neu rendert, darf sie keine Umformulierung mehr anbieten: Der
  // Schlüssel, den sie dafür bräuchte, liegt nicht mehr im Arbeitsspeicher.
  it('bietet keine Umformulierung mehr an, sobald der Tresor sich gesperrt hat', async () => {
    const { fetchMock } = stubFetch()
    const vault = unlockedVault()
    setup({ vault })
    await screen.findByRole('textbox')
    await waitFor(() =>
      expect(screen.queryByText(t('editor.analysis.loading'))).not.toBeInTheDocument(),
    )
    const callsBefore = fetchMock.mock.calls.length

    // Ab hier ist der Tresor gesperrt, ohne dass er es jemandem sagt.
    vi.mocked(vault.getKey).mockReturnValue(null)

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))

    expect(await screen.findByText(t('vault.locked'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeDisabled()
    expect(fetchMock.mock.calls).toHaveLength(callsBefore)
  })

  it('schaltet den freien Modus erst nach ausdrücklicher Zustimmung ein', async () => {
    stubFetch()
    const { harness } = setup({ vault: unlockedVault() })
    await screen.findByRole('textbox')

    fireEvent.pointerDown(screen.getByRole('combobox', { name: t('editor.truthMode.label') }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('option', { name: t('settings.truthMode.options.free') }))

    await screen.findByText(t('editor.truthMode.free.export'))
    expect(harness.updateSettings).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t('editor.truthMode.free.confirmAction') }))

    expect(harness.updateSettings).toHaveBeenCalledWith({ truthMode: 'free' })
  })
})
