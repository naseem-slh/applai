import type { FloatingObject, PageFormat } from './format'

/**
 * Wo ein schwebendes Objekt auf dem Blatt sitzt.
 *
 * Word misst es waagerecht vom Blattrand oder vom Satzspiegel, senkrecht
 * zusätzlich vom Absatz, in dem es verankert ist — und statt eines Maßes
 * kann auch eine Ausrichtung stehen. In einem Anschreiben trifft das die
 * drei Stücke, die den Brief überhaupt erst zu einem machen: das
 * Anschriftenfeld nach DIN 5008, die Linie unter dem Briefkopf und die
 * eingescannte Unterschrift.
 *
 * **Warum getrennt von beiden Verwendern.** Der PDF-Satz und die
 * Arbeitsfläche müssen dieselbe Rechnung anstellen; stünde sie zweimal da,
 * säße das Anschriftenfeld auf dem Schirm irgendwann einen Zentimeter
 * woanders als in der Datei, die der Nutzer verschickt. Reine Geometrie,
 * ohne DOM und ohne Schriften.
 */

/** Die gemessene Lage des Absatzes, an dem ein Objekt hängt. */
export interface ParagraphAnchor {
  pageIndex: number
  /** Oberkante des Absatzes, von der Oberkante **seiner** Seite gemessen. */
  topPt: number
}

export interface FloatPosition {
  pageIndex: number
  /** Von der linken Blattkante. */
  xPt: number
  /** Von der oberen Blattkante der genannten Seite. */
  yPt: number
}

/**
 * `null`, wenn das Objekt an einem Absatz hängt, dessen Lage nicht bekannt
 * ist — dann steht nicht fest, auf welche Seite es gehört, und ein geratener
 * Platz wäre schlechter als keiner.
 */
export function floatPosition(
  float: FloatingObject,
  page: PageFormat,
  anchorAt: ParagraphAnchor | null,
): FloatPosition | null {
  const { anchor } = float

  const originX = anchor.fromH === 'page' ? 0 : page.marginLeftPt
  const spanX =
    anchor.fromH === 'page' ? page.widthPt : page.widthPt - page.marginLeftPt - page.marginRightPt
  const xPt =
    anchor.alignH === 'center'
      ? originX + (spanX - float.widthPt) / 2
      : anchor.alignH === 'right'
        ? originX + spanX - float.widthPt
        : anchor.alignH === 'left'
          ? originX
          : originX + anchor.xPt

  let pageIndex = 0
  let originY = 0
  if (anchor.fromV === 'paragraph') {
    if (anchorAt === null) return null
    pageIndex = anchorAt.pageIndex
    originY = anchorAt.topPt
  } else if (anchor.fromV === 'margin') {
    originY = page.marginTopPt
  }

  // Eine Ausrichtung am Absatz ergibt keinen Sinn — dort zählt der Versatz.
  const alignedV = anchor.fromV !== 'paragraph'
  const spanY =
    anchor.fromV === 'page' ? page.heightPt : page.heightPt - page.marginTopPt - page.marginBottomPt
  const yPt =
    alignedV && anchor.alignV === 'center'
      ? originY + (spanY - float.heightPt) / 2
      : alignedV && anchor.alignV === 'bottom'
        ? originY + spanY - float.heightPt
        : alignedV && anchor.alignV === 'top'
          ? originY
          : originY + anchor.yPt

  return { pageIndex, xPt, yPt }
}
