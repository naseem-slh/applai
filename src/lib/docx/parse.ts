import { unzipSync } from 'fflate'
import type { DocxDocument, Paragraph, Run } from './model'

const DOCUMENT_XML_PATH = 'word/document.xml'

// Absätze im Dokumenttext werden mit diesem Zeichen verbunden. Es liegt
// zwischen den Absätzen und gehört zu keinem Paragraph.start/.end-Bereich
// (siehe model.ts) — Aufgabe 3 muss das beim Umrechnen von Offsets beachten.
const PARAGRAPH_SEPARATOR = '\n'

/**
 * Liest eine `.docx`-Datei ein und baut ein Offset-Modell ihres Fließtexts
 * auf. Nur `word/document.xml` (der Hauptteil) wird geparst — Kopf- und
 * Fußzeilen liegen in eigenen XML-Teilen und fließen bewusst nicht in
 * `text` ein. Das vollständige Archiv bleibt trotzdem auf `zip` erhalten,
 * damit Aufgabe 3 beim erneuten Packen keinen Eintrag verliert.
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<DocxDocument> {
  const zip = unzipSync(new Uint8Array(buffer))
  const documentXmlBytes = zip[DOCUMENT_XML_PATH]
  if (!documentXmlBytes) {
    throw new Error(`Ungültige .docx-Datei: "${DOCUMENT_XML_PATH}" fehlt im Archiv.`)
  }

  const xml = new TextDecoder('utf-8').decode(documentXmlBytes)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error(`"${DOCUMENT_XML_PATH}" konnte nicht als XML geparst werden: ${parserError.textContent}`)
  }

  const { paragraphs, text } = buildTextModel(doc)

  return { zip, doc, paragraphs, text }
}

/**
 * Baut das Offset-Modell (Absätze, Läufe, Fließtext) zu einem bereits
 * geparsten `word/document.xml` auf.
 *
 * Bewusst getrennt von `parseDocx`, weil Aufgabe 3 dasselbe Modell nach dem
 * Patchen des XML-Baums neu aufbauen muss: `replaceRange` gibt ein neues
 * `DocxDocument` zurück und darf die Offsets nicht von Hand fortschreiben —
 * beide Wege müssen exakt dieselbe Offset-Semantik erzeugen, deshalb gibt es
 * nur diese eine Implementierung.
 */
export function buildTextModel(doc: XMLDocument): { paragraphs: Paragraph[]; text: string } {
  const paragraphNodes = Array.from(doc.getElementsByTagName('w:p'))
  const paragraphs: Paragraph[] = []
  let text = ''

  paragraphNodes.forEach((node, index) => {
    const { text: paragraphText, runs } = parseParagraph(node)
    const start = text.length
    paragraphs.push({
      index,
      node,
      text: paragraphText,
      runs,
      start,
      end: start + paragraphText.length,
    })
    text += paragraphText
    if (index < paragraphNodes.length - 1) {
      text += PARAGRAPH_SEPARATOR
    }
  })

  return { paragraphs, text }
}

function parseParagraph(paragraphNode: Element): { text: string; runs: Run[] } {
  const runNodes = Array.from(paragraphNode.getElementsByTagName('w:r'))
  const runs: Run[] = []
  let text = ''

  for (const runNode of runNodes) {
    const runText = parseRunText(runNode)
    const start = text.length
    runs.push({ node: runNode, text: runText, start, end: start + runText.length })
    text += runText
  }

  return { text, runs }
}

// Baut den Text eines `w:r`-Laufs aus seinen Kindelementen zusammen
// (siehe runChildText): `w:t` liefert seinen Textinhalt (unverändert, auch
// ohne xml:space="preserve" wird hier nichts getrimmt — Word setzt das
// Attribut ohnehin genau dann, wenn führende/nachgestellte Leerzeichen
// erhalten bleiben sollen), `w:tab` wird zu einem Tabulator, `w:br` und
// `w:cr` zu einem Zeilenumbruch. Andere Kindelemente (z. B. `w:rPr` für
// Formatierung) tragen keinen Text bei und werden übersprungen.
function parseRunText(runNode: Element): string {
  let text = ''
  for (const child of Array.from(runNode.children)) {
    text += runChildText(child)
  }
  return text
}

/**
 * Der Textbeitrag eines einzelnen Kindelements eines `w:r`.
 *
 * Einzige Quelle der Wahrheit für die Zuordnung XML → Zeichen-Offsets:
 * `parseDocx` baut damit das Modell auf, `replaceRange` schneidet damit
 * Bereiche aus den Läufen heraus. Beide müssen sich zwingend einig sein,
 * wie lang ein Kindelement im Fließtext ist.
 */
export function runChildText(child: Element): string {
  switch (child.tagName) {
    case 'w:t':
      return child.textContent ?? ''
    case 'w:tab':
      return '\t'
    case 'w:br':
    case 'w:cr':
      return '\n'
    default:
      return ''
  }
}
