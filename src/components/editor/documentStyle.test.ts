import { describe, expect, it } from 'vitest'

import type {
  CharacterFormat,
  FormattedParagraph,
  LineSpacing,
  PageFormat,
  ParagraphFormat,
  ParagraphItem,
} from '@/lib/docx/format'
import { characterStyle, displayText, pageStyle, paragraphStyle, scaled } from './documentStyle'

const CHARACTER: CharacterFormat = {
  fontFamily: 'Calibri',
  sizePt: 12,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  caps: false,
  smallCaps: false,
  vertAlign: 'baseline',
}

const PARAGRAPH: ParagraphFormat = {
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
}

const PAGE: PageFormat = {
  widthPt: 595,
  heightPt: 842,
  marginTopPt: 57,
  marginRightPt: 43,
  marginBottomPt: 57,
  marginLeftPt: 70,
  headerDistancePt: 0,
  footerDistancePt: 0,
  titlePage: false,
}

function character(overrides: Partial<CharacterFormat> = {}): CharacterFormat {
  return { ...CHARACTER, ...overrides }
}

function paragraph(
  overrides: Partial<ParagraphFormat> = {},
  items: ParagraphItem[] = [{ kind: 'text', text: 'Text', format: CHARACTER }],
  markFormat: CharacterFormat = CHARACTER,
): FormattedParagraph {
  return { index: 0, format: { ...PARAGRAPH, ...overrides }, items, markFormat }
}

/** Die natürliche Zeilenhöhe der Prüfschrift: schlicht das Anderthalbfache. */
const natural = (format: CharacterFormat): number => format.sizePt * 1.5

describe('scaled — Punkt als CSS-Länge', () => {
  it('misst am Maßstab der Seite statt in festen Pixeln', () => {
    expect(scaled(12)).toBe('calc(var(--pt) * 12)')
  })

  it('kürzt die Nachkommastellen, die kein Auge unterscheidet', () => {
    expect(scaled(11.999999)).toBe('calc(var(--pt) * 12)')
    expect(scaled(6.35)).toBe('calc(var(--pt) * 6.35)')
  })
})

describe('characterStyle — Zeichenformatierung', () => {
  it('setzt die mitgelieferte Familie, nicht den Namen aus dem Dokument', () => {
    // Calibri ist lizenziert und liegt nicht im Projekt; Carlito ist der
    // metrikgleiche Nachbau (G2, G4).
    expect(characterStyle(character()).fontFamily).toBe('Carlito')
    expect(characterStyle(character({ fontFamily: 'Times New Roman' })).fontFamily).toBe(
      'LiberationSerif',
    )
  })

  it('trägt Grad, Fettung und Neigung', () => {
    const style = characterStyle(character({ sizePt: 14, bold: true, italic: true }))

    expect(style.fontSize).toBe('calc(var(--pt) * 14)')
    expect(style.fontWeight).toBe(700)
    expect(style.fontStyle).toBe('italic')
  })

  it('fasst Unterstreichung und Durchstreichung zusammen', () => {
    expect(characterStyle(character({ underline: true })).textDecorationLine).toBe('underline')
    expect(characterStyle(character({ strike: true })).textDecorationLine).toBe('line-through')
    expect(characterStyle(character({ underline: true, strike: true })).textDecorationLine).toBe(
      'underline line-through',
    )
    expect(characterStyle(character()).textDecorationLine).toBeUndefined()
  })

  it('setzt eine Farbe als Doppelkreuz-Wert, Schwarz gar nicht', () => {
    expect(characterStyle(character({ color: '1F4E79' })).color).toBe('#1F4E79')
    expect(characterStyle(character()).color).toBeUndefined()
  })

  /**
   * Entscheidend: Großschreibung über CSS, **nicht** über den Text. Der
   * Zeichenbestand im DOM muss zeichengleich mit `Paragraph.text` bleiben,
   * sonst zeigen die Markierungen des Nutzers hinterher auf andere Stellen.
   */
  it('macht Versalien über text-transform statt über den Text', () => {
    expect(characterStyle(character({ caps: true })).textTransform).toBe('uppercase')
    expect(characterStyle(character({ smallCaps: true })).fontVariantCaps).toBe('small-caps')
  })

  it('schrumpft und hebt hoch- und tiefgestellten Text wie der PDF-Satz', () => {
    const superscript = characterStyle(character({ vertAlign: 'superscript' }))
    const subscript = characterStyle(character({ vertAlign: 'subscript' }))

    // 0,65 des Grads, 0,35 bzw. −0,15 davon als Versatz — dieselben Anteile
    // wie in `export/pdf/layout.ts`.
    expect(superscript.fontSize).toBe('calc(var(--pt) * 7.8)')
    expect(superscript.verticalAlign).toBe('calc(var(--pt) * 4.2)')
    expect(subscript.verticalAlign).toBe('calc(var(--pt) * -1.8)')
  })
})

describe('paragraphStyle — Absatzformatierung', () => {
  it('trägt Ausrichtung und Einzüge', () => {
    const style = paragraphStyle(
      paragraph({
        alignment: 'justify',
        indentLeftPt: 190,
        indentRightPt: 50,
        indentFirstLinePt: -20,
      }),
      natural,
    )

    expect(style.textAlign).toBe('justify')
    expect(style.marginLeft).toBe('calc(var(--pt) * 190)')
    expect(style.marginRight).toBe('calc(var(--pt) * 50)')
    expect(style.textIndent).toBe('calc(var(--pt) * -20)')
  })

  /**
   * Abstände als **Polsterung**, nicht als Rand. Zwei Gründe, beide
   * zwingend: CSS-Ränder benachbarter Geschwister fallen zusammen, Words
   * `spaceBefore`/`spaceAfter` tun das nicht; und `offsetHeight` schließt
   * Polsterung ein, Ränder nicht — die Seitenaufteilung misst sonst falsch.
   */
  it('setzt Absatzabstände als Polsterung', () => {
    const style = paragraphStyle(paragraph({ spaceBeforePt: 3, spaceAfterPt: 8 }), natural)

    expect(style.paddingTop).toBe('calc(var(--pt) * 3)')
    expect(style.paddingBottom).toBe('calc(var(--pt) * 8)')
    expect(style.marginTop).toBeUndefined()
    expect(style.marginBottom).toBeUndefined()
  })

  it('nimmt ein festes Zeilenmaß unmittelbar', () => {
    const exact: LineSpacing = { rule: 'exact', valuePt: 6 }

    expect(paragraphStyle(paragraph({ lineSpacing: exact }), natural).lineHeight).toBe(
      'calc(var(--pt) * 6)',
    )
  })

  /**
   * Words „einzeilig" ist *Faktor × natürliche Zeilenhöhe der Schrift* — und
   * das ist nicht das `normal` des Browsers. Gerechnet wird deshalb aus den
   * Metriken der wirklichen Schriftdatei.
   */
  it('rechnet ein Vielfaches aus der natürlichen Zeilenhöhe der Schrift', () => {
    const style = paragraphStyle(paragraph({ lineSpacing: { rule: 'auto', factor: 1.5 } }), natural)

    // 12 pt × 1,5 (natürlich) × 1,5 (Absatz)
    expect(style.lineHeight).toBe('calc(var(--pt) * 27)')
  })

  it('nimmt bei „mindestens" den größeren der beiden Werte', () => {
    const small = paragraphStyle(paragraph({ lineSpacing: { rule: 'atLeast', valuePt: 6 } }), natural)
    const large = paragraphStyle(paragraph({ lineSpacing: { rule: 'atLeast', valuePt: 30 } }), natural)

    expect(small.lineHeight).toBe('calc(var(--pt) * 18)')
    expect(large.lineHeight).toBe('calc(var(--pt) * 30)')
  })

  it('richtet sich nach dem größten Grad im Absatz', () => {
    const style = paragraphStyle(
      paragraph({}, [
        { kind: 'text', text: 'klein', format: character({ sizePt: 9 }) },
        { kind: 'text', text: 'groß', format: character({ sizePt: 20 }) },
      ]),
      natural,
    )

    expect(style.lineHeight).toBe('calc(var(--pt) * 30)')
  })

  /**
   * Ein leerer Absatz hat keinen Lauf und damit keinen Grad — ohne die
   * Absatzmarke fiele er auf null zusammen. In einem Anschreiben sind leere
   * Absätze der Zeilenfall zwischen Anrede, Text und Grußformel.
   */
  it('gibt dem leeren Absatz die Höhe seiner Absatzmarke', () => {
    const style = paragraphStyle(paragraph({}, [], character({ sizePt: 8 })), natural)

    expect(style.lineHeight).toBe('calc(var(--pt) * 12)')
    expect(style.minHeight).toBe('calc(var(--pt) * 12)')
  })
})

describe('pageStyle — Blattmaß und Ränder', () => {
  it('nimmt Maß und Ränder aus dem Dokument', () => {
    const style = pageStyle(PAGE)

    expect(style.width).toBe('calc(var(--pt) * 595)')
    expect(style.minHeight).toBe('calc(var(--pt) * 842)')
    expect(style.paddingTop).toBe('calc(var(--pt) * 57)')
    expect(style.paddingLeft).toBe('calc(var(--pt) * 70)')
    expect(style.paddingRight).toBe('calc(var(--pt) * 43)')
    expect(style.paddingBottom).toBe('calc(var(--pt) * 57)')
  })
})

describe('displayText — was auf dem Schirm steht', () => {
  it('lässt gewöhnlichen Text unangetastet', () => {
    expect(displayText('Ebersstraße 58', CHARACTER)).toBe('Ebersstraße 58')
  })

  /**
   * Word legt ein Wingdings-Zeichen in den Privatbereich (`U+F09F`). Ohne
   * Übersetzung sucht der Browser es in Carlito, findet nichts und zeigt
   * einen leeren Kasten — in der Kontaktzeile eines Anschreibens der
   * sichtbarste Fehler überhaupt.
   */
  it('übersetzt ein Bildzeichen in ein zeichenbares', () => {
    expect(displayText('', character({ fontFamily: 'Wingdings' }))).toBe('•')
  })

  /**
   * Die Länge ist die Bedingung, unter der übersetzt werden darf: An den
   * Zeichenzahlen im DOM hängen die Offsets der Markierungen. Eine
   * Übersetzung, die kürzt, wird deshalb verworfen — lieber ein leerer
   * Kasten als eine verrutschte Markierung.
   */
  it('verwirft eine Übersetzung, die die Zeichenzahl ändert', () => {
    const astral = '\u{1f600}'

    expect(displayText(astral, character({ fontFamily: 'Wingdings' }))).toBe(astral)
  })
})
