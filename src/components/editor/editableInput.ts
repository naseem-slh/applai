/**
 * Was auf der Dokumentfläche eingegeben werden darf und was nicht — die
 * Regel „Text ja, Formatierung nein" aus `docs/spec.md`, als zwei prüfbare
 * Funktionen.
 *
 * `contentEditable` ist von Haus aus ein kleiner Rich-Text-Editor: Strg+B
 * setzt `<b>`, die Eingabetaste erzeugt einen neuen Block, ein Einfügen aus
 * der Zwischenablage bringt fremdes Markup mit. Nichts davon hat eine
 * Entsprechung im Dokumentmodell — dort ist ein Absatz ein `w:p` aus der
 * Word-Datei, und seine Formatierung gehört den vorhandenen `w:rPr`. Der
 * DOM ist hier **Ansicht**, nicht Quelle: Was er zeigt, ist der Text des
 * Modells, und was der Nutzer eingibt, geht als Zeichenänderung zurück ins
 * Modell.
 */

/**
 * Eingabearten, die Struktur erzeugen statt Zeichen. Sie werden abgelehnt,
 * bevor der Browser sie ausführt.
 *
 * `insertParagraph` (Eingabetaste) und `insertLineBreak` (Umschalt+Eingabe)
 * sind bewusst dabei: Die Absatzfolge kommt aus der Word-Datei. Ein im DOM
 * erzeugter Absatz hätte kein `w:p` hinter sich, und die Zuordnung zwischen
 * Absatz und Offset — die Grundlage jeder Ersetzung — wäre gebrochen.
 */
const BLOCKED_INPUT_TYPES = new Set([
  'insertParagraph',
  'insertLineBreak',
  'insertOrderedList',
  'insertUnorderedList',
  'insertHorizontalRule',
  'insertLink',
  // Beim Ablegen (Drag and Drop) kommt Markup mit; das Einfügen läuft
  // ausschließlich über die Zwischenablage, wo es sich entschärfen lässt.
  'insertFromDrop',
  'insertFromPasteAsQuotation',
])

/**
 * Alles, was mit `format` beginnt (`formatBold`, `formatItalic`,
 * `formatUnderline`, `formatFontColor`, `formatJustifyCenter`, …), plus die
 * Liste oben. Die Präfixprüfung ist Absicht: Sie fängt auch die
 * Eingabearten, die ein Browser morgen ergänzt, ohne dass jemand diese
 * Liste nachpflegen müsste.
 */
export function isBlockedInputType(inputType: string): boolean {
  return inputType.startsWith('format') || BLOCKED_INPUT_TYPES.has(inputType)
}

/** Tasten, die zusammen mit Strg oder Cmd eine Formatierung auslösen. */
const FORMATTING_KEYS = new Set(['b', 'i', 'u'])

/**
 * Strg+B, Strg+I, Strg+U (und ihre Cmd-Entsprechungen). Sie lösen zwar
 * ohnehin eine `format…`-Eingabeart aus und würden dort abgefangen — aber
 * nicht jeder Browser meldet sie vorher an, und der Plan nennt diesen Weg
 * ausdrücklich. Zwei Riegel an derselben Tür sind hier billiger als ein
 * fett gesetztes Wort, das im Modell nicht vorkommt.
 */
export function isFormattingShortcut(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  if (event.altKey) return false
  return FORMATTING_KEYS.has(event.key.toLowerCase())
}

/**
 * Aus dem Inhalt der Zwischenablage wird reiner Text in **einer** Zeile.
 *
 * Zeilenumbrüche werden zu einem Leerzeichen: Ein eingefügter Absatzwechsel
 * müsste im Modell einen neuen `w:p` erzeugen, und den gibt es in der
 * Word-Datei nicht. Tabulatoren bleiben stehen — sie sind im Modell ein
 * Zeichen (`w:tab`) und in einem Anschreiben ein übliches Trennzeichen.
 */
export function toPlainTextInsertion(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[^\S\n]*\n+[^\S\n]*/g, ' ')
}

/** Eine kleinste Änderung an einem Text: `[from, to)` wird zu `insert`. */
export interface TextEdit {
  from: number
  to: number
  insert: string
}

/**
 * Die **kleinste** Änderung, die aus `before` `after` macht: gemeinsamer
 * Anfang und gemeinsames Ende bleiben stehen, dazwischen wird ersetzt.
 *
 * Das ist keine Sparsamkeit um ihrer selbst willen, sondern die Bedingung
 * dafür, dass Tippen die Formatierung nicht zerstört. `replaceRange` gibt
 * dem Ersatztext die Formatierung des ersten überdeckten Laufs; würde bei
 * jedem Tastendruck der ganze Absatz ersetzt, fielen alle seine `w:rPr`
 * zusammen und ein fett gesetzter Teilsatz wäre nach einem einzigen Komma
 * verschwunden. Mit der kleinsten Änderung bleibt jeder unbeteiligte Lauf
 * unangetastet (Aufgabe 3 fasst ihn dann gar nicht erst an).
 */
export function diffText(before: string, after: string): TextEdit {
  const shortest = Math.min(before.length, after.length)

  let prefix = 0
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }

  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  }
}

/**
 * Fügt Text an der aktuellen Einfügestelle ein, ohne `document.execCommand`.
 *
 * Der veraltete Befehl wäre der kürzere Weg, hängt aber am
 * Rückgängig-Stapel des Browsers — und der ist hier abgeschaltet, weil
 * Strg+Z den Verlauf der Arbeitsfläche bedient (ein Stapel aus
 * `DocxDocument`-Zuständen, nicht aus DOM-Zuständen). Über einen
 * DOM-Bereich ist das Einfügen zudem prüfbar; `execCommand` gibt es in
 * jsdom nicht.
 *
 * Liefert `false`, wenn die Einfügestelle nicht in diesem Absatz liegt.
 */
export function insertPlainText(host: HTMLElement, text: string): boolean {
  const selection = host.ownerDocument.defaultView?.getSelection() ?? null
  if (selection === null || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!host.contains(range.commonAncestorContainer)) return false

  range.deleteContents()
  const node = host.ownerDocument.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}
