// Lädt Fixtures per node:fs/promises von der Platte und läuft deshalb unter
// tsconfig.test.json (eigenes TS-Projekt mit 'node' in "types"), nicht unter
// tsconfig.app.json — siehe die ausführliche Begründung in
// src/lib/docx/parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectMultiColumn, extractPdf, groupItemsIntoLines, type PdfItem } from './extract'

// Fixtures liegen unter tests/fixtures/ (binäre Testdateien, siehe
// CLAUDE.md), erzeugt durch tests/fixtures/build-pdf-fixtures.mjs.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

async function loadFixture(fileName: string) {
  const buffer = await readFile(join(FIXTURES_DIR, fileName))
  // Node liefert einen Buffer; extractPdf erwartet einen echten ArrayBuffer.
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return extractPdf(arrayBuffer)
}

function item(text: string, x: number, y: number): PdfItem {
  return { text, x, y, fontSize: 11, fontName: 'Helvetica', bold: false }
}

describe('groupItemsIntoLines', () => {
  it('gruppiert Elemente mit y-Unterschied bis 2 pt zu einer Zeile und sortiert sie nach x', () => {
    const items = [item('Welt', 40, 100.5), item('Hallo', 10, 99)]
    const lines = groupItemsIntoLines(items)

    expect(lines).toHaveLength(1)
    expect(lines[0]!.map((i) => i.text)).toEqual(['Hallo', 'Welt'])
  })

  it('trennt Elemente mit mehr als 2 pt y-Unterschied in eigene Zeilen', () => {
    const items = [item('Zeile eins', 72, 100), item('Zeile zwei', 72, 97)]
    const lines = groupItemsIntoLines(items)

    expect(lines).toHaveLength(2)
    expect(lines[0]!.map((i) => i.text)).toEqual(['Zeile eins'])
    expect(lines[1]!.map((i) => i.text)).toEqual(['Zeile zwei'])
  })

  it('sortiert Zeilen absteigend nach y (pdf.js: y wächst nach oben, erste Zeile der Seite zuerst)', () => {
    const items = [item('unten', 72, 100), item('oben', 72, 400)]
    const lines = groupItemsIntoLines(items)

    expect(lines.map((line) => line[0]!.text)).toEqual(['oben', 'unten'])
  })

  it('vergleicht mit dem ersten Element der Zeile, damit eine lange Zeile nicht schrittweise wegdriftet', () => {
    // 100, 98.5, 97: je zwei Nachbarn liegen innerhalb der Toleranz, aber
    // 100 und 97 nicht mehr (Unterschied 3 pt) — ohne Anker am ersten
    // Element würde diese Kette dennoch zu einer Zeile verschmelzen.
    const items = [item('a', 10, 100), item('b', 20, 98.5), item('c', 30, 97)]
    const lines = groupItemsIntoLines(items)

    expect(lines).toHaveLength(2)
    expect(lines[0]!.map((i) => i.text)).toEqual(['a', 'b'])
    expect(lines[1]!.map((i) => i.text)).toEqual(['c'])
  })
})

describe('extractPdf', () => {
  it('liest lebenslauf.pdf und liefert Seitenmaße sowie Text in Lesereihenfolge', async () => {
    const pages = await loadFixture('lebenslauf.pdf')

    expect(pages).toHaveLength(1)
    const [page] = pages
    expect(page!.width).toBe(595)
    expect(page!.height).toBe(842)

    expect(page!.items.map((i) => i.text)).toEqual([
      'Anna Beispiel',
      'Berufserfahrung',
      'Mehrjaehrige Erfahrung in der Webentwicklung mit Fokus auf',
      'moderne Frontend-Frameworks, agile Teams sowie kontinuierliche',
      'Qualitaetssicherung in produktiven Umgebungen.',
      'Zustaendig fuer Konzeption und Umsetzung neuer Module.',
      'Kernkompetenzen',
      '• Bullet mit Punktzeichen',
      '- Bullet mit Bindestrich',
    ])
  })

  it('erkennt fett gesetzte Überschriften und liefert die gesetzte Schriftgröße', async () => {
    const [page] = await loadFixture('lebenslauf.pdf')

    const name = page!.items[0]!
    expect(name.text).toBe('Anna Beispiel')
    expect(name.bold).toBe(true)
    expect(name.fontSize).toBe(22)
    expect(name.fontName).toBe('Helvetica-Bold')

    const section = page!.items[1]!
    expect(section.text).toBe('Berufserfahrung')
    expect(section.bold).toBe(true)
    expect(section.fontSize).toBe(13)

    const body = page!.items[2]!
    expect(body.bold).toBe(false)
    expect(body.fontSize).toBe(11)
    expect(body.fontName).toBe('Helvetica')
  })

  it('setzt x auf den Zeilenanfang, gleich für alle Zeilen einer einspaltigen Seite', async () => {
    const [page] = await loadFixture('lebenslauf.pdf')

    for (const pdfItem of page!.items) {
      expect(pdfItem.x).toBe(72)
    }
  })

  it('liefert zwei Seiten für ein zweiseitiges PDF, ohne dass sich der Text vermischt', async () => {
    const pages = await loadFixture('lebenslauf-zwei-seiten.pdf')

    expect(pages).toHaveLength(2)
    expect(pages[0]!.items.map((i) => i.text)).toEqual(['Erste Seite', 'Text auf der ersten Seite.'])
    expect(pages[1]!.items.map((i) => i.text)).toEqual(['Zweite Seite', 'Text auf der zweiten Seite.'])
  })

  it('verwirft rein leere und reine Leerzeichen-Elemente (pdf.js fügt Lücken zwischen weit auseinanderliegenden Textstücken derselben Zeile als eigenes Leerzeichen-Element ein)', async () => {
    const [page] = await loadFixture('lebenslauf-zweispaltig.pdf')

    // 5 Zeilen × 2 Spalten = 10 sichtbare Elemente; ohne den Filter kämen
    // 5 zusätzliche Leerzeichen-Elemente zwischen den Spalten hinzu (siehe
    // extract.ts, hasVisibleText).
    expect(page!.items).toHaveLength(10)
    for (const pdfItem of page!.items) {
      expect(pdfItem.text.trim()).not.toBe('')
    }
  })

  it('wirft bei einem ungültigen PDF eine aussagekräftige Fehlermeldung', async () => {
    const garbage = new TextEncoder().encode('Das ist kein PDF.').buffer as ArrayBuffer
    await expect(extractPdf(garbage)).rejects.toThrow()
  })
})

describe('detectMultiColumn', () => {
  it('ist false für eine einspaltige Seite (lebenslauf.pdf)', async () => {
    const [page] = await loadFixture('lebenslauf.pdf')
    expect(detectMultiColumn(page!)).toBe(false)
  })

  it('ist true für eine zweispaltige Seite mit x-Bändern bei 72 und 320 (lebenslauf-zweispaltig.pdf)', async () => {
    const [page] = await loadFixture('lebenslauf-zweispaltig.pdf')
    expect(detectMultiColumn(page!)).toBe(true)
  })

  it('ist false für eine leere Seite', () => {
    expect(detectMultiColumn({ items: [], width: 595, height: 842 })).toBe(false)
  })

  it('ist false, wenn eine zweite Häufung nur einen winzigen Anteil der Elemente trägt (keine echte Spalte)', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => item(`Zeile ${i}`, 72, 800 - i * 12)),
      // Eine einzelne verirrte Randnotiz weit rechts soll keine
      // Zweispaltigkeit vortäuschen (< COLUMN_MIN_SHARE).
      item('Seite 1', 500, 40),
    ]
    expect(detectMultiColumn({ items, width: 595, height: 842 })).toBe(false)
  })

  it('ist false, wenn zwei Häufungen zwar substanziell sind, ihr Abstand aber nur eine Einrückung ist', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`Zeile ${i}`, 72, 800 - i * 14)),
      ...Array.from({ length: 5 }, (_, i) => item(`Stichpunkt ${i}`, 90, 730 - i * 14)),
    ]
    expect(detectMultiColumn({ items, width: 595, height: 842 })).toBe(false)
  })
})
