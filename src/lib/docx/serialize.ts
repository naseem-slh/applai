import { zipSync, type Zippable } from 'fflate'
import type { DocxDocument } from './model'

const DOCUMENT_XML_PATH = 'word/document.xml'
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Wort-für-Wort die Deklaration, die Word selbst schreibt. Sie dient nur
// als Rückfall, falls das Original keine erkennbare Deklaration hatte.
const DEFAULT_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

const XML_DECLARATION_PATTERN = /^\s*<\?xml[^>]*\?>\r?\n?/

/**
 * Packt ein `DocxDocument` wieder zu einer `.docx`-Datei.
 *
 * Nur `word/document.xml` wird durch den (ggf. von `replaceRange`
 * gepatchten) XML-Baum ersetzt; jeder andere Archiveintrag — Formatvorlagen,
 * Kopf- und Fußzeilen, Schriftarten, Bilder, Beziehungen — wird
 * byteidentisch übernommen. Das übergebene Dokument bleibt unverändert:
 * die Zuordnung der Einträge wird neu aufgebaut, nicht überschrieben.
 */
export async function serializeDocx(docx: DocxDocument): Promise<Blob> {
  const serialized = new XMLSerializer().serializeToString(docx.doc)

  // XMLSerializer gibt die XML-Deklaration nicht zwingend wieder aus, Word
  // erwartet sie aber. Bevorzugt wird die des Originals übernommen (sie
  // steht noch unverändert im Archiv), sonst die Word-übliche.
  const xml = XML_DECLARATION_PATTERN.test(serialized)
    ? serialized
    : originalXmlDeclaration(docx) + serialized

  const zippable: Zippable = { ...docx.zip, [DOCUMENT_XML_PATH]: new TextEncoder().encode(xml) }

  return new Blob([zipSync(zippable)], { type: DOCX_MIME_TYPE })
}

function originalXmlDeclaration(docx: DocxDocument): string {
  const originalBytes = docx.zip[DOCUMENT_XML_PATH]
  if (!originalBytes) {
    return DEFAULT_XML_DECLARATION
  }
  // Für die Deklaration reicht der Dateianfang; das ganze Dokument zu
  // dekodieren wäre bei großen Dateien Verschwendung.
  const head = new TextDecoder('utf-8').decode(originalBytes.subarray(0, 256))
  const declaration = XML_DECLARATION_PATTERN.exec(head)?.[0]
  return declaration ?? DEFAULT_XML_DECLARATION
}
