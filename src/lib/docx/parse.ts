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
  const paragraphNodes = paragraphNodesOf(doc)
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
  const runNodes = runNodesOf(paragraphNode)
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
/**
 * Die Absätze eines XML-Teils in Dokumentreihenfolge.
 *
 * Exportiert, weil `src/lib/docx/format.ts` dieselbe Auswahl braucht — für
 * `word/document.xml` **und** für Kopf- und Fußzeilen, die eigene Teile mit
 * demselben Aufbau sind. Zwei Stellen mit zwei Auffassungen davon, was ein
 * Absatz ist, wären genau die Art von Abweichung, die später als
 * verrutschter Text auffällt.
 */
/**
 * Trägt dieses Dokument eine Tabelle?
 *
 * Gebraucht vom PDF-Export, und zwar als **Sperre**: Der Satzspiegel in
 * `lib/export/pdf/layout.ts` kennt keine Tabellen (das steht dort
 * ausdrücklich unter „Was bewusst fehlt"). Ein tabellenbasiertes Dokument
 * käme als PDF ohne seine Tabelle heraus — der Text stünde untereinander,
 * die Spalten wären weg. Zweispaltige Lebensläufe sind genau solche
 * Dokumente (siehe `replace.ts`, `isLastParagraphInTableCell`), und
 * Adressblöcke im Anschreiben ebenfalls.
 *
 * Eine still falsche Bewerbungsmappe ist der schlechteste denkbare Ausgang.
 * Word-Export und Kopierfeld bleiben davon unberührt: Sie reichen das
 * Original weiter, statt es neu zu setzen.
 *
 * Gesucht wird im ganzen Dokument, auch in Kopf- und Fußzeilen dieses Teils —
 * `getElementsByTagName` sucht rekursiv, und eine Tabelle irgendwo ist eine
 * Tabelle.
 */
export function hasTables(doc: XMLDocument): boolean {
  return doc.getElementsByTagName('w:tbl').length > 0
}

export function paragraphNodesOf(root: XMLDocument | Element): Element[] {
  return Array.from(root.getElementsByTagName('w:p')).filter((node) => !isNestedContent(node))
}

/**
 * Die Absätze **innerhalb** eines Textfelds.
 *
 * `paragraphNodesOf` lässt sie aus, und das zu Recht: Sie stehen nicht im
 * Fließtext, ihre Zeichen gehören nicht in die Offsets, an denen die
 * Markierungen des Nutzers hängen. Für den PDF-Satz werden sie trotzdem
 * gebraucht — in einem Anschreiben steht die Empfängeranschrift regelmäßig
 * in einem Textfeld, und ohne sie ist der Brief keiner.
 *
 * Gezählt wird relativ zu `root`: Ein Textfeld in einem Textfeld bleibt
 * wieder außen vor und wird beim Setzen dieses Kastens erneut aufgesammelt.
 */
export function nestedParagraphNodesOf(root: Element): Element[] {
  return Array.from(root.getElementsByTagName('w:p')).filter((node) => {
    for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (parent.tagName === 'w:p' || parent.tagName === 'w:txbxContent') return false
    }
    return true
  })
}

/** Die Läufe eines Absatzes, ohne die verschachtelter Absätze und Textfelder. */
export function runNodesOf(paragraphNode: Element): Element[] {
  return Array.from(paragraphNode.getElementsByTagName('w:r')).filter((runNode) =>
    belongsToParagraph(runNode, paragraphNode),
  )
}

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

/**
 * Steckt der Knoten in einem verschachtelten Textbereich — also in einem
 * anderen Absatz oder im Inhalt eines Textfelds (`w:txbxContent`)?
 *
 * `getElementsByTagName` sucht rekursiv. Ohne diesen Filter erschiene der
 * Absatz eines Textfelds zusätzlich als eigener Dokumentabsatz, während
 * seine Läufe gleichzeitig als Läufe des umgebenden Absatzes gezählt
 * würden: derselbe `w:r`-Knoten läge in zwei Absätzen mit zwei
 * widersprüchlichen Offsets. Der Text stünde doppelt im Modell und eine
 * gewöhnliche Markierung würde beim Ersetzen das Textfeld zerstören.
 * Textfeldinhalt taucht deshalb bewusst gar nicht im Modell auf.
 */
function isNestedContent(node: Element): boolean {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'w:p' || parent.tagName === 'w:txbxContent') {
      return true
    }
  }
  return false
}

// Ein Lauf gehört genau zu dem Absatz, der ihm am nächsten steht: Auf dem
// Weg nach oben muss `paragraphNode` erreicht werden, bevor ein anderer
// Absatz oder ein Textfeldinhalt dazwischenkommt. Läufe in `w:hyperlink`
// o. Ä. bleiben damit Teil ihres Absatzes.
function belongsToParagraph(runNode: Element, paragraphNode: Element): boolean {
  for (let parent = runNode.parentElement; parent; parent = parent.parentElement) {
    if (parent === paragraphNode) {
      return true
    }
    if (parent.tagName === 'w:p' || parent.tagName === 'w:txbxContent') {
      return false
    }
  }
  return false
}
