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

// Fester Zeitstempel: fflate setzt sonst Date.now() in jeden Zip-Eintrag,
// dann erzeugt jeder Lauf andere Bytes und ein erneutes Ausführen des
// Skripts sähe im Git-Diff wie eine echte Änderung aus.
const FIXED_MTIME = Date.UTC(2026, 0, 1)

function writeDocx(fileName, files) {
  const encoder = new TextEncoder()
  const zippable = {}
  for (const [path, content] of Object.entries(files)) {
    zippable[path] = encoder.encode(content)
  }
  const zipped = zipSync(zippable, { level: 0, mtime: FIXED_MTIME })
  writeFileSync(join(fixturesDir, fileName), zipped)
  console.log(`geschrieben: ${fileName}`)
}

// --- Fixture 1: einfaches Anschreiben (Fließtext, Tabulator, Zeilenumbruch, leerer Absatz) ---
{
  const body = [
    '    <w:p><w:r><w:t>Sehr geehrte Damen und Herren,</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t xml:space="preserve">ich bewerbe mich hiermit um die ausgeschriebene Stelle. </w:t></w:r><w:r><w:t>Meine Motivation ist hoch.</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Anrede:</w:t><w:tab/><w:t>Herr</w:t><w:br/><w:t>Zeile zwei</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Mit freundlichen Grüßen</w:t></w:r></w:p>',
    '    <w:p/>',
  ].join('\n')

  writeDocx('anschreiben.docx', {
    '[Content_Types].xml': CONTENT_TYPES_BASE,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
  })
}

// --- Fixture 2: fett gesetzter Teilsatz + formatierungsreiner Lauf ohne w:t ---
{
  const body = [
    '    <w:p>',
    '      <w:r><w:t xml:space="preserve">Ich bin ein </w:t></w:r>',
    '      <w:r><w:rPr><w:b/></w:rPr><w:t>hoch motivierter</w:t></w:r>',
    '      <w:r><w:rPr><w:i/></w:rPr></w:r>',
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

// --- Fixture 4: Sonderformen, die das Textmodell nicht sieht ---
// Ein Absatz, der nur ein Bild trägt; eine Tabellenzelle; ein Textfeld.
// Alle drei sind in echten Anschreiben üblich (Unterschriftsgrafik,
// Adressblock als Tabelle, Randnotiz als Textfeld) und dürfen beim
// Ersetzen weder verschwinden noch doppelt gezählt werden.
{
  const body = [
    '    <w:p><w:r><w:t>Alpha</w:t></w:r></w:p>',
    // Nur ein Bild, kein w:t: im Fließtext ist dieser Absatz leer.
    '    <w:p><w:r><w:drawing/></w:r></w:p>',
    '    <w:tbl>',
    '      <w:tblPr/>',
    '      <w:tblGrid><w:gridCol w:w="4530"/></w:tblGrid>',
    '      <w:tr><w:tc><w:tcPr><w:tcW w:w="4530" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Zelle</w:t></w:r></w:p></w:tc></w:tr>',
    '    </w:tbl>',
    // Textfeld: der Absatz darin ist ein w:p innerhalb eines w:p — er darf
    // weder als eigener Absatz noch als Lauf des äußeren Absatzes zählen.
    '    <w:p>',
    '      <w:r><w:t>Vor</w:t></w:r>',
    '      <w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" style="width:100pt;height:20pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>BoxText</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>',
    '    </w:p>',
    '    <w:p><w:r><w:t>Gamma</w:t></w:r></w:p>',
  ].join('\n')

  writeDocx('anschreiben-sonderfaelle.docx', {
    '[Content_Types].xml': CONTENT_TYPES_BASE,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
  })
}
