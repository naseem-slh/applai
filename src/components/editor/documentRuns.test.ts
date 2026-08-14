import { describe, expect, it } from 'vitest'

import type { DocumentImage } from '@/lib/docx/format'
import { character, formattedParagraph, text } from './documentFormat.testutils'
import {
  caretOffsetWithin,
  displayedText,
  pieceSignature,
  placeCaretWithin,
  runPieces,
  sourceText,
  writePieces,
} from './documentRuns'

const BOLD = character({ bold: true })
const WINGDINGS = character({ fontFamily: 'Wingdings' })

const IMAGE: DocumentImage = {
  path: 'word/media/image1.png',
  bytes: new Uint8Array([1, 2, 3]),
  widthPt: 40,
  heightPt: 20,
}

function paragraphElement(): HTMLParagraphElement {
  const element = document.createElement('p')
  document.body.append(element)
  return element
}

describe('runPieces — Läufe zu Stücken', () => {
  it('legt aneinandergrenzende Läufe gleicher Formatierung zusammen', () => {
    const pieces = runPieces(formattedParagraph([text('Sehr '), text('geehrte')]))

    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({ kind: 'text', text: 'Sehr geehrte' })
  })

  it('trennt, wo sich die Formatierung ändert', () => {
    const pieces = runPieces(formattedParagraph([text('normal'), text('fett', BOLD)]))

    expect(pieces).toHaveLength(2)
    expect(pieces.map((piece) => (piece.kind === 'text' ? piece.text : ''))).toEqual([
      'normal',
      'fett',
    ])
  })

  it('schreibt Tabulator und Zeilenumbruch als ihr Zeichen', () => {
    const format = character()
    const pieces = runPieces(
      formattedParagraph([
        text('a', format),
        { kind: 'tab', format },
        { kind: 'break', page: false, format },
        text('b', format),
      ]),
    )

    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({ text: 'a\t\nb' })
  })

  it('lässt ein Bild für sich stehen', () => {
    const format = character()
    const pieces = runPieces(
      formattedParagraph([text('vor', format), { kind: 'image', image: IMAGE, format }]),
    )

    expect(pieces.map((piece) => piece.kind)).toEqual(['text', 'image'])
  })
})

describe('pieceSignature — der Aufbau, an dem der Abgleich hängt', () => {
  /**
   * Der entscheidende Fall. Beim Tippen wächst ein Lauf, und `replaceRange`
   * teilt ihn dabei mitunter in zwei Läufe **gleicher** Formatierung. Änderte
   * sich davon die Kennung, würde die Ansicht den Absatz neu bauen und der
   * Schreibcursor spränge bei jedem Anschlag an den Absatzanfang.
   */
  it('bleibt gleich, wenn ein Lauf in gleich formatierte Läufe zerfällt', () => {
    const one = pieceSignature(runPieces(formattedParagraph([text('Sehr geehrte')])))
    const two = pieceSignature(runPieces(formattedParagraph([text('Sehr '), text('geehrte')])))

    expect(two).toBe(one)
  })

  it('bleibt gleich, wenn sich nur die Länge ändert', () => {
    const before = pieceSignature(runPieces(formattedParagraph([text('Sehr')])))
    const after = pieceSignature(runPieces(formattedParagraph([text('Sehrx')])))

    expect(after).toBe(before)
  })

  it('ändert sich, sobald eine Auszeichnung hinzukommt', () => {
    const before = pieceSignature(runPieces(formattedParagraph([text('Sehr geehrte')])))
    const after = pieceSignature(
      runPieces(formattedParagraph([text('Sehr '), text('geehrte', BOLD)])),
    )

    expect(after).not.toBe(before)
  })
})

describe('displayedText — was im DOM steht', () => {
  it('gibt gewöhnlichen Text unverändert wieder', () => {
    expect(displayedText(runPieces(formattedParagraph([text('Berlin')])))).toBe('Berlin')
  })

  it('übersetzt ein Bildzeichen und behält dabei die Zeichenzahl', () => {
    const pieces = runPieces(
      formattedParagraph([text('Berlin '), text('', WINGDINGS), text(' Mobil')]),
    )

    expect(displayedText(pieces)).toBe('Berlin • Mobil')
    expect(displayedText(pieces)).toHaveLength('Berlin  Mobil'.length)
  })

  it('zählt ein Bild als kein Zeichen', () => {
    const format = character()
    const pieces = runPieces(
      formattedParagraph([{ kind: 'image', image: IMAGE, format }, text('Mit Gruß', format)]),
    )

    expect(displayedText(pieces)).toBe('Mit Gruß')
  })
})

describe('writePieces und sourceText — hin und zurück', () => {
  it('schreibt je Stück ein span mit seiner Formatierung', () => {
    const element = paragraphElement()

    writePieces(element, runPieces(formattedParagraph([text('normal'), text('fett', BOLD)])))

    const spans = element.querySelectorAll('span')
    expect(spans).toHaveLength(2)
    expect(spans[0]?.style.fontWeight).toBe('400')
    expect(spans[1]?.style.fontWeight).toBe('700')
    expect(element.textContent).toBe('normalfett')
  })

  /**
   * Auf dem Schirm steht `•`, im Dokument steht `U+F09F`. Meldete die Fläche
   * beim Tippen den Bildschirmtext zurück, machte schon eine Änderung
   * irgendwo in derselben Zeile aus dem Wingdings-Zeichen einen
   * Aufzählungspunkt — in Word dann ein leerer Kasten, weil Wingdings dieses
   * Zeichen nicht führt.
   */
  it('meldet den Text des Dokuments zurück, nicht den übersetzten', () => {
    const element = paragraphElement()

    writePieces(element, runPieces(formattedParagraph([text('a'), text('', WINGDINGS)])))

    expect(element.textContent).toBe('a•')
    expect(sourceText(element)).toBe('a')
  })

  /**
   * Hat der Browser das übersetzte Stück doch verändert, gilt sein Text.
   * Der Nutzer soll nie ein Zeichen verlieren, das er getippt hat.
   */
  it('nimmt den DOM-Text, sobald das übersetzte Stück bearbeitet wurde', () => {
    const element = paragraphElement()
    writePieces(element, runPieces(formattedParagraph([text('', WINGDINGS)])))

    const span = element.querySelector('span')
    if (span) span.textContent = '•x'

    expect(sourceText(element)).toBe('•x')
  })

  it('räumt beim Neuschreiben auf, statt anzuhängen', () => {
    const element = paragraphElement()

    writePieces(element, runPieces(formattedParagraph([text('erst')])))
    writePieces(element, runPieces(formattedParagraph([text('dann')])))

    expect(element.textContent).toBe('dann')
    expect(element.querySelectorAll('span')).toHaveLength(1)
  })
})

describe('Schreibcursor über den Neuaufbau hinweg', () => {
  it('findet den Versatz und setzt ihn wieder', () => {
    const element = paragraphElement()
    writePieces(element, runPieces(formattedParagraph([text('Sehr '), text('geehrte', BOLD)])))

    placeCaretWithin(element, 8)

    expect(caretOffsetWithin(element)).toBe(8)
  })

  it('zählt über die Stückgrenze hinweg', () => {
    const element = paragraphElement()
    writePieces(element, runPieces(formattedParagraph([text('abc'), text('def', BOLD)])))

    placeCaretWithin(element, 3)

    expect(caretOffsetWithin(element)).toBe(3)
  })

  it('meldet nichts, wenn der Cursor woanders steht', () => {
    const element = paragraphElement()
    writePieces(element, runPieces(formattedParagraph([text('abc')])))
    const other = paragraphElement()
    writePieces(other, runPieces(formattedParagraph([text('xyz')])))

    placeCaretWithin(other, 1)

    expect(caretOffsetWithin(element)).toBeNull()
  })
})
