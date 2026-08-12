import type { DocxDocument } from '@/lib/docx/model'
import { inspectRange, type Range as TextRange, type RangeInspection } from '@/lib/docx/replace'

/**
 * Die Abbildung zwischen der Markierung im Browser und dem Zeichenbereich
 * im Dokumentmodell — der tragende Teil der Arbeitsfläche.
 *
 * Warum das hier steht und nicht in einer Komponente: Ein Bereich, der um
 * ein Zeichen danebenliegt, lässt `replaceRange` die falsche Stelle im
 * Anschreiben des Nutzers überschreiben. Diese Datei kennt kein React und
 * ist deshalb Fall für Fall prüfbar — auch die unangenehmen (rückwärts
 * gezogene Markierung, Anfang genau auf einer Absatzgrenze, Punkt außerhalb
 * jedes Absatzes).
 *
 * Die Regel, auf der alles beruht: **Jeder Absatz trägt seinen
 * Dokument-Offset als Datenattribut, und sein Textinhalt im DOM ist
 * zeichengleich mit `Paragraph.text`.** Der lokale Offset wird deshalb mit
 * `Range.toString().length` gemessen (das zählt genau die Zeichen zwischen
 * Absatzanfang und Markierungspunkt), der globale ist die Summe aus beidem.
 * `DocumentView` hält die zweite Hälfte dieser Regel ein: Absatztext steht
 * dort als reiner Text, ohne Zwischenelemente, mit `white-space: pre-wrap`,
 * damit Tabulator und Zeilenumbruch als je ein Zeichen im DOM stehen — so
 * wie sie im Modell zählen.
 */

/** Trägt den Dokument-Offset des Absatzanfangs (`Paragraph.start`). */
export const PARAGRAPH_START_ATTRIBUTE = 'data-paragraph-start'
/** Trägt den Index des Absatzes im Modell (`Paragraph.index`). */
export const PARAGRAPH_INDEX_ATTRIBUTE = 'data-paragraph-index'

const PARAGRAPH_SELECTOR = `[${PARAGRAPH_START_ATTRIBUTE}]`

/**
 * Bis zu wie vielen Zeichen Kontext mitgelesen werden.
 *
 * Aufgabe 11 beschreibt `RewriteRequest.contextBefore` als „bis zu 600
 * Zeichen davor", erzwingt es aber ausdrücklich nicht: Wie viel Kontext
 * entsteht, entscheidet die Markierung, und eine Kürzung mitten im Wort
 * gehört an die Stelle, die den Text anzeigt. Das ist hier. Ohne diese
 * Grenze ginge bei einer Markierung am Briefende der ganze Brief davor mit
 * in den Prompt: teurer, und die Anweisungen verdünnen sich.
 *
 * `contextAfter` wird nach derselben Regel gekappt. Aufgabe 11 nennt dafür
 * keine Zahl, aber dieselben Gründe gelten, und die Echo-Prüfung in
 * `rewrite.ts` vergleicht gegen **beide** Ränder.
 */
export const CONTEXT_MAX_CHARS = 600

/**
 * Wie viel vom Kontextfenster mindestens übrig bleiben muss, damit für eine
 * saubere Satzgrenze gekürzt wird. Ohne diese Schranke könnte ein Punkt
 * kurz vor der Markierung („z. B.") 590 der 600 Zeichen wegschneiden.
 */
const MIN_CONTEXT_AFTER_SENTENCE_CUT = CONTEXT_MAX_CHARS / 2

/** Satzende samt schließendem Anführungszeichen oder Klammer und Leerraum. */
const SENTENCE_BREAK = /[.!?](["'”’)\]]*)\s+/

/**
 * Die Punkte einer Markierung, wie `window.getSelection()` sie liefert.
 * Bewusst genau diese vier Felder, damit ein `Selection` unverändert
 * übergeben werden kann und ein Test seine Punkte selbst setzen darf.
 */
export interface SelectionPoints {
  anchorNode: Node | null
  anchorOffset: number
  focusNode: Node | null
  focusOffset: number
}

/** Eine Markierung, so wie die Arbeitsfläche und ihre Anbauten sie brauchen. */
export interface EditorSelection {
  range: TextRange
  /** Der markierte Text selbst. */
  text: string
  /** Höchstens {@link CONTEXT_MAX_CHARS} Zeichen davor. */
  contextBefore: string
  /** Höchstens {@link CONTEXT_MAX_CHARS} Zeichen danach. */
  contextAfter: string
  /**
   * `false`, wenn die Markierung nur aus Leerraum besteht. Dann gibt es
   * nichts umzuformulieren (`rewriteSelection` lehnt das ab), und die
   * Oberfläche sperrt ihre Aktionen, statt den Fehler erst vom Modell
   * zurückzubekommen.
   */
  hasContent: boolean
  /** Was `replaceRange` mit diesem Bereich täte (siehe `inspectRange`). */
  inspection: RangeInspection
}

/**
 * Rechnet die Markierung im DOM in einen Zeichenbereich des Dokumenttexts
 * um. `null`, wenn sich mindestens ein Punkt nicht zuordnen lässt.
 *
 * Eine rückwärts gezogene Markierung (Anker hinter Fokus) liefert denselben
 * Bereich wie die vorwärts gezogene — `from` ist immer der kleinere Offset.
 * Eine zusammengefallene Markierung (Cursor ohne Auswahl) liefert
 * `from === to`; ob damit etwas anzufangen ist, entscheidet der Aufrufer.
 */
export function selectionToRange(root: HTMLElement, points: SelectionPoints): TextRange | null {
  const anchor = pointToOffset(root, points.anchorNode, points.anchorOffset)
  if (anchor === null) return null
  const focus = pointToOffset(root, points.focusNode, points.focusOffset)
  if (focus === null) return null
  return { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
}

/**
 * Der umgekehrte Weg: ein Zeichenbereich als DOM-Bereich, damit eine
 * programmatisch gesetzte Markierung („ganzes Dokument", „dieser Absatz")
 * im Browser auch sichtbar hervorgehoben ist. `null`, wenn die Fläche keine
 * Absätze trägt.
 */
export function rangeToDomRange(root: HTMLElement, range: TextRange): globalThis.Range | null {
  const start = domPoint(root, range.from, 'first')
  const end = domPoint(root, range.to, 'last')
  if (start === null || end === null) return null

  const domRange = root.ownerDocument.createRange()
  domRange.setStart(start.node, start.offset)
  domRange.setEnd(end.node, end.offset)
  return domRange
}

interface DomPoint {
  node: Node
  offset: number
}

function domPoint(root: HTMLElement, offset: number, prefer: 'first' | 'last'): DomPoint | null {
  const paragraphs = paragraphElements(root)
  const covering = paragraphs.filter(
    (paragraph) => paragraphStart(paragraph) <= offset && offset <= paragraphEnd(paragraph),
  )
  // Ein Offset zwischen zwei Absätzen kann es nicht geben: Das
  // Absatztrennzeichen liegt auf dem Endeoffset des vorangehenden Absatzes.
  const paragraph = (prefer === 'first' ? covering[0] : covering.at(-1)) ?? paragraphs.at(-1)
  if (paragraph === undefined) return null

  let remaining = clamp(offset - paragraphStart(paragraph), 0, paragraph.textContent?.length ?? 0)
  const walker = root.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
  }
  // Absatz ohne Textknoten (eine Leerzeile).
  return { node: paragraph, offset: paragraph.childNodes.length }
}

/** Der Bereich über das ganze Dokument — der Knopf „ganzes Dokument". */
export function wholeDocumentRange(docx: DocxDocument): TextRange {
  return { from: 0, to: docx.text.length }
}

/** Der Bereich eines einzelnen Absatzes, `null` bei unbekanntem Index. */
export function paragraphRange(docx: DocxDocument, index: number): TextRange | null {
  const paragraph = docx.paragraphs[index]
  return paragraph === undefined ? null : { from: paragraph.start, to: paragraph.end }
}

/**
 * Baut aus einem Bereich alles, was die Arbeitsfläche und ihre Anbauten
 * brauchen: Text, gekappten Kontext und die Vorschau auf das Ersetzen.
 *
 * `null` bei einem zusammengefallenen Bereich — ohne markierte Zeichen gibt
 * es nichts anzuzeigen und nichts zu ersetzen.
 */
export function createSelection(docx: DocxDocument, range: TextRange): EditorSelection | null {
  const from = clamp(range.from, 0, docx.text.length)
  const to = clamp(range.to, from, docx.text.length)
  if (to <= from) return null

  const text = docx.text.slice(from, to)
  return {
    range: { from, to },
    text,
    contextBefore: cutFromStart(docx.text.slice(0, from)),
    contextAfter: cutToEnd(docx.text.slice(to)),
    hasContent: text.trim() !== '',
    inspection: inspectRange(docx, { from, to }),
  }
}

/**
 * Der Kontext **vor** der Markierung: die letzten {@link CONTEXT_MAX_CHARS}
 * Zeichen, vorgerückt auf eine Satz- oder Wortgrenze, damit der Prompt
 * nicht mitten in einem Wort beginnt.
 */
function cutFromStart(text: string): string {
  if (text.length <= CONTEXT_MAX_CHARS) return text
  const window = text.slice(text.length - CONTEXT_MAX_CHARS)

  const sentence = SENTENCE_BREAK.exec(window)
  if (sentence !== null) {
    const candidate = window.slice(sentence.index + sentence[0].length)
    if (candidate.length >= MIN_CONTEXT_AFTER_SENTENCE_CUT) return candidate
  }

  const space = window.search(/\s/)
  return space === -1 ? window : window.slice(space + 1)
}

/** Dasselbe für den Kontext **nach** der Markierung, vom Ende her gekürzt. */
function cutToEnd(text: string): string {
  if (text.length <= CONTEXT_MAX_CHARS) return text
  const window = text.slice(0, CONTEXT_MAX_CHARS)

  const lastSentenceEnd = lastMatchEnd(window)
  if (lastSentenceEnd !== null && lastSentenceEnd >= MIN_CONTEXT_AFTER_SENTENCE_CUT) {
    return window.slice(0, lastSentenceEnd)
  }

  const space = window.search(/\s\S*$/)
  return space === -1 ? window : window.slice(0, space)
}

/** Ende des letzten Satzabschlusses im Fenster, `null` wenn es keinen gibt. */
function lastMatchEnd(window: string): number | null {
  const pattern = new RegExp(SENTENCE_BREAK.source, 'g')
  let end: number | null = null
  for (let match = pattern.exec(window); match !== null; match = pattern.exec(window)) {
    end = match.index + match[0].length
  }
  return end
}

/**
 * Ein Markierungspunkt als Offset im Dokumenttext.
 *
 * Liegt er in einem Absatz, wird der lokale Anteil gemessen; liegt er
 * dazwischen (etwa im Innenabstand der Fläche, wenn jemand über den Rand
 * hinauszieht), wird er auf die nächste Absatzgrenze gelegt.
 */
function pointToOffset(root: HTMLElement, node: Node | null, offset: number): number | null {
  if (node === null || !root.contains(node)) return null
  if (!isValidPoint(node, offset)) return null

  const paragraph = paragraphOf(node)
  if (paragraph !== null && root.contains(paragraph)) {
    const measure = ownerDocumentOf(node).createRange()
    measure.setStart(paragraph, 0)
    measure.setEnd(node, offset)
    return paragraphStart(paragraph) + measure.toString().length
  }

  return boundaryOffset(root, node, offset)
}

/**
 * Zeigt der Punkt wirklich in den Knoten hinein? Ein Offset hinter dem
 * Ende des Knotens ist keine Position im Dokument, und `Range.setEnd`
 * würde damit werfen — mitten in einem `selectionchange`-Rückruf, also an
 * der denkbar schlechtesten Stelle.
 */
function isValidPoint(node: Node, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0) return false
  const length =
    node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE
      ? (node.nodeValue?.length ?? 0)
      : node.childNodes.length
  return offset <= length
}

/**
 * Der Absatz, in dem dieser Knoten steckt — oder der Knoten selbst, wenn er
 * einer ist. `null` außerhalb jedes Absatzes.
 *
 * Öffentlich, weil `DocumentView` damit prüft, ob eine Eingabe innerhalb
 * eines Absatzes bleibt, und die Arbeitsfläche damit den Absatz unter dem
 * Schreibcursor bestimmt.
 */
export function paragraphOf(node: Node | null): HTMLElement | null {
  if (node === null) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return element?.closest<HTMLElement>(PARAGRAPH_SELECTOR) ?? null
}

/** Der Index des Absatzes, in dem dieser Knoten steckt. */
export function paragraphIndexOf(node: Node | null): number | null {
  const paragraph = paragraphOf(node)
  if (paragraph === null) return null
  const index = Number(paragraph.getAttribute(PARAGRAPH_INDEX_ATTRIBUTE))
  return Number.isInteger(index) ? index : null
}

function paragraphElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR))
}

function paragraphStart(paragraph: HTMLElement): number {
  return Number(paragraph.getAttribute(PARAGRAPH_START_ATTRIBUTE) ?? 0)
}

function paragraphEnd(paragraph: HTMLElement): number {
  return paragraphStart(paragraph) + (paragraph.textContent?.length ?? 0)
}

/**
 * Ein Punkt außerhalb aller Absätze wird auf die nächstgelegene
 * Absatzgrenze gelegt: vor dem ersten Absatz auf dessen Anfang, sonst auf
 * das Ende des davorliegenden Absatzes. Das Absatztrennzeichen gehört zu
 * keinem Absatz (siehe `model.ts`), deshalb ist beides eine gültige Wahl —
 * das Ende des davorliegenden ist die, die dem Zug der Maus entspricht.
 */
function boundaryOffset(root: HTMLElement, node: Node, offset: number): number | null {
  const paragraphs = paragraphElements(root)
  const last = paragraphs.at(-1)
  if (last === undefined) return null

  const point = ownerDocumentOf(node).createRange()
  point.setStart(node, offset)
  point.collapse(true)

  for (const [index, paragraph] of paragraphs.entries()) {
    const bounds = ownerDocumentOf(node).createRange()
    bounds.selectNodeContents(paragraph)
    if (point.compareBoundaryPoints(Range.START_TO_START, bounds) <= 0) {
      const previous = paragraphs[index - 1]
      return previous === undefined ? paragraphStart(paragraph) : paragraphEnd(previous)
    }
  }

  return paragraphEnd(last)
}

function ownerDocumentOf(node: Node): Document {
  return node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : (node.ownerDocument ?? document)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
