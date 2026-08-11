import type { DocxDocument, Paragraph, Run } from './model'
import { buildTextModel, runChildText } from './parse'

/**
 * Ein Bereich im Dokumenttext (`DocxDocument.text`). `to` ist exklusiv,
 * `from === to` ist eine reine Einfügestelle.
 */
export interface Range {
  from: number
  to: number
}

// Rückfallwert, falls das Dokument den Präfix `w` nicht auflösen kann.
const WORDPROCESSING_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

/**
 * Ersetzt den Textbereich `range` durch `newText` und gibt ein **neues**
 * `DocxDocument` zurück; das übergebene bleibt unangetastet (Aufgabe 14
 * hält einen Undo-Stapel aus solchen Zuständen, eine In-Place-Änderung
 * würde die Historie verfälschen).
 *
 * Das Original-XML wird dabei nie neu erzeugt, sondern nur an genau den
 * betroffenen Stellen gepatcht — das ist die Grundlage des Versprechens,
 * dass das Layout der Nutzerdatei unverändert bleibt.
 *
 * Regeln:
 *
 * - **Formatierung:** Der Ersatztext landet im ersten betroffenen Lauf und
 *   erbt damit dessen `w:rPr`. Teilweise überdeckte Läufe an den Rändern
 *   behalten ihren unberührten Teil samt eigener Formatierung, weil dort
 *   nur der überdeckte Textanteil aus den vorhandenen `w:t` herausgeschnitten
 *   wird — die Läufe selbst bleiben dieselben Knoten.
 * - **Absatzgrenzen bleiben bestehen.** Der Ersatztext wird an `\n`
 *   zerlegt; Segment *i* geht in den *i*-ten Absatz des betroffenen
 *   Bereichs. Gibt es weniger Segmente als betroffene Absätze, werden die
 *   dadurch leer gebliebenen Absätze aus dem Dokument entfernt — mit
 *   Ausnahme des ersten betroffenen Absatzes, der immer ein Segment
 *   bekommt und deshalb nie verschwindet (nie den ganzen Bereich auf
 *   nichts zusammenstreichen). Gibt es mehr Segmente als Absätze, hängen
 *   die überzähligen am letzten betroffenen Absatz, dort per `w:br`
 *   getrennt.
 * - **Leerer Ersatztext** löscht nur den Text: ein dadurch leerer Absatz
 *   bleibt als Leerzeile bestehen.
 */
export function replaceRange(docx: DocxDocument, range: Range, newText: string): DocxDocument {
  assertValidRange(range, docx.text.length)

  // Tiefe Kopie: alle Änderungen laufen ausschließlich auf dem Klon.
  const doc = docx.doc.cloneNode(true) as XMLDocument
  const model = buildTextModel(doc)

  // Das Offset-Modell kennt nur `\n` (aus `w:br`/`w:cr`); Zeilenenden aus
  // fremden Quellen werden deshalb vorab vereinheitlicht.
  const replacement = newText.replace(/\r\n?/g, '\n')

  const affected = findAffectedParagraphs(model.paragraphs, range)
  if (affected.length === 0) {
    throw new Error('Das Dokument enthält keinen Absatz, in dem der Bereich liegen könnte.')
  }

  // `split` liefert immer mindestens ein Segment — der erste betroffene
  // Absatz bekommt also garantiert eines und bleibt erhalten.
  const segments = replacement.split('\n')

  affected.forEach((paragraph, index) => {
    const isLast = index === affected.length - 1
    const segment =
      isLast && segments.length > affected.length
        ? segments.slice(index).join('\n') // Überzählige Zeilen: per w:br in denselben Absatz
        : segments[index] // undefined = dieser Absatz bekommt keinen Ersatztext mehr

    const localFrom = clamp(range.from - paragraph.start, 0, paragraph.text.length)
    const localTo = clamp(range.to - paragraph.start, 0, paragraph.text.length)
    applyToParagraph(doc, paragraph, localFrom, localTo, segment ?? '')

    const remainder = paragraph.text.slice(0, localFrom) + paragraph.text.slice(localTo)
    if (segment === undefined && remainder === '' && !carriesSectionBreak(paragraph.node)) {
      paragraph.node.remove()
    }
  })

  // `zip` wird bewusst geteilt statt kopiert: die Einträge werden nirgends
  // verändert (serializeDocx baut eine neue Zuordnung auf), und der
  // Undo-Stapel aus Aufgabe 14 hielte sonst jede Archivkopie im Speicher.
  const { paragraphs, text } = buildTextModel(doc)
  return { zip: docx.zip, doc, paragraphs, text }
}

/**
 * Die Absätze, auf die sich der Bereich auswirkt.
 *
 * Ein Absatz zählt dazu, wenn der Bereich echten Text von ihm überdeckt
 * oder er vollständig im Bereich liegt (das schließt leere Absätze mitten
 * im Bereich ein). Absätze, die der Bereich nur am Rand berührt — etwa
 * weil er auf dem Absatztrennzeichen endet —, bleiben außen vor: das
 * Trennzeichen gehört zu keinem Absatz, und ein Absatz darf nicht wegen
 * einer Markierung verschwinden, die seinen Text gar nicht erfasst.
 */
function findAffectedParagraphs(paragraphs: Paragraph[], range: Range): Paragraph[] {
  const insertionPoint = (offset: number): Paragraph[] => {
    const paragraph = paragraphs.find((candidate) => candidate.start <= offset && offset <= candidate.end)
    return paragraph ? [paragraph] : []
  }

  if (range.from === range.to) {
    return insertionPoint(range.from)
  }

  const overlapping = paragraphs.filter(
    (paragraph) =>
      Math.max(paragraph.start, range.from) < Math.min(paragraph.end, range.to) ||
      (range.from <= paragraph.start && paragraph.end <= range.to),
  )
  if (overlapping.length > 0) {
    return overlapping
  }

  // Der Bereich liegt vollständig auf Absatztrennzeichen (z. B. genau das
  // `\n` zwischen zwei Absätzen). Absatzgrenzen bleiben bestehen, also
  // lässt sich hier nichts löschen — der Ersatztext wird stattdessen an
  // der Anfangsstelle eingefügt.
  return insertionPoint(range.from)
}

/**
 * Wendet die Ersetzung innerhalb eines Absatzes an. `from`/`to` sind
 * Offsets im Absatztext.
 */
function applyToParagraph(doc: XMLDocument, paragraph: Paragraph, from: number, to: number, replacement: string): void {
  const anchor = replacement === '' ? null : findAnchorRun(paragraph, from)

  if (replacement !== '' && anchor === null) {
    // Absatz ganz ohne Lauf (z. B. `<w:p/>`, eine Leerzeile): ein neuer,
    // formatierungsloser Lauf ist die einzige Möglichkeit, Text
    // unterzubringen. Er kommt ans Ende, damit ein `w:pPr` erstes Kind
    // bleibt (das verlangt das OOXML-Schema).
    const run = createWordElement(doc, 'w:r')
    for (const node of buildTextNodes(doc, replacement)) {
      run.appendChild(node)
    }
    paragraph.node.appendChild(run)
    return
  }

  for (const run of paragraph.runs) {
    const overlapsRange = to > from && run.end > from && run.start < to
    if (run !== anchor && !overlapsRange) {
      // Unbeteiligter Lauf: sein XML wird nicht einmal angefasst.
      continue
    }
    rewriteRun(doc, run, from, to, run === anchor ? replacement : '')
  }
}

/**
 * Der Lauf, der den Ersatztext aufnimmt und ihm seine Formatierung vererbt:
 * der erste Lauf, der über den Anfangs-Offset hinausreicht. Liegt der
 * Offset hinter allem Text des Absatzes, ist es der letzte Lauf mit Text
 * (ersatzweise der letzte Lauf überhaupt).
 */
function findAnchorRun(paragraph: Paragraph, from: number): Run | null {
  const covering = paragraph.runs.find((run) => run.end > from)
  if (covering) {
    return covering
  }
  const lastWithText = [...paragraph.runs].reverse().find((run) => run.text.length > 0)
  return lastWithText ?? paragraph.runs.at(-1) ?? null
}

/**
 * Schneidet aus einem Lauf den überdeckten Textanteil heraus und fügt —
 * falls es der Anker-Lauf ist — den Ersatztext an der Anfangsstelle ein.
 *
 * Der Lauf selbst (und damit sein `w:rPr`) bleibt derselbe Knoten; es
 * werden nur seine textkindtragenden Elemente neu zusammengesetzt. Ein
 * Aufteilen in geklonte Läufe ist deshalb nicht nötig: Ein Lauf, der links
 * und rechts des Bereichs Text behält, behält beides mit derselben
 * Formatierung, und Läufe, die der Bereich nur teilweise überdeckt,
 * behalten ihren Rest ohnehin. Kinder ohne Textbeitrag (`w:rPr`, aber auch
 * `w:drawing` für ein Bild) bleiben unangetastet stehen — sie haben im
 * Offset-Modell die Länge 0, eine Markierung „über sie hinweg“ ist daher
 * nicht eindeutig genug, um sie zu löschen.
 */
function rewriteRun(doc: XMLDocument, run: Run, from: number, to: number, replacement: string): void {
  const children = Array.from(run.node.childNodes)
  const rewritten: Node[] = []
  let inserted = replacement === ''
  let cursor = run.start

  for (const child of children) {
    const length = childTextLength(child)
    const start = cursor
    const end = cursor + length
    cursor = end

    if (length === 0) {
      rewritten.push(child)
      continue
    }

    const isDeleted = Math.max(start, from) < Math.min(end, to)
    const isInsertionSite = !inserted && end > from
    if (!isDeleted && !isInsertionSite) {
      rewritten.push(child)
      continue
    }

    const headLength = clamp(from - start, 0, length)
    const tailStart = clamp(to - start, 0, length)

    if (isTextElement(child)) {
      const text = child.textContent ?? ''
      let head = text.slice(0, headLength)
      let tail = text.slice(tailStart)
      const insertedNodes = isInsertionSite ? buildTextNodes(doc, replacement) : []

      // Direkt aneinandergrenzende `w:t` zusammenfassen: inhaltlich sind
      // sie ohnehin ein Text, und so zersplittert ein Lauf auch nach
      // vielen Ersetzungen nicht in immer mehr Textfragmente.
      const first = insertedNodes[0]
      if (head !== '' && first && isTextElement(first)) {
        head += first.textContent ?? ''
        insertedNodes.shift()
      }
      const last = insertedNodes.at(-1)
      if (tail !== '' && last && isTextElement(last)) {
        tail = (last.textContent ?? '') + tail
        insertedNodes.pop()
      }

      if (head !== '') {
        rewritten.push(setTextContent(child, head))
      }
      rewritten.push(...insertedNodes)
      if (tail !== '') {
        // Bleibt vor und hinter dem Bereich Text stehen, braucht der
        // hintere Teil ein eigenes `w:t` — die Attribute (xml:space)
        // werden dabei mitgenommen.
        rewritten.push(setTextContent(head === '' ? child : (child.cloneNode(false) as Element), tail))
      }
    } else {
      // `w:tab`, `w:br`, `w:cr`: genau ein Zeichen, also entweder ganz
      // überdeckt oder gar nicht.
      if (isInsertionSite) {
        rewritten.push(...buildTextNodes(doc, replacement))
      }
      if (!isDeleted) {
        rewritten.push(child)
      }
    }

    inserted = inserted || isInsertionSite
  }

  if (!inserted) {
    // Einfügestelle liegt hinter dem letzten Textkind des Laufs.
    rewritten.push(...buildTextNodes(doc, replacement))
  }

  run.node.replaceChildren(...rewritten)
}

/**
 * Zerlegt einen Ersatztext in Word-Kindelemente: Tabulatoren werden zu
 * `w:tab`, Zeilenumbrüche zu `w:br`, alles andere zu `w:t`. Nur so liest
 * `parseDocx` den Text später wieder identisch ein — und nur so setzt Word
 * ihn wie erwartet.
 */
function buildTextNodes(doc: XMLDocument, text: string): Element[] {
  const nodes: Element[] = []
  for (const part of text.split(/(\n|\t)/)) {
    if (part === '') {
      continue
    }
    if (part === '\n') {
      nodes.push(createWordElement(doc, 'w:br'))
    } else if (part === '\t') {
      nodes.push(createWordElement(doc, 'w:tab'))
    } else {
      nodes.push(setTextContent(createWordElement(doc, 'w:t'), part))
    }
  }
  return nodes
}

// Setzt den Inhalt eines `w:t` und sichert ihn mit xml:space="preserve" ab:
// ohne dieses Attribut schneidet Word führende und nachgestellte
// Leerzeichen weg.
function setTextContent(element: Element, text: string): Element {
  element.textContent = text
  element.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve')
  return element
}

function createWordElement(doc: XMLDocument, qualifiedName: string): Element {
  const namespace = doc.documentElement?.lookupNamespaceURI('w') ?? WORDPROCESSING_NAMESPACE
  return doc.createElementNS(namespace, qualifiedName)
}

function isTextElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'w:t'
}

// Länge des Textbeitrags eines Laufkinds — dieselbe Zuordnung, die
// parse.ts für den Modellaufbau nutzt (runChildText). Knoten ohne
// Elementcharakter (etwa Einrückungs-Textknoten aus formatiertem XML)
// tragen nichts bei.
function childTextLength(node: Node): number {
  return node.nodeType === Node.ELEMENT_NODE ? runChildText(node as Element).length : 0
}

// Trägt der Absatz einen Abschnittswechsel (Seitenränder, Kopf-/Fußzeilen
// des Abschnitts)? Ein solcher Absatz darf nie entfernt werden, sonst
// ändert sich das Layout des gesamten davorliegenden Abschnitts — genau
// das, was Applai zusichert nicht zu tun.
function carriesSectionBreak(paragraphNode: Element): boolean {
  return Array.from(paragraphNode.children).some(
    (child) =>
      child.tagName === 'w:pPr' &&
      Array.from(child.children).some((grandChild) => grandChild.tagName === 'w:sectPr'),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function assertValidRange(range: Range, textLength: number): void {
  const { from, to } = range
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new Error(`Ungültiger Bereich: from (${from}) und to (${to}) müssen ganze Zahlen sein.`)
  }
  if (from < 0 || to < 0) {
    throw new Error(`Ungültiger Bereich: Offsets dürfen nicht negativ sein (from=${from}, to=${to}).`)
  }
  if (from > to) {
    throw new Error(`Ungültiger Bereich: from (${from}) darf nicht größer als to (${to}) sein.`)
  }
  if (to > textLength) {
    throw new Error(`Ungültiger Bereich: to (${to}) liegt hinter dem Dokumentende (${textLength} Zeichen).`)
  }
}
