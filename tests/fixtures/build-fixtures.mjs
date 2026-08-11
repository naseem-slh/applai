#!/usr/bin/env node
// Erzeugt die `.docx`-Testfixtures unter `tests/fixtures/` aus handgeschriebenem
// OOXML. Bewusst keine docx-generierende Bibliothek (G9) und kein Download
// (G2) — die Fixtures müssen exakt die Fälle abbilden, die parse.test.ts
// prüft. Zum Neuerzeugen: `node tests/fixtures/build-fixtures.mjs`.
import { zipSync } from 'fflate'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(fileURLToPath(import.meta.url))

const CONTENT_TYPES_BASE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`

const CONTENT_TYPES_WITH_HEADER_FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>
`

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`

const DOCUMENT_RELS_WITH_HEADER_FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
`

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function documentXml(bodyInner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}>
  <w:body>
${bodyInner}
  </w:body>
</w:document>
`
}

function headerXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W_NS}>
  <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
</w:hdr>
`
}

function footerXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W_NS}>
  <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
</w:ftr>
`
}

function writeDocx(fileName, files) {
  const encoder = new TextEncoder()
  const zippable = {}
  for (const [path, content] of Object.entries(files)) {
    zippable[path] = encoder.encode(content)
  }
  const zipped = zipSync(zippable, { level: 0 })
  writeFileSync(join(fixturesDir, fileName), zipped)
  console.log(`geschrieben: ${fileName}`)
}

// --- Fixture 1: einfaches Anschreiben (Fließtext, Tabulator, Zeilenumbruch) ---
{
  const body = [
    '    <w:p><w:r><w:t>Sehr geehrte Damen und Herren,</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t xml:space="preserve">ich bewerbe mich hiermit um die ausgeschriebene Stelle. </w:t></w:r><w:r><w:t>Meine Motivation ist hoch.</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Anrede:</w:t><w:tab/><w:t>Herr</w:t><w:br/><w:t>Zeile zwei</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Mit freundlichen Grüßen</w:t></w:r></w:p>',
  ].join('\n')

  writeDocx('anschreiben.docx', {
    '[Content_Types].xml': CONTENT_TYPES_BASE,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
  })
}

// --- Fixture 2: fett gesetzter Teilsatz (mehrere w:r-Läufe in einem Absatz) ---
{
  const body = [
    '    <w:p>',
    '      <w:r><w:t xml:space="preserve">Ich bin ein </w:t></w:r>',
    '      <w:r><w:rPr><w:b/></w:rPr><w:t>hoch motivierter</w:t></w:r>',
    '      <w:r><w:t xml:space="preserve"> Bewerber mit einschlägiger Erfahrung.</w:t></w:r>',
    '    </w:p>',
  ].join('\n')

  writeDocx('anschreiben-fett.docx', {
    '[Content_Types].xml': CONTENT_TYPES_BASE,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
  })
}

// --- Fixture 3: Kopf- und Fußzeile (dürfen NICHT in DocxDocument.text landen) ---
{
  const body = [
    '    <w:p><w:r><w:t>Betreff: Bewerbung als Softwareentwicklerin</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Mit freundlichen Grüßen</w:t></w:r></w:p>',
    '    <w:sectPr>',
    '      <w:headerReference w:type="default" r:id="rIdHeader" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>',
    '      <w:footerReference w:type="default" r:id="rIdFooter" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>',
    '    </w:sectPr>',
  ].join('\n')

  writeDocx('anschreiben-kopf-fuss.docx', {
    '[Content_Types].xml': CONTENT_TYPES_WITH_HEADER_FOOTER,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
    'word/_rels/document.xml.rels': DOCUMENT_RELS_WITH_HEADER_FOOTER,
    'word/header1.xml': headerXml('Kopfzeilentext, der nicht im Fließtext auftauchen darf'),
    'word/footer1.xml': footerXml('Fußzeilentext, der nicht im Fließtext auftauchen darf'),
  })
}
