import type { CharacterFormat, DocumentImage, FormattedParagraph } from '@/lib/docx/format'
import { characterStyle, displayText } from './documentStyle'

/**
 * Schreibt die Läufe eines Absatzes in den DOM und liest sie zurück.
 *
 * **Warum imperativ und nicht als JSX.** In dieser Fläche verwaltet React die
 * Absätze und der Browser ihren Text (siehe `DocumentView`). Ließe React die
 * Läufe als Kinder mitverwalten, setzte es nach jeder Eingabe den Text der
 * `<span>` neu — und der Schreibcursor spränge bei jedem Anschlag an den
 * Absatzanfang. Genau dieselbe Aufteilung wie bisher, nur mit Formatierung.
 *
 * **Stücke statt Läufe.** Ein Word-Absatz zerfällt beim Bearbeiten
 * regelmäßig in mehr Läufe, ohne dass sich etwas Sichtbares ändert:
 * `replaceRange` schneidet Bereiche aus Läufen heraus und lässt zwei gleich
 * formatierte zurück, wo einer war. Aneinandergrenzende Läufe gleicher
 * Formatierung werden deshalb zu **einem** Stück zusammengelegt. Damit bleibt
 * der DOM über solche Teilungen hinweg unverändert, und der Abgleich in
 * `DocumentView` erkennt am Aufbau der Stücke zuverlässig, wann wirklich neu
 * gebaut werden muss.
 */

export type RunPiece =
  | { kind: 'text'; text: string; format: CharacterFormat }
  | { kind: 'image'; image: DocumentImage; format: CharacterFormat }

/** Das Attribut, unter dem ein übersetztes Stück seinen Urtext trägt. */
const SOURCE_ATTRIBUTE = 'source'

/** Vergleichsform einer Zeichenformatierung. */
function formatKey(format: CharacterFormat): string {
  return [
    format.fontFamily,
    format.sizePt,
    format.bold ? 'b' : '',
    format.italic ? 'i' : '',
    format.underline ? 'u' : '',
    format.strike ? 's' : '',
    format.color ?? '',
    format.caps ? 'c' : '',
    format.smallCaps ? 'k' : '',
    format.vertAlign,
  ].join('|')
}

export function runPieces(paragraph: FormattedParagraph): RunPiece[] {
  const pieces: RunPiece[] = []

  for (const item of paragraph.items) {
    if (item.kind === 'image') {
      pieces.push({ kind: 'image', image: item.image, format: item.format })
      continue
    }

    // Tabulator und Zeilenumbruch sind im Textmodell je ein Zeichen; nur
    // wenn sie es im DOM auch sind, stimmt die Offset-Rechnung. Sichtbar
    // werden sie durch `white-space: pre-wrap` am Absatz.
    const characters = item.kind === 'text' ? item.text : item.kind === 'tab' ? '\t' : '\n'

    const last = pieces.at(-1)
    if (last?.kind === 'text' && formatKey(last.format) === formatKey(item.format)) {
      last.text += characters
    } else {
      pieces.push({ kind: 'text', text: characters, format: item.format })
    }
  }

  return pieces
}

/**
 * Der Aufbau eines Absatzes — **ohne** die Längen der Stücke.
 *
 * Daran hängt, ob der Abgleich neu baut. Ein getipptes Zeichen verlängert ein
 * Stück und ändert die Kennung nicht; erst eine andere Formatierung tut es.
 * Stünden die Längen darin, spränge der Cursor bei jedem Anschlag.
 */
export function pieceSignature(pieces: readonly RunPiece[]): string {
  return pieces.map((piece) => `${piece.kind}:${formatKey(piece.format)}`).join('¶')
}

/** Was diese Stücke im DOM anzeigen — Bildzeichen bereits übersetzt. */
export function displayedText(pieces: readonly RunPiece[]): string {
  return pieces
    .map((piece) => (piece.kind === 'text' ? displayText(piece.text, piece.format) : ''))
    .join('')
}

/**
 * Objekt-URLs je Bild, damit ein Neuaufbau nicht bei jedem Mal eine neue
 * anlegt. Am Bild und nicht am Absatz, weil dasselbe Bild in mehreren
 * Absätzen stehen kann.
 */
const imageUrls = new WeakMap<DocumentImage, string>()

const MIME_BY_EXTENSION = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['svg', 'image/svg+xml'],
])

function imageUrl(image: DocumentImage): string {
  const cached = imageUrls.get(image)
  if (cached !== undefined) return cached

  const extension = image.path.slice(image.path.lastIndexOf('.') + 1).toLowerCase()
  const type = MIME_BY_EXTENSION.get(extension) ?? 'application/octet-stream'
  const url = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type }))
  imageUrls.set(image, url)
  return url
}

/** Schreibt die Stücke als `<span>` in den Absatz und ersetzt, was dort war. */
export function writePieces(element: HTMLElement, pieces: readonly RunPiece[]): void {
  const document = element.ownerDocument

  element.replaceChildren(
    ...pieces.map((piece) => {
      const span = document.createElement('span')
      Object.assign(span.style, characterStyle(piece.format))

      if (piece.kind === 'image') {
        const image = document.createElement('img')
        image.src = imageUrl(piece.image)
        image.alt = ''
        image.style.width = `calc(var(--pt) * ${piece.image.widthPt})`
        image.style.height = `calc(var(--pt) * ${piece.image.heightPt})`
        // Ein Bild im Fließtext trägt kein Zeichen zum Absatztext bei
        // (`parse.ts`, `runChildText`) — es darf deshalb auch keines in den
        // DOM bringen, sonst verrutschten die Offsets.
        span.append(image)
        return span
      }

      const shown = displayText(piece.text, piece.format)
      span.textContent = shown
      // Nur wo übersetzt wurde: Der Urtext muss beim Zurückmelden wieder
      // herauskommen, sonst stünde nach der ersten Änderung in der Zeile ein
      // Aufzählungspunkt in einer Wingdings-Angabe.
      if (shown !== piece.text) span.dataset[SOURCE_ATTRIBUTE] = piece.text
      return span
    }),
  )
}

/**
 * Der Text des Absatzes, **wie er im Dokument steht** — nicht, wie er auf dem
 * Schirm aussieht.
 *
 * Der Unterschied ist genau ein Fall: ein übersetztes Bildzeichen. Es zeigt
 * `•`, im Dokument steht `U+F09F`, und beides ist gleich lang. Wurde das
 * Stück selbst bearbeitet (die Längen weichen ab), gilt der DOM — der Nutzer
 * darf nie ein Zeichen verlieren, das er getippt hat.
 */
export function sourceText(element: HTMLElement): string {
  let text = ''
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.nodeValue ?? ''
      continue
    }
    const shown = child.textContent ?? ''
    const source = child instanceof HTMLElement ? child.dataset[SOURCE_ATTRIBUTE] : undefined
    text += source !== undefined && source.length === shown.length ? source : shown
  }
  return text
}

/**
 * Der Versatz des Schreibcursors innerhalb dieses Absatzes, oder `null`, wenn
 * er woanders steht.
 *
 * Gebraucht wird er nur für den einen Fall, in dem sich der Neuaufbau nicht
 * vermeiden lässt, der Text aber derselbe bleibt: die Umformulierung, die
 * Läufe teilt. Dort wäre ein Cursorsprung nicht zu rechtfertigen.
 */
export function caretOffsetWithin(element: HTMLElement): number | null {
  const selection = element.ownerDocument.defaultView?.getSelection() ?? null
  if (selection === null || selection.focusNode === null) return null
  if (!element.contains(selection.focusNode)) return null

  let offset = 0
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node === selection.focusNode) return offset + selection.focusOffset
    offset += node.nodeValue?.length ?? 0
  }
  // Der Fokus liegt auf einem Element statt in einem Textknoten — etwa in
  // einem leeren Absatz.
  return offset
}

/** Setzt den Schreibcursor auf diesen Versatz im Absatz. */
export function placeCaretWithin(element: HTMLElement, offset: number): void {
  const view = element.ownerDocument.defaultView
  const selection = view?.getSelection() ?? null
  if (selection === null) return

  let remaining = offset
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0
    if (remaining <= length) {
      selection.collapse(node, remaining)
      return
    }
    remaining -= length
  }
  // Kein Textknoten (eine Leerzeile) oder der Versatz liegt dahinter.
  selection.collapse(element, element.childNodes.length)
}
