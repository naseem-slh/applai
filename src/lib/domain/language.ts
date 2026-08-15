/**
 * Deterministische Spracherkennung per Stoppwort-Zählung.
 *
 * Läuft **vor** jedem Modellaufruf, der eine Sprache braucht (Aufgabe 9:
 * `analyzeJobAd`; laut Aufgabenstellung auch von Aufgabe 11 für die
 * Zielsprache wiederverwendbar) — reproduzierbar, ohne Netzwerk, ohne die
 * Unschärfe eines Modells. Das Modell bekommt das Ergebnis in Aufgabe 9 nur
 * zur Bestätigung im Prompt; das deterministische Ergebnis gewinnt immer
 * über eine abweichende Modellantwort (siehe `jobAd.ts`, `analyzeJobAd`).
 *
 * Bewusst **Stoppwörter statt allgemeiner Worthäufigkeit**: Stoppwörter sind
 * grammatische Funktionswörter (Artikel, Pronomen, Konjunktionen, häufige
 * Präpositionen), die in einer Sprache immer wieder auftauchen, unabhängig
 * vom Fachvokabular des Texts. Das ist genau die Eigenschaft, die den in der
 * Aufgabenstellung genannten Härtefall löst: eine deutsche Stellenanzeige
 * voller englischer Fachbegriffe ("Kubernetes", "Deployment", "Sprint",
 * "Cloud-Native" …). Diese Begriffe sind Substantive/Fachjargon, keine
 * Stoppwörter — sie verändern die Zählung kaum, während die grammatischen
 * Wörter des umgebenden deutschen Satzbaus ("und", "für", "mit", "wird", …)
 * unverändert häufig bleiben. Eine Zählung über *alle* Wörter (allgemeine
 * Worthäufigkeit/Wörterbuchabgleich) würde in genau diesem Fall kippen.
 */

/**
 * Deutsche Stoppwörter — bewusst nur Wörter, die **nicht zugleich** ein
 * eigenständiges, gebräuchliches englisches Wort sind (siehe
 * `language.test.ts`, das die Überschneidungsfreiheit mit
 * `ENGLISH_STOPWORDS` als Regressionsschutz prüft). Mehrdeutige Wörter wie
 * "was" (englisch: Vergangenheitsform von "is"), "hat" (englisch: Hut) oder
 * "also" (englisch: "ebenfalls") sind deshalb absichtlich ausgeschlossen —
 * sie würden in beiden Sprachen zählen und damit keine Unterscheidungskraft
 * liefern (in "also" sogar mit vertauschter Bedeutung).
 */
const GERMAN_STOPWORDS: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'von', 'zu', 'den', 'dem',
  'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'nicht', 'auch', 'wird', 'werden', 'sich', 'auf', 'sie', 'wir', 'sind', 'wie',
  'oder', 'aber', 'haben', 'hast', 'habt',
  'kann', 'können', 'müssen', 'muss', 'sollten', 'soll', 'sollen',
  'uns', 'ihre', 'ihrer', 'ihren', 'ihrem',
  'durch', 'über', 'nach', 'aus', 'sehr',
  'diese', 'dieser', 'dieses', 'diesem', 'diesen',
  'wenn', 'dass', 'damit', 'dabei', 'dadurch', 'deshalb',
  'zwischen', 'jede', 'jeder', 'jedes', 'jedem', 'jeden',
  'seine', 'seiner', 'seinem', 'seinen',
  'unser', 'unsere', 'euch', 'bitte', 'bereits', 'sowie', 'sowohl', 'gerne',
  'immer', 'alle', 'allen', 'alles', 'mehr', 'keine', 'kein', 'keinen',
  'noch', 'schon', 'um', 'wobei', 'ohne', 'gegen', 'bis', 'unter', 'vor', 'während',
  'wurde', 'wurden', 'worden', 'würde', 'könnte',
])

/**
 * Englische Stoppwörter — spiegelbildlich zu {@link GERMAN_STOPWORDS} ohne
 * Wörter, die auch im Deutschen als eigenständiges Wort vorkommen (z. B.
 * "will" = deutsche Form von "wollen", "so" und "also" im Deutschen
 * gebräuchlich, "all" ebenfalls ein deutsches Wort).
 */
const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'of', 'to', 'for', 'with', 'that', 'this', 'are', 'by', 'or',
  'from', 'we', 'you', 'your',
  'have', 'has', 'must', 'should',
  'us', 'our', 'through', 'about', 'after', 'out', 'only', 'already', 'very',
  'these', 'what', 'if', 'which', 'not', 'but', 'they', 'their', 'them',
  'any', 'can', 'could', 'would', 'please', 'more', 'most', 'some', 'such',
  'than', 'then', 'there', 'when', 'where', 'who', 'whom',
  'into', 'onto', 'within', 'without', 'across', 'during', 'before', 'between',
  'each', 'every', 'other', 'own', 'same', 'just', 'both', 'few',
])

/** Zerlegt einen Text in Wörter (nur Buchstaben, Unicode-fähig für Umlaute), klein geschrieben. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? []
}

/**
 * Erkennt die Sprache eines Texts als `'de'` oder `'en'` — die einzigen
 * beiden von Applai unterstützten Sprachen (G8). Zählt für jedes Wort im
 * Text, ob es in der deutschen oder englischen Stoppwortliste steht, und
 * liefert die Sprache mit der höheren Trefferzahl.
 *
 * Bei Gleichstand (einschließlich 0:0, z. B. ein sehr kurzer Text ganz ohne
 * Stoppwörter) gewinnt Deutsch — Applais Standardsprache (G8: Vorauswahl
 * `'de'`, wenn die Browsersprache unbekannt ist; dieselbe Konvention gilt
 * hier für unentscheidbare Texte).
 */
export function detectLanguage(text: string): 'de' | 'en' {
  let germanHits = 0
  let englishHits = 0

  for (const token of tokenize(text)) {
    if (GERMAN_STOPWORDS.has(token)) germanHits++
    if (ENGLISH_STOPWORDS.has(token)) englishHits++
  }

  return englishHits > germanHits ? 'en' : 'de'
}

/** Nur für `language.test.ts` — Regressionsschutz gegen mehrdeutige Wörter in beiden Listen. */
export const _internal = { GERMAN_STOPWORDS, ENGLISH_STOPWORDS }
