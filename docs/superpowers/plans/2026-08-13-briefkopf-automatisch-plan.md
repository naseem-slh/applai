# Selbsttätiger Briefkopf — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der vorgeschlagene Briefkopf landet nach der Anzeigen-Analyse selbsttätig im Anschreiben, sichtbar hervorgehoben und mit einem Bericht „Alt → Neu", statt feldweise von Hand eingesetzt werden zu müssen.

**Architecture:** Ein reines Erkennungsmodul (`letterheadMatch.ts`) beantwortet deterministisch, **wo** die vier Briefkopffelder heute im Brief stehen; `suggestLetterhead` liefert unverändert, **was** dort hinsoll. Ein Adapter (`letterheadApply.ts`) führt beides zusammen, ersetzt von hinten nach vorn und liefert alles oder nichts. Die Arbeitsfläche bindet ihn einmal je Stellenanzeige ein und zeigt das Ergebnis in Kontur und Bericht.

**Tech Stack:** TypeScript (strict) · React 19 · Vitest + Testing Library · i18next · bestehende Bausteine `replaceRange`, `shiftMarks`, `findWholeWordOccurrences`, `useDocumentHistory`

Grundlage: [`docs/superpowers/specs/2026-08-13-briefkopf-automatisch-design.md`](../specs/2026-08-13-briefkopf-automatisch-design.md)

## Global Constraints

- **Kein Server, kein Backend** (G1). Alles läuft im Browser.
- **Keine neue Abhängigkeit.** Diese Arbeit kommt vollständig mit dem vorhandenen Bestand aus (G9).
- **Keine KI in der Erkennung.** Die Regeln sind deterministisch und ohne Modellaufruf.
- **Jeder sichtbare Text über i18next**, Schlüssel in `src/lib/i18n/locales/de.json` **und** `en.json` (G8). Keine hartkodierten Zeichenketten in der Oberfläche.
- **Sprache:** Code-Kommentare und Commit-Nachrichten deutsch, Bezeichner englisch.
- **Tests liegen neben dem Code**, den sie prüfen. Gemeinsam genutzte Attrappen tragen `*.testutils.ts`.
- **Kein Absatz wird angelegt oder entfernt.** `replaceRange` bekommt immer Ersatztext.
- **Kein Feld wird auf Verdacht überschrieben.** Was nicht sicher gefunden ist, bleibt beim Einsetzen-Knopf.
- **Nach jeder Aufgabe:** `npm run lint && npm run typecheck && npm test` — alle drei müssen sauber sein, die bestehenden 1289 Tests grün bleiben.

---

### Task 1: Erkennungsmodul `letterheadMatch.ts`

Beantwortet ausschließlich die Frage **wo**. Rein, ohne React, ohne DOM, ohne `docx`-Typen — damit ohne `.docx`-Fixture testbar.

**Files:**
- Create: `src/lib/domain/letterheadMatch.ts`
- Test: `src/lib/domain/letterheadMatch.test.ts`

**Interfaces:**
- Consumes: `findWholeWordOccurrences(text, phrase, caseInsensitive)` aus `src/lib/text/wholeWord.ts`, liefert `{ index: number; length: number }[]`
- Produces: `matchLetterhead(paragraphs, knownCompanies, currentCompany): LetterheadMatch[]`, dazu die Typen `LetterheadField`, `ParagraphSlice`, `LetterheadMatch`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Datei `src/lib/domain/letterheadMatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchLetterhead, type ParagraphSlice } from './letterheadMatch'

/**
 * Baut Absätze mit denselben Offsets, die `parseDocx` erzeugt: Der
 * Dokumenttext verbindet die Absätze mit `\n`, und dieses Trennzeichen
 * gehört zu keinem der beiden angrenzenden Bereiche.
 */
function slices(...texts: string[]): ParagraphSlice[] {
  let start = 0
  return texts.map((text, index) => {
    const slice: ParagraphSlice = { index, text, start, end: start + text.length }
    start += text.length + 1
    return slice
  })
}

const BRIEF_DE = slices(
  'Alte Muster GmbH',
  'Musterstraße 12',
  '10115 Berlin',
  '',
  'Berlin, 14.03.2026',
  '',
  'Bewerbung als Disponentin',
  '',
  'Sehr geehrte Frau Klein,',
  '',
  'mit großem Interesse habe ich Ihre Bewerbung um Aufmerksamkeit gelesen.',
  'Bewerbung ist für mich mehr als ein Wort — 12.08.2020 begann meine Laufbahn.',
)

describe('matchLetterhead', () => {
  it('findet alle vier Felder im deutschen Brief', () => {
    const matches = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(matches.map((match) => match.field)).toEqual(['recipient', 'date', 'subject', 'salutation'])
  })

  it('ersetzt beim Datum nur die Datumsstelle, nicht den Ortszusatz', () => {
    const [, date] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(date?.previous).toBe('14.03.2026')
    expect(date?.paragraph).toBe(4)
  })

  it('ersetzt beim Empfänger nur den Firmennamen, nicht die Anschrift', () => {
    const [recipient] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(recipient?.previous).toBe('Alte Muster GmbH')
    expect(recipient?.range).toEqual({ from: 0, to: 'Alte Muster GmbH'.length })
  })

  it('nimmt „Bewerbung" aus dem Fließtext nicht für den Betreff', () => {
    const [, , subject] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(subject?.paragraph).toBe(6)
  })

  it('nimmt ein Datum unterhalb der Anrede nicht für das Briefdatum', () => {
    const ohneKopfdatum = slices('Sehr geehrte Damen und Herren,', '', 'Seit 12.08.2020 arbeite ich dort.')

    const matches = matchLetterhead(ohneKopfdatum, [], null)

    expect(matches.map((match) => match.field)).toEqual(['salutation'])
  })

  it('findet Anrede, Datum und Betreff im englischen Brief', () => {
    const brief = slices('August 12, 2026', '', 'Application for Dispatcher', '', 'Dear Ms. Connolly,')

    const matches = matchLetterhead(brief, [], null)

    expect(matches.map((match) => match.field)).toEqual(['date', 'subject', 'salutation'])
  })

  it('findet ohne bekannte Firmen keinen Empfänger', () => {
    const matches = matchLetterhead(BRIEF_DE, [], null)

    expect(matches.some((match) => match.field === 'recipient')).toBe(false)
  })

  it('schließt die aktuelle Firma von der Empfängersuche aus', () => {
    const matches = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'alte muster gmbh')

    expect(matches.some((match) => match.field === 'recipient')).toBe(false)
  })

  it('nimmt bei mehreren bekannten Firmen den obersten Absatz', () => {
    const brief = slices('Alte Muster GmbH', 'Zweite Firma AG', '', 'Sehr geehrte Damen und Herren,')

    const [recipient] = matchLetterhead(brief, ['Zweite Firma AG', 'Alte Muster GmbH'], null)

    expect(recipient?.paragraph).toBe(0)
  })

  it('sucht ohne Anrede nur in den ersten 15 Absätzen', () => {
    const lang = slices(...Array.from({ length: 20 }, (_, index) => `Absatz ${index}`), '01.01.2026')

    expect(matchLetterhead(lang, [], null)).toEqual([])
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/lib/domain/letterheadMatch.test.ts`
Erwartet: FAIL — „Failed to resolve import ./letterheadMatch"

- [ ] **Step 3: Das Modul schreiben**

Datei `src/lib/domain/letterheadMatch.ts`:

```ts
import { findWholeWordOccurrences } from '../text/wholeWord'

/**
 * Wo die vier Briefkopffelder im vorliegenden Brief heute stehen — die
 * Frage **wo**, nicht die Frage **was**. Was dort hinsoll, liefert
 * unverändert `suggestLetterhead` in `letterhead.ts`.
 *
 * `LetterheadPanel.tsx` begründet, warum der Briefkopf ursprünglich von Hand
 * eingesetzt wurde: Wer die Stelle automatisch sucht, rät, und wer beim
 * Raten danebenliegt, überschreibt eine falsche Zeile. Dieses Modul greift
 * die Begründung nicht an, sondern grenzt sie ein — es findet nur, was an
 * einer Formel erkennbar ist, und schweigt sonst. Ein Feld ohne Treffer
 * bleibt beim Einsetzen-Knopf.
 *
 * Die tragende Absicherung ist das **Suchfenster**: gesucht wird
 * ausschließlich oberhalb und einschließlich der Anrede. Ohne diese Grenze
 * könnte ein „Bewerbung" im Fließtext als Betreff durchgehen oder ein Datum
 * aus der Berufserfahrung als Briefdatum.
 */

export type LetterheadField = 'recipient' | 'date' | 'subject' | 'salutation'

/**
 * Die strukturelle Teilmenge von `Paragraph` (`src/lib/docx/model.ts`), die
 * diese Erkennung braucht. Bewusst nicht `Paragraph` selbst: So bleibt das
 * Modul frei von `docx`- und DOM-Typen und ohne Fixture testbar. Ein
 * `Paragraph` ist strukturell zuweisbar.
 */
export interface ParagraphSlice {
  index: number
  text: string
  start: number
  end: number
}

export interface LetterheadMatch {
  field: LetterheadField
  /** Bereich im Dokumenttext, Ende exklusiv. */
  range: { from: number; to: number }
  paragraph: number
  /** Was dort heute steht — für den Bericht „Alt → Neu". */
  previous: string
}

/**
 * Kleingeschrieben verglichen. „Sehr geehrte" ist Präfix von „Sehr
 * geehrter"; beide getrennt aufzuführen schadet nicht und macht die Liste
 * lesbar.
 */
const SALUTATION_OPENERS: readonly string[] = [
  'sehr geehrte',
  'sehr geehrter',
  'sehr geehrtes',
  'liebe',
  'lieber',
  'guten tag',
  'hallo',
  'dear',
  'to whom it may concern',
]

const SUBJECT_OPENERS: readonly string[] = ['bewerbung', 'betreff', 'application', 're:']

const MONTHS_DE = 'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember'
const MONTHS_EN =
  'January|February|March|April|May|June|July|August|September|October|November|December'

/**
 * Die ausgeschriebenen Formen nennen die Monatsnamen ausdrücklich, statt
 * ein beliebiges Wort zwischen Zahlen zuzulassen — „12. Jahre 2026" ist
 * kein Datum.
 */
const DATE_PATTERNS: readonly RegExp[] = [
  /\d{1,2}\.\s?\d{1,2}\.\s?\d{4}/u,
  new RegExp(`\\d{1,2}\\.\\s?(?:${MONTHS_DE})\\s+\\d{4}`, 'u'),
  new RegExp(`(?:${MONTHS_EN})\\s+\\d{1,2},\\s?\\d{4}`, 'u'),
  /\d{4}-\d{2}-\d{2}/u,
]

/** Ohne erkannte Anrede gilt diese Zahl Absätze als Briefkopfbereich. */
const FALLBACK_WINDOW = 15

/** Bis hierhin darf die Anrede stehen; darunter ist sie Fließtext. */
const SALUTATION_WINDOW = 25

/**
 * Wie viel neben dem Datum im selben Absatz stehen darf. Ein Ortszusatz
 * („Berlin, ") passt, ein ganzer Satz mit einer Jahreszahl nicht.
 */
const DATE_CONTEXT_LIMIT = 40

const PRIORITY: readonly LetterheadField[] = ['salutation', 'date', 'subject', 'recipient']

function wholeParagraph(field: LetterheadField, paragraph: ParagraphSlice): LetterheadMatch {
  return {
    field,
    range: { from: paragraph.start, to: paragraph.end },
    paragraph: paragraph.index,
    previous: paragraph.text,
  }
}

function findSalutation(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs.slice(0, SALUTATION_WINDOW)) {
    const lower = paragraph.text.trim().toLowerCase()
    if (lower === '') continue
    if (!SALUTATION_OPENERS.some((opener) => lower.startsWith(opener))) continue
    return wholeParagraph('salutation', paragraph)
  }
  return null
}

function findSubject(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs) {
    const lower = paragraph.text.trim().toLowerCase()
    if (lower === '') continue
    if (!SUBJECT_OPENERS.some((opener) => lower.startsWith(opener))) continue
    return wholeParagraph('subject', paragraph)
  }
  return null
}

/**
 * Ersetzt wird **nur die Datumsstelle**, nicht der Absatz: Ein Ortspräfix
 * wie „Berlin, " muss stehen bleiben.
 */
function findDate(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs) {
    for (const pattern of DATE_PATTERNS) {
      const found = pattern.exec(paragraph.text)
      if (found === null) continue
      if (paragraph.text.trim().length - found[0].length > DATE_CONTEXT_LIMIT) continue
      return {
        field: 'date',
        range: { from: paragraph.start + found.index, to: paragraph.start + found.index + found[0].length },
        paragraph: paragraph.index,
        previous: found[0],
      }
    }
  }
  return null
}

/**
 * Der Anker ist der Firmenname einer früheren Bewerbung — dieselbe Suche,
 * die auch die Fremdfirmen-Warnung benutzt. Ersetzt wird nur der Name, damit
 * eine mehrzeilige Anschrift nicht verschwindet. Dass Straße und
 * Postleitzahl der alten Firma dann stehen bleiben, ist beabsichtigt und für
 * den Nutzer sichtbar: Genau dafür gibt es den Bericht.
 *
 * Es gewinnt der **oberste** Absatz und darin das **erste** Vorkommen — die
 * Anschrift steht im Geschäftsbrief über allem anderen. Weitere Vorkommen
 * bleiben unangetastet; für sie ist die Fremdfirmen-Warnung zuständig.
 */
function findRecipient(
  paragraphs: readonly ParagraphSlice[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadMatch | null {
  const current = currentCompany === null ? null : currentCompany.trim().toLowerCase()

  for (const paragraph of paragraphs) {
    let best: LetterheadMatch | null = null
    for (const company of knownCompanies) {
      const trimmed = company.trim()
      if (trimmed === '') continue
      if (current !== null && trimmed.toLowerCase() === current) continue

      const hit = findWholeWordOccurrences(paragraph.text, trimmed, true)[0]
      if (hit === undefined) continue
      if (best !== null && paragraph.start + hit.index >= best.range.from) continue

      best = {
        field: 'recipient',
        range: { from: paragraph.start + hit.index, to: paragraph.start + hit.index + hit.length },
        paragraph: paragraph.index,
        previous: paragraph.text.slice(hit.index, hit.index + hit.length),
      }
    }
    if (best !== null) return best
  }
  return null
}

/**
 * Treffer dürfen sich nicht überlappen. Bei Konflikt gewinnt die
 * verlässlichere Regel — die Reihenfolge in {@link PRIORITY}. Der
 * unterlegene Treffer entfällt ersatzlos.
 */
function withoutOverlaps(matches: readonly LetterheadMatch[]): LetterheadMatch[] {
  const kept: LetterheadMatch[] = []
  for (const field of PRIORITY) {
    const match = matches.find((candidate) => candidate.field === field)
    if (match === undefined) continue
    const clashes = kept.some(
      (other) => other.range.from < match.range.to && other.range.to > match.range.from,
    )
    if (!clashes) kept.push(match)
  }
  return kept.sort((a, b) => a.range.from - b.range.from)
}

export function matchLetterhead(
  paragraphs: readonly ParagraphSlice[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadMatch[] {
  const salutation = findSalutation(paragraphs)
  const above =
    salutation === null
      ? paragraphs.slice(0, FALLBACK_WINDOW)
      : paragraphs.filter((paragraph) => paragraph.index < salutation.paragraph)

  const found = [
    salutation,
    findDate(above),
    findSubject(above),
    findRecipient(above, knownCompanies, currentCompany),
  ].filter((match): match is LetterheadMatch => match !== null)

  return withoutOverlaps(found)
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `npx vitest run src/lib/domain/letterheadMatch.test.ts`
Erwartet: PASS, 10 Tests

- [ ] **Step 5: Gesamtprüfung**

Run: `npm run lint && npm run typecheck && npm test`
Erwartet: alle sauber, 1299 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/letterheadMatch.ts src/lib/domain/letterheadMatch.test.ts
git commit -m "feat(domain): Briefkopffelder im vorhandenen Brief auffinden"
```

---

### Task 2: Anwendungs-Adapter `letterheadApply.ts`

Führt Erkennung und Vorschlag zusammen. Zuschnitt wie `foreignCompanies.ts`: die Brücke zwischen reiner Logik und Arbeitsfläche.

Enthält vorab eine kleine Aufräumarbeit, die dieser Task braucht: `buildDocx` liegt heute wortgleich in `replace.test.ts` **und** `documentSelection.test.ts`. Nach der Konvention aus `CLAUDE.md` gehört eine von mehreren Testdateien genutzte Attrappe in eine `*.testutils.ts` neben den Code.

**Files:**
- Create: `src/lib/docx/docx.testutils.ts`
- Modify: `src/lib/docx/replace.test.ts:15-42` (Helfer entfernen, importieren)
- Modify: `src/components/editor/documentSelection.test.ts` (dito)
- Create: `src/components/editor/letterheadApply.ts`
- Test: `src/components/editor/letterheadApply.test.ts`

**Interfaces:**
- Consumes: `matchLetterhead` aus Task 1 · `replaceRange(docx, range, newText): DocxDocument` aus `src/lib/docx/replace.ts` · `shiftMarks(marks, range, insertedLength, nextText): Mark[]` aus `./marks` · `Letterhead` aus `src/lib/domain/letterhead`
- Produces: `applyLetterhead(docx, letterhead, marks, knownCompanies, currentCompany): LetterheadApplication`, dazu `LetterheadChange` und `LetterheadApplication`

- [ ] **Step 1: Den geteilten Testhelfer anlegen**

Datei `src/lib/docx/docx.testutils.ts` — der Rumpf von `buildDocx` wird aus `replace.test.ts:29-42` **wortgleich** übernommen, nur um einen Kopfkommentar und den Export ergänzt:

```ts
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
```

- [ ] **Step 2: Die beiden bestehenden Testdateien auf den Helfer umstellen**

In `src/lib/docx/replace.test.ts` und `src/components/editor/documentSelection.test.ts` die lokale `buildDocx`-Definition samt `W_NS`-Konstante und dem `zipSync`-Import entfernen und stattdessen importieren. In `replace.test.ts`:

```ts
import { buildDocx } from './docx.testutils'
```

In `documentSelection.test.ts` mit dem passenden relativen Pfad:

```ts
import { buildDocx } from '@/lib/docx/docx.testutils'
```

- [ ] **Step 3: Bestehende Tests laufen lassen — sie müssen unverändert grün sein**

Run: `npx vitest run src/lib/docx/replace.test.ts src/components/editor/documentSelection.test.ts`
Erwartet: PASS, keine Änderung an der Testzahl. Schlägt etwas fehl, wurde der Helfer nicht wortgleich übernommen.

- [ ] **Step 4: Commit der Aufräumarbeit**

```bash
git add src/lib/docx/docx.testutils.ts src/lib/docx/replace.test.ts src/components/editor/documentSelection.test.ts
git commit -m "refactor(test): buildDocx als geteilte Attrappe statt doppelt"
```

- [ ] **Step 5: Den fehlschlagenden Test für den Adapter schreiben**

Datei `src/components/editor/letterheadApply.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocx, paragraphXml } from '@/lib/docx/docx.testutils'
import { parseDocx } from '@/lib/docx/parse'
import type { DocxDocument } from '@/lib/docx/model'
import type { Letterhead } from '@/lib/domain/letterhead'
import { applyLetterhead } from './letterheadApply'

/**
 * Für die Alles-oder-nichts-Regel muss eine Ersetzung mitten im Stapel
 * scheitern. `vi.mock` wird hochgezogen, der Zähler deshalb über
 * `vi.hoisted`. Ohne gesetztes `failOnCall` reicht die Attrappe unverändert
 * an die echte Umsetzung durch — alle übrigen Tests dieser Datei laufen
 * gegen das Original.
 */
const replaceState = vi.hoisted(() => ({ calls: 0, failOnCall: 0 }))

vi.mock('@/lib/docx/replace', async () => {
  const actual = await vi.importActual<typeof import('@/lib/docx/replace')>('@/lib/docx/replace')
  return {
    ...actual,
    replaceRange: (...args: Parameters<typeof actual.replaceRange>) => {
      replaceState.calls += 1
      if (replaceState.calls === replaceState.failOnCall) throw new Error('Absturz im Stapel')
      return actual.replaceRange(...args)
    },
  }
})

beforeEach(() => {
  replaceState.calls = 0
  replaceState.failOnCall = 0
})

const LETTERHEAD: Letterhead = {
  recipient: 'Neue Beispiel AG',
  date: '13.08.2026',
  subject: 'Bewerbung als Disponentin',
  salutation: 'Sehr geehrter Herr Dr. Meier,',
}

function brief(): DocxDocument {
  return parseDocx(
    buildDocx(
      [
        paragraphXml('Alte Muster GmbH'),
        paragraphXml('Musterstraße 12'),
        paragraphXml('Berlin, 14.03.2026'),
        paragraphXml('Bewerbung als Sachbearbeiterin'),
        paragraphXml('Sehr geehrte Frau Klein,'),
        paragraphXml('mit großem Interesse habe ich Ihre Anzeige gelesen.'),
      ].join(''),
    ),
  )
}

describe('applyLetterhead', () => {
  it('setzt alle gefundenen Felder und lässt die Anschrift stehen', () => {
    const result = applyLetterhead(brief(), LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.document.text).toContain('Neue Beispiel AG')
    expect(result.document.text).toContain('Musterstraße 12')
    expect(result.document.text).toContain('Berlin, 13.08.2026')
    expect(result.document.text).toContain('Sehr geehrter Herr Dr. Meier,')
    expect(result.document.text).not.toContain('Alte Muster GmbH')
    expect(result.document.text).not.toContain('14.03.2026')
  })

  it('meldet je Feld, was vorher und was nachher dort steht', () => {
    const result = applyLetterhead(brief(), LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.changes).toEqual([
      { field: 'recipient', paragraph: 0, previous: 'Alte Muster GmbH', next: 'Neue Beispiel AG' },
      { field: 'date', paragraph: 2, previous: '14.03.2026', next: '13.08.2026' },
      {
        field: 'subject',
        paragraph: 3,
        previous: 'Bewerbung als Sachbearbeiterin',
        next: 'Bewerbung als Disponentin',
      },
      {
        field: 'salutation',
        paragraph: 4,
        previous: 'Sehr geehrte Frau Klein,',
        next: 'Sehr geehrter Herr Dr. Meier,',
      },
    ])
    expect(result.missing).toEqual([])
  })

  it('überspringt ein leeres Feld, statt den alten Text zu löschen', () => {
    const ohneFirma: Letterhead = { ...LETTERHEAD, recipient: '' }

    const result = applyLetterhead(brief(), ohneFirma, [], ['Alte Muster GmbH'], null)

    expect(result.document.text).toContain('Alte Muster GmbH')
    expect(result.missing).toContain('recipient')
    expect(result.changes.some((change) => change.field === 'recipient')).toBe(false)
  })

  it('lässt das Dokument unberührt, wenn nichts gefunden wurde', () => {
    const nurText = parseDocx(buildDocx(paragraphXml('Nur ein Satz ohne jeden Briefkopf.')))

    const result = applyLetterhead(nurText, LETTERHEAD, [], [], null)

    expect(result.document).toBe(nurText)
    expect(result.changes).toEqual([])
    expect(result.missing).toEqual(['recipient', 'date', 'subject', 'salutation'])
  })

  it('lässt das Dokument unberührt, wenn eine Ersetzung mitten im Stapel scheitert', () => {
    replaceState.failOnCall = 2
    const original = brief()

    const result = applyLetterhead(original, LETTERHEAD, [], ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(result.document).toBe(original)
    expect(result.changes).toEqual([])
    expect(original.text).toContain('Alte Muster GmbH')
  })

  it('führt die Vormerkungen mit', () => {
    const original = brief()
    const from = original.text.indexOf('mit großem Interesse')
    const marks = [
      {
        id: 'm1',
        range: { from, to: from + 'mit großem Interesse'.length },
        anchor: { range: { from, to: from + 20 }, text: 'mit großem Interesse', before: '', after: '' },
        current: 'mit großem Interesse',
        done: false,
      },
    ]

    const result = applyLetterhead(original, LETTERHEAD, marks, ['Alte Muster GmbH'], 'Neue Beispiel AG')
    const moved = result.marks[0]

    expect(result.document.text.slice(moved?.range.from, moved?.range.to)).toBe('mit großem Interesse')
  })
})
```

> Hinweis zum Vormerkungs-Test: Die genaue Form von `MarkAnchor` steht in `src/components/editor/marks.ts`. Weicht sie von der hier gezeigten ab, ist die Attrappe an die dortige Form anzupassen — geprüft wird allein, dass der Bereich nach der Ersetzung noch denselben Wortlaut überdeckt.

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/components/editor/letterheadApply.test.ts`
Erwartet: FAIL — „Failed to resolve import ./letterheadApply"

- [ ] **Step 7: Den Adapter schreiben**

Datei `src/components/editor/letterheadApply.ts`:

```ts
import type { DocxDocument } from '@/lib/docx/model'
import { replaceRange } from '@/lib/docx/replace'
import type { Letterhead } from '@/lib/domain/letterhead'
import { matchLetterhead, type LetterheadField } from '@/lib/domain/letterheadMatch'
import { shiftMarks, type Mark } from './marks'

/**
 * Die selbsttätige Übernahme des Briefkopfs — die Brücke zwischen der reinen
 * Erkennung (`letterheadMatch.ts`, Frage **wo**) und dem ebenso reinen
 * Vorschlag (`letterhead.ts`, Frage **was**).
 *
 * Vier Regeln, in dieser Reihenfolge:
 *
 * 1. **Leere Neuwerte werden übersprungen.** `suggestLetterhead` gibt
 *    `recipient: ''` zurück, wenn die Firma in der Anzeige fehlt — ohne
 *    diese Regel würde ein leerer Vorschlag den alten Adressblock löschen.
 *    Die wichtigste Einzelregel dieses Moduls.
 * 2. **Ersetzt wird von hinten nach vorn.** Jede Ersetzung verschiebt die
 *    Offsets alles Nachfolgenden; von hinten begonnen bleiben die noch
 *    offenen Treffer gültig.
 * 3. **Vormerkungen werden mitgeführt.** Beim Laden eines Entwurfs mit
 *    `keepMarks` können bereits welche liegen.
 * 4. **Alles oder nichts.** Wirft eine Ersetzung, wird der ganze Stapel
 *    verworfen und das übergebene Dokument unverändert zurückgegeben. Ein
 *    halb angewandter Briefkopf entsteht nie.
 */

export interface LetterheadChange {
  field: LetterheadField
  paragraph: number
  previous: string
  next: string
}

export interface LetterheadApplication {
  document: DocxDocument
  marks: readonly Mark[]
  changes: LetterheadChange[]
  /** Nicht übernommene Felder — gleich ob nicht gefunden oder ohne Neuwert. */
  missing: LetterheadField[]
}

const ALL_FIELDS: readonly LetterheadField[] = ['recipient', 'date', 'subject', 'salutation']

export function applyLetterhead(
  docx: DocxDocument,
  letterhead: Letterhead,
  marks: readonly Mark[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadApplication {
  const matches = matchLetterhead(docx.paragraphs, knownCompanies, currentCompany).filter(
    (match) => letterhead[match.field].trim() !== '',
  )

  const unchanged: LetterheadApplication = {
    document: docx,
    marks,
    changes: [],
    missing: [...ALL_FIELDS],
  }
  if (matches.length === 0) return unchanged

  try {
    let document = docx
    let moved = marks
    // Von hinten nach vorn, damit die Offsets der offenen Treffer gültig bleiben.
    for (const match of [...matches].sort((a, b) => b.range.from - a.range.from)) {
      const next = letterhead[match.field]
      const replaced = replaceRange(document, match.range, next)
      moved = shiftMarks(moved, match.range, next.length, replaced.text)
      document = replaced
    }

    return {
      document,
      marks: moved,
      changes: matches.map((match) => ({
        field: match.field,
        paragraph: match.paragraph,
        previous: match.previous,
        next: letterhead[match.field],
      })),
      missing: ALL_FIELDS.filter((field) => !matches.some((match) => match.field === field)),
    }
  } catch {
    // Alles oder nichts: Das übergebene Dokument bleibt, wie es war.
    return unchanged
  }
}
```

- [ ] **Step 8: Test laufen lassen und Erfolg bestätigen**

Run: `npx vitest run src/components/editor/letterheadApply.test.ts`
Erwartet: PASS, 6 Tests

- [ ] **Step 9: Gesamtprüfung**

Run: `npm run lint && npm run typecheck && npm test`
Erwartet: alle sauber

- [ ] **Step 10: Commit**

```bash
git add src/components/editor/letterheadApply.ts src/components/editor/letterheadApply.test.ts
git commit -m "feat(editor): Briefkopf im Stapel übernehmen, alles oder nichts"
```

---

### Task 3: Dritte Absatzfarbe in `DocumentView`

Geänderte Absätze bekommen eine eigene Kontur — nicht dieselbe wie ein Fehler, denn es ist keiner.

**Files:**
- Modify: `src/components/editor/DocumentView.tsx:135` (Prop), `:175` (Menge), `:312-321` (Weitergabe), `:393-399` (Prop der Absatzkomponente), `:439-443` (Farbwahl)
- Test: `src/components/editor/DocumentView.test.tsx`

**Interfaces:**
- Produces: neue optionale Prop `letterheadParagraphs?: readonly number[]` an `DocumentView`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Ans Ende von `src/components/editor/DocumentView.test.tsx` anfügen. Die Datei bringt bereits alles mit: `setup(overrides)` nimmt eine Teilmenge der `DocumentView`-Props, `paragraphElement(index)` holt den gerenderten Absatz über sein `data`-Attribut.

```ts
it('umrandet einen selbsttätig geänderten Absatz in eigener Farbe', () => {
  setup({ letterheadParagraphs: [0] })

  expect(paragraphElement(0).className).toContain('--color-info')
})

it('lässt eine Beanstandung der Briefkopf-Kontur vorgehen', () => {
  setup({ letterheadParagraphs: [0], foreignParagraphs: [0] })

  expect(paragraphElement(0).className).toContain('--color-error')
  expect(paragraphElement(0).className).not.toContain('--color-info')
})

it('lässt einen unveränderten Absatz farblos', () => {
  setup({ letterheadParagraphs: [0] })

  expect(paragraphElement(1).className).toContain('border-transparent')
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/components/editor/DocumentView.test.tsx`
Erwartet: FAIL — die Kontur ist `border-transparent`

- [ ] **Step 3: Die Prop ergänzen**

Nach `foreignParagraphs` (`:135`) in `DocumentViewProps`:

```ts
  /**
   * Absätze, in denen der Briefkopf selbsttätig übernommen wurde. Eigene
   * Farbe, nicht die der Beanstandung: Hier ist nichts falsch, hier hat die
   * Anwendung nur etwas getan, und der Nutzer soll sehen, was. Der Bericht
   * mit Alt und Neu steht daneben in `LetterheadPanel`.
   */
  letterheadParagraphs?: readonly number[]
```

Im Funktionskopf (`:165`) den Vorgabewert ergänzen: `letterheadParagraphs = [],`

Bei `:175` eine **eigene** Menge daneben, nicht in `flagged` hinein:

```ts
  const flagged = new Set([...claimParagraphs, ...foreignParagraphs])
  const applied = new Set(letterheadParagraphs)
```

Bei `:317` weiterreichen: `applied={applied.has(paragraph.index)}`

In `DocumentParagraphProps` (`:397`):

```ts
  /** Hier wurde der Briefkopf selbsttätig übernommen. */
  applied: boolean
```

und im Funktionskopf `applied,` aufnehmen.

Die Farbwahl bei `:439` um die dritte Stufe erweitern:

```ts
        flagged
          ? 'border-[var(--color-error)]'
          : retained
            ? 'border-[var(--color-warning)]'
            : applied
              ? 'border-[var(--color-info)]'
              : 'border-transparent',
```

Den Kommentar darüber um einen Satz ergänzen:

```ts
        // Der Briefkopf steht hinten an: Ein falscher Firmenname hält den
        // Export auf, „hier wurde etwas geändert" ist ein Hinweis.
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `npx vitest run src/components/editor/DocumentView.test.tsx`
Erwartet: PASS

- [ ] **Step 5: Gesamtprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/components/editor/DocumentView.tsx src/components/editor/DocumentView.test.tsx
git commit -m "feat(editor): eigene Kontur für selbsttätig geänderte Absätze"
```

---

### Task 4: Bericht im `LetterheadPanel`

Die Absatzkontur allein genügt nicht: Steht die alte Anschrift im selben Absatz wie der Firmenname, umrandet sie beides. Der Bericht zeigt, was **tatsächlich** getauscht wurde.

**Files:**
- Modify: `src/components/editor/LetterheadPanel.tsx:36-48` (Props), `:100-107` (Bericht darunter)
- Modify: `src/lib/i18n/locales/de.json` und `en.json` (Zweig `editor.letterhead.applied`)
- Test: `src/components/editor/LetterheadPanel.test.tsx`

**Interfaces:**
- Consumes: `LetterheadApplication` aus Task 2 (`changes`, `missing`)
- Produces: neue Props `application: LetterheadApplication | null` und `onDismissApplication: () => void`

- [ ] **Step 1: Die i18n-Schlüssel anlegen**

In `src/lib/i18n/locales/de.json`, im Zweig `editor.letterhead` neben `insertHint`:

```json
"applied": {
  "heading": "Selbsttätig übernommen",
  "change": "{{previous}} → {{next}}",
  "missing": "nicht gefunden — bitte einsetzen",
  "hint": "Prüfen Sie, was daneben stehen blieb — eine alte Anschrift etwa wird nicht mitgetauscht.",
  "dismiss": "Verstanden",
  "none": "Im Brief war kein Briefkopf zu finden. Setzen Sie die Felder von Hand ein."
}
```

In `src/lib/i18n/locales/en.json` an derselben Stelle:

```json
"applied": {
  "heading": "Applied automatically",
  "change": "{{previous}} → {{next}}",
  "missing": "not found — please insert",
  "hint": "Check what stayed behind — an old postal address is not replaced along with the name.",
  "dismiss": "Got it",
  "none": "No letterhead was found in the letter. Please insert the fields by hand."
}
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

An `src/components/editor/LetterheadPanel.test.tsx` anfügen. Die Datei hat ein `setup(options)` mit einem `SetupOptions`-Typ — beides ist zuerst um die neuen Props zu erweitern:

```ts
interface SetupOptions {
  letterhead?: Letterhead
  onInsert?: ((value: string) => void) | null
  foreign?: ForeignCompanies
  application?: LetterheadApplication | null
  onDismissApplication?: () => void
}
```

und im `render`-Aufruf darin:

```tsx
      application={options.application ?? null}
      onDismissApplication={options.onDismissApplication ?? vi.fn()}
```

Dann die Tests, mit `fireEvent` und `t()` wie im Rest der Datei:

```ts
const APPLICATION: LetterheadApplication = {
  document: {} as never,
  marks: [],
  changes: [
    { field: 'recipient', paragraph: 0, previous: 'Alte Muster GmbH', next: 'Neue Beispiel AG' },
  ],
  missing: ['subject'],
}

it('nennt für jedes übernommene Feld den alten und den neuen Wortlaut', () => {
  setup({ application: APPLICATION })

  expect(screen.getByText('Alte Muster GmbH → Neue Beispiel AG')).toBeInTheDocument()
})

it('nennt die nicht übernommenen Felder', () => {
  setup({ application: APPLICATION })

  expect(screen.getByText(t('editor.letterhead.applied.missing'))).toBeInTheDocument()
})

it('meldet den Bericht ab, wenn der Nutzer ihn wegklickt', () => {
  const onDismissApplication = vi.fn()
  setup({ application: APPLICATION, onDismissApplication })

  fireEvent.click(screen.getByRole('button', { name: t('editor.letterhead.applied.dismiss') }))

  expect(onDismissApplication).toHaveBeenCalledTimes(1)
})

it('zeigt ohne Übernahme keinen Bericht', () => {
  setup()

  expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
})

it('sagt es, wenn gar kein Briefkopf zu finden war', () => {
  setup({
    application: { document: {} as never, marks: [], changes: [], missing: ['recipient', 'date', 'subject', 'salutation'] },
  })

  expect(screen.getByText(t('editor.letterhead.applied.none'))).toBeInTheDocument()
})
```

Der Import dazu: `import type { LetterheadApplication } from './letterheadApply'`

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/components/editor/LetterheadPanel.test.tsx`
Erwartet: FAIL — die Props gibt es nicht

- [ ] **Step 4: Die Props und den Bericht ergänzen**

In `LetterheadPanelProps` nach `foreign`:

```ts
  /**
   * Das Ergebnis der selbsttätigen Übernahme, `null`, solange keine
   * stattfand oder der Nutzer den Bericht weggeklickt hat.
   */
  application: LetterheadApplication | null
  onDismissApplication: () => void
```

Im Rumpf, hinter dem Hinweis bei `:102-107` und **vor** dem Fremdfirmen-Block:

```tsx
        {application !== null && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-info)]">
              {t('editor.letterhead.applied.heading')}
            </p>
            {application.changes.length === 0 ? (
              <p className={FIELD_HINT_CLASS}>{t('editor.letterhead.applied.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {application.changes.map((change) => (
                  <li key={change.field} className="text-[length:var(--text-body-sm-size)]">
                    <span className="font-medium">{t(`editor.letterhead.fields.${change.field}`)}</span>{' '}
                    {t('editor.letterhead.applied.change', {
                      previous: change.previous,
                      next: change.next,
                    })}
                  </li>
                ))}
                {application.missing.map((field) => (
                  <li
                    key={field}
                    className="text-[length:var(--text-body-sm-size)] text-[var(--color-muted)]"
                  >
                    <span className="font-medium">{t(`editor.letterhead.fields.${field}`)}</span>{' '}
                    {t('editor.letterhead.applied.missing')}
                  </li>
                ))}
              </ul>
            )}
            <p className={FIELD_HINT_CLASS}>{t('editor.letterhead.applied.hint')}</p>
            <div>
              <Button variant="secondary" size="md" onClick={onDismissApplication}>
                {t('editor.letterhead.applied.dismiss')}
              </Button>
            </div>
          </div>
        )}
```

Den Import ergänzen:

```ts
import type { LetterheadApplication } from './letterheadApply'
```

Und den Kopfkommentar der Datei um einen Absatz erweitern, der die geänderte Lage festhält:

```ts
/**
 * **Seit der selbsttätigen Übernahme** setzt die Arbeitsfläche die sicher
 * gefundenen Felder selbst ein (`letterheadApply.ts`). Der Einsetzen-Knopf
 * bleibt trotzdem: Er ist der Weg für jedes Feld, das nicht sicher gefunden
 * wurde — die oben beschriebene Begründung gegen das Raten gilt unverändert.
 * Der Bericht darunter nennt Alt und Neu je Feld und macht damit einen
 * Teilersatz sichtbar, den die Absatzkontur allein nicht zeigen kann.
 */
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

Run: `npx vitest run src/components/editor/LetterheadPanel.test.tsx`
Erwartet: PASS

- [ ] **Step 6: i18n-Vollständigkeit prüfen**

Run: `npx vitest run src/lib/i18n`
Erwartet: PASS — der Bestandstest vergleicht die Schlüsselbäume von `de` und `en`. Fehlt einer, schlägt er hier fehl.

- [ ] **Step 7: Gesamtprüfung und Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/components/editor/LetterheadPanel.tsx src/components/editor/LetterheadPanel.test.tsx src/lib/i18n/locales/de.json src/lib/i18n/locales/en.json
git commit -m "feat(editor): Bericht Alt zu Neu für den übernommenen Briefkopf"
```

---

### Task 5: Einbindung in `Editor.tsx`

Der Zusammenbau: einmal je Stellenanzeige, ein einziger Rückgängig-Schritt, Bericht und Kontur an ihren Platz.

**Files:**
- Modify: `src/routes/Editor.tsx` — Import, Zustand, Effekt (nach `:319`), `undo`-Umhüllung (`:558`, `:742`), `DocumentView`-Aufruf (`:791`), `LetterheadPanel`-Aufruf (`:922`)
- Test: `src/routes/Editor.test.tsx`

**Interfaces:**
- Consumes: `applyLetterhead(docx, letterhead, marks, knownCompanies, currentCompany): LetterheadApplication` aus Task 2 · `letterheadParagraphs` aus Task 3 · `application` und `onDismissApplication` aus Task 4
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Die neuen Tests gehören **in den bestehenden Block** `describe('Editor — Seitenspalte und Sprache (14c)')` in `src/routes/Editor.test.tsx`, direkt hinter „füllt den Briefkopf aus der ausgewerteten Anzeige vor". Nur dort ist die Hilfe `ready()` im Sichtbereich, die die Arbeitsfläche mit abgeschlossener Analyse aufbaut. `type(index, text)`, `undoShortcut()` und `paragraphElement(index)` stehen auf oberster Ebene der Datei und sind ohnehin verfügbar.

Die Fixture `anschreiben.docx` trägt „Sehr geehrte Damen und Herren," — der Anredetreffer ist damit sicher, unabhängig von der Bewerbungsliste.

```ts
it('übernimmt den Briefkopf selbsttätig, sobald die Analyse fertig ist', async () => {
  await ready()

  expect(await screen.findByText(t('editor.letterhead.applied.heading'))).toBeInTheDocument()
  await waitFor(() =>
    expect(paragraphElement(0).textContent).not.toContain('Sehr geehrte Damen und Herren,'),
  )
})

it('nimmt die gesamte Übernahme mit einem einzigen Schritt zurück', async () => {
  await ready()
  await screen.findByText(t('editor.letterhead.applied.heading'))
  const vorher = (await documentSurface()).textContent

  undoShortcut()

  await waitFor(async () => expect((await documentSurface()).textContent).not.toBe(vorher))
  expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
})

it('übernimmt nicht ein zweites Mal, wenn der Nutzer den Brief bearbeitet', async () => {
  await ready()
  await screen.findByText(t('editor.letterhead.applied.heading'))
  fireEvent.click(screen.getByRole('button', { name: t('editor.letterhead.applied.dismiss') }))

  type(1, 'Ein neuer Satz im Brief.')

  await waitFor(() => expect(paragraphElement(1).textContent).toBe('Ein neuer Satz im Brief.'))
  expect(screen.queryByText(t('editor.letterhead.applied.heading'))).not.toBeInTheDocument()
})
```

> Der Anredeabsatz der Fixture ist Absatz 0; sollte sich das ändern, ist der Index aus `anschreiben.docx` abzulesen statt zu raten. Steht `waitFor` oder `fireEvent` in der Datei noch nicht im Import, ist er zu ergänzen.

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/routes/Editor.test.tsx`
Erwartet: FAIL — kein Bericht im Baum

- [ ] **Step 3: Zustand und Effekt ergänzen**

Importe:

```ts
import { applyLetterhead, type LetterheadApplication } from '@/components/editor/letterheadApply'
```

Beim Laden der bekannten Firmen (`:325-340`) einen Ladezustand mitführen — sonst liefe der Effekt womöglich, bevor die Liste aus IndexedDB da ist, und fände nie einen Empfänger:

```ts
  const [knownCompanies, setKnownCompanies] = useState<string[]>([])
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
```

In beiden Zweigen der Zusage (`then` und `catch`) `setCompaniesLoaded(true)` setzen — auch der Fehlerfall ist ein abgeschlossener Ladevorgang, sonst bliebe die Übernahme bei unerreichbarem Speicher für immer aus.

Danach, hinter dem `letterhead`-Effekt bei `:319`:

```ts
  /**
   * Die selbsttätige Übernahme des Briefkopfs.
   *
   * **Einmal je Stellenanzeige**, nicht einmal überhaupt: Der Ref merkt sich
   * die `jobAd`, für die bereits übernommen wurde. Analysiert der Nutzer zu
   * demselben Brief eine zweite Anzeige, soll erneut übernommen werden —
   * dann steht im Briefkopf ja die vorige Firma und er ist selbst der alte
   * Briefkopf geworden. Dass `docx`, `marks` und `letterhead` in der
   * Abhängigkeitsliste stehen, ist unschädlich: Der Ref-Vergleich lässt den
   * Rumpf je Anzeige nur einmal durchlaufen, und dann mit den Werten dieses
   * Rendervorgangs.
   *
   * Gewartet wird auf `companiesLoaded`: Ohne die Liste früherer Firmen gibt
   * es keinen Anker für den Empfänger, und ein zu früher Lauf fände ihn nie.
   */
  const appliedFor = useRef<JobAd | null>(null)
  const [application, setApplication] = useState<LetterheadApplication | null>(null)
  useEffect(() => {
    if (docx === null || jobAd === null || letterhead === null || !companiesLoaded) return
    if (appliedFor.current === jobAd) return
    appliedFor.current = jobAd

    const result = applyLetterhead(docx, letterhead, marks, knownCompanies, jobAd.company)
    setApplication(result)
    if (result.changes.length > 0) commit(result.document, result.marks)
  }, [docx, jobAd, letterhead, marks, knownCompanies, companiesLoaded, commit])
```

`JobAd` ist dafür aus `@/lib/domain/jobAd` zu importieren, falls noch nicht geschehen.

- [ ] **Step 4: Rückgängig räumt den Bericht mit ab**

Eine Umhüllung neben `undo` anlegen und an **beiden** Stellen einsetzen:

```ts
  /**
   * Rückgängig nimmt auch den Bericht mit: Er bezeichnet Änderungen, die
   * es danach nicht mehr gibt.
   */
  const undoAll = useCallback(() => {
    undo()
    setApplication(null)
  }, [undo])
```

Dann die zwei Aufrufstellen umstellen. Im Tastaturhandler (`:555-562`):

```ts
      undo()
```
wird zu
```ts
      undoAll()
```
und die Abhängigkeitsliste des umgebenden `useCallback` von `[undo]` auf `[undoAll]`.

Am Knopf (`:742`):

```tsx
                <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undo}>
```
wird zu
```tsx
                <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undoAll}>
```

`undoAll` muss **vor** beiden Stellen deklariert sein — also direkt hinter dem `application`-Zustand aus Step 3, nicht erst weiter unten.

- [ ] **Step 5: Kontur und Bericht anschließen**

Am `DocumentView`-Aufruf (`:791`), neben `foreignParagraphs`:

```tsx
                // Absätze, in denen der Briefkopf selbsttätig übernommen
                // wurde. Eigene Farbe, kein Fehler.
                letterheadParagraphs={application?.changes.map((change) => change.paragraph) ?? []}
```

Am `LetterheadPanel`-Aufruf (`:922`):

```tsx
                application={application}
                onDismissApplication={() => setApplication(null)}
```

- [ ] **Step 6: Test laufen lassen und Erfolg bestätigen**

Run: `npx vitest run src/routes/Editor.test.tsx`
Erwartet: PASS

- [ ] **Step 7: Gesamtprüfung**

Run: `npm run lint && npm run typecheck && npm test`
Erwartet: alle sauber, alle Tests grün

- [ ] **Step 8: Im laufenden Browser ansehen**

Run: `npm run dev`, eine `.docx` aus `tests/fixtures/` laden, eine Stellenanzeige einfügen, analysieren lassen.
Erwartet: Briefkopffelder stehen im Brief, die geänderten Absätze sind in `--color-info` umrandet, der Bericht nennt Alt und Neu, „Verstanden" räumt die Kontur ab, „Rückgängig" nimmt alles in einem Schritt zurück.

- [ ] **Step 9: Commit**

```bash
git add src/routes/Editor.tsx src/routes/Editor.test.tsx
git commit -m "feat(editor): Briefkopf nach der Analyse selbsttätig übernehmen"
```

---

## Abschließende Prüfung

- [ ] `npm run lint && npm run typecheck && npm test` sauber
- [ ] `npm run build` erfolgreich
- [ ] Kein Feld wird überschrieben, das nicht sicher gefunden wurde
- [ ] Ein leerer Vorschlag löscht nirgends vorhandenen Text
- [ ] Der Einsetzen-Knopf funktioniert unverändert für nicht gefundene Felder
- [ ] Word-Export enthält den Briefkopf ohne weiteres Zutun
