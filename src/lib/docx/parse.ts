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

  return { zip, doc, paragraphs, text }
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

// Baut den Text eines `w:r`-Laufs aus seinen Kindelementen zusammen:
// `w:t` liefert seinen Textinhalt (unverändert, auch ohne
// xml:space="preserve" wird hier nichts getrimmt — Word setzt das Attribut
// ohnehin genau dann, wenn führende/nachgestellte Leerzeichen erhalten
// bleiben sollen), `w:tab` wird zu einem Tabulator, `w:br` und `w:cr` zu
// einem Zeilenumbruch. Andere Kindelemente (z. B. `w:rPr` für Formatierung)
// tragen keinen Text bei und werden übersprungen.
function parseRunText(runNode: Element): string {
  let text = ''
  for (const child of Array.from(runNode.children)) {
    switch (child.tagName) {
      case 'w:t':
        text += child.textContent ?? ''
        break
      case 'w:tab':
        text += '\t'
        break
      case 'w:br':
      case 'w:cr':
        text += '\n'
        break
      default:
        break
    }
  }
  return text
}
