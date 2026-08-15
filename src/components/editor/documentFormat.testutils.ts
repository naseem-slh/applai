import type {
  CharacterFormat,
  DocumentFormat,
  FormattedParagraph,
  PageFormat,
  ParagraphFormat,
  ParagraphItem,
} from '@/lib/docx/format'

/**
 * Formatierungen von der Stange für die Tests der Arbeitsfläche.
 *
 * Ein `CharacterFormat` hat zehn Felder und ein `ParagraphFormat` zehn
 * weitere; von Hand ausgeschrieben verdeckt das in jedem Test den einen
 * Wert, um den es geht.
 */

export const CHARACTER: CharacterFormat = {
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

export const PARAGRAPH: ParagraphFormat = {
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

export const PAGE: PageFormat = {
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

export function character(overrides: Partial<CharacterFormat> = {}): CharacterFormat {
  return { ...CHARACTER, ...overrides }
}

export function formattedParagraph(
  items: ParagraphItem[] = [{ kind: 'text', text: 'Text', format: CHARACTER }],
  format: Partial<ParagraphFormat> = {},
  markFormat: CharacterFormat = CHARACTER,
): FormattedParagraph {
  return { index: 0, format: { ...PARAGRAPH, ...format }, items, markFormat }
}

/** Ein Textlauf in einem bestimmten Zeichenformat. */
export function text(value: string, format: CharacterFormat = CHARACTER): ParagraphItem {
  return { kind: 'text', text: value, format }
}

/** Ein ganzes Dokument aus fertigen Absätzen. */
export function documentFormat(
  paragraphs: FormattedParagraph[],
  page: PageFormat = PAGE,
): DocumentFormat {
  const running = { default: null, first: null, even: null }
  return { page, paragraphs, floats: [], header: running, footer: running, defaultTabStopPt: 36 }
}
