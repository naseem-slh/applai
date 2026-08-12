import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Paragraph } from '@/lib/docx/model'
import { DocumentView } from './DocumentView'
import { PARAGRAPH_INDEX_ATTRIBUTE, PARAGRAPH_START_ATTRIBUTE } from './documentSelection'

/**
 * `DocumentView` liest von einem `Paragraph` nur `index`, `start` und
 * `text`. Ein echtes Dokument zu parsen brächte hier nichts als Laufzeit;
 * die Zusammenarbeit mit dem echten Modell prüft `Editor.test.tsx`.
 */
function paragraph(index: number, start: number, text: string): Paragraph {
  return { index, start, end: start + text.length, text, runs: [], node: null as unknown as Element }
}

const PARAGRAPHS = [
  paragraph(0, 0, 'Sehr geehrte Damen und Herren,'),
  paragraph(1, 31, 'ich bewerbe mich um die Stelle.'),
  paragraph(2, 63, ''),
]

function paragraphElement(index: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}="${index}"]`)
  if (element === null) throw new Error(`Absatz ${index} nicht gefunden`)
  return element
}

function setup(overrides: Partial<Parameters<typeof DocumentView>[0]> = {}) {
  const onParagraphInput = vi.fn()
  const view = render(
    <>
      <h2 id="ueberschrift">Anschreiben</h2>
      <DocumentView
        paragraphs={PARAGRAPHS}
        editable
        labelledBy="ueberschrift"
        onParagraphInput={onParagraphInput}
        {...overrides}
      />
    </>,
  )
  return { ...view, onParagraphInput }
}

/** Cursor oder Markierung innerhalb der Absätze setzen. */
function selectIn(startIndex: number, startOffset: number, endIndex = startIndex, endOffset = startOffset) {
  const start = paragraphElement(startIndex)
  const end = paragraphElement(endIndex)
  window
    .getSelection()
    ?.setBaseAndExtent(
      start.firstChild ?? start,
      start.firstChild === null ? 0 : startOffset,
      end.firstChild ?? end,
      end.firstChild === null ? 0 : endOffset,
    )
}

/**
 * `beforeinput` wird von jsdom nicht selbst ausgelöst (es gibt dort keine
 * echte Texteingabe) und kennt auch `getTargetRanges` nicht — dann
 * entscheidet die aktuelle Markierung. Liefert `false`, wenn die Eingabe
 * abgelehnt wurde.
 */
function dispatchBeforeInput(index: number, inputType: string): boolean {
  return paragraphElement(index).dispatchEvent(
    new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true }),
  )
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
})

describe('DocumentView', () => {
  it('zeigt jeden Absatz mit seinem Text', () => {
    setup()

    expect(paragraphElement(0).textContent).toBe(PARAGRAPHS[0].text)
    expect(paragraphElement(1).textContent).toBe(PARAGRAPHS[1].text)
    expect(paragraphElement(2).textContent).toBe('')
  })

  // Die Offset-Abbildung liest genau diese beiden Attribute (siehe
  // `documentSelection.ts`). Schriebe die Ansicht andere Namen, liefe die
  // Markierung ins Leere, ohne dass ein Test es merkte.
  it('trägt an jedem Absatz seinen Offset und seinen Index', () => {
    setup()

    expect(paragraphElement(1).getAttribute(PARAGRAPH_START_ATTRIBUTE)).toBe('31')
    expect(paragraphElement(1).getAttribute(PARAGRAPH_INDEX_ATTRIBUTE)).toBe('1')
  })

  // Ein gemeinsamer Bearbeitungsbereich, nicht einer je Absatz: Chrome
  // klemmt jede Markierung auf genau einen Bereich, und damit wäre die
  // Markierung über Absatzgrenzen hinweg unmöglich (siehe DocumentView).
  it('ist genau ein benanntes Textfeld über alle Absätze', () => {
    setup()

    const box = screen.getByRole('textbox')
    expect(box).toHaveAttribute('contenteditable', 'true')
    expect(box).toHaveAttribute('aria-multiline', 'true')
    expect(box).toHaveAccessibleName('Anschreiben')
    expect(box.querySelectorAll(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`)).toHaveLength(3)
  })

  // Die Sprache gehört an den Text, nicht an die Oberfläche: Davon hängen
  // Rechtschreibprüfung und Aussprache der Vorlesesoftware ab.
  it('trägt die Sprache des Dokuments an der Fläche', () => {
    setup({ language: 'de' })

    expect(screen.getByRole('textbox')).toHaveAttribute('lang', 'de')
  })

  it('gibt auf schmalen Bildschirmen nichts zum Bearbeiten frei', () => {
    setup({ editable: false })

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(paragraphElement(0).closest('[contenteditable="true"]')).toBeNull()
  })

  it('meldet den geänderten Absatz samt seinem neuen Text', () => {
    const { onParagraphInput } = setup()
    const element = paragraphElement(1)

    element.textContent = 'ich bewerbe mich um die Stellen.'
    fireEvent.input(screen.getByRole('textbox'))

    expect(onParagraphInput).toHaveBeenCalledWith(1, 'ich bewerbe mich um die Stellen.')
  })

  it('meldet nichts, wenn kein Absatz vom Modell abweicht', () => {
    const { onParagraphInput } = setup()

    fireEvent.input(screen.getByRole('textbox'))

    expect(onParagraphInput).not.toHaveBeenCalled()
  })

  it('lässt den getippten Text stehen, sobald das Modell ihn übernommen hat', () => {
    const { rerender } = setup()
    const element = paragraphElement(1)
    element.textContent = 'ich bewerbe mich um die Stellen.'
    fireEvent.input(screen.getByRole('textbox'))
    const typedNode = element.firstChild

    rerender(
      <>
        <h2 id="ueberschrift">Anschreiben</h2>
        <DocumentView
          paragraphs={[
            PARAGRAPHS[0],
            paragraph(1, 31, 'ich bewerbe mich um die Stellen.'),
            PARAGRAPHS[2],
          ]}
          editable
          labelledBy="ueberschrift"
          onParagraphInput={vi.fn()}
        />
      </>,
    )

    // Derselbe Textknoten: Die Ansicht hat den DOM nicht angefasst, also
    // steht auch der Schreibcursor noch, wo er war.
    expect(paragraphElement(1).firstChild).toBe(typedNode)
  })

  it('setzt den Absatz zurück, wenn DOM und Modell auseinanderlaufen', () => {
    const { rerender } = setup()
    paragraphElement(1).textContent = 'etwas ganz anderes'

    // Dasselbe Modell wie vorher: Die Ansicht schreibt den Absatz neu.
    rerender(
      <>
        <h2 id="ueberschrift">Anschreiben</h2>
        <DocumentView
          paragraphs={PARAGRAPHS}
          editable
          labelledBy="ueberschrift"
          onParagraphInput={vi.fn()}
        />
      </>,
    )

    expect(paragraphElement(1).textContent).toBe(PARAGRAPHS[1].text)
  })

  it('übernimmt einen geänderten Absatz aus dem Modell, etwa nach Rückgängig', () => {
    const { rerender } = setup()

    rerender(
      <>
        <h2 id="ueberschrift">Anschreiben</h2>
        <DocumentView
          paragraphs={[paragraph(0, 0, 'Guten Tag,'), PARAGRAPHS[1], PARAGRAPHS[2]]}
          editable
          labelledBy="ueberschrift"
          onParagraphInput={vi.fn()}
        />
      </>,
    )

    expect(paragraphElement(0).textContent).toBe('Guten Tag,')
  })

  it('unterdrückt Strg+B, Strg+I und Strg+U', () => {
    setup()
    const box = screen.getByRole('textbox')

    for (const key of ['b', 'i', 'u']) {
      expect(fireEvent.keyDown(box, { key, ctrlKey: true })).toBe(false)
    }
    // Gegenprobe: eine gewöhnliche Taste wird nicht abgefangen.
    expect(fireEvent.keyDown(box, { key: 'a' })).toBe(true)
  })

  it('unterdrückt Formatierungs- und Struktureingaben, lässt Text aber durch', () => {
    setup()
    selectIn(0, 3)

    expect(dispatchBeforeInput(0, 'formatBold')).toBe(false)
    expect(dispatchBeforeInput(0, 'insertParagraph')).toBe(false)
    expect(dispatchBeforeInput(0, 'insertText')).toBe(true)
    expect(dispatchBeforeInput(0, 'deleteContentBackward')).toBe(true)
  })

  // Der Grund, aus dem die Absatzfolge trotz gemeinsamer Fläche unantastbar
  // bleibt: Was zwei Absätze berührt, wird abgelehnt.
  it('lehnt jede Eingabe ab, die über eine Absatzgrenze reicht', () => {
    setup()
    selectIn(0, 5, 1, 5)

    expect(dispatchBeforeInput(0, 'insertText')).toBe(false)
    expect(dispatchBeforeInput(0, 'deleteContentBackward')).toBe(false)
  })

  it('lehnt eine Eingabe ohne erkennbare Stelle ab', () => {
    setup()
    window.getSelection()?.removeAllRanges()

    expect(dispatchBeforeInput(0, 'insertText')).toBe(false)
  })

  it('hört auf keine Eingabe, wenn nur gelesen wird', () => {
    setup({ editable: false })
    selectIn(0, 3)

    expect(dispatchBeforeInput(0, 'formatBold')).toBe(true)
  })

  it('fügt aus der Zwischenablage nur reinen, einzeiligen Text ein', () => {
    const { onParagraphInput } = setup()
    selectIn(0, 0)

    const prevented = !fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { getData: () => 'Erste Zeile\nZweite Zeile' },
    })

    expect(prevented).toBe(true)
    expect(paragraphElement(0).textContent).toBe(
      'Erste Zeile Zweite ZeileSehr geehrte Damen und Herren,',
    )
    expect(onParagraphInput).toHaveBeenCalledWith(0, paragraphElement(0).textContent)
  })

  it('fügt nichts ein, wenn die Markierung über zwei Absätze reicht', () => {
    const { onParagraphInput } = setup()
    selectIn(0, 5, 1, 5)

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { getData: () => 'Neuer Text' },
    })

    expect(paragraphElement(0).textContent).toBe(PARAGRAPHS[0].text)
    expect(paragraphElement(1).textContent).toBe(PARAGRAPHS[1].text)
    expect(onParagraphInput).not.toHaveBeenCalled()
  })

  it('nimmt nichts an, was in den Text gezogen wird', () => {
    setup()

    expect(fireEvent.drop(screen.getByRole('textbox'))).toBe(false)
  })

  it('hebt einen Absatz hervor, den die Markierung an seinem Platz festhalten würde', () => {
    setup({ retainedParagraphs: [1] })

    expect(paragraphElement(1).className).toContain('border-[var(--color-warning)]')
    expect(paragraphElement(0).className).toContain('border-transparent')
  })
})
