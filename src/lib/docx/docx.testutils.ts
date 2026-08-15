// Baut ein minimales .docx im Speicher, für Fälle, in denen eine eigene
// Binärdatei unter tests/fixtures/ unverhältnismäßig wäre. Lag zuvor
// wortgleich in replace.test.ts und documentSelection.test.ts; nach
// CLAUDE.md gehört eine von mehreren Testdateien genutzte Attrappe in eine
// *.testutils.ts neben den Code.
import { zipSync } from 'fflate'

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

export function buildDocx(bodyInner: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const zipped = zipSync({
    '[Content_Types].xml': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${bodyInner}</w:body></w:document>`,
    ),
  })
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
}

/** Ein Absatz aus einem einzigen Lauf — die häufigste Form im Test. */
export function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}
