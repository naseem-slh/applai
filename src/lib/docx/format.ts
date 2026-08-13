import type { DocxDocument } from './model'
import { paragraphNodesOf, runChildText, runNodesOf } from './parse'

/**
 * Liest die **Formatierung** einer `.docx` aus — Schrift, Grade, Ausrichtung,
 * Ränder, Kopf- und Fußzeilen, Bilder.
 *
 * **Warum es das braucht.** `parse.ts` liest nur Zeichen und ihre Offsets;
 * mehr braucht die Bearbeitung nicht, und der Word-Export bleibt originaltreu,
 * indem er das Archiv gar nicht erst anfasst (`serialize.ts`). Beim PDF geht
 * das nicht: Ein PDF entsteht neu, und was nicht ausgelesen wurde, steht
 * hinterher nicht darin. Genau daran scheiterte der frühere Weg über den
 * Druckdialog — gedruckt wurde die Bildschirmdarstellung, und die kannte
 * weder die Schrift des Originals noch seine Ränder.
 *
 * **Einheiten.** Word rechnet in Twips (1/1440 Zoll), halben Punkten und EMU
 * (1/914400 Zoll). Umgerechnet wird ausschließlich hier; alles, was dieses
 * Modell verlässt, ist in Punkt (1/72 Zoll) — der Einheit, in der auch ein
 * PDF misst.
 *
 * **Die Zeichen bleiben dieselben.** Der Textbeitrag jedes Laufs kommt aus
 * `runChildText` (`parse.ts`), damit dieses Modell zeichengenau zu
 * `Paragraph.text` passt. Wichen die beiden voneinander ab, verrutschten die
 * Markierungen des Nutzers gegenüber dem, was im PDF steht. Ein Test hält
 * beide zusammen.
 */

const TWIPS_PER_POINT = 20
const HALF_POINTS_PER_POINT = 2
const EMU_PER_POINT = 12700
const PIXELS_PER_POINT = 96 / 72

/** DIN A4 in Twips, Word-Standardrand von einem Zoll — nur als Notnagel. */
const DEFAULT_PAGE = { width: 11906, height: 16838, margin: 1440 } as const
/** Word setzt Tabulatoren ohne eigene Angabe alle 1,25 cm. */
const DEFAULT_TAB_STOP_TWIPS = 720

export type Alignment = 'left' | 'center' | 'right' | 'justify'
export type TabAlignment = 'left' | 'center' | 'right' | 'decimal'
export type VerticalAlignment = 'baseline' | 'superscript' | 'subscript'

export interface CharacterFormat {
  /** Der Name, wie er im Dokument steht („Calibri"), nicht die Datei. */
  fontFamily: string
  sizePt: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** Sechs Hexadezimalstellen ohne Doppelkreuz, oder `null` für Schwarz. */
  color: string | null
  caps: boolean
  smallCaps: boolean
  vertAlign: VerticalAlignment
}

export interface TabStop {
  positionPt: number
  alignment: TabAlignment
}

/**
 * Der Zeilenabstand, in Words zwei Lesarten: ein Vielfaches der natürlichen
 * Zeilenhöhe (`auto`, das übliche „1,5-zeilig") oder ein festes Maß.
 */
export type LineSpacing =
  | { rule: 'auto'; factor: number }
  | { rule: 'exact' | 'atLeast'; valuePt: number }

export interface ParagraphFormat {
  alignment: Alignment
  indentLeftPt: number
  indentRightPt: number
  /** Erstzeileneinzug; negativ bedeutet hängend. */
  indentFirstLinePt: number
  spaceBeforePt: number
  spaceAfterPt: number
  lineSpacing: LineSpacing
  tabStops: TabStop[]
  pageBreakBefore: boolean
  keepNext: boolean
}

export interface DocumentImage {
  /** Der Eintrag im Archiv, z. B. `word/media/image1.png`. */
  path: string
  bytes: Uint8Array
  widthPt: number
  heightPt: number
}

/**
 * Ein Stück Absatzinhalt. Die Zeichenbeiträge (`text`, `\t`, `\n`) ergeben
 * aneinandergehängt genau den Absatztext aus `parse.ts`.
 */
export type ParagraphItem =
  | { kind: 'text'; text: string; format: CharacterFormat }
  | { kind: 'tab'; format: CharacterFormat }
  | { kind: 'break'; page: boolean; format: CharacterFormat }
  | { kind: 'image'; image: DocumentImage; format: CharacterFormat }

export interface FormattedParagraph {
  /**
   * Der Index im Fließtextmodell (`DocxDocument.paragraphs`) — oder `null`,
   * wenn der Absatz aus einer Kopf- oder Fußzeile stammt und deshalb gar
   * nicht im Fließtext steht.
   */
  index: number | null
  format: ParagraphFormat
  items: ParagraphItem[]
  /**
   * Die Zeichenangaben der Absatzmarke selbst.
   *
   * Ein leerer Absatz hat keinen Lauf und damit keinen Grad — er nähme sonst
   * gar keine Höhe ein. In einem Anschreiben sind leere Absätze aber der
   * Zeilenfall zwischen Anrede, Text und Grußformel: Ohne sie rutscht der
   * ganze Brief zusammen.
   */
  markFormat: CharacterFormat
}

export interface PageFormat {
  widthPt: number
  heightPt: number
  marginTopPt: number
  marginRightPt: number
  marginBottomPt: number
  marginLeftPt: number
  /** Abstand der Kopfzeile vom oberen, der Fußzeile vom unteren Blattrand. */
  headerDistancePt: number
  footerDistancePt: number
  /** Erste Seite mit eigener Kopf- und Fußzeile. */
  titlePage: boolean
}

/** Kopf- und Fußzeilen gibt es in bis zu drei Ausführungen je Abschnitt. */
export interface RunningParts {
  default: FormattedParagraph[] | null
  first: FormattedParagraph[] | null
  even: FormattedParagraph[] | null
}

export interface DocumentFormat {
  page: PageFormat
  paragraphs: FormattedParagraph[]
  header: RunningParts
  footer: RunningParts
  defaultTabStopPt: number
}

/** Alles, was beim Auflösen einer Eigenschaft gebraucht wird. */
interface FormatContext {
  zip: DocxDocument['zip']
  styles: Map<string, StyleDefinition>
  defaultParagraphStyle: string | null
  docDefaultParagraph: Element | null
  docDefaultRun: Element | null
  theme: { minor: string | null; major: string | null }
  /** Beziehungen des gerade gelesenen XML-Teils (Bilder, Kopfzeilen). */
  relationships: Map<string, string>
  /** Verzeichnis des Teils, auf das relative Beziehungsziele zeigen. */
  partDirectory: string
}

interface StyleDefinition {
  basedOn: string | null
  paragraphProperties: Element | null
  runProperties: Element | null
}

export function readDocumentFormat(docx: DocxDocument): DocumentFormat {
  const styles = readStyles(docx)
  const theme = readTheme(docx)
  const relationships = readRelationships(docx, 'word/document.xml')

  const context: FormatContext = {
    zip: docx.zip,
    styles: styles.byId,
    defaultParagraphStyle: styles.defaultParagraph,
    docDefaultParagraph: styles.docDefaultParagraph,
    docDefaultRun: styles.docDefaultRun,
    theme,
    relationships,
    partDirectory: 'word/',
  }

  const paragraphs = paragraphNodesOf(docx.doc).map((node, index) =>
    readParagraph(node, context, index),
  )

  const section = findSectionProperties(docx.doc)
  return {
    page: readPageFormat(section),
    paragraphs,
    header: readRunningParts(docx, context, section, 'w:headerReference'),
    footer: readRunningParts(docx, context, section, 'w:footerReference'),
    defaultTabStopPt: readDefaultTabStop(docx) / TWIPS_PER_POINT,
  }
}

// ---------------------------------------------------------------------------
// Formatvorlagen, Design, Einstellungen
// ---------------------------------------------------------------------------

function parsePart(docx: DocxDocument, path: string): XMLDocument | null {
  const bytes = docx.zip[path]
  if (!bytes) return null
  const xml = new TextDecoder('utf-8').decode(bytes)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  // Ein beschädigter Nebenteil darf den Export nicht abbrechen: Ohne
  // `styles.xml` sieht der Brief schlechter aus, ohne Brief steht der
  // Bewerber ganz ohne da.
  return doc.getElementsByTagName('parsererror')[0] ? null : doc
}

function readStyles(docx: DocxDocument): {
  byId: Map<string, StyleDefinition>
  defaultParagraph: string | null
  docDefaultParagraph: Element | null
  docDefaultRun: Element | null
} {
  const byId = new Map<string, StyleDefinition>()
  const doc = parsePart(docx, 'word/styles.xml')
  if (!doc) return { byId, defaultParagraph: null, docDefaultParagraph: null, docDefaultRun: null }

  let defaultParagraph: string | null = null
  for (const style of Array.from(doc.getElementsByTagName('w:style'))) {
    const id = style.getAttribute('w:styleId')
    if (id === null) continue
    byId.set(id, {
      basedOn: child(style, 'w:basedOn')?.getAttribute('w:val') ?? null,
      paragraphProperties: child(style, 'w:pPr'),
      runProperties: child(style, 'w:rPr'),
    })
    // Die Vorlage mit `w:default="1"` gilt für jeden Absatz ohne eigene
    // Angabe — in aller Regel „Standard"/„Normal".
    if (style.getAttribute('w:type') === 'paragraph' && style.getAttribute('w:default') === '1') {
      defaultParagraph = id
    }
  }

  const defaults = doc.getElementsByTagName('w:docDefaults')[0] ?? null
  return {
    byId,
    defaultParagraph,
    docDefaultParagraph: defaults
      ? (child(child(defaults, 'w:pPrDefault'), 'w:pPr') ?? null)
      : null,
    docDefaultRun: defaults ? (child(child(defaults, 'w:rPrDefault'), 'w:rPr') ?? null) : null,
  }
}

/**
 * Die Schriften des Designs.
 *
 * Word schreibt seit 2007 nicht „Calibri" in den Absatz, sondern
 * `w:asciiTheme="minorHAnsi"` — ein Verweis auf `theme1.xml`. Wer den nicht
 * auflöst, findet in einem gewöhnlichen Word-Dokument **überhaupt keine**
 * Schriftangabe.
 */
function readTheme(docx: DocxDocument): { minor: string | null; major: string | null } {
  const doc = parsePart(docx, 'word/theme/theme1.xml')
  if (!doc) return { minor: null, major: null }
  const typeface = (tag: string): string | null =>
    doc.getElementsByTagName(tag)[0]?.getElementsByTagName('a:latin')[0]?.getAttribute('typeface') ??
    null
  return { minor: typeface('a:minorFont'), major: typeface('a:majorFont') }
}

function readDefaultTabStop(docx: DocxDocument): number {
  const doc = parsePart(docx, 'word/settings.xml')
  const value = doc?.getElementsByTagName('w:defaultTabStop')[0]?.getAttribute('w:val')
  const parsed = value === null || value === undefined ? Number.NaN : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TAB_STOP_TWIPS
}

/**
 * Die Beziehungen eines XML-Teils: `rId7` → `media/image1.png`.
 *
 * Bilder und Kopfzeilen stehen im Dokument nur als Kennung; wohin sie zeigt,
 * sagt die zugehörige `.rels`-Datei neben dem Teil.
 */
function readRelationships(docx: DocxDocument, partPath: string): Map<string, string> {
  const slash = partPath.lastIndexOf('/')
  const directory = partPath.slice(0, slash + 1)
  const name = partPath.slice(slash + 1)
  const doc = parsePart(docx, `${directory}_rels/${name}.rels`)
  const map = new Map<string, string>()
  if (!doc) return map

  for (const relationship of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = relationship.getAttribute('Id')
    const target = relationship.getAttribute('Target')
    if (id === null || target === null) continue
    if (relationship.getAttribute('TargetMode') === 'External') continue
    map.set(id, target)
  }
  return map
}

/** Ein Beziehungsziel als Pfad im Archiv. */
function resolveTarget(context: FormatContext, id: string): string | null {
  const target = context.relationships.get(id)
  if (target === undefined) return null
  return target.startsWith('/') ? target.slice(1) : `${context.partDirectory}${target}`
}

// ---------------------------------------------------------------------------
// Seite, Kopf- und Fußzeilen
// ---------------------------------------------------------------------------

/**
 * Die Abschnittsangaben stehen am Ende des Rumpfes. Mehrere Abschnitte
 * (jeder Absatz kann eigene tragen) kommen in einem Anschreiben nicht vor;
 * gilt hier deshalb der letzte, der für das ganze Dokument gedachte.
 */
function findSectionProperties(doc: XMLDocument): Element | null {
  const body = doc.getElementsByTagName('w:body')[0]
  if (!body) return null
  for (const node of Array.from(body.children).reverse()) {
    if (node.tagName === 'w:sectPr') return node
  }
  return null
}

function readPageFormat(section: Element | null): PageFormat {
  const size = section ? child(section, 'w:pgSz') : null
  const margin = section ? child(section, 'w:pgMar') : null

  const width = twips(size, 'w:w', DEFAULT_PAGE.width)
  const height = twips(size, 'w:h', DEFAULT_PAGE.height)
  // Querformat steht als eigenes Attribut, die Maße können trotzdem im
  // Hochformat notiert sein.
  const landscape = size?.getAttribute('w:orient') === 'landscape'

  return {
    widthPt: (landscape ? Math.max(width, height) : width) / TWIPS_PER_POINT,
    heightPt: (landscape ? Math.min(width, height) : height) / TWIPS_PER_POINT,
    marginTopPt: twips(margin, 'w:top', DEFAULT_PAGE.margin) / TWIPS_PER_POINT,
    marginRightPt: twips(margin, 'w:right', DEFAULT_PAGE.margin) / TWIPS_PER_POINT,
    marginBottomPt: twips(margin, 'w:bottom', DEFAULT_PAGE.margin) / TWIPS_PER_POINT,
    marginLeftPt: twips(margin, 'w:left', DEFAULT_PAGE.margin) / TWIPS_PER_POINT,
    headerDistancePt: twips(margin, 'w:header', 720) / TWIPS_PER_POINT,
    footerDistancePt: twips(margin, 'w:footer', 720) / TWIPS_PER_POINT,
    titlePage: section !== null && isOn(child(section, 'w:titlePg')),
  }
}

function readRunningParts(
  docx: DocxDocument,
  context: FormatContext,
  section: Element | null,
  reference: 'w:headerReference' | 'w:footerReference',
): RunningParts {
  const parts: RunningParts = { default: null, first: null, even: null }
  if (!section) return parts

  for (const node of Array.from(section.getElementsByTagName(reference))) {
    const id = node.getAttribute('r:id')
    const type = node.getAttribute('w:type') ?? 'default'
    if (id === null) continue
    const path = resolveTarget(context, id)
    if (path === null) continue
    const doc = parsePart(docx, path)
    if (!doc) continue

    // Der Teil hat eigene Beziehungen — sein Logo liegt in *seiner*
    // `.rels`-Datei, nicht in der des Hauptdokuments.
    const partContext: FormatContext = {
      ...context,
      relationships: readRelationships(docx, path),
      partDirectory: path.slice(0, path.lastIndexOf('/') + 1),
    }
    const paragraphs = paragraphNodesOf(doc).map((paragraph) =>
      readParagraph(paragraph, partContext, null),
    )

    if (type === 'first') parts.first = paragraphs
    else if (type === 'even') parts.even = paragraphs
    else parts.default = paragraphs
  }
  return parts
}

// ---------------------------------------------------------------------------
// Absätze und Läufe
// ---------------------------------------------------------------------------

function readParagraph(
  node: Element,
  context: FormatContext,
  index: number | null,
): FormattedParagraph {
  const properties = child(node, 'w:pPr')
  const styleId = child(properties, 'w:pStyle')?.getAttribute('w:val') ?? context.defaultParagraphStyle

  const format = defaultParagraphFormat()
  const characterBase = defaultCharacterFormat()

  // Reihenfolge wie in Word: Dokumentvorgaben, dann die Vorlagenkette von
  // der Wurzel abwärts, dann die direkte Angabe am Absatz.
  applyParagraph(format, context.docDefaultParagraph)
  applyRun(characterBase, context.docDefaultRun, context)
  for (const style of styleChain(context, styleId)) {
    applyParagraph(format, style.paragraphProperties)
    applyRun(characterBase, style.runProperties, context)
  }
  applyParagraph(format, properties)

  // Die Absatzmarke trägt eigene Zeichenangaben (`w:pPr/w:rPr`). Sie gelten
  // **nur für sie** und nicht für die Läufe des Absatzes: Wer eine
  // Überschrift löscht, deren fette Marke aber stehen lässt, bekäme sonst
  // einen Absatz, der im PDF durchgehend fett steht und in Word nicht.
  // Gebraucht werden sie trotzdem — ein leerer Absatz hat nichts anderes,
  // woraus sich seine Höhe ergäbe.
  const markFormat = { ...characterBase }
  applyRun(markFormat, child(properties, 'w:rPr'), context)

  const items: ParagraphItem[] = []
  for (const runNode of runNodesOf(node)) {
    const characterFormat = readCharacterFormat(runNode, characterBase, context)
    for (const runChild of Array.from(runNode.children)) {
      appendItem(items, runChild, characterFormat, context)
    }
  }

  return { index, format, items, markFormat }
}

function readCharacterFormat(
  runNode: Element,
  base: CharacterFormat,
  context: FormatContext,
): CharacterFormat {
  const properties = child(runNode, 'w:rPr')
  const format = { ...base }
  for (const style of styleChain(context, child(properties, 'w:rStyle')?.getAttribute('w:val'))) {
    applyRun(format, style.runProperties, context)
  }
  applyRun(format, properties, context)
  return format
}

/**
 * Hängt den Beitrag eines Lauf-Kindelements an.
 *
 * Der Zeichenbeitrag kommt aus `runChildText` und **nur** von dort — dieselbe
 * Funktion, die das Offset-Modell aufbaut. Hier wird lediglich zusätzlich
 * unterschieden, um welche Art von Beitrag es sich handelt: Ein `w:br` mit
 * `w:type="page"` liefert wie jeder Umbruch ein `\n`, verlangt im Satz aber
 * eine neue Seite statt einer neuen Zeile.
 */
function appendItem(
  items: ParagraphItem[],
  runChild: Element,
  format: CharacterFormat,
  context: FormatContext,
): void {
  switch (runChild.tagName) {
    case 'w:t': {
      const text = runChildText(runChild)
      if (text !== '') items.push({ kind: 'text', text, format })
      return
    }
    case 'w:tab':
      items.push({ kind: 'tab', format })
      return
    case 'w:br':
    case 'w:cr':
      items.push({ kind: 'break', page: runChild.getAttribute('w:type') === 'page', format })
      return
    case 'w:drawing':
    case 'w:pict': {
      const image = readImage(runChild, context)
      if (image) items.push({ kind: 'image', image, format })
      return
    }
    case 'mc:AlternateContent': {
      // Word legt dasselbe Objekt zweimal ab: unter `mc:Choice` in der
      // neueren Form (DrawingML), unter `mc:Fallback` als VML für Fassungen,
      // die sie nicht lesen können. Beide zu nehmen setzte das Bild doppelt.
      // Genommen wird deshalb die erste Fassung, die etwas beiträgt — die
      // Reihenfolge im Dokument ist Words Rangfolge.
      const before = items.length
      for (const branchName of ['mc:Choice', 'mc:Fallback']) {
        const branch = child(runChild, branchName)
        if (!branch) continue
        for (const branchChild of Array.from(branch.children)) {
          appendItem(items, branchChild, format, context)
        }
        if (items.length > before) return
      }
      return
    }
    default:
      // Alles Übrige trägt keine Zeichen bei (`w:rPr`, Feldbefehle,
      // Kommentarmarken) und erscheint auch im Satz nicht.
      return
  }
}

/**
 * Ein Bild, in beiden Schreibweisen, die Word kennt: `w:drawing` (seit 2007)
 * und `w:pict` mit VML (älter — und genau das, was in vielen geerbten
 * Briefköpfen steckt).
 */
function readImage(node: Element, context: FormatContext): DocumentImage | null {
  const blip = node.getElementsByTagName('a:blip')[0]
  if (blip) {
    const id = blip.getAttribute('r:embed') ?? blip.getAttribute('r:link')
    const extent = node.getElementsByTagName('wp:extent')[0]
    if (id === null || !extent) return null
    return loadImage(context, id, {
      widthPt: Number(extent.getAttribute('cx') ?? 0) / EMU_PER_POINT,
      heightPt: Number(extent.getAttribute('cy') ?? 0) / EMU_PER_POINT,
    })
  }

  const imageData = node.getElementsByTagName('v:imagedata')[0]
  if (!imageData) return null
  const id = imageData.getAttribute('r:id')
  if (id === null) return null
  const style = imageData.parentElement?.getAttribute('style') ?? ''
  return loadImage(context, id, {
    widthPt: cssLength(style, 'width'),
    heightPt: cssLength(style, 'height'),
  })
}

function loadImage(
  context: FormatContext,
  id: string,
  size: { widthPt: number; heightPt: number },
): DocumentImage | null {
  const path = resolveTarget(context, id)
  if (path === null) return null
  const bytes = context.zip[path]
  if (!bytes || size.widthPt <= 0 || size.heightPt <= 0) return null
  return { path, bytes, ...size }
}

/** Eine Längenangabe aus einem VML-`style`-Attribut, z. B. `width:170.25pt`. */
function cssLength(style: string, property: string): number {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([0-9.]+)\\s*(pt|px|in|cm|mm)?`).exec(style)
  if (!match) return 0
  const value = Number(match[1])
  switch (match[2]) {
    case 'px':
      return value / PIXELS_PER_POINT
    case 'in':
      return value * 72
    case 'cm':
      return (value / 2.54) * 72
    case 'mm':
      return (value / 25.4) * 72
    default:
      return value
  }
}

// ---------------------------------------------------------------------------
// Eigenschaften anwenden
// ---------------------------------------------------------------------------

/**
 * Die Vorlagenkette von der Wurzel abwärts.
 *
 * Word erbt über `w:basedOn`; wer zuerst die Wurzel anwendet und dann die
 * abgeleiteten, bekommt automatisch die richtige Vorrangfolge. Der Zähler
 * bricht Ringe ab, die in von Hand zusammengesetzten Dateien vorkommen.
 */
function styleChain(context: FormatContext, styleId: string | null | undefined): StyleDefinition[] {
  const chain: StyleDefinition[] = []
  let current = styleId ?? null
  const seen = new Set<string>()
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const style = context.styles.get(current)
    if (!style) break
    chain.unshift(style)
    current = style.basedOn
  }
  return chain
}

function defaultParagraphFormat(): ParagraphFormat {
  return {
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
}

function defaultCharacterFormat(): CharacterFormat {
  return {
    // Ohne jede Angabe fällt Word auf Times New Roman in 10 pt zurück.
    fontFamily: 'Times New Roman',
    sizePt: 10,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    caps: false,
    smallCaps: false,
    vertAlign: 'baseline',
  }
}

function applyParagraph(format: ParagraphFormat, properties: Element | null): void {
  if (!properties) return

  const alignment = child(properties, 'w:jc')?.getAttribute('w:val')
  if (alignment !== null && alignment !== undefined) {
    format.alignment = readAlignment(alignment)
  }

  const indent = child(properties, 'w:ind')
  if (indent) {
    // `w:start`/`w:end` sind die neueren Namen für links und rechts.
    const left = attribute(indent, 'w:left') ?? attribute(indent, 'w:start')
    const right = attribute(indent, 'w:right') ?? attribute(indent, 'w:end')
    if (left !== null) format.indentLeftPt = left / TWIPS_PER_POINT
    if (right !== null) format.indentRightPt = right / TWIPS_PER_POINT
    const firstLine = attribute(indent, 'w:firstLine')
    const hanging = attribute(indent, 'w:hanging')
    // Ein hängender Einzug ist ein negativer Erstzeileneinzug — Word notiert
    // ihn nur als eigenes, positives Attribut.
    if (hanging !== null) format.indentFirstLinePt = -hanging / TWIPS_PER_POINT
    else if (firstLine !== null) format.indentFirstLinePt = firstLine / TWIPS_PER_POINT
  }

  const spacing = child(properties, 'w:spacing')
  if (spacing) {
    const before = attribute(spacing, 'w:before')
    const after = attribute(spacing, 'w:after')
    if (before !== null) format.spaceBeforePt = before / TWIPS_PER_POINT
    if (after !== null) format.spaceAfterPt = after / TWIPS_PER_POINT
    const line = attribute(spacing, 'w:line')
    if (line !== null) {
      const rule = spacing.getAttribute('w:lineRule') ?? 'auto'
      format.lineSpacing =
        rule === 'exact' || rule === 'atLeast'
          ? { rule, valuePt: line / TWIPS_PER_POINT }
          : // Bei `auto` zählt Word in 240steln einer Zeile: 360 sind
            // anderthalb, 480 zwei.
            { rule: 'auto', factor: line / 240 }
    }
  }

  const tabs = child(properties, 'w:tabs')
  if (tabs) {
    for (const tab of Array.from(tabs.getElementsByTagName('w:tab'))) {
      const position = attribute(tab, 'w:pos')
      const kind = tab.getAttribute('w:val') ?? 'left'
      if (position === null) continue
      // `clear` nimmt einen geerbten Halt zurück, `bar` zeichnet nur einen
      // Strich und hält den Text nicht an.
      if (kind === 'clear') {
        format.tabStops = format.tabStops.filter(
          (stop) => Math.abs(stop.positionPt - position / TWIPS_PER_POINT) > 0.01,
        )
        continue
      }
      if (kind === 'bar') continue
      format.tabStops = [
        ...format.tabStops,
        { positionPt: position / TWIPS_PER_POINT, alignment: readTabAlignment(kind) },
      ]
    }
    format.tabStops.sort((first, second) => first.positionPt - second.positionPt)
  }

  const pageBreak = child(properties, 'w:pageBreakBefore')
  if (pageBreak) format.pageBreakBefore = isOn(pageBreak)
  const keepNext = child(properties, 'w:keepNext')
  if (keepNext) format.keepNext = isOn(keepNext)
}

function applyRun(
  format: CharacterFormat,
  properties: Element | null,
  context: FormatContext,
): void {
  if (!properties) return

  const fonts = child(properties, 'w:rFonts')
  if (fonts) {
    const family = readFontFamily(fonts, context)
    if (family !== null) format.fontFamily = family
  }

  const size = attribute(child(properties, 'w:sz'), 'w:val')
  if (size !== null) format.sizePt = size / HALF_POINTS_PER_POINT

  const bold = child(properties, 'w:b')
  if (bold) format.bold = isOn(bold)
  const italic = child(properties, 'w:i')
  if (italic) format.italic = isOn(italic)
  const strike = child(properties, 'w:strike')
  if (strike) format.strike = isOn(strike)
  const caps = child(properties, 'w:caps')
  if (caps) format.caps = isOn(caps)
  const smallCaps = child(properties, 'w:smallCaps')
  if (smallCaps) format.smallCaps = isOn(smallCaps)

  const underline = child(properties, 'w:u')
  if (underline) format.underline = (underline.getAttribute('w:val') ?? 'single') !== 'none'

  const color = child(properties, 'w:color')?.getAttribute('w:val')
  if (color !== null && color !== undefined) {
    // `auto` heißt „der Betrachter entscheidet" und ist auf Papier schwarz.
    format.color = color.toLowerCase() === 'auto' ? null : color.replace('#', '').toUpperCase()
  }

  const vertAlign = child(properties, 'w:vertAlign')?.getAttribute('w:val')
  if (vertAlign === 'superscript' || vertAlign === 'subscript') format.vertAlign = vertAlign
  else if (vertAlign === 'baseline') format.vertAlign = 'baseline'
}

/**
 * Die Schriftfamilie eines Laufs — entweder direkt benannt oder über das
 * Design (`w:asciiTheme="minorHAnsi"`), das der übliche Fall ist.
 */
function readFontFamily(fonts: Element, context: FormatContext): string | null {
  const direct = fonts.getAttribute('w:ascii') ?? fonts.getAttribute('w:hAnsi')
  if (direct !== null) return direct

  const themed = fonts.getAttribute('w:asciiTheme') ?? fonts.getAttribute('w:hAnsiTheme')
  if (themed === null) return null
  // `minorHAnsi`, `minorAscii`, `minorBidi` zeigen alle auf dieselbe
  // Fließtextschrift des Designs; `major*` auf die der Überschriften.
  return themed.startsWith('major') ? context.theme.major : context.theme.minor
}

function readAlignment(value: string): Alignment {
  switch (value) {
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    case 'both':
    case 'distribute':
      return 'justify'
    default:
      return 'left'
  }
}

function readTabAlignment(value: string): TabAlignment {
  switch (value) {
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    case 'decimal':
      return 'decimal'
    default:
      return 'left'
  }
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

/** Das erste unmittelbare Kindelement mit diesem Namen. */
function child(node: Element | null, tagName: string): Element | null {
  if (!node) return null
  for (const candidate of Array.from(node.children)) {
    if (candidate.tagName === tagName) return candidate
  }
  return null
}

/** Ein Zahlenattribut, oder `null` wenn es fehlt oder keine Zahl ist. */
function attribute(node: Element | null, name: string): number | null {
  const raw = node?.getAttribute(name)
  if (raw === null || raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function twips(node: Element | null, name: string, fallback: number): number {
  return attribute(node, name) ?? fallback
}

/**
 * Words Schalter: Das Element allein bedeutet „an", `w:val="0"` oder
 * `w:val="false"` bedeutet „aus" — was in einer abgeleiteten Vorlage eine
 * geerbte Auszeichnung gezielt zurücknimmt.
 */
function isOn(node: Element | null): boolean {
  if (!node) return false
  const value = node.getAttribute('w:val')
  if (value === null) return true
  return value !== '0' && value !== 'false' && value !== 'off'
}
