// Lädt Schriften und Fixtures per node:fs von der Platte und läuft deshalb
// unter tsconfig.test.json — siehe src/lib/docx/parse.test.ts.
import { describe, expect, it } from 'vitest'
import type {
  CharacterFormat,
  DocumentFormat,
  FloatingObject,
  FormattedParagraph,
  ParagraphItem,
} from '../../docx/format'
import { loadFixtureFormat, loadFontProvider } from './fonts.testutils'
import { layoutDocument, requiredFontKeys, type DrawnText, type LaidOutDocument } from './layout'

const CHARACTER: CharacterFormat = {
  fontFamily: 'Calibri',
  sizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  caps: false,
  smallCaps: false,
  vertAlign: 'baseline',
}

/** Ein Blatt A4 mit 2-cm-Rändern — 453,5 pt Satzspiegelbreite. */
function page(): DocumentFormat['page'] {
  return {
    widthPt: 595.3,
    heightPt: 841.9,
    marginTopPt: 56.7,
    marginRightPt: 56.7,
    marginBottomPt: 56.7,
    marginLeftPt: 56.7,
    headerDistancePt: 35.4,
    footerDistancePt: 35.4,
    titlePage: false,
  }
}

function paragraph(items: ParagraphItem[], overrides = {}): FormattedParagraph {
  return {
    index: 0,
    items,
    markFormat: CHARACTER,
    format: {
      alignment: 'left',
      indentLeftPt: 0,
      indentRightPt: 0,
      indentFirstLinePt: 0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
      lineSpacing: { rule: 'auto', factor: 1 },
      tabStops: [],
      pageBreakBefore: false,
      keepNext: false,
      ...overrides,
    },
  }
}

function text(content: string, format: Partial<CharacterFormat> = {}): ParagraphItem {
  return { kind: 'text', text: content, format: { ...CHARACTER, ...format } }
}

function document(paragraphs: FormattedParagraph[]): DocumentFormat {
  return {
    page: page(),
    paragraphs,
    floats: [],
    header: { default: null, first: null, even: null },
    footer: { default: null, first: null, even: null },
    defaultTabStopPt: 35.45,
  }
}

async function layout(format: DocumentFormat): Promise<LaidOutDocument> {
  return layoutDocument(format, await loadFontProvider(requiredFontKeys(format)))
}

function texts(result: LaidOutDocument, pageIndex = 0): DrawnText[] {
  return result.pages[pageIndex].items.filter((item): item is DrawnText => item.kind === 'text')
}

/** Die Zeilen einer Seite: Stücke gleicher Grundlinie, von oben nach unten. */
function lines(result: LaidOutDocument, pageIndex = 0): { yPt: number; text: string }[] {
  const byBaseline = new Map<number, DrawnText[]>()
  for (const item of texts(result, pageIndex)) {
    byBaseline.set(item.yPt, [...(byBaseline.get(item.yPt) ?? []), item])
  }
  return [...byBaseline.entries()]
    .sort(([first], [second]) => first - second)
    .map(([yPt, items]) => ({
      yPt,
      text: items.sort((a, b) => a.xPt - b.xPt).map((item) => item.text).join(''),
    }))
}

describe('layoutDocument — Zeilenumbruch', () => {
  it('bricht um, wenn das nächste Wort nicht mehr auf die Zeile passt', async () => {
    const long = Array.from({ length: 40 }, () => 'Bewerbungsschreiben').join(' ')

    const result = await layout(document([paragraph([text(long)])]))

    const written = lines(result)
    expect(written.length).toBeGreaterThan(1)
    // Kein Wort wird zerrissen: Jede Zeile besteht aus ganzen Wörtern.
    for (const line of written) {
      for (const word of line.text.trim().split(' ')) {
        expect(word).toBe('Bewerbungsschreiben')
      }
    }
  })

  it('setzt einen kurzen Absatz auf eine Zeile', async () => {
    const result = await layout(document([paragraph([text('Sehr geehrte Damen und Herren,')])]))

    expect(lines(result)).toHaveLength(1)
    expect(lines(result)[0].text).toBe('Sehr geehrte Damen und Herren,')
  })

  it('beginnt nach einer Zeilenschaltung eine neue Zeile', async () => {
    const result = await layout(
      document([
        paragraph([
          text('Erste'),
          { kind: 'break', page: false, format: CHARACTER },
          text('Zweite'),
        ]),
      ]),
    )

    expect(lines(result).map((line) => line.text)).toEqual(['Erste', 'Zweite'])
  })
})

describe('layoutDocument — Wörter über Laufgrenzen', () => {
  /**
   * Word zerteilt einen Absatz in Läufe, wo es ihm gerade passt: bei einem
   * Formatwechsel, aber ebenso mitten im Wort, wo nur eine Rechtschreibmarke
   * sitzt. Bricht der Satz an einer solchen Grenze um, steht im fertigen
   * Brief „Ihre Rück / meldung" — der Fehler, den ein Leser als Ersten sieht
   * und der ihn den ganzen Brief für schludrig halten lässt.
   */
  it('bricht nicht zwischen zwei Läufen desselben Wortes um', async () => {
    // Wortlaut, Aufteilung und Spaltenbreite eines echten Anschreibens, in
    // dem „meine" über zwei w:t-Läufe verteilt stand.
    const result = await layout(
      document([
        paragraph(
          [
            text('Ich bin ab sofort verfügbar und würde mich über die Möglichkeit freuen, Ihr Team durch mei'),
            text('ne Mitarbeit und mein Engagement zu unterstützen.'),
          ],
          { indentRightPt: 60 },
        ),
      ]),
    )

    const written = lines(result)
    expect(written.length).toBeGreaterThan(1)
    for (const line of written) {
      expect(line.text.endsWith('mei')).toBe(false)
      expect(line.text.startsWith('ne ')).toBe(false)
    }
    expect(written.map((line) => line.text).join(' ')).toContain('meine Mitarbeit')
  })

  /**
   * Zusammenhalten heißt nicht verschmelzen: „Vertrag" mit fettem zweiten
   * Teil bleibt ein Wort, wird aber weiterhin aus zwei Stücken gesetzt.
   */
  it('behält bei einem Formatwechsel im Wort beide Schnitte', async () => {
    const result = await layout(
      document([paragraph([text('Ver'), text('trag', { bold: true })])]),
    )

    const written = texts(result)
    expect(written.map((item) => item.text).join('')).toBe('Vertrag')
    expect(written).toHaveLength(2)
    expect(written[0].face.key).toBe('Carlito-Regular')
    expect(written[1].face.key).toBe('Carlito-Bold')
  })

  /**
   * Ein Leerzeichen am Laufwechsel bleibt eine Umbruchstelle — sonst wäre
   * die Kur schlimmer als das Leiden und ein Absatz liefe über den Rand.
   */
  it('bricht am Leerzeichen zwischen zwei Läufen weiterhin um', async () => {
    const result = await layout(
      document([
        paragraph([text('Ihre Antwort '), text('folgt umgehend')], { indentRightPt: 380 }),
      ]),
    )

    const written = lines(result)
    expect(written.length).toBeGreaterThan(1)
    // Der Umbruch sitzt an einer Wortgrenze, nicht in einem Wort.
    for (const line of written) {
      expect(['Ihre', 'Antwort', 'folgt', 'umgehend']).toContain(line.text.split(' ').at(-1))
    }
  })
})

describe('layoutDocument — Bildschriften', () => {
  /**
   * Die Kontaktzeile eines echten Anschreibens: Straße, Ort und Telefon
   * durch ein Wingdings-Zeichen getrennt. Ohne Übersetzung steht dort im
   * PDF ein leerer Kasten — und weil `.notdef` eine eigene Breite hat, auch
   * noch mit falschem Abstand.
   */
  it('setzt ein Wingdings-Zeichen als Aufzählungspunkt', async () => {
    const result = await layout(
      document([
        paragraph([
          text('Ebersstraße 58 '),
          text('\uF09F', { fontFamily: 'Wingdings' }),
          text(' 10827 Berlin'),
        ]),
      ]),
    )

    expect(lines(result)[0].text).toBe('Ebersstraße 58 • 10827 Berlin')
  })

  it('setzt das Zeichen mit der Ersatzschrift, nicht mit .notdef', async () => {
    const result = await layout(
      document([paragraph([text('\uF09F', { fontFamily: 'Wingdings' })])]),
    )

    const written = texts(result)
    expect(written).toHaveLength(1)
    expect(written[0].text).toBe('•')
    expect(written[0].face.key).toBe('LiberationSans-Regular')
  })
})

/** Ein schwebendes Objekt mit den Vorgaben, die Word ohne Angabe setzt. */
function float(overrides: Partial<FloatingObject> = {}): FloatingObject {
  return {
    anchor: {
      fromH: 'page',
      fromV: 'page',
      xPt: 0,
      yPt: 0,
      alignH: null,
      alignV: null,
      paragraphIndex: null,
    },
    widthPt: 100,
    heightPt: 50,
    content: { kind: 'shape', fill: '000000', stroke: null, strokePt: 0 },
    ...overrides,
  }
}

describe('layoutDocument — schwebende Objekte', () => {
  /**
   * Die Empfängeranschrift steht in einem Anschreiben nach DIN 5008 im
   * Anschriftenfeld — und das ist in Word regelmäßig ein Textfeld. Fehlt es
   * im PDF, fehlt dem Brief der Empfänger.
   */
  it('setzt den Text eines Textfelds in dessen Kasten', async () => {
    const result = await layout({
      ...document([paragraph([text('Fließtext')])]),
      floats: [
        float({
          anchor: {
            fromH: 'page',
            fromV: 'page',
            xPt: 70,
            yPt: 200,
            alignH: null,
            alignV: null,
            paragraphIndex: null,
          },
          widthPt: 186,
          heightPt: 110,
          content: {
            kind: 'textbox',
            paragraphs: [paragraph([text('HyCARE GmbH')])],
            insets: { leftPt: 7.2, topPt: 3.6, rightPt: 7.2, bottomPt: 3.6 },
          },
        }),
      ],
    })

    const written = texts(result).find((item) => item.text.startsWith('HyCARE'))
    expect(written).toBeDefined()
    expect(written?.xPt).toBeCloseTo(70 + 7.2, 1)
    expect(written?.yPt).toBeGreaterThan(200)
    expect(written?.yPt).toBeLessThan(200 + 110)
  })

  it('bricht den Text an der Breite des Kastens um, nicht an der der Seite', async () => {
    const long = 'Ein Anschriftenfeld ist schmal und zwingt den Satz früh zum Umbruch'
    const result = await layout({
      ...document([]),
      floats: [
        float({
          widthPt: 120,
          heightPt: 200,
          content: {
            kind: 'textbox',
            paragraphs: [paragraph([text(long)])],
            insets: { leftPt: 0, topPt: 0, rightPt: 0, bottomPt: 0 },
          },
        }),
      ],
    })

    // Auf Satzspiegelbreite stünde der Satz in einer Zeile.
    const baselines = new Set(texts(result).map((item) => item.yPt))
    expect(baselines.size).toBeGreaterThan(1)
    for (const item of texts(result)) {
      expect(item.xPt).toBeLessThan(120)
    }
  })

  /**
   * Die Linie unter dem Briefkopf ist eine Form der Höhe null. Ohne eigene
   * Höhe wäre sie unsichtbar; gezeichnet wird sie mit ihrer Strichstärke.
   */
  it('zeichnet eine Linie mit ihrer Strichstärke', async () => {
    const result = await layout({
      ...document([]),
      floats: [
        float({
          anchor: {
            fromH: 'page',
            fromV: 'page',
            xPt: 68,
            yPt: 127.5,
            alignH: null,
            alignV: null,
            paragraphIndex: null,
          },
          widthPt: 452.9,
          heightPt: 0,
          content: { kind: 'shape', fill: null, stroke: '000000', strokePt: 0.67 },
        }),
      ],
    })

    const rects = result.pages[0].items.filter((item) => item.kind === 'rect')
    expect(rects).toHaveLength(1)
    expect(rects[0].xPt).toBeCloseTo(68, 1)
    expect(rects[0].yPt).toBeCloseTo(127.5, 1)
    expect(rects[0].widthPt).toBeCloseTo(452.9, 1)
    expect(rects[0].heightPt).toBeCloseTo(0.67, 2)
  })

  it('misst den Bezug „Rand" vom Satzspiegel, nicht vom Blattrand', async () => {
    const result = await layout({
      ...document([]),
      floats: [
        float({
          anchor: {
            fromH: 'margin',
            fromV: 'margin',
            xPt: 10,
            yPt: 20,
            alignH: null,
            alignV: null,
            paragraphIndex: null,
          },
          content: { kind: 'shape', fill: '000000', stroke: null, strokePt: 0 },
        }),
      ],
    })

    const rect = result.pages[0].items.find((item) => item.kind === 'rect')
    expect(rect?.xPt).toBeCloseTo(56.7 + 10, 1)
    expect(rect?.yPt).toBeCloseTo(56.7 + 20, 1)
  })

  /**
   * Eine Unterschrift hängt an der Grußformel. Rutscht die auf die zweite
   * Seite, muss die Unterschrift mit — sonst steht sie allein auf Seite eins.
   */
  it('lässt ein am Absatz hängendes Objekt auf dessen Seite wandern', async () => {
    const filler = Array.from({ length: 60 }, (_ignored, index) => ({
      ...paragraph([text(`Zeile ${index}`)]),
      index,
    }))
    const greeting = { ...paragraph([text('Mit freundlichen Grüßen')]), index: 60 }

    const result = await layout({
      ...document([...filler, greeting]),
      floats: [
        float({
          anchor: {
            fromH: 'page',
            fromV: 'paragraph',
            xPt: 70,
            yPt: 10,
            alignH: null,
            alignV: null,
            paragraphIndex: 60,
          },
          content: { kind: 'shape', fill: '000000', stroke: null, strokePt: 0 },
        }),
      ],
    })

    expect(result.pages.length).toBeGreaterThan(1)
    const withGreeting = result.pages.findIndex((laidOut) =>
      laidOut.items.some((item) => item.kind === 'text' && item.text.startsWith('Grüßen')),
    )
    const withRect = result.pages.findIndex((laidOut) =>
      laidOut.items.some((item) => item.kind === 'rect'),
    )
    expect(withRect).toBe(withGreeting)
  })

  it('lässt ein Objekt weg, dessen Absatz gar nicht gesetzt wurde', async () => {
    const result = await layout({
      ...document([paragraph([text('Fließtext')])]),
      floats: [
        float({
          anchor: {
            fromH: 'page',
            fromV: 'paragraph',
            xPt: 0,
            yPt: 0,
            alignH: null,
            alignV: null,
            paragraphIndex: 99,
          },
        }),
      ],
    })

    expect(result.pages[0].items.filter((item) => item.kind === 'rect')).toHaveLength(0)
  })
})

describe('layoutDocument — Ausrichtung', () => {
  it('setzt zentriert und rechtsbündig an die richtige Stelle', async () => {
    const centered = await layout(
      document([paragraph([text('Anlagen')], { alignment: 'center' })]),
    )
    const right = await layout(document([paragraph([text('Anlagen')], { alignment: 'right' })]))
    const left = await layout(document([paragraph([text('Anlagen')])]))

    const textLeft = 56.7
    const textRight = 595.3 - 56.7
    expect(texts(left)[0].xPt).toBeCloseTo(textLeft, 1)

    // Rechtsbündig endet der Text am rechten Satzspiegelrand.
    const width = textRight - texts(right)[0].xPt
    expect(width).toBeGreaterThan(0)

    // Zentriert bleibt links und rechts derselbe Rest.
    expect(texts(centered)[0].xPt).toBeCloseTo(textLeft + (textRight - textLeft - width) / 2, 1)
  })

  it('streckt im Blocksatz die Wortzwischenräume, aber nicht in der letzten Zeile', async () => {
    const long = Array.from({ length: 30 }, () => 'Wort').join(' ')

    const result = await layout(document([paragraph([text(long)], { alignment: 'justify' })]))

    const written = lines(result)
    expect(written.length).toBeGreaterThan(1)
    const items = texts(result).filter((item) => item.yPt === written[0].yPt)
    const last = items[items.length - 1]
    // Die erste Zeile reicht im Blocksatz bis an den rechten Rand.
    expect(last.xPt + 4 * 2).toBeGreaterThan(480)
  })
})

describe('layoutDocument — Tabulatoren', () => {
  /**
   * Der klassische Briefkopf: Ort links, Datum rechtsbündig am
   * Satzspiegelrand. Der Halt zählt vom linken Rand, nicht vom Einzug.
   */
  it('hält rechtsbündig am angegebenen Halt', async () => {
    const stop = { positionPt: 453.5, alignment: 'right' as const }
    const result = await layout(
      document([
        paragraph(
          [text('Musterstadt,'), { kind: 'tab', format: CHARACTER }, text('13. August 2026')],
          { tabStops: [stop] },
        ),
      ]),
    )

    // Das Datum zerfällt in mehrere Wörter; maßgeblich ist, wo das letzte endet.
    const fonts = await loadFontProvider(['Carlito-Regular'])
    const face = fonts.face('Calibri', false, false)
    const measure = (content: string): number => {
      let units = 0
      for (const character of content) {
        units += face.font.advance(face.font.glyphId(character.codePointAt(0) ?? 0))
      }
      return (units * 11) / face.font.metrics.unitsPerEm
    }

    const items = texts(result)
    const last = items[items.length - 1]
    expect(last.text).toBe('2026')
    expect(last.xPt + measure(last.text)).toBeCloseTo(56.7 + 453.5, 1)
  })

  it('springt ohne eigenen Halt auf das nächste Standardmaß', async () => {
    const result = await layout(
      document([paragraph([text('A'), { kind: 'tab', format: CHARACTER }, text('B')])]),
    )

    const items = texts(result)
    expect(items[1].xPt - 56.7).toBeCloseTo(35.45, 1)
  })
})

describe('layoutDocument — Seiten', () => {
  it('beginnt bei einem harten Seitenumbruch eine neue Seite', async () => {
    const result = await layout(
      document([
        paragraph([text('Erste Seite')]),
        paragraph([{ kind: 'break', page: true, format: CHARACTER }, text('Zweite Seite')]),
      ]),
    )

    expect(result.pages).toHaveLength(2)
    expect(lines(result, 1)[0].text).toBe('Zweite Seite')
  })

  it('bricht um, wenn der Satzspiegel voll ist', async () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      paragraph([text(`Absatz ${index + 1}`)]),
    )

    const result = await layout(document(many))

    expect(result.pages.length).toBeGreaterThan(1)
  })

  it('gibt einem leeren Absatz die Höhe seiner Absatzmarke', async () => {
    const withGap = await layout(
      document([paragraph([text('Oben')]), paragraph([]), paragraph([text('Unten')])]),
    )
    const withoutGap = await layout(
      document([paragraph([text('Oben')]), paragraph([text('Unten')])]),
    )

    const gap = lines(withGap)[1].yPt - lines(withGap)[0].yPt
    const none = lines(withoutGap)[1].yPt - lines(withoutGap)[0].yPt
    expect(gap).toBeCloseTo(none * 2, 1)
  })

  it('streckt die Zeilen nach dem Zeilenabstand des Absatzes', async () => {
    const single = await layout(document([paragraph([text('A')]), paragraph([text('B')])]))
    const oneAndAHalf = await layout(
      document([
        paragraph([text('A')], { lineSpacing: { rule: 'auto', factor: 1.5 } }),
        paragraph([text('B')], { lineSpacing: { rule: 'auto', factor: 1.5 } }),
      ]),
    )

    const singleGap = lines(single)[1].yPt - lines(single)[0].yPt
    const stretched = lines(oneAndAHalf)[1].yPt - lines(oneAndAHalf)[0].yPt
    expect(stretched).toBeCloseTo(singleGap * 1.5, 1)
  })
})

describe('layoutDocument — echte Datei', () => {
  it('setzt das formatierte Anschreiben auf drei Seiten mit Kopf- und Fußzeile', async () => {
    const { format, fonts } = await loadFixtureFormat('anschreiben-formatiert.docx')

    const result = layoutDocument(format, fonts)

    // Zwei ausdrückliche Seitenumbrüche im Fixture.
    expect(result.pages).toHaveLength(3)
    for (const laidOut of result.pages) {
      const written = laidOut.items.filter((item) => item.kind === 'text')
      expect(written.some((item) => item.text.includes('Erika'))).toBe(true)
      expect(written.some((item) => item.text.includes('erika@example.org'))).toBe(true)
    }
    // Das Logo steht auf jeder Seite genau einmal.
    expect(result.pages[0].items.filter((item) => item.kind === 'image')).toHaveLength(1)
  })

  it('zeichnet die Unterstreichung als eigene Fläche', async () => {
    const { format, fonts } = await loadFixtureFormat('anschreiben-formatiert.docx')

    const result = layoutDocument(format, fonts)

    const rects = result.pages.flatMap((laidOut) =>
      laidOut.items.filter((item) => item.kind === 'rect'),
    )
    expect(rects.length).toBeGreaterThan(0)
  })
})
