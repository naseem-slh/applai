import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Paragraph } from '@/lib/docx/model'
import { DocumentView } from './DocumentView'
import {
  PARAGRAPH_INDEX_ATTRIBUTE,
  PARAGRAPH_START_ATTRIBUTE,
  paragraphOf,
} from './documentSelection'

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

/** Eine Absatzfolge aus bloßen Texten, mit fortlaufenden Offsets. */
function paragraphs(texts: string[]): Paragraph[] {
  let offset = 0
  return texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return paragraph(index, start, text)
  })
}

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
 * Die Dokumentfläche selbst. Sie trägt die Absätze und den Zuhörer; ein
 * eigener Testhaken wäre nur eine zweite Wahrheit.
 */
function surface(): HTMLElement {
  const element = paragraphElement(0).parentElement
  if (element === null) throw new Error('Dokumentfläche nicht gefunden')
  return element
}

/** Ein Bereich, wie `beforeinput.getTargetRanges()` ihn meldet. */
function targetRange(
  startIndex: number,
  startOffset: number,
  endIndex: number,
  endOffset: number,
): StaticRange {
  const start = paragraphElement(startIndex)
  const end = paragraphElement(endIndex)
  return new StaticRange({
    startContainer: start.firstChild ?? start,
    startOffset,
    endContainer: end.firstChild ?? end,
    endOffset,
  })
}

/**
 * `beforeinput` wird von jsdom nicht selbst ausgelöst (es gibt dort keine
 * echte Texteingabe) und kennt auch `getTargetRanges` nicht — ohne
 * gemeldeten Bereich entscheidet die aktuelle Markierung.
 *
 * Verschickt wird **an der Fläche**, weil Chrome das Ereignis dort
 * verschickt: Ein Zuhörer, der zurück ans `<p>` wanderte, bekäme es nie zu
 * sehen. Genau das war der Fehler, der im Browser einen sechsten Absatz
 * erzeugte; an einem `<p>` gemeldet würde er hier durch das Aufsteigen
 * verdeckt. Liefert `false`, wenn die Eingabe abgelehnt wurde.
 */
function dispatchBeforeInput(inputType: string, ranges?: readonly StaticRange[]): boolean {
  const event = new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true })
  if (ranges !== undefined) {
    Object.defineProperty(event, 'getTargetRanges', { value: () => [...ranges] })
  }
  return surface().dispatchEvent(event)
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

    expect(dispatchBeforeInput('formatBold')).toBe(false)
    expect(dispatchBeforeInput('insertParagraph')).toBe(false)
    expect(dispatchBeforeInput('insertText')).toBe(true)
    expect(dispatchBeforeInput('deleteContentBackward')).toBe(true)
  })

  // Der Grund, aus dem die Absatzfolge trotz gemeinsamer Fläche unantastbar
  // bleibt: Was zwei Absätze berührt, wird abgelehnt.
  it('lehnt jede Eingabe ab, die über eine Absatzgrenze reicht', () => {
    setup()
    selectIn(0, 5, 1, 5)

    expect(dispatchBeforeInput('insertText')).toBe(false)
    expect(dispatchBeforeInput('deleteContentBackward')).toBe(false)
  })

  // Der zweite Zweig der Prüfung, und der wichtigere: Die Rücktaste am
  // Absatzanfang meldet einen Bereich, der beim **Ende des vorigen**
  // Absatzes beginnt, während der Cursor sichtbar in einem einzigen Absatz
  // steht. Nur `getTargetRanges` zeigt das Verschmelzen, bevor es geschieht.
  it('lehnt die Rücktaste am Absatzanfang ab, obwohl der Cursor in einem Absatz steht', () => {
    setup()
    selectIn(1, 0)

    const prevented = !dispatchBeforeInput('deleteContentBackward', [
      targetRange(0, PARAGRAPHS[0].text.length, 1, 0),
    ])

    expect(prevented).toBe(true)
  })

  // Gegenprobe zum vorigen Fall: Der gemeldete Bereich entscheidet, nicht
  // die Markierung. Sonst wäre der Zweig oben auch dann grün, wenn er die
  // Bereiche gar nicht läse.
  it('lässt eine Eingabe durch, deren gemeldeter Bereich in einem Absatz bleibt', () => {
    setup()
    selectIn(0, 5, 1, 5)

    expect(dispatchBeforeInput('insertText', [targetRange(1, 1, 1, 4)])).toBe(true)
  })

  it('lehnt eine Eingabe ohne erkennbare Stelle ab', () => {
    setup()
    window.getSelection()?.removeAllRanges()

    expect(dispatchBeforeInput('insertText')).toBe(false)
  })

  it('hört auf keine Eingabe, wenn nur gelesen wird', () => {
    setup({ editable: false })
    selectIn(0, 3)

    expect(dispatchBeforeInput('formatBold')).toBe(true)
  })

  // `insertCompositionText` ist in Chrome nicht abbrechbar: Die Prüfung
  // oben lehnt die Eingabe zwar ab, der Browser führt sie trotzdem aus. Die
  // Markierung wird deshalb zusammengelegt, bevor die Eingabemethode
  // anfängt — danach hat sie genau einen Absatz vor sich.
  it('legt eine Markierung über zwei Absätze zusammen, bevor eine Eingabemethode beginnt', () => {
    setup()
    selectIn(0, 5, 1, 5)

    fireEvent.compositionStart(surface())

    const selection = window.getSelection()
    expect(selection?.isCollapsed).toBe(true)
    expect(paragraphOf(selection?.anchorNode ?? null)).toBe(paragraphElement(0))
    expect(selection?.anchorOffset).toBe(5)
  })

  it('lässt eine Markierung innerhalb eines Absatzes unangetastet', () => {
    setup()
    selectIn(0, 5, 0, 9)

    fireEvent.compositionStart(surface())

    expect(window.getSelection()?.isCollapsed).toBe(false)
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

  // Der Brief steht auf Seiten, und alles, was daran hängt — Offsets,
  // Datenattribute, Eingaben — muss davon unberührt bleiben.
  it('setzt die Absätze in Seitenkästen innerhalb einer einzigen Schreibfläche', () => {
    render(
      <DocumentView
        paragraphs={paragraphs(['Erster Absatz', 'Zweiter Absatz'])}
        editable
        labelledBy="ueberschrift"
        onParagraphInput={vi.fn()}
      />,
    )

    const surface = screen.getByRole('textbox')
    // Genau eine Schreibfläche: Chrome klemmt jede Markierung auf einen
    // `contentEditable`-Bereich, zwei davon bräche das Markieren über
    // Absatzgrenzen hinweg.
    expect(surface.querySelectorAll('[contenteditable]')).toHaveLength(0)
    expect(surface.querySelectorAll('[data-page]').length).toBeGreaterThan(0)
    expect(surface.querySelectorAll(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`)).toHaveLength(2)
  })

  it('macht aus einem Lauf von Leerzeilen eine, ohne sie zu entfernen', () => {
    render(
      <DocumentView
        paragraphs={paragraphs(['Text', '', '', '', '', 'Mehr'])}
        editable
        labelledBy="ueberschrift"
        onParagraphInput={vi.fn()}
        collapseBlankRuns
      />,
    )

    const boxes = Array.from(
      screen.getByRole('textbox').querySelectorAll<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`),
    )
    // Alle sechs stehen weiter im Baum — ihre Offsets hängen daran, und der
    // Export braucht sie unverändert.
    expect(boxes).toHaveLength(6)
    // Die erste Leerzeile bleibt eine Leerzeile.
    expect(boxes[1]?.className).toContain('min-h-[1.7em]')
    // Die drei danach beanspruchen nichts mehr: keine Höhe, und der
    // negative Rand hebt auch den Abstand vor ihnen auf.
    for (const index of [2, 3, 4]) {
      expect(boxes[index]?.className).toContain('h-0')
      expect(boxes[index]?.className).toContain('-mt-4')
    }
    expect(boxes[5]?.className).toContain('min-h-[1.7em]')
  })

  it('faltet nichts zusammen, solange es nicht verlangt wird', () => {
    render(
      <DocumentView
        paragraphs={paragraphs(['Text', '', '', '', 'Mehr'])}
        editable
        labelledBy="ueberschrift"
        onParagraphInput={vi.fn()}
      />,
    )

    const boxes = Array.from(
      screen.getByRole('textbox').querySelectorAll<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`),
    )
    expect(boxes.every((box) => box.className.includes('min-h-[1.7em]'))).toBe(true)
  })
})

it('umrandet einen selbsttätig geänderten Absatz in eigener Farbe', () => {
  setup({ letterheadParagraphs: [0] })

  expect(paragraphElement(0).className).toContain('--color-info')
})

it('lässt eine Beanstandung der Briefkopf-Kontur vorgehen', () => {
  setup({ letterheadParagraphs: [0], foreignParagraphs: [0] })

  expect(paragraphElement(0).className).toContain('--color-error')
  expect(paragraphElement(0).className).not.toContain('--color-info')
})

it('lässt einen unveränderten Absatz farblos', () => {
  setup({ letterheadParagraphs: [0] })

  expect(paragraphElement(1).className).toContain('border-transparent')
})
