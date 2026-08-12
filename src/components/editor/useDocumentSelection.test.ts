// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { DocxDocument } from '@/lib/docx/model'
import { parseDocx } from '@/lib/docx/parse'
import { replaceRange } from '@/lib/docx/replace'
import { PARAGRAPH_INDEX_ATTRIBUTE, PARAGRAPH_START_ATTRIBUTE } from './documentSelection'
import { useDocumentSelection } from './useDocumentSelection'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

let letter: DocxDocument

beforeAll(async () => {
  const buffer = await readFile(join(FIXTURES_DIR, 'anschreiben.docx'))
  letter = await parseDocx(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  )
})

function renderParagraphs(docx: DocxDocument): HTMLElement {
  const root = document.createElement('div')
  for (const paragraph of docx.paragraphs) {
    const element = document.createElement('p')
    element.setAttribute(PARAGRAPH_INDEX_ATTRIBUTE, String(paragraph.index))
    element.setAttribute(PARAGRAPH_START_ATTRIBUTE, String(paragraph.start))
    element.textContent = paragraph.text
    root.append(element)
  }
  document.body.append(root)
  return root
}

function textNode(root: HTMLElement, index: number): Text {
  return root.children[index]!.firstChild as Text
}

/**
 * jsdom löst `selectionchange` nicht selbst aus (nachgemessen). Der Haken
 * hängt an genau diesem Ereignis, also wird es hier von Hand verschickt.
 */
function selectInDom(anchor: Node, anchorOffset: number, focus: Node, focusOffset: number): void {
  window.getSelection()?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
  document.dispatchEvent(new Event('selectionchange'))
}

function mount(root: HTMLElement, docx: DocxDocument | null, trackPointerSelection = true) {
  const rootRef = { current: root as HTMLElement | null }
  return renderHook(
    (props: { document: DocxDocument | null }) =>
      useDocumentSelection({ rootRef, document: props.document, trackPointerSelection }),
    { initialProps: { document: docx } },
  )
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('useDocumentSelection', () => {
  it('nimmt eine Markierung in der Dokumentfläche auf', () => {
    const root = renderParagraphs(letter)
    const { result } = mount(root, letter)

    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))

    expect(result.current.selection?.range).toEqual({
      from: 5,
      to: letter.paragraphs[1]!.start + 3,
    })
    expect(result.current.selection?.text).toBe(letter.text.slice(5, letter.paragraphs[1]!.start + 3))
  })

  it('löscht die Markierung, wenn der Nutzer in den Text klickt', () => {
    const root = renderParagraphs(letter)
    const { result } = mount(root, letter)
    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))
    expect(result.current.selection).not.toBeNull()

    act(() => selectInDom(textNode(root, 0), 2, textNode(root, 0), 2))

    expect(result.current.selection).toBeNull()
  })

  // Ein Klick auf einen Knopf der Leiste legt in vielen Browsern eine
  // zusammengefallene Markierung dorthin. Sie darf die Auswahl nicht in dem
  // Augenblick löschen, in dem etwas mit ihr geschehen soll.
  it('behält die Markierung, wenn außerhalb der Dokumentfläche geklickt wird', () => {
    const root = renderParagraphs(letter)
    const outside = document.createElement('p')
    outside.textContent = 'Werkzeugleiste'
    document.body.append(outside)
    const { result } = mount(root, letter)
    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))
    const before = result.current.selection

    act(() => selectInDom(outside.firstChild!, 1, outside.firstChild!, 1))

    expect(result.current.selection).toBe(before)
  })

  it('setzt eine Markierung von außen und hebt sie im Browser hervor', () => {
    const root = renderParagraphs(letter)
    const { result } = mount(root, letter)

    act(() => result.current.select({ from: 0, to: letter.text.length }))

    expect(result.current.selection?.range).toEqual({ from: 0, to: letter.text.length })
    // Der Browser reicht die Absatztexte durch; nur die Trennzeichen
    // zwischen den Absätzen gehören keinem Absatz und stehen deshalb nicht
    // im markierten Text. Die Zeilenumbrüche **innerhalb** eines Absatzes
    // (aus `w:br`) sind dagegen dabei.
    expect(window.getSelection()?.toString()).toBe(
      letter.paragraphs.map((paragraph) => paragraph.text).join(''),
    )
  })

  it('setzt eine Markierung auch dann, wenn der Maus-Markierung nicht gefolgt wird', () => {
    const root = renderParagraphs(letter)
    const { result } = mount(root, letter, false)

    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))
    expect(result.current.selection).toBeNull()

    act(() => result.current.select({ from: 0, to: 5 }))

    expect(result.current.selection?.text).toBe('Sehr ')
  })

  // Die Offsets einer Markierung gelten für einen Text, den es nach einer
  // Änderung nicht mehr gibt.
  it('löscht die Markierung, sobald sich das Dokument ändert', () => {
    const root = renderParagraphs(letter)
    const { result, rerender } = mount(root, letter)
    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))
    expect(result.current.selection).not.toBeNull()

    rerender({ document: replaceRange(letter, { from: 0, to: 4 }, 'Hallo') })

    expect(result.current.selection).toBeNull()
  })

  it('lässt die Markierung ausdrücklich aufheben', () => {
    const root = renderParagraphs(letter)
    const { result } = mount(root, letter)
    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))

    act(() => result.current.clear())

    expect(result.current.selection).toBeNull()
  })

  it('bestellt seinen Zuhörer wieder ab', () => {
    const root = renderParagraphs(letter)
    const { result, unmount } = mount(root, letter)
    act(() => selectInDom(textNode(root, 0), 5, textNode(root, 1), 3))
    const before = result.current.selection

    unmount()
    act(() => selectInDom(textNode(root, 0), 1, textNode(root, 0), 2))

    expect(result.current.selection).toBe(before)
  })
})
