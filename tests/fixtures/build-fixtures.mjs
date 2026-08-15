#!/usr/bin/env node
// Erzeugt die `.docx`-Testfixtures unter `tests/fixtures/` aus handgeschriebenem
// OOXML. Bewusst keine docx-generierende Bibliothek (G9) und kein Download
// (G2) — die Fixtures müssen exakt die Fälle abbilden, die parse.test.ts
// prüft. Zum Neuerzeugen: `node tests/fixtures/build-fixtures.mjs`.
import { zipSync, zlibSync } from 'fflate'
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
    // Bilder kommen fertig als Bytes, alles Übrige als XML-Text.
    zippable[path] = typeof content === 'string' ? encoder.encode(content) : content
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

// --- Fixture 5: ein durchformatiertes Anschreiben ---
// Alles, was `src/lib/docx/format.ts` auslesen können muss und in den
// bisherigen Fixtures fehlt: Formatvorlagen mit Vererbung, Designschriften
// (`asciiTheme`), Seitenmaße und Ränder, Ausrichtung, Einzüge, Zeilen- und
// Absatzabstände, Tabulatorhalte, Auszeichnungen, ein Seitenumbruch sowie
// eine Kopfzeile mit Bild und eine Fußzeile. Die vorhandenen Fixtures sind
// bewusst nackt (`anschreiben.docx` hat weder `styles.xml` noch `sectPr`) —
// sie prüfen das Textmodell, nicht die Form.
{
  const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>
`

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
`

  // Das Logo hängt an der Kopfzeile, nicht am Hauptdokument — genau wie in
  // einem echten Briefkopf. Es steht deshalb in *deren* Beziehungsdatei.
  const headerRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>
</Relationships>
`

  // Fließtext 11 pt in der Designschrift, Überschriften in der zweiten.
  // „Betreff" erbt über w:basedOn von „Standard" und setzt nur den Fettdruck
  // — damit prüfbar ist, dass die Vorlagenkette von der Wurzel abwärts wirkt.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>
      <w:sz w:val="22"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="160" w:line="259" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Standard">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Betreff">
    <w:name w:val="Subject"/>
    <w:basedOn w:val="Standard"/>
    <w:pPr><w:spacing w:before="240" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Hervorhebung">
    <w:name w:val="Emphasis"/>
    <w:rPr><w:i/><w:color w:val="C00000"/></w:rPr>
  </w:style>
</w:styles>
`

  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Testdesign">
  <a:themeElements>
    <a:fontScheme name="Testschriften">
      <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>
`

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W_NS}>
  <w:defaultTabStop w:val="709"/>
</w:settings>
`

  const body = [
    // Rechtsbündiges Datum über einen rechten Tabulatorhalt am Satzspiegelrand.
    '    <w:p>',
    '      <w:pPr><w:tabs><w:tab w:val="right" w:pos="9070"/></w:tabs></w:pPr>',
    '      <w:r><w:t>Musterstadt,</w:t><w:tab/><w:t>13. August 2026</w:t></w:r>',
    '    </w:p>',
    '    <w:p><w:pPr><w:pStyle w:val="Betreff"/></w:pPr><w:r><w:t>Bewerbung als Softwareentwicklerin</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Sehr geehrte Damen und Herren,</w:t></w:r></w:p>',
    // Blocksatz mit hängendem Einzug, darin fett und eine Zeichenvorlage.
    '    <w:p>',
    '      <w:pPr><w:jc w:val="both"/><w:ind w:left="567" w:hanging="284"/><w:spacing w:before="120" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>',
    '      <w:r><w:t xml:space="preserve">ich bewerbe mich um die ausgeschriebene Stelle und bringe </w:t></w:r>',
    '      <w:r><w:rPr><w:b/></w:rPr><w:t>fünf Jahre Erfahrung</w:t></w:r>',
    '      <w:r><w:t xml:space="preserve"> mit. Besonders reizt mich </w:t></w:r>',
    '      <w:r><w:rPr><w:rStyle w:val="Hervorhebung"/></w:rPr><w:t>Ihr Produkt</w:t></w:r>',
    '      <w:r><w:t>.</w:t></w:r>',
    '    </w:p>',
    // Zentriert, unterstrichen, mit weicher Zeilenschaltung.
    '    <w:p>',
    '      <w:pPr><w:jc w:val="center"/></w:pPr>',
    '      <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Anlagen</w:t></w:r>',
    '      <w:r><w:br/><w:t>Lebenslauf, Zeugnisse</w:t></w:r>',
    '    </w:p>',
    // Harter Seitenumbruch: derselbe w:br, aber mit w:type="page".
    '    <w:p><w:r><w:br w:type="page"/><w:t>Zweite Seite</w:t></w:r></w:p>',
    '    <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Dritte Seite</w:t></w:r></w:p>',
    '    <w:p><w:r><w:t>Mit freundlichen Grüßen</w:t></w:r></w:p>',
    '    <w:sectPr>',
    '      <w:headerReference w:type="default" r:id="rIdHeader" ' + R_NS + '/>',
    '      <w:footerReference w:type="default" r:id="rIdFooter" ' + R_NS + '/>',
    '      <w:pgSz w:w="11906" w:h="16838"/>',
    '      <w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1701" w:header="708" w:footer="708"/>',
    '    </w:sectPr>',
  ].join('\n')

  // Ein Briefkopf, wie er üblich ist: Logo rechts, Absender darunter.
  // 3 cm × 1 cm in EMU (914400 je Zoll).
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W_NS} ${R_NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:drawing>
    <wp:inline><wp:extent cx="1080000" cy="360000"/>
      <a:graphic><a:graphicData><a:blip r:embed="rIdLogo"/></a:graphicData></a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>
  <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Erika Mustermann · Musterweg 1 · 12345 Musterstadt</w:t></w:r></w:p>
</w:hdr>
`

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W_NS}>
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="808080"/></w:rPr><w:t>erika@example.org</w:t></w:r></w:p>
</w:ftr>
`

  writeDocx('anschreiben-formatiert.docx', {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXml(body),
    'word/_rels/document.xml.rels': documentRels,
    'word/styles.xml': styles,
    'word/settings.xml': settings,
    'word/theme/theme1.xml': theme,
    'word/header1.xml': header,
    'word/_rels/header1.xml.rels': headerRels,
    'word/footer1.xml': footer,
    'word/media/logo.png': pngFixture(),
  })
}

/**
 * Ein winziges PNG (6 × 3 Bildpunkte, waagerechter Verlauf) als Briefkopflogo.
 *
 * Von Hand erzeugt statt heruntergeladen (G2) und ohne Bildbibliothek (G9):
 * Ein PNG ist eine Signatur, drei Blöcke und eine zlib-gepackte Bildzeile je
 * Zeile mit vorangestelltem Filterbyte — `zlibSync` aus fflate, das ohnehin
 * für die Zip-Dateien gebraucht wird, erledigt den Rest.
 */
// --- Fixture 6: schwebende Objekte und Symbolschrift ---
// Der Nachbau eines echten Anschreibens, das aus einer PDF-Umwandlung kam:
// Empfängeranschrift in einem Textfeld, Linie unter dem Briefkopf,
// eingescannte Unterschrift — alle drei schwebend, also mit `wp:anchor` an
// einer Blattkoordinate statt im Textfluss. Dazu ein Wingdings-Trenner in
// der Kontaktzeile und ein Wort, das über zwei `w:t`-Läufe verteilt ist.
// Verbraucht von layout.test.ts, write.test.ts und format.test.ts.
{
  const NAMESPACES = [
    W_NS,
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    'xmlns:v="urn:schemas-microsoft-com:vml"',
  ].join(' ')

  // Textfeld mit der Empfängeranschrift, an der Blattkoordinate 70/200 pt.
  const addressBox = [
    '<mc:AlternateContent><mc:Choice Requires="wps">',
    '<w:drawing><wp:anchor>',
    '<wp:positionH relativeFrom="page"><wp:posOffset>889000</wp:posOffset></wp:positionH>',
    '<wp:positionV relativeFrom="page"><wp:posOffset>2540000</wp:posOffset></wp:positionV>',
    '<wp:extent cx="2360930" cy="1404620"/>',
    '<a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>',
    '<w:p><w:r><w:t>Musterwerk GmbH</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Musterstraße 8</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>10827 Berlin</w:t></w:r></w:p>',
    '</w:txbxContent></wps:txbx>',
    '<wps:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>',
    '</wps:wsp></a:graphicData></a:graphic>',
    '</wp:anchor></w:drawing>',
    '</mc:Choice><mc:Fallback>',
    // Dieselbe Anschrift noch einmal als VML. Wer beide liest, setzt sie
    // doppelt — genau das prüft format.test.ts.
    '<w:pict><v:shape style="position:absolute;margin-left:70pt;margin-top:200pt;width:186pt;height:110pt">',
    '<v:textbox><w:txbxContent><w:p><w:r><w:t>Musterwerk GmbH</w:t></w:r></w:p></w:txbxContent></v:textbox>',
    '</v:shape></w:pict>',
    '</mc:Fallback></mc:AlternateContent>',
  ].join('')

  // Linie unter dem Briefkopf: Höhe null, sichtbar nur durch ihre Stärke.
  const rule = [
    '<w:drawing><wp:anchor>',
    '<wp:positionH relativeFrom="page"><wp:posOffset>863600</wp:posOffset></wp:positionH>',
    '<wp:positionV relativeFrom="page"><wp:posOffset>1619250</wp:posOffset></wp:positionV>',
    '<wp:extent cx="5753100" cy="0"/>',
    '<a:graphic><a:graphicData><wps:wsp><wps:spPr>',
    '<a:ln w="8508"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
    '</wps:spPr></wps:wsp></a:graphicData></a:graphic>',
    '</wp:anchor></w:drawing>',
  ].join('')

  // Unterschrift, am Absatz der Grußformel hängend.
  const signature = [
    '<w:drawing><wp:anchor>',
    '<wp:positionH relativeFrom="page"><wp:posOffset>882650</wp:posOffset></wp:positionH>',
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>132558</wp:posOffset></wp:positionV>',
    '<wp:extent cx="1123950" cy="578484"/>',
    '<a:graphic><a:graphicData><a:blip r:embed="rIdImage"/></a:graphicData></a:graphic>',
    '</wp:anchor></w:drawing>',
  ].join('')

  const body = [
    '    <w:p><w:r><w:t>Erika Mustermann</w:t></w:r></w:p>',
    // Wingdings als Trenner — im PDF muss daraus ein Aufzählungspunkt werden.
    '    <w:p><w:r><w:t xml:space="preserve">Musterstraße 1 </w:t></w:r>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings"/></w:rPr><w:t></w:t></w:r>' +
      '<w:r><w:t xml:space="preserve"> 10827 Berlin</w:t></w:r></w:p>',
    `    <w:p><w:r>${rule}</w:r></w:p>`,
    `    <w:p><w:r>${addressBox}</w:r></w:p>`,
    '    <w:p><w:r><w:t>Sehr geehrte Damen und Herren,</w:t></w:r></w:p>',
    // „meine" über zwei Läufe: hier darf nicht umbrochen werden.
    '    <w:p><w:r><w:t xml:space="preserve">Ich würde mich freuen, Ihr Team durch mei</w:t></w:r>' +
      '<w:r><w:t>ne Mitarbeit zu unterstützen.</w:t></w:r></w:p>',
    `    <w:p><w:r><w:t>Mit freundlichen Grüßen</w:t></w:r><w:r>${signature}</w:r></w:p>`,
  ].join('\n')

  const documentXmlWithNamespaces = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NAMESPACES}>
  <w:body>
${body}
  </w:body>
</w:document>
`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/unterschrift.png"/>
</Relationships>
`

  writeDocx('anschreiben-schwebend.docx', {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': PACKAGE_RELS,
    'word/document.xml': documentXmlWithNamespaces,
    'word/_rels/document.xml.rels': documentRels,
    'word/media/unterschrift.png': pngFixture(),
  })
}

function pngFixture() {
  const width = 6
  const height = 3
  const raw = new Uint8Array(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3)
    raw[row] = 0 // Filter „None"
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3
      raw[at] = Math.round((x / (width - 1)) * 255)
      raw[at + 1] = 60
      raw[at + 2] = 120
    }
  }

  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // 8 Bit je Kanal
  ihdr[9] = 2 // Farbtyp „Echtfarben", ohne Alphakanal

  const chunks = [
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return concat([signature, ...chunks])
}

function chunk(type, data) {
  const bytes = new Uint8Array(12 + data.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index)
  bytes.set(data, 8)
  view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)))
  return bytes
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}
