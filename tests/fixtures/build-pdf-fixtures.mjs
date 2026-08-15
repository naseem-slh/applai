#!/usr/bin/env node
// Erzeugt die `.pdf`-Testfixtures unter `tests/fixtures/` aus handgeschriebener
// PDF-Syntax (%PDF-1.4, Katalog, Seitenbaum, Type1-Basisschriften). Bewusst
// kein LibreOffice (in dieser Umgebung nicht verfügbar) und kein Download
// (G2) — Textinhalt, Position und Schriftgröße jedes Elements müssen exakt
// bekannt sein, damit extract.test.ts / toDocx.test.ts sie prüfen können.
// Zum Neuerzeugen: `node tests/fixtures/build-pdf-fixtures.mjs`.
//
// Die Dateien verzichten bewusst auf eine echte Kreuzverweistabelle (xref):
// pdf.js baut sie beim Lesen ohnehin per Objekt-Scan neu auf ("Indexing all
// PDF objects", geprüft), das spart hier fehleranfällige Byte-Offset-
// Buchführung von Hand.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(fileURLToPath(import.meta.url))

// A4 in PDF-Punkten (1/72 Zoll), gerundet — wie die übrigen Fixtures im
// Projekt orientieren sich Maße an einem realen deutschen Lebenslauf.
const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842

// WinAnsiEncoding-Bytewert für "•" (U+2022) außerhalb des ASCII-Bereichs.
// Ohne explizite `/Encoding` einigen sich Schriftart und Leser nicht
// zwangsläufig auf dieselbe Zuordnung — mit `/WinAnsiEncoding` decodiert
// pdf.js Byte 0x95 zuverlässig zu "•", geprüft per Probelauf gegen
// pdfjs-dist. Die übrigen Stichpunktmarker ("-", "–", "*") sind
// ASCII-Zeichen (bzw. werden in toDocx.test.ts direkt an konstruierten
// PdfItem-Objekten geprüft, ohne den Umweg über eine PDF-Byte-Kodierung).
const BULLET_CHAR = '\x95' // •

/**
 * Baut die Bytes einer mehrseitigen PDF-Datei.
 *
 * @param {Array<{ texts: Array<{ font: 'Helvetica' | 'Helvetica-Bold', size: number, x: number, y: number, text: string }> }>} pages
 */
function buildPdf(pages) {
  const objects = [] // 1-indiziert; objects[0] bleibt ungenutzt.
  let nextObjectNumber = 1
  const allocate = () => nextObjectNumber++

  const catalogNumber = allocate()
  const pagesNumber = allocate()

  const fontNumberByBaseFont = new Map()
  function fontObjectNumber(baseFont) {
    if (!fontNumberByBaseFont.has(baseFont)) {
      const number = allocate()
      objects[number] = `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`
      fontNumberByBaseFont.set(baseFont, number)
    }
    return fontNumberByBaseFont.get(baseFont)
  }

  const pageNumbers = []
  for (const page of pages) {
    const pageNumber = allocate()
    const contentNumber = allocate()
    pageNumbers.push(pageNumber)

    const fontsOnPage = [...new Set(page.texts.map((t) => t.font))]
    const aliasByFont = new Map(fontsOnPage.map((font, index) => [font, `F${index + 1}`]))
    const fontResourceEntries = fontsOnPage.map((font) => `/${aliasByFont.get(font)} ${fontObjectNumber(font)} 0 R`).join(' ')

    const contentStream =
      page.texts
        .map((t) => `BT /${aliasByFont.get(t.font)} ${t.size} Tf ${t.x} ${t.y} Td (${escapePdfString(t.text)}) Tj ET`)
        .join('\n') + '\n'
    // latin1: Bytewerte 0x00–0xFF werden 1:1 übernommen (wichtig für
    // BULLET_CHAR, siehe oben) — bei 'utf8' würde dieses Zeichen in eine
    // Mehrbyte-Sequenz zerlegt und der WinAnsi-Bytewert stimmte nicht mehr.
    const contentBytes = Buffer.from(contentStream, 'latin1')
    objects[contentNumber] = `<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream`

    objects[pageNumber] =
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << ${fontResourceEntries} >> >> /Contents ${contentNumber} 0 R >>`
  }

  objects[catalogNumber] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`
  objects[pagesNumber] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`

  let body = '%PDF-1.4\n'
  for (let number = 1; number < objects.length; number++) {
    if (objects[number] === undefined) continue
    body += `${number} 0 obj\n${objects[number]}\nendobj\n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root ${catalogNumber} 0 R >>\n%%EOF`
  return Buffer.from(body, 'latin1')
}

// Runde Klammern und Backslashes müssen in PDF-Literal-Strings maskiert
// werden — keine der Fixtures unten braucht das aktuell, die Funktion steht
// trotzdem hier, damit ein künftiger Fixture-Text nicht still falsch würde.
function escapePdfString(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

// --- Verschlüsselung (Standard Security Handler, RC4 40-bit, V=1/R=2) ---
//
// Für die Fixture "verschluesselt.pdf": Sie muss echte, von pdf.js als
// verschlüsselt erkannte PDF-Bytes enthalten, nicht nur einen `/Encrypt`-
// Schlüssel ohne funktionierende Kryptografie — sonst wäre der Test, den sie
// stützt (extractPdf lehnt passwortgeschützte PDFs sofort mit einer klaren
// Meldung ab, statt zu hängen), gegen eine Attrappe geschrieben. Node bringt
// zwar MD5 mit (`node:crypto`), aber keinen RC4-Cipher mehr (in dieser
// Umgebung standardmäßig deaktiviert — `createCipheriv('rc4', …)` wirft
// "unsupported"), deshalb RC4 hier von Hand: Es ist nur eine
// Schlüsselplanung (KSA) und ein Pseudozufallsgenerator (PRGA), keine 20
// Zeilen. Gegen den offiziellen RC4-Testvektor geprüft
// (Schlüssel "Key", Klartext "Plaintext" → BBF316E8D940AF0AD3).
//
// Die Ableitung folgt ISO 32000-1, Abschnitt 7.6.3, in der einfachsten
// Ausprägung (Revision 2, 40-Bit-Schlüssel — keine 50 zusätzlichen
// MD5-Runden, kein AES): Algorithmus 2 (Dateischlüssel), Algorithmus 3
// (O-Wert), Algorithmus 4 (U-Wert, Revision 2), Algorithmus 1
// (Objektschlüssel für die Inhaltsstrom-Verschlüsselung).
function rc4(keyBytes, dataBytes) {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff
    ;[S[i], S[j]] = [S[j], S[i]]
  }
  const out = new Uint8Array(dataBytes.length)
  let i = 0
  j = 0
  for (let k = 0; k < dataBytes.length; k++) {
    i = (i + 1) & 0xff
    j = (j + S[i]) & 0xff
    ;[S[i], S[j]] = [S[j], S[i]]
    out[k] = dataBytes[k] ^ S[(S[i] + S[j]) & 0xff]
  }
  return Buffer.from(out)
}

// Die in der PDF-Spezifikation fest vorgegebene 32-Byte-Auffüllfolge, mit
// der ein Kennwort auf genau 32 Byte gebracht wird (Algorithmus 2, Schritt a).
const PDF_PASSWORD_PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00,
  0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
])

// 40 Bit = 5 Byte — die kürzeste, älteste Schlüssellänge (V=1/R=2), damit
// diese Fixture ohne die zusätzlichen 50 MD5-Runden von Revision 3+ auskommt.
const ENCRYPTION_KEY_LENGTH_BYTES = 5

function padPdfPassword(password) {
  const passwordBytes = Buffer.from(password, 'latin1')
  const padded = Buffer.alloc(32)
  const n = Math.min(passwordBytes.length, 32)
  passwordBytes.copy(padded, 0, 0, n)
  PDF_PASSWORD_PAD.copy(padded, n, 0, 32 - n)
  return padded
}

function md5(...buffers) {
  const hash = createHash('md5')
  for (const buffer of buffers) hash.update(buffer)
  return hash.digest()
}

// Algorithmus 3: der O-Wert (Owner-Passwort verschlüsselt das aufgefüllte
// User-Passwort mit einem aus dem Owner-Passwort abgeleiteten RC4-Schlüssel).
function computeOwnerValue(ownerPassword, userPassword) {
  const key = md5(padPdfPassword(ownerPassword)).subarray(0, ENCRYPTION_KEY_LENGTH_BYTES)
  return rc4(key, padPdfPassword(userPassword))
}

// Algorithmus 2: der Dateischlüssel, aus User-Passwort, O-Wert,
// Zugriffsrechten (P, 4 Byte little-endian) und der ersten Datei-ID.
function computeFileKey(userPassword, ownerValue, permissions, fileId) {
  const permissionBytes = Buffer.alloc(4)
  permissionBytes.writeInt32LE(permissions, 0)
  return md5(padPdfPassword(userPassword), ownerValue, permissionBytes, fileId).subarray(0, ENCRYPTION_KEY_LENGTH_BYTES)
}

// Algorithmus 4 (Revision 2): der U-Wert — die Auffüllfolge selbst, mit dem
// Dateischlüssel verschlüsselt. Ein Leser prüft ein eingegebenes Kennwort,
// indem er denselben Wert mit dem daraus abgeleiteten Schlüssel neu berechnet
// und vergleicht.
function computeUserValue(fileKey) {
  return rc4(fileKey, PDF_PASSWORD_PAD)
}

// Algorithmus 1: der Schlüssel für ein einzelnes Objekt (hier: den
// Inhaltsstrom) — der Dateischlüssel, erweitert um Objekt- und
// Generationsnummer und erneut durch MD5 geführt.
function computeObjectKey(fileKey, objectNumber, generationNumber) {
  const extra = Buffer.from([
    objectNumber & 0xff,
    (objectNumber >> 8) & 0xff,
    (objectNumber >> 16) & 0xff,
    generationNumber & 0xff,
    (generationNumber >> 8) & 0xff,
  ])
  return md5(fileKey, extra).subarray(0, Math.min(fileKey.length + 5, 16))
}

/**
 * Baut ein einseitiges, mit einem User-Kennwort geschütztes PDF (RC4
 * 40-Bit, V=1/R=2) — anders als `buildPdf` mit fest zugeordneten
 * Objektnummern, weil die Verschlüsselung Objektnummer und Generation des
 * Inhaltsstroms kennen muss, um seinen Objektschlüssel abzuleiten.
 *
 * @param {{ userPassword: string, ownerPassword: string, text: string }} options
 */
function buildEncryptedPdf({ userPassword, ownerPassword, text }) {
  // Objektnummern: 1 Katalog, 2 Seitenbaum, 3 Seite, 4 Schriftart,
  // 5 Inhaltsstrom, 6 Verschlüsselungswörterbuch.
  const CONTENT_OBJECT_NUMBER = 5
  const GENERATION_NUMBER = 0
  // Feste Datei-ID (16 Byte) statt einer echten Zufallsfolge — reproduzierbare
  // Fixture-Bytes, wie bei den anderen Fixtures im Projekt (siehe
  // FIXED_MTIME in build-fixtures.mjs).
  const fileId = Buffer.from('Applai PDF Test', 'latin1')
  // Alle Bits gesetzt: keine der (hier ohnehin nicht durchgesetzten)
  // Beschränkungen ist für die Fixture von Bedeutung, nur der Wert muss
  // zwischen /P im Wörterbuch und der Schlüsselableitung übereinstimmen.
  const permissions = -1

  const ownerValue = computeOwnerValue(ownerPassword, userPassword)
  const fileKey = computeFileKey(userPassword, ownerValue, permissions, fileId)
  const userValue = computeUserValue(fileKey)

  const contentPlain = Buffer.from(`BT /F1 11 Tf 72 720 Td (${escapePdfString(text)}) Tj ET\n`, 'latin1')
  const contentEncrypted = rc4(computeObjectKey(fileKey, CONTENT_OBJECT_NUMBER, GENERATION_NUMBER), contentPlain)

  const objects = []
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objects[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
    `/Resources << /Font << /F1 4 0 R >> >> /Contents ${CONTENT_OBJECT_NUMBER} 0 R >>`
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  objects[CONTENT_OBJECT_NUMBER] = `<< /Length ${contentEncrypted.length} >>\nstream\n${contentEncrypted.toString('latin1')}\nendstream`
  objects[6] =
    `<< /Filter /Standard /V 1 /R 2 /O <${ownerValue.toString('hex')}> /U <${userValue.toString('hex')}> /P ${permissions} >>`

  let body = '%PDF-1.4\n'
  for (let number = 1; number < objects.length; number++) {
    body += `${number} 0 obj\n${objects[number]}\nendobj\n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Encrypt 6 0 R /ID [<${fileId.toString('hex')}> <${fileId.toString('hex')}>] >>\n%%EOF`
  return Buffer.from(body, 'latin1')
}

function writePdf(fileName, pages) {
  writeRawPdf(fileName, buildPdf(pages))
}

function writeRawPdf(fileName, bytes) {
  writeFileSync(join(fixturesDir, fileName), bytes)
  console.log(`geschrieben: ${fileName}`)
}

// --- Fixture (a): einspaltiger Lebenslauf ---
// Deckt beide Überschrift-Heuristiken ab (großer Name: über dem
// Größen-Schwellwert; Abschnittsüberschriften: fett, aber mit 13 pt unter
// dem Schwellwert), einen über drei Zeilen umbrochenen Absatz (kleiner,
// regelmäßiger Zeilenabstand von 14 pt), einen bewussten Absatzwechsel
// (26 pt Abstand, > 1,5× der 14-pt-Grundlinie) und je einen Stichpunkt mit
// "•" und mit "-". Alle Elemente stehen bei x=72 (eine Spalte) — Gegenstück
// zu Fixture (b) für detectMultiColumn.
{
  const HEADING = 'Helvetica-Bold'
  const BODY = 'Helvetica'
  writePdf('lebenslauf.pdf', [
    {
      texts: [
        { font: HEADING, size: 22, x: 72, y: 780, text: 'Anna Beispiel' },
        { font: HEADING, size: 13, x: 72, y: 750, text: 'Berufserfahrung' },
        { font: BODY, size: 11, x: 72, y: 730, text: 'Mehrjaehrige Erfahrung in der Webentwicklung mit Fokus auf' },
        { font: BODY, size: 11, x: 72, y: 716, text: 'moderne Frontend-Frameworks, agile Teams sowie kontinuierliche' },
        { font: BODY, size: 11, x: 72, y: 702, text: 'Qualitaetssicherung in produktiven Umgebungen.' },
        { font: BODY, size: 11, x: 72, y: 676, text: 'Zustaendig fuer Konzeption und Umsetzung neuer Module.' },
        { font: HEADING, size: 13, x: 72, y: 646, text: 'Kernkompetenzen' },
        { font: BODY, size: 11, x: 72, y: 626, text: `${BULLET_CHAR} Bullet mit Punktzeichen` },
        { font: BODY, size: 11, x: 72, y: 610, text: '- Bullet mit Bindestrich' },
      ],
    },
  ])
}

// --- Fixture (b): zweispaltige Seite ---
// Zwei x-Bänder (72 und 320, Abstand 248 pt) mit je fünf Zeilen — Gegenstück
// zu Fixture (a) für detectMultiColumn (dort: false, hier: true). Der
// Lesereihenfolge wird hier bewusst kein Sinn unterstellt (siehe extract.ts:
// die "ehrliche" einspaltige Umwandlung liest zeilenweise über die ganze
// Breite, das ist bei echtem Zweispalten-Layout absichtlich Mus — dafür
// warnt detectMultiColumn).
{
  const BODY = 'Helvetica'
  const rows = [760, 740, 720, 700, 680]
  const texts = []
  rows.forEach((y, index) => {
    const n = index + 1
    texts.push({ font: BODY, size: 11, x: 72, y, text: `Linke Spalte Zeile ${n}` })
    texts.push({ font: BODY, size: 11, x: 320, y, text: `Rechte Spalte Zeile ${n}` })
  })
  writePdf('lebenslauf-zweispaltig.pdf', [{ texts }])
}

// --- Fixture (c): zweiseitiges Dokument ---
// Belegt die Seitenbehandlung: extractPdf muss zwei PdfPage-Einträge
// liefern, deren Elemente sich nicht vermischen; pdfToDocx muss den Inhalt
// beider Seiten übernehmen (mit Seitenumbruch vor dem ersten Absatz der
// zweiten Seite, siehe toDocx.test.ts). Die erste Zeile jeder Seite ist fett
// (Überschrift) statt einer zweiten Fließtextzeile: Mit nur einer
// Fließtextzeile je Seite gibt es keinen zweiten Zeilenabstand, an dem sich
// ein "üblicher" Absatzabstand ablesen ließe — diese Fixture soll allein die
// Seitenaufteilung prüfen, nicht das (in Fixture (a) bereits abgedeckte)
// Zusammenfassen mehrerer Fließtextzeilen zu einem Absatz.
{
  const HEADING = 'Helvetica-Bold'
  const BODY = 'Helvetica'
  writePdf('lebenslauf-zwei-seiten.pdf', [
    {
      texts: [
        { font: HEADING, size: 13, x: 72, y: 780, text: 'Erste Seite' },
        { font: BODY, size: 11, x: 72, y: 760, text: 'Text auf der ersten Seite.' },
      ],
    },
    {
      texts: [
        { font: HEADING, size: 13, x: 72, y: 780, text: 'Zweite Seite' },
        { font: BODY, size: 11, x: 72, y: 760, text: 'Text auf der zweiten Seite.' },
      ],
    },
  ])
}

// --- Fixture (d): passwortgeschütztes PDF ---
// Belegt, dass extractPdf ein Kennwort verlangendes PDF sofort mit einer
// klaren Meldung ablehnt statt endlos zu warten (siehe extract.ts,
// loadingTask.onPassword, und extract.test.ts). Echte RC4-Verschlüsselung
// (siehe oben) — kein bloßes /Encrypt-Wörterbuch ohne Wirkung, sonst
// prüfte der Test nichts Reales. Mit dem passenden Kennwort ("geheim")
// lässt sie sich regulär lesen (siehe extract.test.ts) — das beweist, dass
// die Ablehnung tatsächlich am fehlenden Kennwort liegt, nicht an einer
// kaputten Datei.
{
  writeRawPdf(
    'verschluesselt.pdf',
    buildEncryptedPdf({
      userPassword: 'geheim',
      ownerPassword: 'geheim-owner',
      text: 'Geheimer Text',
    }),
  )
}
