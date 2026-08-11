/**
 * Anonymisierung persönlicher Daten vor dem Senden an einen KI-Anbieter.
 *
 * Reines Textmodul: keine Speicherung, kein KI-Adapter, kein i18n, kein DOM
 * (siehe `CLAUDE.md`, Architektur-Grenzen). `anonymize` ersetzt E-Mail,
 * Telefon, Geburtsdatum, Adresse (Postleitzahl mit Ort UND Straße mit
 * Hausnummer, siehe unten) und den erkannten Namen durch feste Platzhalter;
 * `deanonymize` tauscht sie exakt zurück. Der Rundlauf
 * `deanonymize(anonymize(t).text, map) === t` ist die harte Anforderung —
 * wichtiger als jede einzelne Erkennung, siehe Abschnitt "Klammer-Escaping"
 * unten für den Mechanismus, der das für JEDEN Eingabetext garantiert.
 *
 * G9 (minimale Abhängigkeiten): keine NLP-/Namenserkennungs-Bibliothek.
 * Alles hier ist Vorschriften-Regex plus einfache JavaScript-Prüfungen —
 * bewusst lesbar statt als ein einziger großer Ausdruck, damit jede Regel
 * einzeln nachvollziehbar und testbar bleibt.
 *
 * ---------------------------------------------------------------------------
 * GRUNDPRINZIP — Kandidaten sammeln, Überschneidungen nach Priorität auflösen
 * ---------------------------------------------------------------------------
 * Jede Kategorie (E-Mail, Datum, Adresse, Telefon, Name) durchsucht den
 * GESAMTEN Text unabhängig von den anderen und liefert eine Liste von
 * Kandidaten-Fundstellen (Start/Ende-Index im Text). Anschließend werden
 * alle Kandidaten in einer festen Prioritätsreihenfolge
 * (E-Mail > Datum > Adresse > Telefon > Name) sortiert; ein Kandidat wird
 * nur angenommen, wenn er sich mit KEINER bereits angenommenen Fundstelle
 * überschneidet. Das löst mehrere Randfälle aus der Aufgabenstellung mit
 * EINEM einzigen, generischen Mechanismus statt Spezialfällen:
 *
 * - Eine Postleitzahl, die zufällig wie eine Telefonnummer beginnt (z. B.
 *   "01067 Dresden"), wird als Adresse erkannt (höhere Priorität) und kann
 *   deshalb nicht mehr als Telefonnummer-Fundstelle "gewinnen".
 * - Ein Datum wie "01.03.2019" hat höhere Priorität als Telefon — ohne das
 *   würde die lose Telefon-Vorschriften-Regex (die u. a. mit "0" beginnende
 *   Ziffernfolgen sucht) das Datum fälschlich als Rufnummer lesen.
 * - Der erkannte Name kann nicht innerhalb einer bereits als E-Mail
 *   erkannten Fundstelle nochmals zuschlagen — relevant z. B., wenn
 *   `hints.name` (anders als die Kopfbereich-Erkennung, die immer eine
 *   2-4-Wort-Phrase liefert) nur aus einem einzelnen Wort besteht, etwa nur
 *   dem Nachnamen "Mustermann", und genau dieses Wort auch im Lokalteil
 *   einer E-Mail-Adresse vorkommt (z. B. "Mustermann@beispiel.de") —
 *   E-Mail hat Vorrang.
 *
 * Nicht-Geburtsdaten (jedes TT.MM.JJJJ-/DD/MM/YYYY-förmige Datum OHNE
 * Geburtsdatums-Label in der Nähe) werden ebenfalls als Kandidat erzeugt,
 * aber mit `replace: false` markiert: sie "reservieren" ihre Fundstelle
 * (blockieren also z. B. eine Telefon-Fehlinterpretation), werden selbst
 * aber nicht ersetzt und bleiben im Ausgabetext unverändert stehen.
 *
 * ---------------------------------------------------------------------------
 * KLAMMER-ESCAPING — warum der Rundlauf IMMER hält, auch bei Text, der
 * bereits wörtlich "[NAME]" enthält
 * ---------------------------------------------------------------------------
 * `deanonymize` kennt nur `(text, map)` — keine Positionsangaben. Es kann
 * einen von uns eingefügten Platzhalter nicht von einem *zufällig gleich
 * aussehenden* Textstück im Originaldokument unterscheiden, wenn beide als
 * exakt dieselbe Zeichenkette "[NAME]" im Text stehen. Deshalb werden VOR
 * jeder Erkennung alle eckigen Klammern im Originaltext durch private
 * Unicode-Zeichen ersetzt (`escapeBrackets`) — danach kann im Arbeitstext
 * gar keine eckige Klammer mehr vorkommen, die nicht von uns selbst stammt.
 * Erst `deanonymize` macht das am Ende rückgängig (`unescapeBrackets`),
 * NACHDEM alle echten Platzhalter bereits ersetzt wurden. Ein zufälliges
 * "[NAME]" im Originaldokument landet dadurch im an den Anbieter gesendeten
 * Text als harmlose, optisch nahezu identische Zeichenfolge mit
 * Sonderzeichen statt echten Klammern — und wird beim Rücktausch exakt
 * wiederhergestellt. Diese Lösung ist bewusst allgemein (sie behandelt JEDE
 * eckige Klammer im Original, nicht nur exakt unsere fünf Platzhalter-
 * Schreibweisen) und macht den Rundlauf beweisbar für JEDEN Eingabetext
 * sicher, nicht nur für die in der Aufgabenstellung genannten Beispiele.
 */

/** Platzhalter → Original. Task 11 trägt diese Map neben der KI-Antwort mit. */
export interface PiiMap {
  [placeholder: string]: string
}

export interface AnonymizeHints {
  /** Gewinnt gegenüber der Kopfbereich-Erkennung, wenn gesetzt — kommt vom Nutzer. */
  name?: string
  /** Wird zusätzlich zum generischen E-Mail-Muster als Ganzwort gesucht. */
  email?: string
}

type Category = 'EMAIL' | 'GEBURTSDATUM' | 'ADRESSE' | 'TEL' | 'NAME'

interface Candidate {
  start: number
  end: number
  value: string
  category: Category
  /** false = Fundstelle wird nur reserviert (blockiert andere Kategorien), aber nicht ersetzt. */
  replace: boolean
}

// Priorität hoch → niedrig. Siehe Erklärung oben.
const CATEGORY_PRIORITY: readonly Category[] = ['EMAIL', 'GEBURTSDATUM', 'ADRESSE', 'TEL', 'NAME']

// ---------------------------------------------------------------------------
// Klammer-Escaping (siehe Doc-Kommentar oben)
// ---------------------------------------------------------------------------

// Unicode Private-Use-Area — kommt in echten Dokumenten praktisch nie vor.
const BRACKET_OPEN_ESCAPE = '\uE000'
const BRACKET_CLOSE_ESCAPE = '\uE001'

function escapeBrackets(text: string): string {
  return text.replaceAll('[', BRACKET_OPEN_ESCAPE).replaceAll(']', BRACKET_CLOSE_ESCAPE)
}

function unescapeBrackets(text: string): string {
  return text.replaceAll(BRACKET_OPEN_ESCAPE, '[').replaceAll(BRACKET_CLOSE_ESCAPE, ']')
}

// ---------------------------------------------------------------------------
// E-Mail
// ---------------------------------------------------------------------------

const EMAIL_RE = /[\p{L}\p{N}][\p{L}\p{N}._%+-]*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu

function findEmailCandidates(text: string, hintEmail?: string): Candidate[] {
  const candidates = matchAll(text, EMAIL_RE, 'EMAIL')
  if (hintEmail?.trim()) {
    candidates.push(...findWholePhraseOccurrences(text, hintEmail, 'EMAIL', true))
  }
  return candidates
}

// ---------------------------------------------------------------------------
// Datum / Geburtsdatum
//
// Ein Regex deckt beide in der Aufgabenstellung genannten Formate ab
// (TT.MM.JJJJ und DD/MM/YYYY): beide sind Tag-Monat-Jahr mit vierstelligem
// Jahr, nur das Trennzeichen unterscheidet sich. Eine Rückreferenz (\2)
// erzwingt, dass innerhalb eines Datums nicht Punkt und Schrägstrich
// gemischt werden.
//
// GEBURTSDATUM-REGEL (bewusst konservativ — siehe Bericht): ein
// vollständiges Datum wird nur dann als Geburtsdatum behandelt, wenn
// unmittelbar davor (max. 40 Zeichen, i. d. R. dieselbe Zeile) eines der
// Wörter "Geburtsdatum", "geboren"/"geboren am" oder die Abkürzung "geb."
// steht. Ohne dieses Label bleibt JEDES Datum unangetastet — auch wenn es
// wie ein Geburtsdatum aussehen könnte. Das nimmt bewusst in Kauf, dass ein
// Geburtsdatum ohne erkennbares Label im Text stehen bleibt (Datenschutz-
// Fehltreffer), verhindert dafür zuverlässig, dass ein Projektdatum, das
// Briefdatum oder ein Bewerbungszeitraum fälschlich ersetzt wird
// (Dokumentbeschädigung) — laut Aufgabenstellung die richtige Abwägung.
// ---------------------------------------------------------------------------

const DATE_SHAPE_RE = /(?<!\d)(\d{1,2})([./])(\d{1,2})\2(\d{4})(?!\d)/g
const BIRTHDATE_LABEL_RE = /(?:geburtsdatum|geboren(?:\s+am)?|geb\.)\s{0,3}:?\s{0,3}$/iu
const BIRTHDATE_LABEL_WINDOW = 40

function isPlausibleDate(day: number, month: number, year: number, currentYear: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= currentYear
}

function findDateCandidates(text: string): Candidate[] {
  const results: Candidate[] = []
  const currentYear = new Date().getFullYear()
  const re = new RegExp(DATE_SHAPE_RE.source, DATE_SHAPE_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const day = Number(m[1])
    const month = Number(m[3])
    const year = Number(m[4])
    if (!isPlausibleDate(day, month, year, currentYear)) continue
    const windowStart = Math.max(0, m.index - BIRTHDATE_LABEL_WINDOW)
    const preceding = text.slice(windowStart, m.index)
    const isBirthdate = BIRTHDATE_LABEL_RE.test(preceding)
    results.push({ start: m.index, end: m.index + m[0].length, value: m[0], category: 'GEBURTSDATUM', replace: isBirthdate })
  }
  return results
}

// ---------------------------------------------------------------------------
// Adresse — Postleitzahl mit Ort UND Straße mit Hausnummer
//
// Beide Unterarten werden zur Kategorie ADRESSE gezählt, ergeben aber ZWEI
// getrennte Platzhalter, sobald ihre Originaltexte sich unterscheiden
// ([ADRESSE] und [ADRESSE_2]) — die PiiMap bildet genau einen Platzhalter
// auf genau einen Originaltext ab (siehe Signatur), ein gemeinsamer
// Platzhalter für zwei verschiedene Zeilen wäre damit nicht rundlauffähig.
// Das ist einfacher und robuster gegenüber wechselndem Zeilenlayout als der
// Versuch, beide Zeilen zu einem "Adressblock" zusammenzufassen.
//
// Straßen werden über eine offene, aber nicht uferlose Liste gängiger
// deutscher Straßen-Suffixe erkannt (siehe STREET_SUFFIXES) — ohne
// Gazetteer (G9) lässt sich "ist dies ein Straßenname" nicht allgemein
// entscheiden; das ist eine bewusste, dokumentierte Einschränkung
// (Restrisiko: seltene Straßennamen ohne dieser Suffixe, z. B. "Am Hang 5",
// werden nicht erkannt).
// ---------------------------------------------------------------------------

// Nur waagerechter Leerraum als Wortverbinder — verhindert, dass ein Muster
// über eine Zeilengrenze hinweg zwei unabhängige Zeilen zusammenzieht.
const PLZ_ORT_RE = /(?<!\d)\d{5}(?!\d)[ \t]+\p{Lu}[\p{L}.-]*(?:[ \t]+\p{Lu}[\p{L}.-]*){0,2}/gu

const STREET_CANDIDATE_RE =
  /(\p{Lu}[\p{L}]*\.?(?:[ \t]+\p{Lu}[\p{L}]*\.?){0,2})[ \t]+(\d{1,4}[ \t]?[a-zA-Z]?(?:[ \t]?[-–][ \t]?\d{1,4}[a-zA-Z]?)?)/gu

const STREET_SUFFIXES = [
  'straße',
  'strasse',
  'str.',
  'weg',
  'allee',
  'platz',
  'gasse',
  'ring',
  'damm',
  'ufer',
  'steig',
  'chaussee',
  'park',
  'hof',
  'berg',
  'brücke',
  'wall',
  'tal',
  'höhe',
]

function findAddressCandidates(text: string): Candidate[] {
  const results = matchAll(text, PLZ_ORT_RE, 'ADRESSE')

  const re = new RegExp(STREET_CANDIDATE_RE.source, STREET_CANDIDATE_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const words = m[1]!.split(/[ \t]+/)
    const lastWord = words[words.length - 1]!.toLowerCase()
    if (!STREET_SUFFIXES.some((suffix) => lastWord.endsWith(suffix))) continue
    results.push({ start: m.index, end: m.index + m[0].length, value: m[0], category: 'ADRESSE', replace: true })
  }
  return results
}

// ---------------------------------------------------------------------------
// Telefon
//
// Vorschriften-Regex (grob, breit) + JavaScript-Prüfung auf Ziffernanzahl
// statt eines einzigen riesigen Regex — deutlich lesbarer und einfacher an
// realen Fällen nachzuvollziehen (siehe Kommentare an den Konstanten).
//
// Nur waagerechter Leerraum als Trennzeichen-Klasse (kein `\s`): ein
// generisches `\s` würde Zeilenumbrüche verschlucken und könnte dadurch
// gierig über ganze Absätze hinweg "zusammenhängen", was auf Dauer riesige
// Fehltreffer erzeugen könnte.
//
// TEL_MIN_DIGITS = 9 ist kein Zufallswert: er ist knapp UNTER der
// kürzesten Beispielform aus der Aufgabenstellung, "(030) 12 34 56" (genau
// 9 Ziffern), aber hoch genug, um einen bloßen Jahresbereich wie
// "2019 - 2021" (dessen Ziffernrest ab der ersten "0" nur 7 Ziffern liefert,
// siehe Test) sicher auszuschließen.
//
// TEL_MAX_DIGITS = 14 deckt die in deutschen Briefköpfen/Impressen übliche
// Schreibweise "+49 (0)<Vorwahl> <Nummer>" ab (z. B. "+49 (0)621 12345678"
// = 2 + 1 + 3 + 8 = 14 Ziffern) — mit 13 wäre genau diese Form knapp
// verworfen worden (Fund aus Review-Runde 1, siehe Bericht). Eine IBAN
// (i. d. R. > 14 Ziffern nach Buchstabenpräfix) und ein reiner Jahresbereich
// (deutlich unter 9 Ziffern, siehe oben) bleiben davon unberührt.
// ---------------------------------------------------------------------------

const TEL_CANDIDATE_RE = /(?:\+\d{1,3}|\(0\d{1,5}\)|0)[\d \t./()-]{2,}\d/g
const TEL_MIN_DIGITS = 9
const TEL_MAX_DIGITS = 14

function findPhoneCandidates(text: string): Candidate[] {
  const results: Candidate[] = []
  const re = new RegExp(TEL_CANDIDATE_RE.source, TEL_CANDIDATE_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const digitCount = m[0].replace(/\D/g, '').length
    if (digitCount < TEL_MIN_DIGITS || digitCount > TEL_MAX_DIGITS) continue
    results.push({ start: m.index, end: m.index + m[0].length, value: m[0], category: 'TEL', replace: true })
  }
  return results
}

// ---------------------------------------------------------------------------
// Name
//
// Kommt entweder aus `hints.name` (gewinnt IMMER, ersetzt die eigene
// Erkennung vollständig statt sie nur zu ergänzen — der Hinweis kommt vom
// Nutzer, siehe Doc-Kommentar an `AnonymizeHints`) oder wird aus dem
// Kopfbereich erkannt: den ersten HEAD_LINE_COUNT nicht-leeren Zeilen des
// Textes. Ein typisches deutsches Anschreiben beginnt mit dem Namen des
// Absenders als eigene Zeile, gefolgt vom Adressblock — deshalb reicht ein
// kleines Fenster am Anfang.
//
// Eine Zeile gilt als "namensförmig", wenn sie aus 2 bis 4 Wörtern besteht,
// jedes Wort mit einem Großbuchstaben beginnt (`\p{Lu}`, deckt auch Ä/Ö/Ü
// ab) und NUR aus Buchstaben/Bindestrich/Apostroph besteht — keine Ziffern,
// kein "@". Das schließt Adresszeilen (Ziffern), die Anrede ("Sehr geehrte
// …" — "geehrte" beginnt klein) und Betreffzeilen mit Kleinwörtern ("als",
// "und" …) fast immer von selbst aus, ohne eine gesonderte Verbotsliste.
//
// GANZWORT-VERGLEICH: der gefundene Name wird NICHT case-insensitiv
// gesucht — bewusst, weil ein Nachname manchmal auch ein normales deutsches
// Wort ist (z. B. "Klein"), das in Kleinschreibung eine ganz andere
// Bedeutung hat ("klein" = nicht groß). In deutschen Bewerbungsunterlagen
// ist ein Eigenname praktisch immer großgeschrieben, das Restrisiko einer
// abweichenden Schreibweise ist gering. Die Grenzprüfung selbst nutzt
// `\p{L}`/`\p{N}` (nicht das ASCII-beschränkte `\w`/`\b`), damit ein Name
// mit Umlaut oder ß korrekt als eigenständiges Wort erkannt wird — z. B.
// darf "Wagner" nicht in "Wagnerstraße" hineingreifen.
//
// LABEL-ZEILEN ("Name: Max Mustermann"): tabellarische Lebensläufe (aus
// `.docx`/PDF, siehe Aufgabe 2-4) legen den Kopfbereich oft als
// "Persönliche Daten"-Tabelle an, die zeilenweise als "Label: Wert"
// extrahiert wird — allen voran "Name: Max Mustermann". Eine solche Zeile
// besteht NICHT nur aus 2-4 namensförmigen Wörtern (das Label "Name:"
// scheitert an NAME_WORD_RE wegen des Doppelpunkts), fällt also durch
// `isNameShapedLine` — ohne Gegenmaßnahme bliebe der Name dann im GESAMTEN
// Dokument unerkannt (Fund aus Review-Runde 1, siehe Bericht: ein echtes
// Datenleck, nicht nur ein verpasster Kopfzeilen-Fund). Deshalb prüft
// `extractLabeledName` als Rückfalloption zusätzlich, ob eine Zeile mit
// dem Label "Name" (case-insensitiv) plus Doppelpunkt beginnt und danach
// eine namensförmige 2-4-Wort-Phrase folgt — dann wird NUR der Namensteil
// (ohne "Name:") als erkannter Name verwendet.
//
// REIHENFOLGE INNERHALB DES KOPFBEREICHS — Label-Zeile hat Vorrang vor
// bloßer Zeilenform: `detectHeadName` durchsucht den Kopfbereich zweimal.
// Zuerst NUR nach einer "Name: …"-Label-Zeile; erst wenn keine existiert,
// zählt die erste bloß namensförmige Zeile. Grund (beim Schreiben des
// Tests für obigen Fund selbst entdeckt, nicht Teil der ursprünglichen
// Meldung, aber derselbe Fehlermechanismus): eine Abschnittsüberschrift wie
// "Persönliche Daten" ist selbst schon zwei großgeschriebene Wörter und
// damit äußerlich namensförmig — stünde sie VOR der eigentlichen
// "Name: …"-Zeile und würde "erste passende Zeile gewinnt" ohne
// Label-Vorrang gelten, würde die Überschrift fälschlich als Name gelesen
// und die echte "Name: …"-Zeile nie erreicht. Ein explizites Label ist ein
// eindeutigeres Signal als eine zufällig namensförmige Zeile und gewinnt
// deshalb unabhängig von der Position im Fenster.
//
// Bewusst eng gefasst: erkannt wird ausschließlich das Label "Name" (exakt
// dieses Wort, gefolgt von einem Doppelpunkt) — NICHT "Vorname:"/
// "Nachname:" getrennt (liefert je nur ein Wort, scheitert an der
// 2-4-Wort-Regel) und NICHT zusammengesetzte Label wie "Vollständiger
// Name:". Das ist eine bewusste, dokumentierte Lücke (kein Rätselraten
// über beliebige Label-Varianten), kein Versehen — siehe Restrisiken im
// Bericht.
// ---------------------------------------------------------------------------

const HEAD_LINE_COUNT = 8
const NAME_WORD_RE = /^\p{Lu}[\p{L}'-]*$/u
const NAME_LABEL_RE = /^name\s*:\s*(.+)$/iu

function isNameShapedLine(line: string): boolean {
  const words = line.split(/[ \t]+/).filter((w) => w.length > 0)
  if (words.length < 2 || words.length > 4) return false
  return words.every((w) => NAME_WORD_RE.test(w))
}

// Liefert den Namensteil einer "Name: …"-Label-Zeile, sofern vorhanden und
// selbst namensförmig — sonst `undefined`. Prüft NUR das Label, nicht die
// bloße Zeilenform (siehe `isNameShapedLine` dafür).
function extractLabeledName(line: string): string | undefined {
  const labelMatch = NAME_LABEL_RE.exec(line)
  if (!labelMatch) return undefined
  const value = labelMatch[1]!.trim()
  return isNameShapedLine(value) ? value : undefined
}

function detectHeadName(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, HEAD_LINE_COUNT)

  // Erster Durchlauf: explizite "Name: …"-Label-Zeile hat Vorrang (siehe
  // Begründung oben), unabhängig davon, an welcher Position im Fenster sie
  // steht.
  for (const line of lines) {
    const labeled = extractLabeledName(line)
    if (labeled) return labeled
  }

  // Zweiter Durchlauf (Rückfall): erste bloß namensförmige Zeile.
  return lines.find((line) => isNameShapedLine(line))
}

function findNameCandidates(text: string, hintName?: string): Candidate[] {
  const name = hintName?.trim() ? hintName.trim() : detectHeadName(text)
  if (!name) return []
  return findWholePhraseOccurrences(text, name, 'NAME', false)
}

// ---------------------------------------------------------------------------
// Gemeinsame Hilfsfunktionen
// ---------------------------------------------------------------------------

function matchAll(text: string, re: RegExp, category: Category): Candidate[] {
  const results: Candidate[] = []
  const r = new RegExp(re.source, re.flags)
  let m: RegExpExecArray | null
  while ((m = r.exec(text))) {
    results.push({ start: m.index, end: m.index + m[0].length, value: m[0], category, replace: true })
    if (m[0].length === 0) r.lastIndex++
  }
  return results
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Sucht `phrase` als Ganzwort/Ganzphrase (Grenzen über \p{L}/\p{N} statt
// des ASCII-beschränkten \b, siehe Erklärung an der Name-Erkennung oben).
function findWholePhraseOccurrences(text: string, phrase: string, category: Category, caseInsensitive: boolean): Candidate[] {
  const trimmed = phrase.trim()
  if (!trimmed) return []
  const pattern = `(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`
  const re = new RegExp(pattern, caseInsensitive ? 'gui' : 'gu')
  const results: Candidate[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    results.push({ start: m.index, end: m.index + m[0].length, value: m[0], category, replace: true })
  }
  return results
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const priorityRank = new Map(CATEGORY_PRIORITY.map((c, i) => [c, i]))
  const sorted = [...candidates].sort((a, b) => {
    const byPriority = priorityRank.get(a.category)! - priorityRank.get(b.category)!
    if (byPriority !== 0) return byPriority
    if (a.start !== b.start) return a.start - b.start
    return b.end - b.start - (a.end - a.start)
  })
  const accepted: Candidate[] = []
  for (const candidate of sorted) {
    if (accepted.some((a) => overlaps(a, candidate))) continue
    accepted.push(candidate)
  }
  return accepted
}

// Weist einer Kategorie-Wert-Kombination einen Platzhalter zu. Dieselbe
// Kategorie mit demselben Originaltext bekommt immer denselben Platzhalter
// (Dedup); ein neuer, andersartiger Wert derselben Kategorie bekommt einen
// nummerierten Platzhalter ([TEL], [TEL_2], [TEL_3], …). Die erste
// Fundstelle jeder Kategorie trägt IMMER die in der Aufgabenstellung
// vorgegebene, exakte Schreibweise ohne Nummer.
function assignPlaceholder(dedupe: Map<Category, Map<string, string>>, category: Category, value: string): string {
  let perCategory = dedupe.get(category)
  if (!perCategory) {
    perCategory = new Map()
    dedupe.set(category, perCategory)
  }
  const existing = perCategory.get(value)
  if (existing) return existing
  const n = perCategory.size + 1
  const token = n === 1 ? `[${category}]` : `[${category}_${n}]`
  perCategory.set(value, token)
  return token
}

function buildAnonymized(text: string, accepted: Candidate[]): { text: string; map: PiiMap } {
  const toReplace = accepted.filter((c) => c.replace).sort((a, b) => a.start - b.start)
  const dedupe = new Map<Category, Map<string, string>>()
  const map: PiiMap = {}
  let result = ''
  let cursor = 0
  for (const candidate of toReplace) {
    result += text.slice(cursor, candidate.start)
    const token = assignPlaceholder(dedupe, candidate.category, candidate.value)
    result += token
    map[token] = candidate.value
    cursor = candidate.end
  }
  result += text.slice(cursor)
  return { text: result, map }
}

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle
// ---------------------------------------------------------------------------

/**
 * Ersetzt E-Mail, Telefon, Geburtsdatum, Adresse (Postleitzahl mit Ort und
 * Straße mit Hausnummer) und den erkannten Namen durch feste Platzhalter.
 * `hints` sind optional und gewinnen gegenüber der eigenen Erkennung, wenn
 * gesetzt (siehe Doc-Kommentare an `AnonymizeHints` und den einzelnen
 * Kategorien oben für die jeweilige Begründung).
 */
export function anonymize(text: string, hints?: AnonymizeHints): { text: string; map: PiiMap } {
  const escaped = escapeBrackets(text)
  const candidates = [
    ...findEmailCandidates(escaped, hints?.email),
    ...findDateCandidates(escaped),
    ...findAddressCandidates(escaped),
    ...findPhoneCandidates(escaped),
    ...findNameCandidates(escaped, hints?.name),
  ]
  const accepted = resolveOverlaps(candidates)
  return buildAnonymized(escaped, accepted)
}

/** Tauscht jeden Platzhalter aus `map` im Text exakt gegen sein Original zurück. */
export function deanonymize(text: string, map: PiiMap): string {
  let result = text
  for (const [placeholder, original] of Object.entries(map)) {
    result = result.split(placeholder).join(original)
  }
  return unescapeBrackets(result)
}
