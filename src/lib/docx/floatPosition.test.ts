import { describe, expect, it } from 'vitest'

import type { FloatAnchor, FloatingObject, PageFormat } from './format'
import { floatPosition } from './floatPosition'

const PAGE: PageFormat = {
  widthPt: 600,
  heightPt: 800,
  marginTopPt: 60,
  marginRightPt: 40,
  marginBottomPt: 60,
  marginLeftPt: 70,
  headerDistancePt: 0,
  footerDistancePt: 0,
  titlePage: false,
}

const ANCHOR: FloatAnchor = {
  fromH: 'page',
  fromV: 'page',
  xPt: 0,
  yPt: 0,
  alignH: null,
  alignV: null,
  paragraphIndex: null,
}

function float(anchor: Partial<FloatAnchor> = {}, widthPt = 200, heightPt = 100): FloatingObject {
  return {
    anchor: { ...ANCHOR, ...anchor },
    widthPt,
    heightPt,
    content: { kind: 'image', image: { path: 'a.png', bytes: new Uint8Array(), widthPt, heightPt } },
  }
}

describe('floatPosition — waagerecht', () => {
  it('misst vom Blattrand', () => {
    expect(floatPosition(float({ fromH: 'page', xPt: 120 }), PAGE, null)?.xPt).toBe(120)
  })

  it('misst vom Satzspiegel', () => {
    expect(floatPosition(float({ fromH: 'margin', xPt: 120 }), PAGE, null)?.xPt).toBe(190)
  })

  it('richtet statt zu messen, wenn eine Ausrichtung angegeben ist', () => {
    expect(floatPosition(float({ alignH: 'left', xPt: 999 }), PAGE, null)?.xPt).toBe(0)
    expect(floatPosition(float({ alignH: 'right' }), PAGE, null)?.xPt).toBe(400)
    expect(floatPosition(float({ alignH: 'center' }), PAGE, null)?.xPt).toBe(200)
  })

  it('richtet innerhalb des Satzspiegels aus, wenn daran gemessen wird', () => {
    // 600 − 70 − 40 = 490 Satzspiegel, minus 200 Breite, plus 70 Ursprung.
    expect(floatPosition(float({ fromH: 'margin', alignH: 'right' }), PAGE, null)?.xPt).toBe(360)
  })
})

describe('floatPosition — senkrecht', () => {
  it('misst vom oberen Blattrand', () => {
    expect(floatPosition(float({ fromV: 'page', yPt: 150 }), PAGE, null)?.yPt).toBe(150)
  })

  it('misst vom oberen Satzspiegelrand', () => {
    expect(floatPosition(float({ fromV: 'margin', yPt: 150 }), PAGE, null)?.yPt).toBe(210)
  })

  /**
   * Die Unterschrift hängt an der Grußformel. Wo die steht, weiß erst der
   * Umbruch — deshalb kommt die Lage des Absatzes von außen herein.
   */
  it('misst vom Absatz, an dem es hängt, samt seiner Seite', () => {
    const position = floatPosition(float({ fromV: 'paragraph', yPt: 12, paragraphIndex: 7 }), PAGE, {
      pageIndex: 1,
      topPt: 400,
    })

    expect(position).toEqual({ pageIndex: 1, xPt: 0, yPt: 412 })
  })

  it('gibt nichts zurück, solange die Lage des Absatzes unbekannt ist', () => {
    expect(floatPosition(float({ fromV: 'paragraph', paragraphIndex: 7 }), PAGE, null)).toBeNull()
  })

  /**
   * Am Absatz zählt allein der Versatz: „unten ausgerichtet" hieße hier
   * „unten am Absatz", und das meint Word nicht.
   */
  it('übergeht eine Ausrichtung, wenn am Absatz gemessen wird', () => {
    const position = floatPosition(
      float({ fromV: 'paragraph', alignV: 'bottom', yPt: 5, paragraphIndex: 0 }),
      PAGE,
      { pageIndex: 0, topPt: 100 },
    )

    expect(position?.yPt).toBe(105)
  })

  it('richtet am Blatt aus, wo eine Ausrichtung steht', () => {
    expect(floatPosition(float({ fromV: 'page', alignV: 'bottom' }), PAGE, null)?.yPt).toBe(700)
    expect(floatPosition(float({ fromV: 'page', alignV: 'center' }), PAGE, null)?.yPt).toBe(350)
  })
})
