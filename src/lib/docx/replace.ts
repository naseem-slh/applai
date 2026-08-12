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
 *   nichts zusammenstreichen), und mit Ausnahme der Absätze, die mehr als
 *   Text und Formatierung enthalten (siehe `mayBeRemoved`) — die bleiben
 *   als Leerzeile stehen. Gibt es mehr Segmente als Absätze, hängen die
 *   überzähligen am letzten betroffenen Absatz, dort per `w:br` getrennt.
 * - **Leere Absätze** (Leerzeilen) gehören nur dann zum Bereich, wenn sie
 *   echt in seinem Inneren liegen — an seinen Enden berührt der Bereich
 *   kein Zeichen von ihnen.
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
    if (segment === undefined && remainder === '' && mayBeRemoved(paragraph.node)) {
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
 * Warum ein Absatz beim Ersetzen **nie** entfernt wird (siehe
 * {@link mayBeRemoved}). Die drei Gründe sind für die Oberfläche
 * unterscheidbar, weil sie verschiedene Dinge im Dokument bezeichnen und
 * der Nutzer wissen soll, was ihm im Weg steht.
 */
export type RetainedParagraphReason = 'sectionBreak' | 'tableCell' | 'embeddedContent'

/** Ein Absatz, der seinen Platz behält, obwohl der Bereich ihn überdeckt. */
export interface RetainedParagraph {
  /** Index im Dokument (`Paragraph.index`). */
  index: number
  /** Stelle innerhalb der betroffenen Absätze; 0 ist der erste. */
  position: number
  reason: RetainedParagraphReason
}

/**
 * Was `replaceRange` mit diesem Bereich täte, ohne ihn auszuführen.
 *
 * Gebraucht wird das von der Arbeitsfläche (Aufgabe 14): Sie muss den
 * Nutzer **vor** dem Ersetzen darauf hinweisen, dass ein nicht entfernbarer
 * Absatz seinen Platz behält, während der Ersatztext die vorderen Absätze
 * füllt — die Unterschriftsgrafik kann dadurch sichtbar verrutschen. Das
 * ist der bewusste Tausch gegen Datenverlust aus Aufgabe 3; sichtbar
 * gemacht wird er dort, wo die Markierung entsteht.
 */
export interface RangeInspection {
  /** Indizes der Absätze, die der Bereich überdeckt (Dokumentreihenfolge). */
  affected: number[]
  /** Davon die, die nie entfernt werden. */
  retained: RetainedParagraph[]
  /**
   * Kann sich die Reihenfolge von Text und festem Inhalt sichtbar ändern?
   *
   * `true`, sobald ein nicht entfernbarer Absatz **nicht** der erste
   * betroffene ist. Nur dann kann er leer zurückbleiben: Der erste
   * betroffene Absatz bekommt immer ein Segment des Ersatztextes (`split`
   * liefert mindestens eines), jeder weitere nur dann, wenn der Ersatztext
   * genügend Zeilen hat. Bleibt er ohne Segment und darf nicht entfernt
   * werden, steht er danach als Leerzeile hinter dem zusammengerückten
   * Text — die Grafik wandert.
   *
   * Bewusst „kann", nicht „wird": Wie viele Zeilen der Ersatztext hat,
   * steht erst fest, wenn er vorliegt. Wer die Frage genauer beantworten
   * will, ruft diese Funktion mit dem fertigen Text noch einmal auf und
   * vergleicht `newText.split('\n').length` mit `affected.length`.
   */
  mayShiftContent: boolean
}

/**
 * Vorschau auf `replaceRange`, ohne das Dokument anzufassen. Prüft den
 * Bereich nach denselben Regeln (gleiche Fehler bei ungültigen Offsets).
 */
export function inspectRange(docx: DocxDocument, range: Range): RangeInspection {
  assertValidRange(range, docx.text.length)

  const affected = findAffectedParagraphs(docx.paragraphs, range)
  const retained: RetainedParagraph[] = []

  affected.forEach((paragraph, position) => {
    const reason = retainedReason(paragraph.node)
    if (reason !== null) {
      retained.push({ index: paragraph.index, position, reason })
    }
  })

  return {
    affected: affected.map((paragraph) => paragraph.index),
    retained,
    mayShiftContent: retained.some((entry) => entry.position > 0),
  }
}

/**
 * Die Absätze, auf die sich der Bereich auswirkt.
 *
 * Ein Absatz zählt dazu, wenn der Bereich mindestens ein Zeichen von ihm
 * überdeckt; ein leerer Absatz, wenn er echt im Inneren des Bereichs liegt.
 * Absätze, die der Bereich nur am Rand berührt — etwa weil er auf dem
 * Absatztrennzeichen endet —, bleiben außen vor: Das Trennzeichen gehört zu
 * keinem Absatz, und ein Absatz darf nicht wegen einer Markierung
 * verschwinden, die seinen Text gar nicht erfasst.
 */
function findAffectedParagraphs(paragraphs: Paragraph[], range: Range): Paragraph[] {
  const insertionPoint = (offset: number): Paragraph[] => {
    const paragraph = paragraphs.find((candidate) => candidate.start <= offset && offset <= candidate.end)
    return paragraph ? [paragraph] : []
  }

  if (range.from === range.to) {
    return insertionPoint(range.from)
  }

  const overlapping = paragraphs.filter((paragraph) =>
    paragraph.start === paragraph.end
      ? // Leerer Absatz (Leerzeile): Er hat kein Zeichen, das der Bereich
        // überdecken könnte. Betroffen ist er nur, wenn er echt im Inneren
        // liegt — berührt der Bereich ihn bloß an seinem Anfang oder Ende
        // (`to` ist exklusiv!), bleibt er unangetastet. Sonst verschwände
        // eine Leerzeile, die gar nicht markiert war, oder der Ersatztext
        // landete in ihr statt im tatsächlich überdeckten Absatz.
        range.from < paragraph.start && paragraph.end < range.to
      : Math.max(paragraph.start, range.from) < Math.min(paragraph.end, range.to),
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

  // Ein Lauf, der Text hatte und nun nur noch seine eigene Formatierung
  // enthält, wird entfernt — seine `w:rPr` galt genau diesem Text. Läufe,
  // die von vornherein textlos waren, bleiben dagegen immer stehen: Sie
  // tragen im Zweifel ein Bild oder ein Textfeld, das im Offset-Modell
  // unsichtbar ist.
  const keepsContent = rewritten.some(
    (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'w:rPr',
  )
  if (!keepsContent && run.text.length > 0) {
    run.node.remove()
  }
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
// Leerzeichen weg. Das Attribut wird auch an bestehende `w:t` geschrieben,
// die es noch nicht hatten — der Textinhalt ändert sich dadurch nicht, und
// es entspricht genau der Lesart des Modells (parse.ts trimmt nie).
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

/**
 * Darf dieser textlos gewordene Absatz wirklich aus dem Dokument entfernt
 * werden — oder muss er als Leerzeile stehen bleiben?
 *
 * Das Textmodell sieht nur Zeichen. „Kein Text mehr übrig“ heißt deshalb
 * nicht „nichts mehr drin“: Ein Absatz kann ein Bild, ein Textfeld, eine
 * Fußnote oder einen Abschnittswechsel tragen, die im Modell die Länge 0
 * haben. Ihn zu löschen, weil seine Zeichen ersetzt wurden, wäre stiller
 * Datenverlust — und in einer Tabellenzelle sogar eine beschädigte Datei.
 * Im Zweifel bleibt der Absatz leer stehen; das kostet höchstens eine
 * Leerzeile, während die Gegenrichtung die Bewerbung zerstört.
 */
function mayBeRemoved(paragraphNode: Element): boolean {
  return retainedReason(paragraphNode) === null
}

/**
 * Derselbe Beschluss wie {@link mayBeRemoved}, nur mit Begründung — damit
 * die Oberfläche benennen kann, was im Weg steht, ohne die Regel ein
 * zweites Mal zu formulieren. Es gibt genau diese eine Fassung; `mayBeRemoved`
 * liest sie nur aus.
 */
function retainedReason(paragraphNode: Element): RetainedParagraphReason | null {
  if (carriesSectionBreak(paragraphNode)) return 'sectionBreak'
  if (isLastParagraphInTableCell(paragraphNode)) return 'tableCell'
  if (!containsOnlyTextAndFormatting(paragraphNode)) return 'embeddedContent'
  return null
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

// Eine `w:tc` muss mindestens einen Absatz enthalten und mit einem `w:p`
// enden (CT_Tc). Bliebe die Zelle leer zurück, hielte Word die Datei für
// beschädigt und verlangte eine Reparatur — das schlimmstmögliche Ergebnis
// für dieses Projekt. Der letzte Absatz einer Zelle wird deshalb nur
// geleert. Adressblöcke und zweispaltige Lebensläufe sind Tabellen.
function isLastParagraphInTableCell(paragraphNode: Element): boolean {
  const parent = paragraphNode.parentElement
  if (!parent || parent.tagName !== 'w:tc') {
    return false
  }
  const paragraphsInCell = Array.from(parent.children).filter((child) => child.tagName === 'w:p')
  return paragraphsInCell.at(-1) === paragraphNode
}

// Kindelemente, die ein Absatz enthalten darf, ohne dass beim Entfernen
// etwas verloren ginge: reine Formatierung und reiner Text. `w:pPr` und
// `w:rPr` werden nicht weiter durchsucht — sie enthalten ausschließlich
// Formatierung (der Sonderfall `w:sectPr` wird oben eigens geprüft).
// `w:proofErr` und `w:lastRenderedPageBreak` streut Word als reine
// Hilfsmarkierung ein; ohne sie wäre in echten Word-Dateien kaum ein
// Absatz je entfernbar. Alles andere — `w:drawing`, `w:pict`, `w:object`,
// `w:hyperlink`, Lesezeichen, Kommentare, Felder — blockiert das Entfernen.
const REMOVABLE_ELEMENTS = new Set([
  'w:pPr',
  'w:rPr',
  'w:r',
  'w:t',
  'w:tab',
  'w:br',
  'w:cr',
  'w:proofErr',
  'w:lastRenderedPageBreak',
])

function containsOnlyTextAndFormatting(element: Element): boolean {
  return Array.from(element.children).every((child) => {
    if (!REMOVABLE_ELEMENTS.has(child.tagName)) {
      return false
    }
    // Formatierungsblöcke tragen nie Inhalt, der verloren gehen könnte.
    if (child.tagName === 'w:pPr' || child.tagName === 'w:rPr') {
      return true
    }
    return containsOnlyTextAndFormatting(child)
  })
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
