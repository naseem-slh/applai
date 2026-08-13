// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeStorage,
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

/**
 * Die Dokumentfläche, über ihren Namen. Seit 14c stehen daneben die Felder
 * der Seitenspalte; ein Zugriff nur über die Rolle träfe die auch.
 */
function documentSurface(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: t('editor.document.heading') })
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
  // Explizit als `string | null` getippt (statt der sonst aus dem
  // Literal `null` abgeleiteten Type `null`): Overrides in `ready({ jobAd:
  // … })` müssen hier auch einen Ansprechpartner samt Anrede setzen können
  // (Korrekturrunde Task 6, Anrede-Tests unten).
  contactPerson: null as string | null,
  salutation: null as string | null,
  requirements: [{ text: 'Erfahrung mit TypeScript', kind: 'skill' }],
  tone: 'sachlich',
}

const STYLE_REPLY = {
  formality: 70,
  traits: ['knappe Hauptsätze'],
  sample: STYLE_SAMPLE,
}

const GAPS_REPLY = {
  assessments: [{ index: 0, status: 'covered', evidence: 'Im Lebenslauf genannt' }],
}

/** Was der Übersetzungsschritt zurückgibt, wenn die Zielsprache abweicht. */
const TRANSLATED_SELECTION =
  'I am applying for the advertised position. My motivation is high.'

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
  /** Abweichende Felder der Anzeigen-Antwort. */
  jobAd?: Partial<typeof JOB_AD_REPLY>
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
      return Promise.resolve(geminiReply({ ...JOB_AD_REPLY, ...options.jobAd }))
    }
    if (system.startsWith('Du analysierst den Schreibstil')) {
      if (options.failAnalysis) return Promise.resolve(mockFetchResponse(401, {}))
      return Promise.resolve(geminiReply(STYLE_REPLY))
    }
    if (system.startsWith('Du prüfst')) {
      return Promise.resolve(geminiReply(GAPS_REPLY))
    }
    if (system.startsWith('Du übersetzt')) {
      // Bei abweichender Zielsprache läuft erst dieser Schritt, dann die
      // Umformulierung (Aufgabe 11, zwei getrennte Aufrufe). Die Antwort
      // muss ungefähr so lang sein wie die Auswahl, sonst gilt sie als
      // „Kontext mitübersetzt".
      return Promise.resolve(geminiReply({ translation: TRANSLATED_SELECTION }))
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

    await documentSurface()
    expect(container.querySelectorAll('main')).toHaveLength(0)
    expect(
      screen.getByRole('heading', { level: 1, name: t('routes.editor.heading') }),
    ).toBeInTheDocument()
  })

  it('zeigt das Anschreiben als ein bearbeitbares Feld mit allen Absätzen', async () => {
    setup()

    const box = await documentSurface()
    expect(box.querySelectorAll(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`)).toHaveLength(5)
    expect(paragraphElement(0)).toHaveTextContent('Sehr geehrte Damen und Herren,')
  })

  it('markiert auf Knopfdruck das ganze Dokument', async () => {
    setup()
    await documentSurface()

    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))

    expect(
      await screen.findByText(t('editor.selection.summary', { chars: letterText.length })),
    ).toBeInTheDocument()
  })

  it('markiert den Absatz, in dem der Cursor steht', async () => {
    setup()
    await documentSurface()

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
    await documentSurface()
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
    await documentSurface()
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
    await documentSurface()
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
    await documentSurface()

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
    expect(
      screen.getByRole('textbox', { name: t('editor.document.heading') }),
    ).toBeInTheDocument()
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
    await documentSurface()

    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))

    // Der Vermerk steht sofort in der Leiste. Die Einzelheiten kommen auf
    // Nachfrage dazu, damit die Zeile ihre Hoehe behaelt (Variante A).
    // Die Vorlage haelt drei solche Absaetze fest; der Vermerk zaehlt sie.
    fireEvent.click(
      await screen.findByRole('button', { name: t('editor.retained.short', { count: 3 }) }),
    )

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
    await documentSurface()

    // Absatz 3 („Zelle") ist der letzte einer Tabellenzelle und wird nie
    // entfernt — als einziger betroffener Absatz verrutscht dabei nichts.
    caretIn(2, 1)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))

    expect(
      await screen.findByText(t('editor.selection.summary', { chars: 'Zelle'.length })),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.retained.short', { count: 1 }) }),
    ).not.toBeInTheDocument()
    expect(paragraphElement(2).className).toContain('border-transparent')
  })

  it('sagt vor dem ersten Zwischenstand, dass von selbst gesichert wird', async () => {
    setup()
    await documentSurface()

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
    await documentSurface()

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
    await documentSurface()

    expect(screen.getByText(t('editor.analysis.loading'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))
    expect(screen.getByRole('button', { name: t('editor.variants.trigger') })).toBeDisabled()
  })

  it('fragt gar nicht, solange der Tresor gesperrt ist, und sagt warum', async () => {
    const { fetchMock } = stubFetch()
    setup({ status: 'locked' })
    await documentSurface()

    expect(screen.getByText(t('vault.locked'))).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('meldet eine gescheiterte Auswertung übersetzt und versucht sie auf Wunsch erneut', async () => {
    stubFetch({ failAnalysis: true })
    setup({ vault: unlockedVault() })
    await documentSurface()

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
    await documentSurface()
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
    await documentSurface()

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
    await documentSurface()

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
    await documentSurface()

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
    await documentSurface()
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
    await documentSurface()

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

describe('Editor — Seitenspalte und Sprache (14c)', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
  })

  /**
   * Eine englische Stellenanzeige. Die Sprache kommt aus dem **Text**, nicht
   * aus der Modellantwort: `analyzeJobAd` überschreibt das `language`-Feld
   * der Antwort immer mit der deterministischen Erkennung (Aufgabe 9,
   * „reproduzierbar schlägt Modellmeinung").
   */
  const ENGLISH_JOB_AD = [
    'We are looking for a frontend engineer to join our platform team.',
    'You will work with React and TypeScript and review the code of others.',
    'A degree in computer science or equivalent experience is required.',
  ].join('\n')

  function englishAdSession(): HarnessOptions {
    return {
      session: {
        letter: letterDocument(),
        cv: null,
        jobAdText: ENGLISH_JOB_AD,
        userName: 'Marlene Ostwald',
      },
    }
  }

  /**
   * Gewartet wird über den Text, nicht über eine Rolle: Steht die
   * Sprach-Nachfrage offen, legt Radix `aria-hidden` über den Rest der
   * Seite, und eine Abfrage nach der Rolle fände die Dokumentfläche dann
   * nicht mehr — was richtig ist (sie ist hinter einem modalen Dialog auch
   * nicht bedienbar), aber hier nur den Aufbau des Tests beträfe.
   */
  async function ready(options: Parameters<typeof stubFetch>[0] = {}, harness: HarnessOptions = {}) {
    const stub = stubFetch(options)
    const view = setup({ vault: unlockedVault(), ...harness })
    await waitFor(() => expect(paragraphElement(0)).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.queryByText(t('editor.analysis.loading'))).not.toBeInTheDocument(),
    )
    return { ...view, ...stub }
  }

  it('füllt den Briefkopf aus der ausgewerteten Anzeige vor', async () => {
    await ready()

    expect(screen.getByLabelText(t('editor.letterhead.fields.recipient'))).toHaveValue(
      'Musterwerk Solutions',
    )
    expect(screen.getByLabelText(t('editor.letterhead.fields.subject'))).toHaveValue(
      'Bewerbung als Entwicklerin',
    )
    // Ohne Ansprechpartner die übliche Formel, keine erfundene Person.
    expect(screen.getByLabelText(t('editor.letterhead.fields.salutation'))).toHaveValue(
      'Sehr geehrte Damen und Herren,',
    )
  })

  /**
   * Korrekturrunde (Task 6, komma-Fix): Mit der allgemeinen Formel deckt
   * sich der Vorschlag inzwischen zeichengleich mit der Anrede der Fixture
   * ("Sehr geehrte Damen und Herren," — vorher wie nachher). Ein Absatz, der
   * sich nicht ändert, beweist die Übernahme nicht mehr. Ein Ansprechpartner
   * in der Anzeige liefert stattdessen einen Vorschlag, der sich inhaltlich
   * von der Fixture unterscheidet — das beweist die Übernahme unabhängig
   * vom Komma. (Empfänger/Betreff scheiden aus: In dieser Fixture steht die
   * Anrede bereits in Absatz 0, `matchLetterhead` sucht Empfänger/Datum/
   * Betreff aber nur in den Absätzen OBERHALB der Anrede — hier also nie.)
   */
  const JOB_AD_MIT_ANSPRECHPARTNER = {
    contactPerson: 'Dr. Thomas Weber',
    salutation: 'Sehr geehrter Herr Dr. Weber',
  }

  it('übernimmt den Briefkopf selbsttätig, sobald die Analyse fertig ist', async () => {
    await ready({ jobAd: JOB_AD_MIT_ANSPRECHPARTNER })

    expect(await screen.findByText(t('editor.letterhead.applied.heading'))).toBeInTheDocument()
    await waitFor(() =>
      expect(paragraphElement(0).textContent).toBe('Sehr geehrter Herr Dr. Weber,'),
    )
  })

  it('nimmt die gesamte Übernahme mit einem einzigen Schritt zurück', async () => {
    await ready({ jobAd: JOB_AD_MIT_ANSPRECHPARTNER })
    await screen.findByText(t('editor.letterhead.applied.heading'))
    // Die Übernahme hat tatsächlich stattgefunden: Absatz 0 trägt die neue
    // Anrede aus der Anzeige, nicht mehr die der Fixture.
    expect(paragraphElement(0).textContent).toBe('Sehr geehrter Herr Dr. Weber,')
    expect(screen.getByRole('button', { name: t('editor.undo') })).toBeEnabled()

    undoShortcut()

    // Der Ursprungszustand, nicht bloß irgendein anderer Text: Absatz 0
    // trägt wieder exakt die Anrede der Fixture.
    await waitFor(() =>
      expect(paragraphElement(0).textContent).toBe('Sehr geehrte Damen und Herren,'),
    )
    expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
    // Ein einziger Schritt für die ganze Übernahme: Nach genau einem Undo
    // bleibt nichts mehr rückgängig zu machen. Vier einzelne commit()-Aufrufe
    // (einer je Feld, im Auftrag ausdrücklich verboten) hinterließen hier
    // noch weitere Schritte in der Historie, und dieser Knopf bliebe
    // aktiviert.
    expect(screen.getByRole('button', { name: t('editor.undo') })).toBeDisabled()
  })

  it('übernimmt nicht ein zweites Mal, wenn der Nutzer den Brief bearbeitet', async () => {
    await ready()
    await screen.findByText(t('editor.letterhead.applied.heading'))
    fireEvent.click(screen.getByRole('button', { name: t('editor.letterhead.applied.dismiss') }))

    type(1, 'Ein neuer Satz im Brief.')

    await waitFor(() => expect(paragraphElement(1).textContent).toBe('Ein neuer Satz im Brief.'))
    expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
  })

  /**
   * Befund 2: `appliedFor` ist ein `useRef` und stirbt mit der Komponente.
   * Über „zuletzt bearbeitet" (`Start.handleUseRecent`) lädt die Anwendung
   * `draft.docxBase` — den Arbeitsstand, in dem der Briefkopf schon steht —
   * und `useLetterAnalysis` liefert dieselbe Anzeige aus dem
   * Auswertungsspeicher als FRISCHES Objekt (neue Identität, aber
   * inhaltsgleich). Ohne Schutz liefe die Übernahme ein zweites Mal und
   * überschriebe eine Korrektur, die der Nutzer von Hand an der Anrede
   * vorgenommen hat — genau das prüft dieser Fall: Der Brief trägt bereits
   * eine ANDERE Anrede als die, die `suggestLetterhead` erneut vorschlagen
   * würde (der Nutzer hat sie also bewusst geändert), und sie muss stehen
   * bleiben.
   *
   * `LoadedDocument.source === 'draft'` ist das Merkmal, an dem sich ein
   * fortgesetzter Entwurf erkennen lässt (gesetzt einzig in
   * `Start.handleUseRecent`, siehe `appContext.ts`) — die selbsttätige
   * Übernahme unterbleibt dafür ganz, statt sich auf einen reinen
   * Text-Vergleich (Befund 4) zu verlassen, der genau diesen
   * Handkorrektur-Fall nicht abfinge (der neue Vorschlag unterscheidet sich
   * ja bewusst von dem, was jetzt im Brief steht).
   */
  it('übernimmt den Briefkopf nicht noch einmal, wenn ein fortgesetzter Entwurf geladen wird', async () => {
    await ready(
      { jobAd: JOB_AD_MIT_ANSPRECHPARTNER },
      {
        session: {
          letter: letterDocument({ source: 'draft' }),
          cv: null,
          jobAdText: 'Wir suchen eine Entwicklerin.',
          userName: 'Marlene Ostwald',
        },
      },
    )

    // Beweis, dass Auswertung und Vorschlag durchgelaufen sind — und damit
    // auch der Renderzyklus, in dem die selbsttätige Übernahme liefe, wenn
    // sie nicht unterbunden wäre.
    await waitFor(() =>
      expect(screen.getByLabelText(t('editor.letterhead.fields.salutation'))).toHaveValue(
        'Sehr geehrter Herr Dr. Weber,',
      ),
    )

    expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
    expect(paragraphElement(0).textContent).toBe('Sehr geehrte Damen und Herren,')
  })

  it('setzt ein Briefkopf-Feld an der Markierung ein und macht das mit Strg+Z rückgängig', async () => {
    await ready()
    const original = paragraphElement(0).textContent

    caretIn(0, 2)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))

    const insertButtons = screen.getAllByRole('button', { name: t('editor.letterhead.insert') })
    fireEvent.click(insertButtons[3]!)

    await waitFor(() =>
      expect(paragraphElement(0).textContent).toBe('Sehr geehrte Damen und Herren,'),
    )

    undoShortcut()

    await waitFor(() => expect(paragraphElement(0).textContent).toBe(original))
  })

  it('sperrt das Einsetzen, solange nichts markiert ist', async () => {
    await ready()

    for (const button of screen.getAllByRole('button', { name: t('editor.letterhead.insert') })) {
      expect(button).toBeDisabled()
    }
  })

  it('zeigt die Anforderungen der Anzeige ohne weiteren Modellaufruf', async () => {
    const { calls } = await ready()

    expect(screen.getByText('Erfahrung mit TypeScript')).toBeInTheDocument()
    expect(calls).toHaveLength(2)
  })

  it('holt den Abgleich erst auf Knopfdruck und nennt ihn dann eine Einschätzung', async () => {
    const { calls } = await ready()

    fireEvent.click(screen.getByRole('button', { name: t('editor.gaps.run') }))

    expect(await screen.findByText(t('editor.gaps.status.covered'))).toBeInTheDocument()
    expect(calls).toHaveLength(3)
    expect(screen.getByText(t('editor.gaps.assessment'))).toBeInTheDocument()
  })

  it('übernimmt eine Korrektur am Stilprofil in den nächsten Auftrag an das Modell', async () => {
    const { calls } = await ready()

    fireEvent.change(screen.getByLabelText(t('editor.style.traitsLabel')), {
      target: { value: 'schreibt ausschließlich in Fragen' },
    })

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)

    const rewriteCall = calls.at(-1)!
    expect(rewriteCall.user).toContain('schreibt ausschließlich in Fragen')
    expect(rewriteCall.user).not.toContain('knappe Hauptsätze')
  })

  it('markiert einen Firmennamen aus einer früheren Bewerbung im Text', async () => {
    const storage = createFakeStorage({
      applications: [
        { id: 'a1', company: 'Musterwerk Solutions', position: 'Entwicklerin', date: '2026-01-01' },
        { id: 'a2', company: 'Herren', position: 'Irgendwas', date: '2026-02-01' },
      ],
    })
    await ready({}, { storage })

    // „Herren" steht im ersten Absatz des Anschreibens und gehört nicht zur
    // aktuellen Anzeige; „Musterwerk Solutions" ist die aktuelle Firma und
    // wird deshalb nicht gemeldet.
    expect(
      await screen.findByText(
        t('editor.letterhead.foreign.entry', { name: 'Herren', number: 1 }),
      ),
    ).toBeInTheDocument()
    expect(paragraphElement(0).className).toContain('border-[var(--color-error)]')
  })

  // docs/spec.md: „Zielsprache = Sprache der Anzeige. Nachfrage nur bei
  // Abweichung." Der Regelfall ist die Übereinstimmung.
  it('fragt nichts, wenn Anzeige und Anschreiben dieselbe Sprache haben', async () => {
    await ready()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fragt bei abweichender Sprache und weist auf die Gepflogenheiten hin', async () => {
    await ready({}, englishAdSession())

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(t('editor.language.customs.heading'))
  })

  it('übersetzt erst, nachdem der Wechsel bestätigt wurde', async () => {
    const { calls } = await ready({}, englishAdSession())

    fireEvent.click(
      await screen.findByRole('button', {
        name: t('editor.language.switch', { language: t('editor.language.names.en') }),
      }),
    )

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)

    // Bei abweichender Zielsprache läuft erst ein Übersetzungsschritt
    // (Aufgabe 11), dann die Umformulierung: zwei Aufrufe statt einem.
    expect(calls).toHaveLength(4)
  })

  it('bleibt bei der Sprache des Briefes, wenn die Nachfrage abgelehnt wird', async () => {
    const { calls } = await ready({}, englishAdSession())

    fireEvent.click(
      await screen.findByRole('button', {
        name: t('editor.language.keep', { language: t('editor.language.names.de') }),
      }),
    )

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)

    expect(calls).toHaveLength(3)
  })

  it('fragt die Sprache nur einmal', async () => {
    await ready({}, englishAdSession())

    fireEvent.click(
      await screen.findByRole('button', {
        name: t('editor.language.keep', { language: t('editor.language.names.de') }),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    type(0, 'Guten Tag,')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('editor.undo') })).toBeEnabled(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Editor — Export (15)', () => {
  function stubDownload() {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    })
    return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  }

  it('trägt nach dem Word-Export die Bewerbung ein und löscht den Zwischenstand', async () => {
    const click = stubDownload()
    stubFetch()
    const storage = createFakeStorage({
      drafts: new Map([
        ['letter', { id: 'letter', docxBase: new ArrayBuffer(8), text: 'x', savedAt: 1 }],
      ]),
    })
    setup({ vault: unlockedVault(), storage })
    await documentSurface()
    await waitFor(() =>
      expect(screen.queryByText(t('editor.analysis.loading'))).not.toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.docx') }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    await waitFor(() => expect(storage.state.applications).toHaveLength(1))
    expect(storage.state.applications[0]).toMatchObject({
      company: 'Musterwerk Solutions',
      position: 'Entwicklerin',
    })
    expect(storage.state.applications[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await waitFor(() => expect(storage.state.drafts.has('letter')).toBe(false))

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // G10, der ganze Weg: freier Modus, unbestätigte Aussage im Brief, und
  // kein Weg führt hinaus.
  it('sperrt den Export, solange eine unbelegte Aussage unbestätigt ist, und gibt ihn danach frei', async () => {
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
    await documentSurface()

    caretIn(1, 3)
    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
    await openVariants()
    await screen.findByText('Ich spreche fließend Finnisch.')
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: t('editor.export.pdf') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.export.copy') })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: t('editor.claims.confirm') }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeEnabled(),
    )
  })

  it('markiert genau das Blatt für den Druck, nicht die ganze Seite', async () => {
    stubFetch()
    const { container } = setup({ vault: unlockedVault() })
    await documentSurface()

    const marked = container.querySelectorAll('[data-print-document]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.querySelector(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`)).not.toBeNull()
    // Die Werkzeugleiste gehört nicht dazu.
    expect(
      marked[0]!.contains(screen.getByRole('button', { name: t('editor.selection.wholeDocument') })),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Vorgemerkte Stellen
// ---------------------------------------------------------------------------

/** Der Eintrag mit dieser Nummer in der Merkliste. */
function markEntry(number: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${number}\\.`) })
}

/**
 * Einen Absatz markieren. Das **ist** das Vormerken — einen eigenen Knopf
 * dafür gibt es nicht mehr.
 */
function markParagraph(index: number): void {
  caretIn(index, 3)
  fireEvent.click(screen.getByRole('button', { name: t('editor.selection.currentParagraph') }))
}

describe('Editor — vorgemerkte Stellen', () => {
  it('merkt die markierte Stelle vor und führt sie in der Liste', async () => {
    setup()
    await documentSurface()
    const paragraphText = paragraphElement(1).textContent ?? ''

    markParagraph(1)

    expect(screen.getByText(t('editor.marks.progress', { done: 0, total: 1 }))).toBeInTheDocument()
    expect(markEntry(1).textContent).toContain(paragraphText.slice(0, 20))
  })

  it('hebt die Vormerkung auf, wenn dieselbe Stelle noch einmal markiert wird', async () => {
    setup()
    await documentSurface()
    markParagraph(1)

    markParagraph(1)

    expect(screen.getByText(t('editor.marks.none'))).toBeInTheDocument()
  })

  // „Ganzes Dokument" ist bewusst ausgenommen: Es würde jede vorgemerkte
  // Stelle durch eine einzige ersetzen, die den ganzen Brief überdeckt.
  it('merkt bei „ganzes Dokument" nichts vor und lässt die Stellen stehen', async () => {
    setup()
    await documentSurface()
    markParagraph(1)

    fireEvent.click(screen.getByRole('button', { name: t('editor.selection.wholeDocument') }))

    expect(screen.getByText(t('editor.marks.progress', { done: 0, total: 1 }))).toBeInTheDocument()
  })

  // Der Kernpunkt: Eine Textänderung davor darf die Vormerkung nicht
  // verrutschen lassen. Sichtbar wird das am Wortlaut in der Liste — zeigt
  // der Bereich daneben, steht dort etwas anderes.
  it('führt die Vormerkung mit, wenn davor getippt wird', async () => {
    setup()
    await documentSurface()
    const paragraphText = paragraphElement(1).textContent ?? ''
    markParagraph(1)

    type(0, `${paragraphElement(0).textContent ?? ''} und noch ein Zusatz`)

    await waitFor(() => expect(markEntry(1).textContent).toContain(paragraphText.slice(0, 20)))
  })

  it('hakt die Stelle ab, wenn eine Variante übernommen wird, und lässt sie stehen', async () => {
    stubFetch()
    setup({ vault: unlockedVault() })
    await documentSurface()
    markParagraph(1)

    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)

    await waitFor(() =>
      expect(screen.getByText(t('editor.marks.progress', { done: 1, total: 1 }))).toBeInTheDocument(),
    )
    expect(markEntry(1)).toBeInTheDocument()
  })

  it('holt Strg+Z Text und Vormerkung zusammen zurück', async () => {
    stubFetch()
    setup({ vault: unlockedVault() })
    await documentSurface()
    const original = paragraphElement(1).textContent
    markParagraph(1)

    await openVariants()
    await screen.findByText(VARIANT_TEXTS[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[0]!)
    await waitFor(() => expect(paragraphElement(1).textContent).toBe(VARIANT_TEXTS[0]))

    undoShortcut()

    await waitFor(() => expect(paragraphElement(1).textContent).toBe(original))
    expect(screen.getByText(t('editor.marks.progress', { done: 0, total: 1 }))).toBeInTheDocument()
  })

  it('stellt die Vormerkungen beim nächsten Öffnen desselben Anschreibens wieder her', async () => {
    const storage = createFakeStorage()
    // Das Behalten ist eine Entscheidung des Nutzers und standardmäßig aus.
    const first = setup({ storage, settings: { keepMarks: true } })
    await documentSurface()
    const paragraphText = paragraphElement(1).textContent ?? ''
    markParagraph(1)

    // Das Ablegen ist bewusst verzögert (siehe MARK_SAVE_DELAY_MS).
    await waitFor(() => expect(storage.state.markSets.size).toBe(1), { timeout: 3000 })
    first.unmount()

    setup({ storage, settings: { keepMarks: true } })
    await documentSurface()

    await waitFor(() => expect(markEntry(1).textContent).toContain(paragraphText.slice(0, 20)))
    expect(
      screen.getByText(t('editor.marks.restored', { restored: 1, total: 1 })),
    ).toBeInTheDocument()
  })
})

