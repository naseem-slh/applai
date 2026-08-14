import type {
  CharacterFormat,
  DocumentFormat,
  DocumentImage,
  FloatingObject,
  FormattedParagraph,
  PageFormat,
  ParagraphFormat,
} from '../../docx/format'
import { translateSymbolText } from '../../docx/symbols'
import { fontFileKey } from '../../fonts/bundled'
import type { FontFace, FontProvider } from './fonts'

/**
 * Setzt den ausgelesenen Brief auf Seiten: Zeilenumbruch, Tabulatoren,
 * Ausrichtung, Zeilen- und Absatzabstände, Seitenumbruch, Kopf- und Fußzeile
 * sowie die schwebenden Objekte — Textfelder, Linien und Unterschriften an
 * ihrer Blattkoordinate.
 *
 * **Warum das hier und nicht im Browser passiert.** Der Zeilenumbruch
 * bestimmt, wo der Brief auf die zweite Seite rutscht — die auffälligste
 * Eigenschaft eines Anschreibens überhaupt. Er muss deshalb mit denselben
 * Zahlen gerechnet werden, mit denen Word rechnet: den Vorschubbreiten aus
 * der Schriftdatei. Der Browser könnte messen, aber nur seine eigenen
 * Schriften und nur auf Bildschirmpixel gerundet.
 *
 * **Wie nah das an Word herankommt.** Die mitgelieferten Schriften sind
 * metrikgleich zu den Originalen, die Absatz- und Zeilenmaße kommen aus dem
 * Dokument. Damit bricht der Satz in aller Regel an denselben Stellen um.
 * Wortgenau **gleich** ist er nicht: Words Umbruchverfahren ist nicht
 * veröffentlicht, Silbentrennung und Ligaturen bleiben hier außen vor. Das
 * ist eine Näherung, und sie wird auch so benannt — nicht als „identisch".
 *
 * Was bewusst fehlt: Tabellen, Aufzählungszeichen aus `numbering.xml`,
 * Absatzzusammenhalt (`w:keepNext`) und der Textumfluss um schwebende
 * Objekte (`w:wrap`) — die liegen über dem Text, statt ihn zu verdrängen.
 * Für ein Anschreiben ist das folgenlos: Anschriftenfeld, Linie und
 * Unterschrift stehen dort, wo ohnehin kein Fließtext steht.
 * Siehe `docs/spec.md`.
 */

/** Ein Stück gesetzter Text an seinem Platz auf dem Blatt. */
export interface DrawnText {
  kind: 'text'
  xPt: number
  /** Die Grundlinie, von der Blattoberkante nach unten gemessen. */
  yPt: number
  text: string
  face: FontFace
  sizePt: number
  color: string | null
}

/** Eine gefüllte Fläche — Unterstreichung und Durchstreichung. */
export interface DrawnRect {
  kind: 'rect'
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
  color: string | null
}

export interface DrawnImage {
  kind: 'image'
  xPt: number
  /** Oberkante, von der Blattoberkante nach unten gemessen. */
  yPt: number
  widthPt: number
  heightPt: number
  image: DocumentImage
}

export type DrawItem = DrawnText | DrawnRect | DrawnImage

export interface LaidOutPage {
  items: DrawItem[]
}

export interface LaidOutDocument {
  page: PageFormat
  pages: LaidOutPage[]
}

/** Der Anteil des Schriftgrads, auf den hoch- und tiefgestellter Text schrumpft. */
const SCRIPT_SCALE = 0.65
/** Wie weit hoch- bzw. tiefgestellter Text von der Grundlinie abrückt. */
const SUPERSCRIPT_RISE = 0.35
const SUBSCRIPT_RISE = -0.15
/** Kapitälchen: Kleinbuchstaben als Großbuchstaben in diesem Anteil des Grads. */
const SMALL_CAPS_SCALE = 0.8
/** Stärke und Lage von Unterstreichung und Durchstreichung, in Anteilen des Grads. */
const UNDERLINE_OFFSET = 0.12
const UNDERLINE_THICKNESS = 0.055
const STRIKE_OFFSET = -0.26

// ---------------------------------------------------------------------------
// Zwischenformen: Stücke, Bausteine, Zeilen
// ---------------------------------------------------------------------------

/** Ein Stück Text mit einheitlicher Schrift und einheitlichem Grad. */
interface Piece {
  text: string
  format: CharacterFormat
  face: FontFace
  sizePt: number
  widthPt: number
  /** Versatz gegenüber der Grundlinie, für Hoch- und Tiefstellung. */
  risePt: number
}

/**
 * Der kleinste Baustein des Umbruchs. Ein Wort wird nie zerrissen, an einem
 * Leerraum darf umbrochen werden, ein Tabulator und ein Umbruch sind
 * Anweisungen.
 */
type Atom =
  | { kind: 'word'; pieces: Piece[]; widthPt: number }
  | { kind: 'space'; pieces: Piece[]; widthPt: number }
  | { kind: 'tab'; stops: readonly TabTarget[] }
  | { kind: 'break'; page: boolean }
  | { kind: 'image'; image: DocumentImage }

interface TabTarget {
  positionPt: number
  alignment: 'left' | 'center' | 'right' | 'decimal'
}

interface Line {
  atoms: Atom[]
  /** Ob die Zeile durch eine Zeilenschaltung endet und nicht durch Umbruch. */
  hardBreak: boolean
  /** Ob vor dieser Zeile eine neue Seite beginnen muss. */
  pageBreakBefore: boolean
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

export function layoutDocument(format: DocumentFormat, fonts: FontProvider): LaidOutDocument {
  const pages: DrawItem[][] = []
  const flow = new PageFlow(format, fonts, pages)

  for (const paragraph of format.paragraphs) {
    flow.addParagraph(paragraph)
  }
  flow.finish()

  // Zweiter Durchgang für die schwebenden Objekte. Er ist zulässig, weil sie
  // den Fluss nicht verschieben: Textumfluss (`w:wrap`) ist nicht umgesetzt,
  // sie liegen über dem Text. Umgekehrt geht es nicht — wo ein Absatz zu
  // stehen kommt, weiß man erst nach dem Umbruch.
  for (const float of format.floats) {
    const placed = placeFloat(float, format, fonts, flow)
    if (placed) pages[placed.pageIndex]?.push(...placed.items)
  }

  // Kopf- und Fußzeile stehen auf **jeder** Seite und werden deshalb erst
  // gesetzt, wenn feststeht, wie viele es sind.
  pages.forEach((items, index) => {
    items.push(...runningItems(format, fonts, index))
  })

  return { page: format.page, pages: pages.map((items) => ({ items })) }
}

/**
 * Sammelt die Schnitte, die ein Dokument braucht — damit der Aufrufer sie
 * laden kann, bevor gesetzt wird. Der Satz selbst greift nie ins Netz.
 */
export function requiredFontKeys(format: DocumentFormat): string[] {
  const keys = new Set<string>()
  const collect = (paragraphs: FormattedParagraph[] | null): void => {
    for (const paragraph of paragraphs ?? []) {
      keys.add(fontKeyOf(paragraph.markFormat))
      for (const item of paragraph.items) keys.add(fontKeyOf(item.format))
    }
  }

  collect(format.paragraphs)
  // Auch die Absätze in Textfeldern — sonst fehlt beim Setzen die Datei.
  for (const float of format.floats) {
    if (float.content.kind === 'textbox') collect(float.content.paragraphs)
  }
  for (const parts of [format.header, format.footer]) {
    collect(parts.default)
    collect(parts.first)
    collect(parts.even)
  }
  return [...keys]
}

// Dieselbe Herleitung, die `fonts.ts` beim Nachschlagen benutzt — sonst lädt
// der Aufrufer andere Dateien, als der Satz später verlangt.
function fontKeyOf(format: CharacterFormat): string {
  return fontFileKey(format.fontFamily, format.bold, format.italic)
}

// ---------------------------------------------------------------------------
// Der Seitenfluss
// ---------------------------------------------------------------------------

class PageFlow {
  private items: DrawItem[] = []
  private y: number
  private readonly top: number
  private readonly bottom: number
  /**
   * Wo jeder Absatz des Fließtextes zu stehen kam.
   *
   * Ein schwebendes Objekt hängt in Word regelmäßig an einem Absatz — die
   * Unterschrift an der Grußformel. Auf welcher Seite und in welcher Höhe
   * der landet, steht erst nach dem Umbruch fest.
   */
  private readonly anchors = new Map<number, { pageIndex: number; topPt: number }>()

  constructor(
    private readonly format: DocumentFormat,
    private readonly fonts: FontProvider,
    private readonly pages: DrawItem[][],
  ) {
    // Kopf- und Fußzeile stehen im Rand. Reichen sie darüber hinaus, weicht
    // in Word der Fließtext aus, statt sich mit ihnen zu überlagern — der
    // Rand ist die **Mindest**entfernung des Textes vom Blattrand, nicht die
    // Grenze der Kopfzeile. Ein Briefkopf mit Logo ist regelmäßig höher als
    // der obere Rand.
    const header = tallestPart(format.header, format, fonts)
    const footer = tallestPart(format.footer, format, fonts)
    this.top = Math.max(format.page.marginTopPt, format.page.headerDistancePt + header)
    this.bottom = Math.min(
      format.page.heightPt - format.page.marginBottomPt,
      format.page.heightPt - format.page.footerDistancePt - footer,
    )
    this.y = this.top
  }

  /** Seite und Oberkante eines Absatzes des Fließtextes. */
  anchorOf(index: number): { pageIndex: number; topPt: number } | null {
    return this.anchors.get(index) ?? null
  }

  private breakPage(): void {
    this.pages.push(this.items)
    this.items = []
    this.y = this.top
  }

  finish(): void {
    // Auch ein Brief, der genau auf die Seite passt, braucht diese Seite.
    this.pages.push(this.items)
  }

  addParagraph(paragraph: FormattedParagraph): void {
    const atoms = buildAtoms(paragraph, this.fonts, this.format.defaultTabStopPt)
    const geometry = geometryOf(this.format.page, paragraph.format)
    const lines = breakIntoLines(atoms, paragraph.format, geometry)

    if (paragraph.format.pageBreakBefore && this.items.length > 0) this.breakPage()
    this.y += paragraph.format.spaceBeforePt

    if (paragraph.index !== null) {
      this.anchors.set(paragraph.index, { pageIndex: this.pages.length, topPt: this.y })
    }

    lines.forEach((line, index) => {
      if (line.pageBreakBefore && this.items.length > 0) this.breakPage()

      const metrics = lineMetrics(line, paragraph, this.fonts)
      // Passt die Zeile nicht mehr aufs Blatt, beginnt eine neue Seite —
      // außer die Seite ist noch leer, dann passt sie nirgends und muss
      // stehen bleiben, sonst liefe der Umbruch endlos.
      if (this.y + metrics.heightPt > this.bottom && this.items.length > 0) this.breakPage()

      const baseline = this.y + metrics.heightPt - metrics.descentPt
      const last = index === lines.length - 1
      this.items.push(
        ...placeLine(line, paragraph.format, {
          geometry,
          firstLine: index === 0,
          justify: paragraph.format.alignment === 'justify' && !last && !line.hardBreak,
          baseline,
        }),
      )
      this.y += metrics.heightPt
    })

    this.y += paragraph.format.spaceAfterPt
  }
}

// ---------------------------------------------------------------------------
// Kopf- und Fußzeile
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Schwebende Objekte
// ---------------------------------------------------------------------------

/** Die Stärke, mit der eine Linie ohne eigene Angabe gezeichnet wird. */
const DEFAULT_STROKE_PT = 0.75

/**
 * Setzt ein schwebendes Objekt auf seine Seite.
 *
 * `null`, wenn der Absatz, an dem es hängt, gar nicht gesetzt wurde — dann
 * gibt es keine Stelle, auf die es gehörte, und es wegzulassen ist ehrlicher
 * als es zu raten.
 */
function placeFloat(
  float: FloatingObject,
  format: DocumentFormat,
  fonts: FontProvider,
  flow: PageFlow,
): { pageIndex: number; items: DrawItem[] } | null {
  const page = format.page
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
    if (anchor.paragraphIndex === null) return null
    const at = flow.anchorOf(anchor.paragraphIndex)
    if (!at) return null
    pageIndex = at.pageIndex
    originY = at.topPt
  } else if (anchor.fromV === 'margin') {
    originY = page.marginTopPt
  }

  // Eine Ausrichtung am Absatz ergibt keinen Sinn — dort zählt der Versatz.
  const spanY = anchor.fromV === 'page' ? page.heightPt : page.heightPt - page.marginTopPt - page.marginBottomPt
  const yPt =
    anchor.fromV !== 'paragraph' && anchor.alignV === 'center'
      ? originY + (spanY - float.heightPt) / 2
      : anchor.fromV !== 'paragraph' && anchor.alignV === 'bottom'
        ? originY + spanY - float.heightPt
        : anchor.fromV !== 'paragraph' && anchor.alignV === 'top'
          ? originY
          : originY + anchor.yPt

  switch (float.content.kind) {
    case 'image':
      return {
        pageIndex,
        items: [
          {
            kind: 'image',
            xPt,
            yPt,
            widthPt: float.widthPt,
            heightPt: float.heightPt,
            image: float.content.image,
          },
        ],
      }

    case 'shape': {
      // Eine Linie hat die Höhe null; gezeichnet wird sie mit ihrer Stärke.
      const heightPt =
        float.heightPt > 0
          ? float.heightPt
          : float.content.strokePt > 0
            ? float.content.strokePt
            : DEFAULT_STROKE_PT
      const color = float.content.fill ?? float.content.stroke
      if (float.widthPt <= 0) return null
      return { pageIndex, items: [{ kind: 'rect', xPt, yPt, widthPt: float.widthPt, heightPt, color }] }
    }

    case 'textbox': {
      const { insets } = float.content
      const block = layoutBlock(float.content.paragraphs, format, fonts, yPt + insets.topPt, {
        leftPt: xPt + insets.leftPt,
        rightPt: xPt + float.widthPt - insets.rightPt,
      })
      return { pageIndex, items: block.items }
    }
  }
}

function runningItems(format: DocumentFormat, fonts: FontProvider, pageIndex: number): DrawItem[] {
  const header = choosePart(format.header, format.page.titlePage, pageIndex)
  const footer = choosePart(format.footer, format.page.titlePage, pageIndex)
  const items: DrawItem[] = []

  if (header) {
    items.push(...layoutBlock(header, format, fonts, format.page.headerDistancePt).items)
  }
  if (footer) {
    // Erst messen, dann so setzen, dass die Fußzeile unten am Abstand endet.
    const height = blockHeight(footer, format, fonts)
    const top = format.page.heightPt - format.page.footerDistancePt - height
    items.push(...layoutBlock(footer, format, fonts, top).items)
  }
  return items
}

function choosePart(
  parts: DocumentFormat['header'],
  titlePage: boolean,
  pageIndex: number,
): FormattedParagraph[] | null {
  if (pageIndex === 0 && titlePage && parts.first) return parts.first
  if (pageIndex % 2 === 1 && parts.even) return parts.even
  return parts.default
}

/** Eine gesetzte Gruppe Absätze samt der Höhe, die sie einnimmt. */
interface LaidOutBlock {
  items: DrawItem[]
  heightPt: number
}

/**
 * Setzt einen Block Absätze ab einer festen Höhe, ohne Seitenumbruch.
 *
 * Setzen und Messen in **einer** Funktion: Beides lief früher in zwei
 * getrennten Schleifen, und eine Änderung an der einen konnte die andere
 * stillschweigend überholen. Die Fußzeile wird gemessen, um sie unten
 * bündig zu setzen, ein Textfeld, um seine Höhe zu kennen — beide Male
 * müssen es dieselben Zahlen sein.
 *
 * `column` gibt die Spalte vor; `null` heißt Satzspiegel der Seite.
 */
function layoutBlock(
  paragraphs: FormattedParagraph[],
  format: DocumentFormat,
  fonts: FontProvider,
  topPt: number,
  column: { leftPt: number; rightPt: number } | null = null,
): LaidOutBlock {
  const items: DrawItem[] = []
  let y = topPt

  for (const paragraph of paragraphs) {
    const atoms = buildAtoms(paragraph, fonts, format.defaultTabStopPt)
    const geometry = column
      ? geometryIn(column.leftPt, column.rightPt, paragraph.format)
      : geometryOf(format.page, paragraph.format)
    const lines = breakIntoLines(atoms, paragraph.format, geometry)

    y += paragraph.format.spaceBeforePt
    lines.forEach((line, index) => {
      const metrics = lineMetrics(line, paragraph, fonts)
      items.push(
        ...placeLine(line, paragraph.format, {
          geometry,
          firstLine: index === 0,
          justify: false,
          baseline: y + metrics.heightPt - metrics.descentPt,
        }),
      )
      y += metrics.heightPt
    })
    y += paragraph.format.spaceAfterPt
  }
  return { items, heightPt: y - topPt }
}

/**
 * Die Höhe der höchsten Ausführung einer Kopf- oder Fußzeile.
 *
 * Erste Seite und Folgeseiten können verschieden aussehen; für den
 * Satzspiegel zählt die, die am meisten Platz braucht. Ein Brief, dessen
 * Text auf Seite zwei plötzlich weiter oben begänne, sähe falsch aus.
 */
function tallestPart(
  parts: DocumentFormat['header'],
  format: DocumentFormat,
  fonts: FontProvider,
): number {
  return [parts.default, parts.first, parts.even]
    .filter((paragraphs): paragraphs is FormattedParagraph[] => paragraphs !== null)
    .reduce((tallest, paragraphs) => Math.max(tallest, blockHeight(paragraphs, format, fonts)), 0)
}

function blockHeight(
  paragraphs: FormattedParagraph[],
  format: DocumentFormat,
  fonts: FontProvider,
): number {
  return layoutBlock(paragraphs, format, fonts, 0).heightPt
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function buildAtoms(
  paragraph: FormattedParagraph,
  fonts: FontProvider,
  defaultTabStopPt: number,
): Atom[] {
  const atoms: Atom[] = []
  const stops = tabTargets(paragraph.format, defaultTabStopPt)

  // Aufeinanderfolgende Textstücke werden **gemeinsam** zerlegt. Word teilt
  // einen Absatz in Läufe, wo es ihm passt — bei einem Formatwechsel, aber
  // auch mitten im Wort, wo nur eine Rechtschreibmarke steht. Zerlegte man
  // Lauf für Lauf, dürfte der Umbruch zwischen zwei Läufen greifen, und aus
  // „meine Mitarbeit" würde „mei / ne Mitarbeit".
  let segments: TextSegment[] = []
  const flushText = (): void => {
    if (segments.length === 0) return
    atoms.push(...textAtoms(segments, fonts))
    segments = []
  }

  for (const item of paragraph.items) {
    switch (item.kind) {
      case 'text':
        segments.push({ text: item.text, format: item.format })
        break
      case 'tab':
        flushText()
        atoms.push({ kind: 'tab', stops })
        break
      case 'break':
        flushText()
        atoms.push({ kind: 'break', page: item.page })
        break
      case 'image':
        flushText()
        atoms.push({ kind: 'image', image: item.image })
        break
    }
  }
  flushText()
  return atoms
}

/**
 * Die Tabulatorhalte eines Absatzes, ergänzt um die Standardhalte dahinter.
 *
 * Word misst sie vom linken Satzspiegelrand, **nicht** vom Einzug des
 * Absatzes: Ein rechter Halt am Satzspiegelrand hält das Datum rechtsbündig,
 * egal wie der Absatz eingezogen ist.
 */
function tabTargets(format: ParagraphFormat, defaultTabStopPt: number): TabTarget[] {
  const explicit: TabTarget[] = format.tabStops.map((stop) => ({
    positionPt: stop.positionPt,
    alignment: stop.alignment,
  }))
  if (defaultTabStopPt <= 0) return explicit

  // Hinter dem letzten eigenen Halt geht es im Standardmaß weiter. Fünfzig
  // Halte reichen für jedes Blatt und begrenzen die Liste verlässlich.
  const last = explicit.length > 0 ? explicit[explicit.length - 1].positionPt : 0
  const defaults: TabTarget[] = []
  for (let index = 1; index <= 50; index += 1) {
    const position = index * defaultTabStopPt
    if (position > last) defaults.push({ positionPt: position, alignment: 'left' })
  }
  return [...explicit, ...defaults].sort((first, second) => first.positionPt - second.positionPt)
}

/**
 * Trennt Wörter von Leerräumen, an denen umbrochen werden darf.
 *
 * Das geschützte Leerzeichen (U+00A0) ist ausgenommen: Es steht in einem
 * Brief genau dort, wo **nicht** getrennt werden soll — zwischen „Frau" und
 * dem Nachnamen, zwischen Zahl und Einheit. Als Zeichen im Wort behandelt,
 * hält es zusammen, was zusammengehört.
 */
const BREAKABLE_SPACE = /[^\S\u00A0]/

/** Ein Stück Text mit einheitlicher Auszeichnung, so wie es im Lauf stand. */
interface TextSegment {
  text: string
  format: CharacterFormat
}

/**
 * Zerlegt zusammenhängenden Text in Wörter und Leerräume — über Laufgrenzen
 * hinweg.
 *
 * Die Grenze zwischen zwei Läufen ist keine Stelle, an der umbrochen werden
 * darf: Sie sagt nur, dass sich dort die Auszeichnung ändert oder Word beim
 * Tippen einen Schnitt gesetzt hat. Ein Wort, das über zwei Läufe reicht,
 * wird deshalb **ein** Atom mit mehreren Stücken — `Atom.pieces` ist genau
 * dafür ein Feld.
 */
function textAtoms(segments: readonly TextSegment[], fonts: FontProvider): Atom[] {
  const atoms: Atom[] = []
  /** Die Teile des laufenden Tokens, je einer je Lauf, aus dem es stammt. */
  let parts: TextSegment[] = []
  let tokenIsSpace = false

  const flush = (): void => {
    if (parts.length === 0) return
    const pieces = parts.flatMap((part) => buildPieces(part.text, part.format, fonts))
    const widthPt = pieces.reduce((sum, piece) => sum + piece.widthPt, 0)
    atoms.push({ kind: tokenIsSpace ? 'space' : 'word', pieces, widthPt })
    parts = []
  }

  const append = (character: string, format: CharacterFormat): void => {
    const last = parts[parts.length - 1]
    // Verglichen wird die Kennung, nicht der Inhalt: Zwei Läufe mit gleicher
    // Auszeichnung tragen verschiedene Objekte, und sie getrennt zu setzen
    // kostet nichts.
    if (last && last.format === format) last.text += character
    else parts.push({ text: character, format })
  }

  for (const segment of segments) {
    for (const character of segment.text) {
      const isSpace = BREAKABLE_SPACE.test(character)
      if (parts.length > 0 && isSpace !== tokenIsSpace) flush()
      tokenIsSpace = isSpace
      append(character, segment.format)
    }
  }
  flush()
  return atoms
}

/**
 * Zerlegt einen Baustein in Stücke einheitlicher Schrift.
 *
 * Meist ist das genau ein Stück. Zwei Fälle teilen weiter: Kapitälchen
 * setzen die ursprünglichen Kleinbuchstaben als kleinere Großbuchstaben,
 * und Hoch-/Tiefstellung ändert Grad und Lage.
 */
function buildPieces(text: string, format: CharacterFormat, fonts: FontProvider): Piece[] {
  const face = fonts.face(format.fontFamily, format.bold, format.italic)
  // Bildzeichen zuerst auf gewöhnliches Unicode bringen: Sie werden mit der
  // Ersatzschrift gesetzt, und die kennt den Privatbereich nicht (siehe
  // `symbols.ts`). Erst danach wird gemessen, sonst stimmte die Breite nicht.
  const translated = translateSymbolText(format.fontFamily, text)
  const scale =
    format.vertAlign === 'baseline' ? 1 : SCRIPT_SCALE
  const risePt =
    format.vertAlign === 'superscript'
      ? format.sizePt * SUPERSCRIPT_RISE
      : format.vertAlign === 'subscript'
        ? format.sizePt * SUBSCRIPT_RISE
        : 0

  const make = (content: string, sizePt: number): Piece => ({
    text: content,
    format,
    face,
    sizePt,
    widthPt: measure(face, content, sizePt),
    risePt,
  })

  if (format.caps) return [make(translated.toUpperCase(), format.sizePt * scale)]
  if (!format.smallCaps) return [make(translated, format.sizePt * scale)]

  // Kapitälchen: zusammenhängende Läufe gleicher Herkunft, damit ein „GmbH"
  // sein großes G in voller Höhe behält.
  const pieces: Piece[] = []
  let run = ''
  let runWasLower = false
  const flush = (): void => {
    if (run === '') return
    pieces.push(make(run.toUpperCase(), format.sizePt * scale * (runWasLower ? SMALL_CAPS_SCALE : 1)))
    run = ''
  }
  for (const character of translated) {
    const isLower = character !== character.toUpperCase()
    if (run !== '' && isLower !== runWasLower) flush()
    runWasLower = isLower
    run += character
  }
  flush()
  return pieces
}

function measure(face: FontFace, text: string, sizePt: number): number {
  let units = 0
  for (const character of text) {
    units += face.font.advance(face.font.glyphId(character.codePointAt(0) ?? 0))
  }
  return (units * sizePt) / face.font.metrics.unitsPerEm
}

// ---------------------------------------------------------------------------
// Zeilenumbruch
// ---------------------------------------------------------------------------

function breakIntoLines(atoms: Atom[], format: ParagraphFormat, geometry: Geometry): Line[] {
  const lines: Line[] = []
  let current: Atom[] = []
  let pageBreakBefore = false
  let endedWithBreak = false
  let x = geometry.textLeft + format.indentFirstLinePt

  const flush = (hardBreak: boolean, nextPageBreak = false): void => {
    lines.push({ atoms: current, hardBreak, pageBreakBefore })
    current = []
    pageBreakBefore = nextPageBreak
    x = geometry.textLeft
  }

  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index]
    endedWithBreak = atom.kind === 'break'
    if (atom.kind === 'break') {
      flush(true, atom.page)
      continue
    }

    if (atom.kind === 'tab') {
      // Wohin der Tabulator springt, hängt vom Stück **hinter** ihm ab: Ein
      // rechter Halt zieht es nach links, damit es dort endet. Deshalb wird
      // schon hier vorausgeschaut und nicht erst beim Setzen — sonst
      // schlüge der Umbruch an, obwohl der Text auf die Zeile passt.
      current.push(atom)
      x = tabbedPosition(atom.stops, atoms.slice(index + 1), x, geometry.marginLeft)
      continue
    }

    const width = atom.kind === 'image' ? atom.image.widthPt : atom.widthPt
    // Am Zeilenende dürfen Leerräume über den Rand hängen — sonst begänne
    // die nächste Zeile mit einem Leerzeichen.
    if (atom.kind !== 'space' && current.length > 0 && x + width > geometry.textRight + 0.01) {
      flush(false)
    }
    current.push(atom)
    x += width
  }

  if (current.length > 0 || endedWithBreak || lines.length === 0) flush(true)
  return lines
}

/**
 * Die waagerechten Maße eines Absatzes auf dem Blatt.
 *
 * `marginLeft` steht neben `textLeft`, weil beide gebraucht werden und nicht
 * dasselbe sind: Der Text beginnt beim Einzug, die Tabulatorhalte zählen aber
 * vom Satzspiegelrand.
 */
interface Geometry {
  marginLeft: number
  textLeft: number
  textRight: number
}

function geometryOf(page: PageFormat, format: ParagraphFormat): Geometry {
  return geometryIn(page.marginLeftPt, page.widthPt - page.marginRightPt, format)
}

/**
 * Dieselbe Rechnung für eine beliebige Spalte — den Innenraum eines
 * Textfelds etwa. Alles unterhalb von hier (Umbruch, Ausrichtung,
 * Tabulatoren) kennt nur noch `Geometry` und braucht keine Änderung.
 */
function geometryIn(leftPt: number, rightPt: number, format: ParagraphFormat): Geometry {
  return {
    marginLeft: leftPt,
    textLeft: leftPt + format.indentLeftPt,
    textRight: rightPt - format.indentRightPt,
  }
}

// ---------------------------------------------------------------------------
// Zeilenhöhe
// ---------------------------------------------------------------------------

interface LineMetrics {
  heightPt: number
  descentPt: number
}

/**
 * Höhe und Grundlinie einer Zeile.
 *
 * Die natürliche Höhe einer Schrift ist `ascent - descent + lineGap` aus der
 * `hhea`-Tabelle — dieselbe Rechnung, mit der Word „einzeilig" bemisst
 * (Calibri 11 pt ergibt so 13,4 pt). Der Zeilenabstand des Absatzes streckt
 * sie, ein festes Maß ersetzt sie. Die Grundlinie liegt so, dass die
 * Unterlänge unten anschließt.
 */
function lineMetrics(
  line: Line,
  paragraph: FormattedParagraph,
  fonts: FontProvider,
): LineMetrics {
  let ascent = 0
  let descent = 0
  let gap = 0
  let imageHeight = 0

  const consider = (face: FontFace, sizePt: number, risePt: number): void => {
    const units = face.font.metrics.unitsPerEm
    ascent = Math.max(ascent, (face.font.metrics.ascent * sizePt) / units + risePt)
    descent = Math.max(descent, (-face.font.metrics.descent * sizePt) / units - risePt)
    gap = Math.max(gap, (face.font.metrics.lineGap * sizePt) / units)
  }

  for (const atom of line.atoms) {
    if (atom.kind === 'word' || atom.kind === 'space') {
      for (const piece of atom.pieces) consider(piece.face, piece.sizePt, piece.risePt)
    } else if (atom.kind === 'image') {
      imageHeight = Math.max(imageHeight, atom.image.heightPt)
    }
  }

  if (ascent === 0 && descent === 0) {
    // Eine leere Zeile nimmt die Höhe ihrer Absatzmarke ein.
    const mark = paragraph.markFormat
    consider(fonts.face(mark.fontFamily, mark.bold, mark.italic), mark.sizePt, 0)
  }
  ascent = Math.max(ascent, imageHeight)

  const natural = ascent + descent + gap
  const spacing = paragraph.format.lineSpacing
  const heightPt =
    spacing.rule === 'auto'
      ? natural * spacing.factor
      : spacing.rule === 'exact'
        ? spacing.valuePt
        : Math.max(natural, spacing.valuePt)

  return { heightPt, descentPt: descent }
}

// ---------------------------------------------------------------------------
// Zeile setzen
// ---------------------------------------------------------------------------

interface PlacementContext {
  geometry: Geometry
  firstLine: boolean
  justify: boolean
  baseline: number
}

function placeLine(
  line: Line,
  format: ParagraphFormat,
  context: PlacementContext,
): DrawItem[] {
  const hasTab = line.atoms.some((atom) => atom.kind === 'tab')
  const trimmed = trimTrailingSpace(line.atoms)
  const contentWidth = plainWidth(trimmed)

  const start = context.geometry.textLeft + (context.firstLine ? format.indentFirstLinePt : 0)
  const available = context.geometry.textRight - start

  // Ein Tabulator setzt die Ausrichtung außer Kraft: Er bestimmt die Lage
  // selbst, und Word richtet die Zeile dann nicht zusätzlich aus.
  let x = start
  if (!hasTab) {
    if (format.alignment === 'right') x = context.geometry.textRight - contentWidth
    else if (format.alignment === 'center') x = start + (available - contentWidth) / 2
  }

  const gaps = trimmed.filter((atom) => atom.kind === 'space').length
  const stretch = context.justify && gaps > 0 ? (available - contentWidth) / gaps : 0

  const items: DrawItem[] = []
  for (let index = 0; index < trimmed.length; index += 1) {
    const atom = trimmed[index]

    if (atom.kind === 'tab') {
      x = tabbedPosition(atom.stops, trimmed.slice(index + 1), x, context.geometry.marginLeft)
      continue
    }
    if (atom.kind === 'break') continue
    if (atom.kind === 'image') {
      items.push({
        kind: 'image',
        xPt: x,
        yPt: context.baseline - atom.image.heightPt,
        widthPt: atom.image.widthPt,
        heightPt: atom.image.heightPt,
        image: atom.image,
      })
      x += atom.image.widthPt
      continue
    }

    for (const piece of atom.pieces) {
      items.push(...drawPiece(piece, x, context.baseline))
      x += piece.widthPt
    }
    if (atom.kind === 'space') x += stretch
  }
  return items
}

function drawPiece(piece: Piece, x: number, baseline: number): DrawItem[] {
  const y = baseline - piece.risePt
  const items: DrawItem[] = [
    {
      kind: 'text',
      xPt: x,
      yPt: y,
      text: piece.text,
      face: piece.face,
      sizePt: piece.sizePt,
      color: piece.format.color,
    },
  ]

  // Unterstreichung und Durchstreichung stehen in keiner Schriftdatei als
  // Zeichen — sie werden gezeichnet.
  if (piece.format.underline) {
    items.push({
      kind: 'rect',
      xPt: x,
      yPt: y + piece.sizePt * UNDERLINE_OFFSET,
      widthPt: piece.widthPt,
      heightPt: piece.sizePt * UNDERLINE_THICKNESS,
      color: piece.format.color,
    })
  }
  if (piece.format.strike) {
    items.push({
      kind: 'rect',
      xPt: x,
      yPt: y + piece.sizePt * STRIKE_OFFSET,
      widthPt: piece.widthPt,
      heightPt: piece.sizePt * UNDERLINE_THICKNESS,
      color: piece.format.color,
    })
  }
  return items
}

/**
 * Wohin ein Tabulator springt.
 *
 * Erst wird der nächste Halt rechts der jetzigen Stelle gesucht, dann das
 * Stück bis zum nächsten Tabulator gemessen und nach der Art des Halts
 * gelegt: linksbündig beginnt es am Halt, rechtsbündig endet es dort,
 * zentriert liegt es darum, und beim Dezimalhalt steht das Komma darauf.
 */
function tabbedPosition(
  stops: readonly TabTarget[],
  rest: readonly Atom[],
  x: number,
  marginLeft: number,
): number {
  const relative = x - marginLeft
  const stop = stops.find((candidate) => candidate.positionPt > relative + 0.01)
  if (!stop) return x

  const target = marginLeft + stop.positionPt
  const segment: Atom[] = []
  for (const atom of rest) {
    if (atom.kind === 'tab' || atom.kind === 'break') break
    segment.push(atom)
  }
  const width = plainWidth(trimTrailingSpace(segment))

  switch (stop.alignment) {
    case 'right':
      return Math.max(x, target - width)
    case 'center':
      return Math.max(x, target - width / 2)
    case 'decimal':
      return Math.max(x, target - widthBeforeSeparator(segment))
    default:
      return target
  }
}

/** Die Breite bis zum ersten Komma oder Punkt — für den Dezimalhalt. */
function widthBeforeSeparator(segment: Atom[]): number {
  let width = 0
  for (const atom of segment) {
    if (atom.kind !== 'word' && atom.kind !== 'space') continue
    for (const piece of atom.pieces) {
      const at = piece.text.search(/[.,]/)
      if (at >= 0) return width + measure(piece.face, piece.text.slice(0, at), piece.sizePt)
      width += piece.widthPt
    }
  }
  return width
}

function trimTrailingSpace(atoms: Atom[]): Atom[] {
  let end = atoms.length
  while (end > 0) {
    const atom = atoms[end - 1]
    if (atom.kind !== 'space' && atom.kind !== 'break') break
    end -= 1
  }
  return atoms.slice(0, end)
}

/** Breite ohne Tabulatoren — die brauchen erst die fertige Zeile. */
function plainWidth(atoms: Atom[]): number {
  let width = 0
  for (const atom of atoms) {
    if (atom.kind === 'word' || atom.kind === 'space') width += atom.widthPt
    else if (atom.kind === 'image') width += atom.image.widthPt
  }
  return width
}
