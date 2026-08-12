import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import type { Variant } from '@/lib/domain/rewrite'
import i18n from '@/lib/i18n/i18n'
import { createSelection, type EditorSelection } from './documentSelection'
import { VariantPopover } from './VariantPopover'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

/**
 * Ein Dokumentmodell mit echten Absatz-Offsets, damit `createSelection` und
 * `inspectRange` denselben Weg gehen wie in der Anwendung. Die Knoten sind
 * echte Elemente: `inspectRange` fragt sie danach, ob ein Absatz
 * festgehalten wird.
 */
function fakeDocument(texts: string[]): DocxDocument {
  const xml = new DOMParser().parseFromString(
    `<w:document xmlns:w="http://x">${texts.map(() => '<w:p/>').join('')}</w:document>`,
    'application/xml',
  )
  const nodes = [...xml.getElementsByTagName('w:p')]
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return { index, node: nodes[index]!, text, runs: [], start, end: start + text.length }
  })
  return { zip: {}, doc: xml, paragraphs, text: texts.join('\n') }
}

const DOCX = fakeDocument(['Sehr geehrte Damen und Herren,', 'Ich bewerbe mich auf die Stelle.'])

function selectionOf(from: number, to: number): EditorSelection {
  const selection = createSelection(DOCX, { from, to })
  if (selection === null) throw new Error('Markierung leer')
  return selection
}

const VARIANTS: Variant[] = [
  { text: 'Ich bewerbe mich mit Freude.', unbackedClaims: [] },
  { text: 'Auf diese Stelle bewerbe ich mich gern.', unbackedClaims: [] },
  { text: 'Die Stelle passt zu meinem Weg.', unbackedClaims: [] },
]

interface SetupOptions {
  selection?: EditorSelection | null
  ready?: boolean
  rewrite?: (selection: EditorSelection, signal: AbortSignal) => Promise<Variant[]>
  onApply?: (variant: Variant) => void
}

function setup(options: SetupOptions = {}) {
  const rewrite = options.rewrite ?? vi.fn(() => Promise.resolve(VARIANTS))
  const onApply = options.onApply ?? vi.fn()
  const view = render(
    <VariantPopover
      selection={options.selection === undefined ? selectionOf(31, 62) : options.selection}
      rewrite={rewrite}
      ready={options.ready ?? true}
      onApply={onApply}
    />,
  )
  return { ...view, rewrite, onApply }
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: t('editor.variants.trigger') })
}

describe('VariantPopover', () => {
  it('bleibt gesperrt ohne Markierung, bei reiner Leerraum-Markierung und solange die Auswertung läuft', () => {
    const { unmount } = setup({ selection: null })
    expect(trigger()).toBeDisabled()
    unmount()

    // Nur das Leerzeichen nach „Sehr": markiert, aber ohne Inhalt.
    setup({ selection: selectionOf(4, 5) })
    expect(trigger()).toBeDisabled()
  })

  it('sperrt, solange Anzeige und Stilprofil nicht ausgewertet sind', () => {
    setup({ ready: false })
    expect(trigger()).toBeDisabled()
  })

  it('fragt beim Öffnen und zeigt drei Vorschläge', async () => {
    const { rewrite } = setup()

    fireEvent.click(trigger())

    expect(screen.getByRole('status')).toHaveTextContent(t('editor.variants.pending'))
    expect(rewrite).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(screen.getByText(VARIANTS[0]!.text)).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: t('editor.variants.apply') })).toHaveLength(3)
  })

  it('übernimmt die gewählte Variante und schließt', async () => {
    const { onApply } = setup()

    fireEvent.click(trigger())
    await waitFor(() => expect(screen.getByText(VARIANTS[1]!.text)).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: t('editor.variants.apply') })[1]!)

    expect(onApply).toHaveBeenCalledWith(VARIANTS[1])
    await waitFor(() => expect(screen.queryByText(VARIANTS[1]!.text)).not.toBeInTheDocument())
  })

  it('bricht den laufenden Aufruf ab und zeigt danach keine Fehlermeldung', async () => {
    let signal: AbortSignal | undefined
    const rewrite = vi.fn(
      (_selection: EditorSelection, incoming: AbortSignal) =>
        new Promise<Variant[]>((_resolve, reject) => {
          signal = incoming
          incoming.addEventListener('abort', () => reject(incoming.reason))
        }),
    )
    setup({ rewrite })

    fireEvent.click(trigger())
    await waitFor(() => expect(signal).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: t('editor.variants.cancel') }))

    expect(signal!.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('zeigt einen Fehler übersetzt, nicht als Ausnahmetext, und lässt ihn wiederholen', async () => {
    const rewrite = vi
      .fn<(selection: EditorSelection, signal: AbortSignal) => Promise<Variant[]>>()
      .mockRejectedValueOnce(new LlmError('quota', 'gemini', 'interner Text'))
      .mockResolvedValueOnce(VARIANTS)
    setup({ rewrite })

    fireEvent.click(trigger())

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(t('ai.errors.quota_gemini'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('interner Text')

    fireEvent.click(screen.getByRole('button', { name: t('editor.variants.retry') }))

    await waitFor(() => expect(screen.getByText(VARIANTS[0]!.text)).toBeInTheDocument())
  })

  it('verwirft die Vorschläge beim Schließen und fragt beim nächsten Öffnen neu', async () => {
    const { rewrite } = setup()

    fireEvent.click(trigger())
    await waitFor(() => expect(screen.getByText(VARIANTS[0]!.text)).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(VARIANTS[0]!.text)).not.toBeInTheDocument())

    fireEvent.click(trigger())
    expect(rewrite).toHaveBeenCalledTimes(2)
  })

  it('nennt die unbelegten Aussagen einer Variante, bevor sie im Brief steht', async () => {
    const rewrite = vi.fn(() =>
      Promise.resolve<Variant[]>([
        { text: 'Ich spreche fließend Finnisch.', unbackedClaims: ['spreche fließend Finnisch'] },
        VARIANTS[1]!,
        VARIANTS[2]!,
      ]),
    )
    setup({ rewrite })

    fireEvent.click(trigger())

    await waitFor(() =>
      expect(screen.getByText(t('editor.variants.unbacked.heading', { count: 1 }))).toBeInTheDocument(),
    )
    expect(screen.getByText('spreche fließend Finnisch')).toBeInTheDocument()
  })

  it('sagt vor dem Übernehmen, dass ein festgehaltener Absatz leer zurückbleibt', async () => {
    // Ein Absatz mit eingebettetem Inhalt kann nicht entfernt werden; die
    // Markierung geht über beide, der Ersatztext hat nur eine Zeile.
    const docx = fakeDocument(['Erster Absatz', 'Zweiter Absatz'])
    docx.paragraphs[1]!.node.appendChild(docx.doc.createElement('w:drawing'))
    const selection = createSelection(docx, { from: 0, to: docx.text.length })!

    const rewrite = vi.fn(() =>
      Promise.resolve<Variant[]>([{ text: 'Eine einzige Zeile.', unbackedClaims: [] }]),
    )
    render(
      <VariantPopover selection={selection} rewrite={rewrite} ready onApply={vi.fn()} />,
    )

    fireEvent.click(trigger())

    await waitFor(() =>
      expect(
        screen.getByText(t('editor.variants.willShift', { paragraphs: '2', count: 1 })),
      ).toBeInTheDocument(),
    )
  })
})
