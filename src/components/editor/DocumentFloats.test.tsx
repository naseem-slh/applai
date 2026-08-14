import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CharacterFormat, DocumentFormat, FloatingObject } from '@/lib/docx/format'
import { DocumentFloats } from './DocumentFloats'
import { PAGE, documentFormat, formattedParagraph, text } from './documentFormat.testutils'

const natural = (format: CharacterFormat): number => format.sizePt * 1.2

const ANCHOR = {
  fromH: 'margin' as const,
  fromV: 'page' as const,
  xPt: 0,
  yPt: 100,
  alignH: null,
  alignV: null,
  paragraphIndex: null,
}

function withFloats(floats: FloatingObject[]): DocumentFormat {
  return { ...documentFormat([formattedParagraph()]), floats }
}

function renderFloats(format: DocumentFormat, pageCount = 1) {
  return render(
    <DocumentFloats
      format={format}
      pageCount={pageCount}
      pxPerPt={2}
      pageGap={20}
      anchors={new Map()}
      natural={natural}
    />,
  )
}

describe('DocumentFloats', () => {
  /**
   * Die Empfängeranschrift steht in einem Anschreiben nach DIN 5008 in einem
   * Textfeld — außerhalb des Fließtexts und damit außerhalb des
   * Offset-Modells. Ohne diese Ebene fehlte sie auf dem Schirm ganz.
   */
  it('zeigt das Anschriftenfeld an seiner Blattkoordinate', () => {
    renderFloats(
      withFloats([
        {
          anchor: ANCHOR,
          widthPt: 200,
          heightPt: 80,
          content: {
            kind: 'textbox',
            paragraphs: [formattedParagraph([text('HyCARE GmbH')])],
            insets: { leftPt: 7, topPt: 3, rightPt: 7, bottomPt: 3 },
          },
        },
      ]),
    )

    expect(screen.getByText('HyCARE GmbH')).toBeInTheDocument()
    const box = screen.getByText('HyCARE GmbH').closest('div')
    // 70 pt Satzspiegelrand × 2 px/pt waagerecht, 100 pt × 2 senkrecht.
    expect(box?.style.left).toBe('140px')
    expect(box?.style.top).toBe('200px')
  })

  it('zeichnet eine Linie mit ihrer Strichstärke, auch ohne Höhe', () => {
    const { container } = renderFloats(
      withFloats([
        {
          anchor: { ...ANCHOR, fromH: 'page', xPt: 50 },
          widthPt: 400,
          heightPt: 0,
          content: { kind: 'shape', fill: null, stroke: '1F4E79', strokePt: 1.5 },
        },
      ]),
    )

    const line = container.querySelector<HTMLElement>('[data-document-floats] > div')
    expect(line?.style.height).toBe('3px')
    expect(line?.style.width).toBe('800px')
  })

  it('setzt die Unterschrift auf die Seite ihres Absatzes', () => {
    const format = withFloats([
      {
        anchor: { ...ANCHOR, fromV: 'paragraph', yPt: 10, paragraphIndex: 3 },
        widthPt: 100,
        heightPt: 40,
        content: {
          kind: 'image',
          image: { path: 'word/media/image1.png', bytes: new Uint8Array([1]), widthPt: 100, heightPt: 40 },
        },
      },
    ])

    render(
      <DocumentFloats
        format={format}
        pageCount={2}
        pxPerPt={2}
        pageGap={20}
        anchors={new Map([[3, { pageIndex: 1, topPt: 300 }]])}
        natural={natural}
      />,
    )

    // Oberkante der zweiten Seite: Blatthöhe × 2 px/pt plus 20 px Abstand.
    // Darauf der Absatz (300 pt) samt Versatz (10 pt), wieder × 2.
    const image = document.querySelector<HTMLElement>('img')
    expect(image?.style.top).toBe(`${PAGE.heightPt * 2 + 20 + 620}px`)
  })

  /**
   * Ein am Absatz verankertes Objekt ohne gemessene Lage bekommt keinen
   * geratenen Platz: Es fehlt lieber, als an der falschen Stelle zu stehen.
   */
  it('lässt ein Objekt weg, dessen Absatz noch nicht gemessen ist', () => {
    const { container } = renderFloats(
      withFloats([
        {
          anchor: { ...ANCHOR, fromV: 'paragraph', paragraphIndex: 9 },
          widthPt: 100,
          heightPt: 40,
          content: { kind: 'shape', fill: '000000', stroke: null, strokePt: 1 },
        },
      ]),
    )

    expect(container.querySelectorAll('[data-document-floats] > div')).toHaveLength(1)
  })

  it('zeigt die Kopfzeile auf jeder Seite', () => {
    const format = {
      ...documentFormat([formattedParagraph()]),
      header: { default: [formattedParagraph([text('Naseem Salih')])], first: null, even: null },
    }

    renderFloats(format, 2)

    expect(screen.getAllByText('Naseem Salih')).toHaveLength(2)
  })

  it('nimmt vor dem ersten Messen keinen Platz ein', () => {
    const { container } = render(
      <DocumentFloats
        format={withFloats([])}
        pageCount={1}
        pxPerPt={0}
        pageGap={20}
        anchors={new Map()}
        natural={natural}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
