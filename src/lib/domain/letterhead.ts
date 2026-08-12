import type { JobAd } from './jobAd'

/**
 * Aufgabe 12 — Briefkopfvorschlag und Fremdfirmen-Warnung.
 *
 * Beide Funktionen hier laufen **ohne KI** – anders als `gaps.ts` im selben
 * Aufgabenpaket. `docs/spec.md`: "Briefkopf | Empfänger, Datum, Betreff und
 * Anrede werden vorgeschlagen und sind vor Übernahme prüfbar" und
 * "Fremdfirmen-Warnung | Deterministischer Abgleich …". Beide Vorschläge
 * sind Vorschläge, keine Festlegungen – die Oberfläche (Aufgaben 13/14)
 * zeigt sie an, der Nutzer sieht und korrigiert sie vor der Übernahme.
 */

export interface Letterhead {
  recipient: string
  date: string
  subject: string
  salutation: string
}

/**
 * Die einzige Stelle, an der dieser Vorschlag tatsächlich einen Satz
 * FORMULIERT statt nur Vorhandenes zu übernehmen – und deshalb die einzige,
 * die eine G10-Prüfung braucht: Ist das Erfinden einer Anrede ohne bekannten
 * Ansprechpartner nicht genau der Fall, den `jobAd.ts` (Aufgabe 9) verbietet
 * ("erfinde niemals eine allgemeine Anrede … wenn kein Ansprechpartner
 * genannt ist")?
 *
 * Nein – aus zwei Gründen, die den Unterschied ausmachen:
 * 1. Diese Formel erfindet keine PERSON. "Sehr geehrte Damen und Herren" /
 *    "Dear Hiring Team" behauptet nicht, es gäbe einen bestimmten
 *    Ansprechpartner mit Namen und Titel – sie ist im Gegenteil die im
 *    deutschen wie englischen Geschäftsbrief übliche Formel GENAU für den
 *    Fall, dass kein Name bekannt ist. Aufgabe 9 verbietet das Erfinden
 *    eines Fakts (eines Namens); hier wird kein Fakt behauptet.
 * 2. Es ist ein VORSCHLAG, kein automatisch verschickter Text. Die
 *    Oberfläche zeigt den Briefkopf zur Prüfung an (`docs/spec.md`: "sind
 *    vor Übernahme prüfbar") – der Nutzer sieht die generische Anrede, bevor
 *    sie irgendwo landet, und kann sie ändern, falls er den Ansprechpartner
 *    doch kennt (z. B. aus einem Telefonat, das nicht in der Anzeige stand).
 *
 * Ist `jobAd.contactPerson` dagegen bekannt, wird NICHT neu formuliert:
 * `jobAd.salutation` (bereits von Aufgabe 9 samt erkennbarem Titel
 * extrahiert) wird wörtlich übernommen. Das ist bewusst so und nicht etwa
 * eine an `uiLanguage` angepasste Neuformulierung ("Sehr geehrte(r)
 * {contactPerson}") – eine solche Übersetzung müsste die Anrede-Form
 * (Herr/Frau) aus dem Namen erschließen, was bei einem einzelnen
 * Eigennamen unzuverlässig ist und im schlimmsten Fall ein falsches
 * Geschlecht unterstellt. `jobAd.ts` sagt es selbst: `salutation` ist "die
 * Briefanrede zur wörtlichen Übernahme in einem Anschreiben" – genau das
 * passiert hier. Eine dadurch mögliche Sprachmischung (Anzeige englisch,
 * `uiLanguage` deutsch) ist die bewusst kleinere Nebenwirkung gegenüber
 * einer erfundenen Anrede.
 */
const SALUTATION_FALLBACK: Record<'de' | 'en', string> = {
  de: 'Sehr geehrte Damen und Herren',
  en: 'Dear Hiring Team',
}

const SUBJECT_GENERIC: Record<'de' | 'en', string> = {
  de: 'Bewerbung',
  en: 'Application',
}

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

/**
 * Formatiert `today` nach `uiLanguage` – Deutsch als TT.MM.JJJJ (z. B.
 * "12.08.2026"), Englisch als ausgeschriebene Geschäftsbrief-Form (z. B.
 * "August 12, 2026", die im englischsprachigen Geschäftsbrief gängige
 * "Month DD, YYYY"-Form). Bewusst OHNE `Intl.DateTimeFormat`: Diese Funktion
 * legt die exakte Zeichenkette selbst fest, statt sich auf die ICU-Daten der
 * Laufzeitumgebung zu verlassen – Applai läuft im Browser des Nutzers
 * (`CLAUDE.md`: "kein Server, kein Backend"), dessen konkrete
 * `Intl`-Implementierung diese Funktion nicht kennt.
 *
 * Liest ausschließlich lokale Komponenten aus `today`
 * (`getDate`/`getMonth`/`getFullYear`, nicht die UTC-Varianten) – das
 * Kalenderdatum, wie der Nutzer es in seiner Zeitzone sieht. Ruft an keiner
 * Stelle `new Date()` selbst auf: Nur der übergebene `today`-Parameter
 * entscheidet über das Ergebnis, sonst wäre das Ergebnis von der Uhrzeit
 * des Testlaufs abhängig und nicht reproduzierbar pinnbar.
 */
function formatDate(today: Date, uiLanguage: 'de' | 'en'): string {
  const day = today.getDate()
  const month = today.getMonth()
  const year = today.getFullYear()

  if (uiLanguage === 'de') {
    return `${pad2(day)}.${pad2(month + 1)}.${year}`
  }
  return `${MONTH_NAMES_EN[month]} ${day}, ${year}`
}

/**
 * Baut den Empfänger aus Firma und (falls bekannt) Ansprechpartner –
 * niemals aus erfundenen Angaben.
 *
 * Ist `jobAd.company` `null`, ist der Empfänger die leere Zeichenkette –
 * AUCH DANN, wenn `jobAd.contactPerson` ausnahmsweise gesetzt ist (beide
 * Felder sind in `JobAdSchema`, Aufgabe 9, unabhängig voneinander
 * nullable). Ein Empfänger, der nur aus einem Personennamen ohne Firma
 * besteht, ist kein sinnvoller Briefkopf-Empfänger und würde der
 * Oberfläche einen Teilerfolg vortäuschen, wo tatsächlich die wichtigste
 * Angabe fehlt. Die Oberfläche füllt die Lücke – diese Funktion erfindet
 * nichts hinein (siehe auch `buildSubject` unten für dieselbe Linie bei
 * der Position).
 */
function buildRecipient(jobAd: JobAd): string {
  if (jobAd.company === null) return ''
  return jobAd.contactPerson === null ? jobAd.company : `${jobAd.company}\n${jobAd.contactPerson}`
}

/**
 * Ist `jobAd.position` `null`, ist der Betreff ein allgemeiner Platzhalter
 * ohne erfundenen Stellentitel ("Bewerbung"/"Application") statt z. B.
 * "Bewerbung als [Position]" mit einer geratenen Lücke – die Oberfläche
 * zeigt diesen generischen Betreff zur Ergänzung an.
 */
function buildSubject(jobAd: JobAd, uiLanguage: 'de' | 'en'): string {
  if (jobAd.position === null) return SUBJECT_GENERIC[uiLanguage]
  return uiLanguage === 'de' ? `Bewerbung als ${jobAd.position}` : `Application for ${jobAd.position}`
}

/**
 * Schlägt Empfänger, Datum, Betreff und Anrede für den Briefkopf vor – rein
 * deterministisch aus den bereits bekannten `JobAd`-Feldern und `today`,
 * ohne KI-Aufruf. Siehe die Doc-Kommentare der einzelnen Bausteine oben für
 * die Begründung jeder einzelnen Entscheidung (Anrede-Fallback, leerer
 * Empfänger, generischer Betreff, Datumsformat).
 */
export function suggestLetterhead(jobAd: JobAd, uiLanguage: 'de' | 'en', today: Date): Letterhead {
  return {
    recipient: buildRecipient(jobAd),
    date: formatDate(today, uiLanguage),
    subject: buildSubject(jobAd, uiLanguage),
    salutation: jobAd.salutation ?? SALUTATION_FALLBACK[uiLanguage],
  }
}

// ---------------------------------------------------------------------------
// Fremdfirmen-Warnung
// ---------------------------------------------------------------------------

/**
 * Maskiert Regex-Sonderzeichen in einem wörtlich zu suchenden Firmennamen
 * ("S&P Global", "Müller + Partner GmbH") – ohne das würde z. B. "+" als
 * Quantifizierer statt als literales Zeichen gelesen, im schlimmsten Fall
 * (unbalancierte Klammern in einem Firmennamen) mit einem ungültigen
 * regulären Ausdruck statt eines falschen Treffers.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Findet Vorkommen bekannter Firmennamen im Text (z. B. im bestehenden
 * Anschreiben) – der deterministische Abgleich, der den klassischen
 * Kopierfehler abfängt: eine frühere Bewerbung diente als Vorlage, und der
 * Name der früheren Firma blieb irgendwo stehen.
 *
 * **Kein Teilstring-Fehlalarm:** "Bosch" darf nicht innerhalb von
 * "Boschmann" treffen. Die Grenzprüfung `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`
 * (Unicode-Buchstabe/-Ziffer statt des ASCII-beschränkten `\b`) ist
 * dasselbe Muster wie `findWholePhraseOccurrences` in
 * `privacy/anonymize.ts` – dort für Namen/E-Mail-Adressen, hier für
 * Firmennamen. Bewusst hier noch einmal lokal definiert statt von dort
 * importiert: Beide Funktionen lösen zwar dasselbe technische Problem
 * (Ganzwort-Treffer, keine Regex-Sonderzeichen), gehören aber zu
 * unterschiedlichen Zuständigkeiten (PII-Anonymisierung vs.
 * Fremdfirmen-Erkennung) – `escapeRegExp` dort ist zudem nicht exportiert.
 * Ein Import würde die beiden Module unnötig aneinanderkoppeln, für zwei
 * Zeilen Code.
 *
 * `gui`-Flags: `g` für alle Vorkommen, `u` für die Unicode-Eigenschaften in
 * der Grenzprüfung, `i` für Groß-/Kleinschreibungs-Unabhängigkeit ("Bosch"
 * findet auch "BOSCH"/"bosch").
 *
 * `currentCompany` wird aus der Suchliste ausgeschlossen (getrimmt,
 * groß-/kleinschreibungs-unabhängig verglichen) – sie ist per Definition
 * KEINE Fremdfirma, auch wenn sie zufällig in `knownCompanies` steht.
 *
 * Rückgabe sortiert nach `index` (Position im Text) für eine stabile,
 * von-links-nach-rechts lesbare Reihenfolge, wie die Oberfläche sie zum
 * Hervorheben braucht.
 *
 * **Bekannte Grenze (dokumentiert, kein Versehen):** Ein mehrwortiger
 * Firmenname wird nur bei EXAKT derselben Leerraum-Anordnung gefunden wie
 * in `knownCompanies` hinterlegt – ein Zeilenumbruch oder doppeltes
 * Leerzeichen mitten im Namen (z. B. bei einem Textumbruch im Anschreiben)
 * würde nicht mehr treffen. Eine Leerraum-Normalisierung würde zugleich den
 * zurückgegebenen `index` verfälschen (er zeigt auf den UNVERÄNDERTEN
 * Text) – für den hier verlangten Fall (Kopierfehler mit demselben,
 * unveränderten Firmennamen) ist das kein praktisches Problem.
 */
export function findForeignCompanyNames(
  text: string,
  currentCompany: string | null,
  knownCompanies: string[],
): { name: string; index: number }[] {
  const currentNormalized = currentCompany === null ? null : currentCompany.trim().toLowerCase()
  const results: { name: string; index: number }[] = []

  for (const company of knownCompanies) {
    const trimmed = company.trim()
    if (!trimmed) continue
    if (currentNormalized !== null && trimmed.toLowerCase() === currentNormalized) continue

    const pattern = `(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`
    const regex = new RegExp(pattern, 'gui')
    let match: RegExpExecArray | null
    while ((match = regex.exec(text))) {
      results.push({ name: trimmed, index: match.index })
    }
  }

  return results.sort((a, b) => a.index - b.index)
}
