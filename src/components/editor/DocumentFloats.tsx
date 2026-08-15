import type { CSSProperties } from 'react'

import type { DocumentFormat, FormattedParagraph } from '@/lib/docx/format'
import { chooseRunningPart } from '@/lib/docx/format'
import { floatPosition, type ParagraphAnchor } from '@/lib/docx/floatPosition'
import { displayText } from './documentStyle'
import { characterStyle, paragraphStyle, scaled, type NaturalLineHeight } from './documentStyle'
import { imageUrl, runPieces } from './documentRuns'

/**
 * Alles, was auf dem Blatt steht, ohne im Fließtext zu stehen: das
 * Anschriftenfeld, die Linie unter dem Briefkopf, die eingescannte
 * Unterschrift, Kopf- und Fußzeile.
 *
 * **Warum außerhalb des Bearbeitungsbereichs.** Nicht bearbeitbare Inseln in
 * einem `contentEditable` bringen den Schreibcursor durcheinander — er kann
 * darin landen, ohne dass sich etwas eingeben ließe. Diese Ebene liegt
 * deshalb als Geschwister über den Seiten, mit `pointer-events: none`, damit
 * Markieren und Klicken unverändert den Text darunter treffen.
 *
 * **Sichtbar, aber nicht anfassbar.** Aus dem Barrierefreiheitsbaum wird
 * nichts ausgeblendet: Die Empfängeranschrift ist der Kern eines
 * Anschreibens und muss vorgelesen werden können.
 *
 * **Geändert wird woanders.** Das Anschriftenfeld steht bewusst außerhalb
 * des Offset-Modells (`paragraphNodesOf` lässt verschachtelte Absätze aus);
 * es wird über die Briefkopf-Leiste gepflegt, nicht durch Markieren.
 */

export interface DocumentFloatsProps {
  format: DocumentFormat
  pageCount: number
  /** Pixel je Punkt — derselbe Maßstab, den die Seiten benutzen. */
  pxPerPt: number
  /** Abstand zwischen zwei Blättern in Pixeln. */
  pageGap: number
  /** Wo die Absätze zu stehen kamen, für am Absatz verankerte Objekte. */
  anchors: ReadonlyMap<number, ParagraphAnchor>
  natural: NaturalLineHeight
}

/** Strichstärke einer Linie ohne eigene Angabe — wie im PDF-Satz. */
const DEFAULT_STROKE_PT = 0.75

export function DocumentFloats({
  format,
  pageCount,
  pxPerPt,
  pageGap,
  anchors,
  natural,
}: DocumentFloatsProps) {
  if (pxPerPt <= 0) return null

  const { page } = format
  const pageHeight = page.heightPt * pxPerPt
  const topOfPage = (index: number): number => index * (pageHeight + pageGap)

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-document-floats
      // Der Maßstab des Blattes, noch einmal: Diese Ebene ist ein Geschwister
      // der Schreibfläche, auf der `--pt` steht, und erbt ihn deshalb nicht.
      // Ohne ihn verwirft der Browser jedes `calc(var(--pt) * n)` stumm — das
      // Anschriftenfeld stünde in der Schriftgröße der Oberfläche.
      style={{ '--pt': `${pxPerPt}px` } as CSSProperties}
    >
      {format.floats.map((float, index) => {
        const anchor =
          float.anchor.paragraphIndex === null
            ? null
            : (anchors.get(float.anchor.paragraphIndex) ?? null)
        const position = floatPosition(float, page, anchor)
        if (position === null) return null

        const style: CSSProperties = {
          position: 'absolute',
          left: position.xPt * pxPerPt,
          top: topOfPage(position.pageIndex) + position.yPt * pxPerPt,
          width: float.widthPt * pxPerPt,
        }

        if (float.content.kind === 'image') {
          return (
            <img
              key={index}
              src={imageUrl(float.content.image)}
              alt=""
              style={{ ...style, height: float.heightPt * pxPerPt }}
            />
          )
        }

        if (float.content.kind === 'shape') {
          // Eine Linie hat die Höhe null; gezeichnet wird sie mit ihrer
          // Strichstärke — wie im PDF-Satz.
          const heightPt =
            float.heightPt > 0
              ? float.heightPt
              : float.content.strokePt > 0
                ? float.content.strokePt
                : DEFAULT_STROKE_PT
          const color = float.content.fill ?? float.content.stroke
          if (float.widthPt <= 0) return null
          return (
            <div
              key={index}
              style={{
                ...style,
                height: heightPt * pxPerPt,
                backgroundColor: color === null ? 'currentColor' : `#${color}`,
              }}
            />
          )
        }

        const { insets } = float.content
        return (
          <div
            key={index}
            style={{
              ...style,
              height: float.heightPt * pxPerPt,
              paddingTop: scaled(insets.topPt),
              paddingRight: scaled(insets.rightPt),
              paddingBottom: scaled(insets.bottomPt),
              paddingLeft: scaled(insets.leftPt),
              boxSizing: 'border-box',
            }}
          >
            {float.content.paragraphs.map((paragraph, position) => (
              <FloatParagraph key={position} paragraph={paragraph} natural={natural} />
            ))}
          </div>
        )
      })}

      {Array.from({ length: pageCount }, (_, index) => {
        const header = chooseRunningPart(format.header, page.titlePage, index)
        const footer = chooseRunningPart(format.footer, page.titlePage, index)
        return (
          <div key={index}>
            {header && (
              <div
                style={{
                  position: 'absolute',
                  top: topOfPage(index) + page.headerDistancePt * pxPerPt,
                  left: page.marginLeftPt * pxPerPt,
                  width: (page.widthPt - page.marginLeftPt - page.marginRightPt) * pxPerPt,
                }}
              >
                {header.map((paragraph, position) => (
                  <FloatParagraph key={position} paragraph={paragraph} natural={natural} />
                ))}
              </div>
            )}
            {footer && (
              // Von unten gemessen, damit die Fußzeile am Abstand **endet**
              // und nicht dort beginnt — ihre Höhe steht erst nach dem Satz
              // fest, und die kennt der Browser besser als wir.
              <div
                style={{
                  position: 'absolute',
                  top: topOfPage(index) + pageHeight - page.footerDistancePt * pxPerPt,
                  transform: 'translateY(-100%)',
                  left: page.marginLeftPt * pxPerPt,
                  width: (page.widthPt - page.marginLeftPt - page.marginRightPt) * pxPerPt,
                }}
              >
                {footer.map((paragraph, position) => (
                  <FloatParagraph key={position} paragraph={paragraph} natural={natural} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Ein Absatz dieser Ebene — anders als im Fließtext von React verwaltet.
 *
 * Hier darf es JSX sein: Niemand tippt hinein, also gibt es auch keinen
 * Schreibcursor, den React beim Neurendern verlieren könnte.
 */
function FloatParagraph({
  paragraph,
  natural,
}: {
  paragraph: FormattedParagraph
  natural: NaturalLineHeight
}) {
  return (
    <p style={{ ...paragraphStyle(paragraph, natural), whiteSpace: 'pre-wrap' }}>
      {runPieces(paragraph).map((piece, index) =>
        piece.kind === 'image' ? (
          <img
            key={index}
            src={imageUrl(piece.image)}
            alt=""
            style={{
              width: scaled(piece.image.widthPt),
              height: scaled(piece.image.heightPt),
            }}
          />
        ) : (
          <span key={index} style={characterStyle(piece.format)}>
            {displayText(piece.text, piece.format)}
          </span>
        ),
      )}
    </p>
  )
}
