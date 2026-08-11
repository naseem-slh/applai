import { z } from 'zod'
import type { LlmProvider } from '../ai/provider'
import { ModelResponseError, parseModelJson, truncateForError } from '../ai/modelJson'
import { buildStyleProfilePrompt } from '../ai/prompts/styleProfile'
import { detectLanguage } from './language'

/**
 * Aufgabe 10 — Stilprofil aus dem bestehenden Anschreiben ableiten.
 *
 * Das Stilprofil ist der Kern des Produktversprechens (siehe Auftrag): Die
 * KI soll nicht "gut" schreiben, sondern **wie der Nutzer**. Deshalb sind
 * `sentenceLength` und `address` bewusst NICHT Teil der Modellantwort,
 * sondern werden von `computeSentenceLength`/`detectAddress` unten rein
 * deterministisch berechnet – dieselbe Linie wie `detectLanguage` in
 * Aufgabe 9 ("reproduzierbares Ergebnis schlägt Modellmeinung").
 *
 * `traits` und `sample` sind Freitext und laufen deshalb bewusst NICHT durch
 * `nullableFactString` (`src/lib/ai/modelJson.ts`) – diese Funktion ist nur
 * für Fakt-Felder gedacht, die wörtlich aus einer Quelle übernommen werden
 * (siehe deren Doc-Kommentar). Diese Aufgabe hat außerdem **kein** einziges
 * `string | null`-Fakt-Feld: "formality" ist eine Pflichtzahl, "traits" eine
 * Pflichtliste, "sample" ein Pflichtstring, der stattdessen über
 * `assertSampleIsVerbatim` unten geprüft wird (siehe dort) – kein Feld
 * dieser Aufgabe benötigt `nullableFactString`.
 */

/** Wie die Leserin/der Leser des Anschreibens angesprochen wird. */
export type Address = 'sie' | 'du' | 'none'

/**
 * Das vollständige, von der Oberfläche einsehbare und korrigierbare
 * Stilprofil (`docs/spec.md`: "einsehbar und korrigierbar"). **Reines
 * Datenobjekt** – keine Klasse, kein privater Zustand, keine Methoden (siehe
 * Auftrag): Aufgabe 13 liest und schreibt diese Felder direkt aus
 * Formularen/Reglern.
 */
export interface StyleProfile {
  /** 0 = locker, 100 = förmlich. Kommt vom Modell, siehe `deriveStyleProfile`. */
  formality: number
  /** Durchschnittliche Wörter pro Satz, deterministisch berechnet – siehe `computeSentenceLength`. */
  sentenceLength: number
  /** Wie das Anschreiben die Leserin/den Leser anspricht, deterministisch erkannt – siehe `detectAddress`. */
  address: Address
  /** Kurze, konkrete Stilbeobachtungen, z. B. "nennt Ergebnisse mit Zahlen", "kurze Einleitungssätze". Freitext vom Modell. */
  traits: string[]
  /** Zwei repräsentative Sätze aus dem Original, WÖRTLICH – siehe `assertSampleIsVerbatim`. */
  sample: string
}

// ---------------------------------------------------------------------------
// sentenceLength — deterministische Satzsegmentierung ohne Bibliothek (G9)
// ---------------------------------------------------------------------------
//
// REGEL (siehe Auftrag: "Decide your rule, document it, and test the
// abbreviations explicitly"): Ein Punkt/Ausrufe-/Fragezeichen bzw. eine
// Ellipse gilt als Satzende, wenn danach Leerraum folgt (oder das Textende
// erreicht ist) — AUSSER in drei Fällen, die vorher "maskiert" werden (ihr
// Punkt wird durch ein Platzhalterzeichen ersetzt, das keine
// Satzend-Interpunktion ist):
//
//   1. Mehrteilige Abkürzungen ("z. B.", "u. a.", "d. h.", …) — als exakte
//      Phrase erkannt, alle darin enthaltenen Punkte werden maskiert.
//   2. Einteilige Abkürzungen ("Dr.", "ca.", "usw.", …) — per Wortliste
//      erkannt (Wortgrenze davor, Punkt direkt danach).
//   3. Ein- bis zweistellige Ziffern direkt vor einem Punkt, gefolgt von
//      Leerraum ("15.", "3.") — Tagesangabe in einem Datum ("15. März 2024")
//      oder eine Ordinalzahl ("der 3. Platz"). Bewusst nur 1–2 Ziffern:
//      eine vierstellige Jahreszahl ("Das war 1990.") bleibt ein normales,
//      echtes Satzende (siehe "Bewusst falsch" unten).
//
// Ein Doppelpunkt vor einer Aufzählung wird nie als Satzende missverstanden,
// weil ':' von vornherein nicht zur Satzend-Interpunktion zählt — kein
// Sonderfall nötig. Eine Ellipse ("..." oder "…") wird vor allem anderen auf
// ein einzelnes Zeichen vereinheitlicht und danach wie ein normaler
// Satzendpunkt behandelt (Ellipse + Leerraum = Satzende).
//
// BEWUSST FALSCH (dokumentierte Grenzen, siehe Bericht):
// - Ein Satz, der auf eine reine Zahl endet, OHNE dass danach ein Punkt mit
//   mind. drei Ziffern folgt, kann fälschlich mit dem nächsten Satz
//   verschmolzen werden, wenn die Zahl 1–2-stellig ist (z. B. "Ich war Platz
//   2. Das hat mich überrascht." → "2." wird als Ordinalzahl maskiert, beide
//   Sätze zählen als einer). Seltener Fall in einem Anschreiben, aber real.
// - **Fix-Runde 1 (Review-Fund, siehe task-10-report.md): eine Abkürzung, die
//   selbst am Satzende steht, wird ebenfalls fälschlich mit dem Folgesatz
//   verschmolzen.** `maskNonTerminalPeriods` maskiert den Punkt jeder
//   gelisteten Abkürzung UNBEDINGT, unabhängig davon, ob dieser Punkt
//   zufällig auch das echte Satzende ist – z. B. "Ich habe Rechnungen,
//   Angebote, Reports usw. Danach ging ich nach Hause." hat nach deutscher
//   Typografie KEINEN zweiten Punkt (der Abkürzungspunkt IST der Satzpunkt),
//   wird hier aber als ein einziger, zu langer "Satz" gezählt statt als zwei.
//   Bewusst NICHT durch eine Großschreibungs-Heuristik ("nächstes Wort nach
//   dem Punkt ist großgeschrieben, also echtes Satzende") behoben: Im
//   Deutschen wird das nächste Wort so gut wie IMMER großgeschrieben – bei
//   "Dr. Meier" (echte Fortsetzung, "Meier" ist ein großgeschriebenes
//   Substantiv/Eigenname) genauso wie bei "usw. Danach" (echtes Satzende,
//   "Danach" ist satzanfangsbedingt großgeschrieben). Diese Heuristik
//   unterscheidet die beiden Fälle also NICHT zuverlässig und hätte nur den
//   Anschein einer Lösung erzeugt, ohne echten Erkenntnisgewinn – deshalb
//   bewusst nicht eingebaut, stattdessen hier dokumentiert und mit einem
//   eigenen Regressionstest ("verschmilzt zwei echte Sätze, wenn eine
//   Abkürzung selbst das Satzende ist") festgehalten, damit sich das
//   Verhalten nicht unbemerkt ändert.
// - Die feste Abkürzungsliste ist nicht vollständig — eine unbekannte
//   Abkürzung ("ggf.a." o. Ä.) wird wie ein normales Satzende behandelt.
// - Anführungszeichen/Klammern nach dem Satzendezeichen ("Ich schaffe das!")
//   werden nicht gesondert behandelt; das ist unproblematisch, weil danach
//   ohnehin Leerraum folgt.
// ---------------------------------------------------------------------------

/** Steht für einen Punkt, der KEIN Satzende ist (Abkürzung/Ordinalzahl). */
const NON_TERMINAL_PERIOD = ''

const MULTI_WORD_ABBREVIATIONS = [
  'z. B.', 'z.B.',
  'u. a.', 'u.a.',
  'd. h.', 'd.h.',
  'u. v. m.', 'u.v.m.',
  'i. d. R.', 'i.d.R.',
  'u. U.', 'u.U.',
  'o. Ä.', 'o.Ä.',
  'z. T.', 'z.T.',
  's. o.', 's.o.',
  's. u.', 's.u.',
  'v. a.', 'v.a.',
]

const SINGLE_WORD_ABBREVIATIONS = [
  'dr', 'prof', 'ca', 'nr', 'usw', 'bzw', 'ggf', 'inkl', 'exkl', 'etc',
  'tel', 'str', 'hr', 'fr', 'mio', 'mrd', 'sog', 'bspw', 'evtl', 'insb',
  'vgl', 'geb', 'jr', 'co',
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function maskNonTerminalPeriods(text: string): string {
  // Mehrere Punkte in Folge ("...") vereinheitlicht als eine Ellipse – wird
  // unten wie ein normales Satzende behandelt (Zeichen + Leerraum = Ende).
  let masked = text.replace(/\.{2,}/g, '…')

  for (const phrase of MULTI_WORD_ABBREVIATIONS) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(phrase)}`, 'giu')
    masked = masked.replace(re, (match) => match.replaceAll('.', NON_TERMINAL_PERIOD))
  }

  const singleWordPattern = new RegExp(`\\b(${SINGLE_WORD_ABBREVIATIONS.join('|')})\\.`, 'gi')
  masked = masked.replace(singleWordPattern, (_match, word: string) => `${word}${NON_TERMINAL_PERIOD}`)

  // Ordinalzahl/Tagesangabe: ein bis zwei Ziffern direkt vor einem Punkt,
  // gefolgt von Leerraum (siehe Regel 3 oben) – bewusst NICHT bei drei oder
  // mehr Ziffern (Jahreszahlen bleiben echte Satzenden).
  masked = masked.replace(/(?<!\d)(\d{1,2})\.(?=\s)/g, (_match, digits: string) => `${digits}${NON_TERMINAL_PERIOD}`)

  return masked
}

function splitSentences(text: string): string[] {
  const masked = maskNonTerminalPeriods(text.trim())
  if (masked === '') return []
  return masked
    .split(/(?<=[.!?…])\s+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
}

function countWords(text: string): number {
  return (text.match(/\p{L}+/gu) ?? []).length
}

/**
 * Durchschnittliche Wörter pro Satz, rein deterministisch berechnet (siehe
 * Segmentierungsregel oben) – auf eine Nachkommastelle gerundet. `0` für
 * einen leeren oder nur aus Leerraum bestehenden Text.
 */
export function computeSentenceLength(text: string): number {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return 0
  const totalWords = sentences.reduce((sum, sentence) => sum + countWords(sentence), 0)
  return Math.round((totalWords / sentences.length) * 10) / 10
}

// ---------------------------------------------------------------------------
// address — deterministische Anrede-Erkennung ohne Bibliothek (G9)
// ---------------------------------------------------------------------------
//
// **Fix-Runde 2 (Entscheidung des Koordinators nach Rücksprache mit dem
// menschlichen Projektpartner – keine Empfehlung mehr, sondern verbindlich;
// siehe task-10-report.md): Anrede und Grußformel sind das PRIMÄRE
// deterministische Signal, nicht die Pronomen-Zählung.** Jedes echte
// Anschreiben hat eine Anrede – das ist es, was einen Brief zu einem Brief
// macht. "Sehr geehrte(r) …" bzw. "Hallo/Liebe(r)/Hi …" sind anders als ein
// großgeschriebenes Pronomen NIEMALS mit einer 3.-Person-Bedeutung zu
// verwechseln.
//
// PRIORITÄT (absteigend – die erste Stufe mit irgendeinem Treffer
// entscheidet, tiefere Stufen werden dann gar nicht mehr angesehen):
//   1. Anrede – nur in den ersten `SALUTATION_WINDOW_LINES` nicht-leeren
//      Zeilen gesucht (wie die Namenserkennung in `privacy/anonymize.ts`).
//   2. Grußformel – nur in den letzten `CLOSING_WINDOW_LINES` nicht-leeren
//      Zeilen gesucht.
//   3. Pronomen – großgeschrieben MITTEN im Satz, plus "Ihnen" unabhängig
//      von der Position (siehe unten); "du"-Formen immer, unabhängig von
//      Position und Groß-/Kleinschreibung.
//   4. `'none'`, wenn keine der drei Stufen irgendeinen Treffer liefert.
//
// Liefert eine Stufe SOWOHL einen förmlichen als auch einen informellen
// Treffer (widersprüchlich), gewinnt innerhalb dieser Stufe informell –
// dieselbe "informell gewinnt bei Gleichstand"-Regel wie bei den reinen
// Pronomentreffern unten.
//
// **Warum Anrede über Grußformel gewinnt, wenn beide widersprechen**
// (vom Koordinator ausdrücklich zur Entscheidung gestellt): Die Anrede ist
// die bewusstere, verbindlichere Formulierung im ganzen Brief – "Sehr
// geehrte Damen und Herren" erzwingt eine aktive Entscheidung (richtiges
// Anrede-Geschlecht, vollständige Höflichkeitsform), niemand schreibt sie
// aus reiner Gewohnheit. Die Grußformel ist dagegen im heutigen deutschen
// Schriftverkehr stark konventionalisiert: "Viele Grüße" wird von vielen
// Schreibenden als Standard-Abschluss verwendet, unabhängig vom
// tatsächlichen Register des Briefs – ein ansonsten strikt förmlicher Brief,
// der aus Gewohnheit mit "Viele Grüße" statt "Mit freundlichen Grüßen"
// endet, ist real und häufig (vom Koordinator namentlich als Testfall
// verlangt). Deshalb entscheidet die Anrede, sobald sie ein Signal liefert;
// die Grußformel wird nur konsultiert, wenn die Anrede GAR KEIN Signal
// liefert (keine der beiden Wortlisten trifft in den ersten Zeilen).
//
// **Bekannte Grenze, vom Koordinator ausdrücklich angefragt:** Ein
// Anschreiben, dessen Text OHNE die Anrede-Zeile vorliegt (z. B. weil eine
// vorgelagerte Dokumentenverarbeitung nur den reinen Fließtext-Body liefert
// und die Kopfzeile abschneidet), verliert dieses primäre Signal komplett.
// Fehlt in so einem Fall AUCH eine Grußformel UND jede eindeutige
// Pronomen-Evidenz (mitten im Satz oder "Ihnen"), liefert diese Funktion
// `'none'` – selbst wenn ein Mensch den Text zweifelsfrei als förmlich läse
// (z. B. ausschließlich satzanfangsbedingt großgeschriebene "Ihre"-Sätze
// ohne jede andere Evidenz, siehe `styleProfile.test.ts`, Test
// "BEKANNTE GRENZE"). Bewusst in Kauf genommen statt mit einem dritten
// Pronomen-Positionstrick "repariert" – siehe nächster Absatz.
//
// **Warum es KEINEN Positions-Fallback für "sie"/"ihr"/"ihre"/… mehr gibt**
// (Fix-Runde 1 hatte hier einen Fallback für satzanfangsbedingt
// großgeschriebene Possessivformen eingeführt – Fix-Runde 2 entfernt ihn
// ersatzlos, wie vom Koordinator vorgeschlagen): Zwei aufeinanderfolgende
// Review-Runden haben zwei verschiedene Positions-Heuristiken für
// satzanfangsbedingt großgeschriebenes "Sie"/"Ihre" widerlegt (Runde 1: ALLE
// satzanfangsbedingten Treffer zählen NICHT → falsches `'none'` für "Ihre
// Anzeige…"; Runde 2, erster Versuch: Possessivformen zählen am Satzanfang
// ALS Fallback → falsches `'sie'` für "Ihre Anliegen [der zuvor genannten
// Kunden]…"). Eine dritte, noch engere Heuristik (z. B. "nur der
// allererste Wort-Token des gesamten Texts zählt") hätte zwar beide
// bekannten Gegenbeispiele gelöst, ist aber genau die Art fragiler
// Sonderfall-Cleverness, die die letzten beiden Runden bereits zweimal
// widerlegt hat – jede neue Grenze lädt zu einem neuen, noch nicht
// gefundenen Gegenbeispiel ein. Jetzt, wo Anrede/Grußformel als primäres
// Signal existieren, ist der Grenznutzen eines dritten Pronomen-
// Positionstricks gering, das Risiko eines weiteren stillen Fehlers hoch –
// deshalb ersatzlos gestrichen (Entscheidung "drop it entirely" statt
// "narrow it to Ihnen alone" – "Ihnen" ist ohnehin schon die einzige echte
// Ausnahme, siehe unten, kein Positionstrick).
//
// "sie"/"ihr"/"ihre"/"ihrem"/"ihren"/"ihrer" klein geschrieben bedeuten
// IMMER die 3. Person, nie die Höflichkeitsanrede – Großschreibung ist bei
// der Höflichkeitsanrede verbindlich, aber am Satzanfang wird JEDES Wort
// großgeschrieben, unabhängig von seiner Bedeutung. Deshalb zählt nur ein
// großgeschriebener Treffer MITTEN im Satz sicher; ein satzanfangsbedingter
// Treffer zählt für KEINE dieser sechs Formen mehr – "sie" und
// "ihr"/"ihre"/"ihrem"/"ihren"/"ihrer" werden jetzt konsistent GLEICH
// behandelt, das war genau der vom Review in Fix-Runde 1 gefundene
// Widerspruch (das bloße Pronomen wurde ausgeschlossen, die Possessivformen
// nicht, ohne tragfähigen Unterschied).
//
// "Ihnen" (Dativ) bleibt die einzige Ausnahme und zählt unabhängig von der
// Satzposition: als Dativ-Pronomen eröffnet es im Deutschen so gut wie nie
// einen Satz in der 3. Person ("Ihnen wurde geholfen" ist selten und selbst
// dann meist schon gehoben/förmlich) – eine grammatische Tatsache, kein
// Positionstrick, unverändert seit Fix-Runde 1.
//
// "du"/"dich"/"dir"/"dein…" sind nie mit einem anderen, bedeutungsähnlichen
// Wort verwechselbar (kein Homonym-Problem wie bei "sie") – hier zählt jede
// Fundstelle unabhängig von Groß-/Kleinschreibung und Satzposition, auf
// jeder der drei Stufen.
// ---------------------------------------------------------------------------

const FORMAL_ADDRESS_WORDS: ReadonlySet<string> = new Set(['sie', 'ihnen', 'ihr', 'ihre', 'ihrem', 'ihren', 'ihrer'])
/** Zählt unabhängig von der Satzposition immer sicher, siehe Kommentarblock oben. */
const POSITION_INDEPENDENT_FORMAL_WORDS: ReadonlySet<string> = new Set(['ihnen'])
const INFORMAL_ADDRESS_WORDS: ReadonlySet<string> = new Set([
  'du', 'dich', 'dir', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'deines',
])

const SENTENCE_BOUNDARY_CHARS: ReadonlySet<string> = new Set(['.', '!', '?', '…'])
const OPENING_QUOTE_CHARS: ReadonlySet<string> = new Set(['"', "'", '„', '“', '‚', '‘', '»', '«'])

/**
 * Steht `index` am Anfang eines Satzes (Textanfang oder unmittelbar nach
 * Satzend-Interpunktion, übersprungenem Leerraum und öffnenden
 * Anführungszeichen)? Bewusst einfach gehalten (kein Abgleich mit der
 * abkürzungsbewussten Segmentierung oben) – hier geht es nur darum, die
 * Großschreibungs-Zweideutigkeit von "Sie"/"Ihre"/… zu erkennen, nicht um
 * eine exakte Satzgrenze.
 */
function isSentenceInitial(text: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && (/\s/.test(text[i]!) || OPENING_QUOTE_CHARS.has(text[i]!))) i--
  if (i < 0) return true
  return SENTENCE_BOUNDARY_CHARS.has(text[i]!)
}

function isCapitalized(word: string): boolean {
  return word.length > 0 && word[0] !== word[0]!.toLowerCase()
}

/** Ergebnis einer Signalstufe: wie viele förmliche bzw. informelle Treffer sie geliefert hat. */
interface AddressTally {
  formal: number
  informal: number
}

/**
 * Entscheidet eine einzelne Stufe (Anrede/Grußformel/Pronomen): `null`, wenn
 * die Stufe gar kein Signal liefert (nächste Stufe entscheidet dann
 * stattdessen); sonst `'sie'` bei Mehrheit für förmlich, sonst `'du'` –
 * sowohl bei einer informellen Mehrheit als auch bei einem echten
 * Gleichstand mit Treffern auf beiden Seiten ("informell gewinnt bei
 * Gleichstand", siehe Kommentarblock oben).
 */
function resolveTally(tally: AddressTally): Address | null {
  if (tally.formal === 0 && tally.informal === 0) return null
  return tally.informal >= tally.formal ? 'du' : 'sie'
}

function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0)
}

/** Wie viele nicht-leere Zeilen am Anfang/Ende des Texts auf eine Anrede/Grußformel geprüft werden. */
const SALUTATION_WINDOW_LINES = 3
const CLOSING_WINDOW_LINES = 3

// Zeilenanfang-verankert (multiline 'm'), case-insensitive ('i'). Feste
// Wortlisten statt eines allgemeinen Musters – exakt die vom Koordinator
// vorgegebenen Formulierungen (siehe Kommentarblock oben), keine eigene
// Erweiterung (z. B. deckt "Liebes Team," mit sächlichem "Liebes" bewusst
// NICHT ab – nicht in der Vorgabe, siehe Bericht).
const FORMAL_SALUTATION_RE = /^\s*sehr geehrte[nr]?\b/im
const FORMAL_CLOSING_RE = /^\s*(mit (freundlichen|besten) grüßen|hochachtungsvoll)\b/im
const INFORMAL_SALUTATION_RE = /^\s*(hallo|liebe|lieber|hi)\b/im
const INFORMAL_CLOSING_RE = /^\s*(liebe|viele|beste) grüße\b/im

function salutationTally(text: string): AddressTally {
  const window = nonEmptyLines(text).slice(0, SALUTATION_WINDOW_LINES).join('\n')
  return {
    formal: FORMAL_SALUTATION_RE.test(window) ? 1 : 0,
    informal: INFORMAL_SALUTATION_RE.test(window) ? 1 : 0,
  }
}

function closingTally(text: string): AddressTally {
  const lines = nonEmptyLines(text)
  const window = lines.slice(Math.max(0, lines.length - CLOSING_WINDOW_LINES)).join('\n')
  return {
    formal: FORMAL_CLOSING_RE.test(window) ? 1 : 0,
    informal: INFORMAL_CLOSING_RE.test(window) ? 1 : 0,
  }
}

function pronounTally(text: string): AddressTally {
  let formal = 0
  let informal = 0

  const wordRe = /\p{L}+/gu
  let match: RegExpExecArray | null
  while ((match = wordRe.exec(text))) {
    const word = match[0]
    const lower = word.toLowerCase()

    if (INFORMAL_ADDRESS_WORDS.has(lower)) {
      informal++
      continue
    }

    if (!FORMAL_ADDRESS_WORDS.has(lower) || !isCapitalized(word)) continue

    if (POSITION_INDEPENDENT_FORMAL_WORDS.has(lower) || !isSentenceInitial(text, match.index)) {
      formal++
    }
    // Satzanfangsbedingt großgeschrieben und nicht "Ihnen": zweideutig,
    // zählt bewusst nicht (siehe Kommentarblock oben).
  }

  return { formal, informal }
}

/**
 * Erkennt, ob das Anschreiben die Leserin/den Leser förmlich ("Sie"),
 * persönlich ("du") oder gar nicht direkt anspricht – siehe Kommentarblock
 * oben für die dreistufige Priorität (Anrede → Grußformel → Pronomen).
 */
export function detectAddress(text: string): Address {
  return resolveTally(salutationTally(text)) ?? resolveTally(closingTally(text)) ?? resolveTally(pronounTally(text)) ?? 'none'
}

// ---------------------------------------------------------------------------
// Modellantwort — formality, traits, sample
// ---------------------------------------------------------------------------

const StyleProfileModelSchema = z.object({
  formality: z.number().min(0).max(100),
  traits: z.array(z.string().min(1)).min(1),
  sample: z.string().min(1),
})

const STYLE_PROFILE_LABEL = 'Stilprofil-Analyse'

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * G10 hat hier "echte Zähne" (siehe Auftrag): "sample" MUSS wörtlich im
 * Originaltext stehen, sonst hat das Modell einen Beispielsatz erfunden
 * oder umformuliert – irreführend für den Nutzer, der "sample" als Zitat
 * aus dem eigenen Brief liest. Verglichen wird NACH Normalisierung von
 * Leerraum (Zeilenumbrüche/mehrfache Leerzeichen → ein Leerzeichen), weil
 * ein Modell die Zeilenumbrüche des Originaltexts naturgemäß nicht
 * reproduziert, wenn es zwei Sätze "abtippt" – das ist keine inhaltliche
 * Änderung, nur eine Layout-Frage. Bei Verstoß: **Scheitern statt
 * Selbstheilung**, dieselbe Linie wie `salutation`↔`contactPerson` in
 * Aufgabe 9 – ein Modell, das hier bereits erfindet, hat im Zweifel auch
 * anderswo in derselben Antwort improvisiert.
 */
function assertSampleIsVerbatim(sample: string, letterText: string, label: string): void {
  const normalizedSample = normalizeWhitespace(sample)
  const normalizedLetter = normalizeWhitespace(letterText)
  if (normalizedSample === '' || !normalizedLetter.includes(normalizedSample)) {
    throw new ModelResponseError(
      label,
      `${label}: "sample" steht nicht wörtlich im Originalanschreiben – die KI darf keine Beispielsätze erfinden oder umformulieren (G10). Gelieferter Text (gekürzt): "${truncateForError(sample)}"`,
    )
  }
}

/**
 * Ab welcher formality ein "du"-Anschreiben als in sich widersprüchlich gilt
 * (siehe Auftrag: "a du-letter scoring 95 is incoherent... make it explicit
 * and testable, not a silent clamp"). Der Systemprompt definiert 100 explizit
 * als "durchgehend Sie-Anrede" – ein deterministisch als "du" erkannter Text
 * kann diesen Bereich per Definition nicht ehrlich erreichen. 80 liegt
 * deutlich im oberen, laut Prompt exklusiv "Sie" beschriebenen Viertel der
 * Skala: genug Sicherheitsabstand von 100, um auch ein Modell zu fassen, das
 * knapp darunter bleibt (z. B. 90), aber niedrig genug, um moderat-förmliche,
 * professionelle "du"-Anschreiben (z. B. 55–75, in manchen Unternehmenskulturen
 * durchaus real) NICHT fälschlich zu verwerfen. Bewusst NUR in dieser einen
 * Richtung geprüft – ein "Sie"-Anschreiben mit niedriger formality ist
 * plausibel (z. B. eine moderne, aber weiterhin siezende Firma) und wird
 * nicht beanstandet, siehe Bericht.
 */
const DU_FORMALITY_INCOHERENCE_THRESHOLD = 80

function assertCoherentFormality(address: Address, formality: number, label: string): void {
  if (address === 'du' && formality > DU_FORMALITY_INCOHERENCE_THRESHOLD) {
    throw new ModelResponseError(
      label,
      `${label}: Modellantwort widerspricht sich selbst – "formality" ist ${formality}, obwohl das Anschreiben deterministisch als "du"-Anrede erkannt wurde (Systemprompt definiert Werte nahe 100 explizit als "durchgehend Sie"). Kein Meinungsunterschied, sondern ein Zeichen für eine unzuverlässige Modellantwort.`,
    )
  }
}

/**
 * Leitet das Stilprofil aus einem bestehenden Anschreiben ab.
 *
 * Ablauf:
 * 1. `computeSentenceLength`/`detectAddress` berechnen zwei der fünf Felder
 *    deterministisch, VOR jedem Modellaufruf.
 * 2. `detectLanguage` (Aufgabe 9) erkennt die Sprache des Anschreibens –
 *    steuert, in welcher Sprache das Modell "traits" formuliert.
 * 3. Der Prompt (`buildStyleProfilePrompt`) bekommt Sprache, Anredeform und
 *    Satzlänge nur als Kontext mit, nie zur Übernahme.
 * 4. Die Modellantwort läuft durch `parseModelJson(StyleProfileModelSchema, …)`
 *    – dieselbe Zod-Grenze wie in Aufgabe 9.
 * 5. `assertSampleIsVerbatim` prüft "sample" gegen den Originaltext (G10).
 * 6. `assertCoherentFormality` prüft "formality" gegen die deterministisch
 *    erkannte Anredeform.
 *
 * Ruft `anonymize` (Aufgabe 8) bewusst **nicht** auf – siehe Bericht
 * (task-10-report.md, Abschnitt "Anonymisierung"): diese Entscheidung liegt
 * laut Auftrag nicht bei dieser Aufgabe.
 */
export async function deriveStyleProfile(letterText: string, provider: LlmProvider, apiKey: string): Promise<StyleProfile> {
  const sentenceLength = computeSentenceLength(letterText)
  const address = detectAddress(letterText)
  const detectedLanguage = detectLanguage(letterText)

  const { system, user } = buildStyleProfilePrompt(letterText, detectedLanguage, address, sentenceLength)
  const raw = await provider.generate({ system, user, json: true }, apiKey)
  const parsed = parseModelJson(StyleProfileModelSchema, raw, STYLE_PROFILE_LABEL)

  assertSampleIsVerbatim(parsed.sample, letterText, STYLE_PROFILE_LABEL)
  assertCoherentFormality(address, parsed.formality, STYLE_PROFILE_LABEL)

  return {
    formality: parsed.formality,
    sentenceLength,
    address,
    traits: parsed.traits,
    sample: parsed.sample,
  }
}

// ---------------------------------------------------------------------------
// styleProfileToPromptFragment — reine Rendering-Funktion, kein Modellaufruf
// ---------------------------------------------------------------------------
//
// Wird von Aufgabe 11 in den Umformulierungs-Prompt eingefügt und ändert
// sich bei jedem Reglerwert neu (Auftrag: "the style sliders... will steer
// by adjusting this profile and re-rendering the fragment"). Muss deshalb
// mit einem handbearbeiteten, ggf. außerhalb des gültigen Bereichs liegenden
// Profil sinnvoll umgehen (Auftrag: "task 13's slider will produce them") –
// hier wird geklemmt (0–100 bzw. ≥ 0), weil das eine reine
// Anzeige-/Renderfunktion ist, keine Validierungsgrenze wie
// `deriveStyleProfile` oben: ein Regler, der kurzzeitig 104 erzeugt, soll
// den Prompt nicht mit einem unsinnigen Wert füttern, aber auch nicht mit
// einem Fehler abbrechen.
// ---------------------------------------------------------------------------

const FORMALITY_FALLBACK = 50

function clampFormality(value: number): number {
  if (!Number.isFinite(value)) return FORMALITY_FALLBACK
  return Math.min(100, Math.max(0, Math.round(value)))
}

function clampSentenceLength(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.round(value * 10) / 10
}

function describeFormality(formality: number): string {
  if (formality <= 33) return 'locker, persönlich – neigt zu "du" oder umgangssprachlichen Formulierungen'
  if (formality <= 66) return 'neutral-professionell'
  return 'förmlich, zurückhaltend – neigt zu durchgehender "Sie"-Anrede'
}

function describeSentenceLength(sentenceLength: number): string {
  if (sentenceLength <= 10) return 'kurze, prägnante Sätze'
  if (sentenceLength <= 20) return 'mittellange Sätze'
  return 'lange, ausführliche Sätze'
}

const ADDRESS_DESCRIPTIONS: Record<Address, string> = {
  sie: 'verwendet die förmliche Anrede "Sie"',
  du: 'verwendet die persönliche Anrede "du"',
  none: 'spricht die Leserin/den Leser nicht direkt an',
}

/**
 * Rendert das Stilprofil als Fließtext-Baustein für den
 * Umformulierungs-Prompt (Aufgabe 11) – enthält alle fünf Profilfelder.
 * Reine Funktion, kein Modellaufruf. Wie `prompts/jobAd.ts` ein
 * Entwicklerartefakt, kein Oberflächentext (G8 gilt hier nicht).
 */
export function styleProfileToPromptFragment(p: StyleProfile): string {
  const formality = clampFormality(p.formality)
  const sentenceLength = clampSentenceLength(p.sentenceLength)
  const addressDescription = ADDRESS_DESCRIPTIONS[p.address] ?? ADDRESS_DESCRIPTIONS.none

  const traitLines = p.traits
    .map((trait) => trait.trim())
    .filter((trait) => trait.length > 0)
    .map((trait) => `- ${trait}`)
    .join('\n')
  const traitsBlock = traitLines.length > 0 ? traitLines : '- (keine besonderen Stilmerkmale hinterlegt)'

  const sample = p.sample.trim()
  const sampleBlock = sample
    ? `\n- Beispieltext aus dem Original (zeigt den Ton, nicht wörtlich kopieren):\n"${sample}"`
    : ''

  return `Stilprofil des Nutzers (aus dem bestehenden Anschreiben abgeleitet – im EIGENEN Stil des Nutzers schreiben, nicht in einem allgemein "guten" Stil):
- Förmlichkeit: ${formality}/100 (${describeFormality(formality)})
- Durchschnittliche Satzlänge: ${sentenceLength} Wörter pro Satz (${describeSentenceLength(sentenceLength)})
- Anrede der Leserin/des Lesers: ${addressDescription}
- Stilmerkmale:
${traitsBlock}${sampleBlock}`
}
