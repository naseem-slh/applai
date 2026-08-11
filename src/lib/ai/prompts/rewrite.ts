import type { TruthMode } from '../../storage/adapter'

/**
 * Prompts für das Umschreiben einer markierten Textstelle (Aufgabe 11,
 * `domain/rewrite.ts`).
 *
 * **Promptsprache: Deutsch**, aus demselben Grund wie in `prompts/jobAd.ts`
 * und `prompts/styleProfile.ts` — der Prompt ist ein Entwicklerartefakt, kein
 * Oberflächentext (G8 gilt hier nicht). Die *Antwort* des Modells steht
 * dagegen in der Zielsprache; die steht im Nutzer-Prompt ausdrücklich als
 * Klartext ("Zielsprache: Deutsch"/"Englisch").
 *
 * **Zwei getrennte Prompts, weil Übersetzen und Anpassen laut `docs/spec.md`
 * zwei Schritte sind** ("Übersetzen und Anpassen sind getrennte Schritte"):
 * `buildTranslationPrompt` übersetzt ausschließlich, `buildRewritePrompt`
 * formuliert ausschließlich um. Ein einziger Prompt, der beides zugleich
 * verlangt, vermischt die beiden Fehlerquellen (falsche Übersetzung vs.
 * erfundener Inhalt) und macht sie für den Nutzer nicht mehr trennbar.
 *
 * **Warum die Regler NICHT über `temperature` laufen:** `LlmRequest.temperature`
 * ist auf allen drei fest verdrahteten Modellen wirkungslos oder schädlich und
 * wird von keiner Anbieterdatei gesendet (siehe `provider.ts`, Fix-Runde 1).
 * Beide Regler wirken deshalb ausschließlich über den Text: die Förmlichkeit
 * über das Stilprofil (`styleProfileToPromptFragment`, in `styleFragment`
 * hineingereicht), die Länge über `lengthGoal` unten.
 *
 * Diese Datei kennt `src/lib/domain` nicht (Architektur-Grenze, `CLAUDE.md`):
 * `JobAd` wird deshalb nicht importiert, sondern als schmales
 * {@link JobAdSummary} übergeben, und das Stilprofil kommt bereits als
 * fertiger Textbaustein an.
 */

/**
 * Genau drei Varianten — `docs/spec.md`: "**Drei Varianten** zur Auswahl".
 * Eine Zahl, zwei Verwendungen: dieser Prompt fordert sie an, das Zod-Schema
 * in `domain/rewrite.ts` erzwingt sie. Deshalb hier als einzige Quelle.
 */
export const VARIANT_COUNT = 3

/** Was der Längenregler aus Aufgabe 13 inhaltlich bedeutet — die Zahl selbst deutet `domain/rewrite.ts`. */
export type LengthGoal = 'shorter' | 'similar' | 'longer'

/** Die Teile der Stellenanzeige, die für das Umformulieren gebraucht werden (siehe Doc-Kommentar oben). */
export interface JobAdSummary {
  company: string | null
  position: string | null
  tone: string
  requirements: string[]
}

export interface RewritePromptInput {
  selection: string
  contextBefore: string
  contextAfter: string
  jobAd: JobAdSummary
  /** Fließtext aus Lebenslauf und bestehendem Anschreiben – die Belegquelle der Wahrheitsmodi. */
  facts: string
  /** Fertig gerenderter Stilbaustein aus `styleProfileToPromptFragment` (Aufgabe 10), inklusive Reglerwirkung. */
  styleFragment: string
  truthMode: TruthMode
  targetLanguage: 'de' | 'en'
  lengthGoal: LengthGoal
}

export interface TranslationPromptInput {
  selection: string
  contextBefore: string
  contextAfter: string
  sourceLanguage: 'de' | 'en'
  targetLanguage: 'de' | 'en'
}

const LANGUAGE_LABELS: Record<'de' | 'en', string> = { de: 'Deutsch', en: 'Englisch' }

/**
 * Die drei Wahrheitsmodi aus `docs/spec.md`, wörtlich: "**Streng** als
 * Grundregel. **Brücken** zuschaltbar (nur inhaltlich gedeckte
 * Verallgemeinerungen). **Frei** zuschaltbar — mit farbiger Markierung,
 * Einzelbestätigung und Exportsperre."
 *
 * Der Prompt ist die erste Schicht, nicht die einzige: `domain/rewrite.ts`
 * lehnt eine Antwort ab, die in `strict`/`bridge` trotzdem unbelegte Aussagen
 * meldet, und prüft in `free`, ob jede gemeldete Aussage wörtlich im
 * Variantentext steht (sonst kann die Oberfläche sie weder farbig markieren
 * noch einzeln bestätigen lassen).
 */
const TRUTH_MODE_RULES: Record<TruthMode, string> = {
  strict: `Modus "streng" (Grundregel): Verwende ausschließlich Aussagen, die in der Faktenbasis oder in der markierten Auswahl selbst belegt sind. Verboten sind neue Zahlen, Zeiträume, Titel, Abschlüsse, Firmen, Werkzeuge, Ergebnisse und Eigenschaften – auch dann, wenn sie plausibel klingen oder gut zur Stellenanzeige passen. Umformulieren heißt hier: dieselbe Aussage anders sagen, nicht mehr sagen. Auch eine Steigerung ("umfassend", "langjährig", "federführend") ist eine neue Aussage, wenn die Belege sie nicht hergeben. Wenn eine Variante ohne eine unbelegte Aussage schwächer wirkt, ist die schwächere Variante die richtige. "unbackedClaims" ist in diesem Modus für jede Variante ein leeres Array [].`,
  bridge: `Modus "Brücken": wie "streng", zusätzlich erlaubt sind Verallgemeinerungen, die der belegte Inhalt bereits trägt – aus mehreren belegten Einzelbeispielen darf eine zusammenfassende Formulierung werden (Beispiel: drei belegte Projekte mit Terminverantwortung dürfen zu "Erfahrung in der Projektplanung" werden). Die Verallgemeinerung darf nie mehr behaupten als die Belege zusammen hergeben: kein neuer Zeitraum, keine neue Zahl, kein neues Werkzeug, keine neue Rolle, keine Steigerung ohne Beleg. "unbackedClaims" ist auch in diesem Modus für jede Variante ein leeres Array [].`,
  free: `Modus "frei" (vom Nutzer ausdrücklich eingeschaltet): Du darfst zusätzlich Aussagen ergänzen, die nicht belegt sind, wenn sie zur Stelle passen. Jede einzelne unbelegte Aussage MUSS in "unbackedClaims" derselben Variante stehen, und zwar WÖRTLICH als genau der Abschnitt, der so auch in "text" steht – gleiche Zeichenfolge, keine Umschreibung, keine Zusammenfassung, keine Erklärung. Grund: Der Nutzer bekommt jede dieser Stellen farbig markiert, muss sie einzeln bestätigen, und der Export bleibt gesperrt, solange eine unbestätigt ist. Eine Aussage, die du nicht wörtlich zitierst, kann er weder sehen noch bestätigen – sie würde ungeprüft in seinem Anschreiben landen. Enthält eine Variante nichts Unbelegtes, ist ihr "unbackedClaims" ein leeres Array [].`,
}

const LENGTH_GOAL_RULES: Record<LengthGoal, string> = {
  shorter: 'Länge: Die Variante soll deutlich kürzer sein als die Auswahl – knappere Sätze, weniger Ausschmückung. Kürzen heißt straffen, nicht belegte Aussagen weglassen, die die Auswahl trägt.',
  similar: 'Länge: Die Variante soll ungefähr so lang sein wie die Auswahl.',
  longer: 'Länge: Die Variante darf ausführlicher sein als die Auswahl – mehr Ausformulierung derselben Aussagen, aber keine zusätzlichen Fakten (siehe Wahrheitsgrenze).',
}

/**
 * Der Platzhalter-Hinweis steht IMMER im Prompt, auch bei abgeschalteter
 * Anonymisierung: Er kostet einen Satz, und ein Modell, das keine Platzhalter
 * sieht, kann auch keine verändern. Andersherum wäre der Fehler teuer – ein
 * übersetzter oder ausgefüllter Platzhalter ([NAME] → "Dear Sir") überlebt den
 * Rücktausch nicht und stünde sichtbar im fertigen Brief.
 */
const PLACEHOLDER_RULE = `Platzhalter in eckigen Klammern ([NAME], [EMAIL], [TEL], [ADRESSE], [GEBURTSDATUM], auch nummeriert wie [EMAIL_2]) sind anonymisierte persönliche Daten. Übernimm sie unverändert und an sinnvoller Stelle – niemals übersetzen, umbenennen, entfernen oder mit erfundenen Daten füllen.`

function buildRewriteSystemPrompt(input: RewritePromptInput): string {
  return `Du bist der Umformulierungs-Assistent einer Bewerbungs-App. Der Nutzer hat in seinem eigenen Anschreiben eine Textstelle markiert. Deine Aufgabe: genau drei Neuformulierungen GENAU DIESER Textstelle – im eigenen Stil des Nutzers, nicht in einem allgemein "guten" Stil. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock. Das JSON-Objekt muss exakt diese Form haben:

{
  "variants": [
    { "text": string, "unbackedClaims": string[] },
    { "text": string, "unbackedClaims": string[] },
    { "text": string, "unbackedClaims": string[] }
  ]
}

Verbindliche Regeln, in dieser Reihenfolge zu prüfen:

1. GENAU ${VARIANT_COUNT} Varianten – nicht zwei, nicht vier. Eine Antwort mit einer anderen Anzahl wird vollständig verworfen. "unbackedClaims" ist immer anzugeben, notfalls als leeres Array [].

2. NUR DIE AUSWAHL: Der Text vor und nach der Auswahl ("Kontext davor", "Kontext danach") ist nur zum Mitlesen da, damit du den Zusammenhang verstehst. Er ist nicht Teil der Aufgabe und darf nicht verändert, nicht fortgesetzt und nicht mit zurückgegeben werden. Gib in "text" ausschließlich den Ersatz für die Auswahl zurück – keinen Satz aus dem Kontext, auch nicht teilweise, auch nicht als Überleitung. Die Variante wird wörtlich an die Stelle der Auswahl gesetzt: Alles, was du aus dem Kontext mitlieferst, stünde danach doppelt im Brief.

3. DREI VERSCHIEDENE ANSÄTZE, nicht dreimal derselbe Satz mit anderen Wörtern:
   - Variante 1 bleibt nah am Original: gleicher Aufbau, gleiche Reihenfolge der Aussagen, nur Feinschliff in Ton und Wortwahl.
   - Variante 2 baut anders auf: andere Satzstruktur oder andere Reihenfolge der Aussagen (z. B. Ergebnis zuerst statt Tätigkeit zuerst).
   - Variante 3 setzt einen anderen Schwerpunkt: hebt einen anderen belegten Aspekt derselben Auswahl hervor, der zur Stellenanzeige passt.
   Die drei Varianten dürfen sich nicht nur in einzelnen Wörtern unterscheiden. Sie stehen zur Auswahl nebeneinander – drei fast gleiche Vorschläge sind für den Nutzer wertlos.

4. STIL: Schreibe im Stilprofil des Nutzers (siehe Nutzer-Prompt). Es ist sein Brief, nicht deiner – übernimm seine Anredeform, seine Satzlänge und seine Eigenheiten, auch wenn du es anders formulieren würdest.

5. WAHRHEITSGRENZE. ${TRUTH_MODE_RULES[input.truthMode]}

6. ${LENGTH_GOAL_RULES[input.lengthGoal]}

7. ${PLACEHOLDER_RULE}

Die gesamte Antwort steht in dieser Sprache: ${LANGUAGE_LABELS[input.targetLanguage]}.`
}

function factsBlock(facts: string): string {
  return facts.trim() === '' ? '(keine Unterlagen übergeben)' : facts
}

function jobAdBlock(jobAd: JobAdSummary): string {
  const requirements =
    jobAd.requirements.length > 0
      ? jobAd.requirements.map((requirement) => `  - ${requirement}`).join('\n')
      : '  - (keine Anforderungen erkannt)'

  return `- Firma: ${jobAd.company ?? '(nicht genannt)'}
- Position: ${jobAd.position ?? '(nicht genannt)'}
- Ton der Anzeige: ${jobAd.tone}
- Anforderungen:
${requirements}`
}

function buildRewriteUserPrompt(input: RewritePromptInput, facts: string): string {
  return `Zielsprache: ${LANGUAGE_LABELS[input.targetLanguage]}

${input.styleFragment}

Stellenanzeige (nur zur Ausrichtung – diese Angaben stammen aus der Anzeige, nicht aus den Unterlagen des Nutzers und sind deshalb keine Belege über seine Person):
${jobAdBlock(input.jobAd)}

Faktenbasis aus Lebenslauf und bestehendem Anschreiben (neben der Auswahl selbst die EINZIGE zulässige Belegquelle):
"""
${facts}
"""

Kontext davor – NUR ZUM MITLESEN, nicht zurückgeben:
"""
${input.contextBefore}
"""

MARKIERTE AUSWAHL – nur diese umformulieren:
"""
${input.selection}
"""

Kontext danach – NUR ZUM MITLESEN, nicht zurückgeben:
"""
${input.contextAfter}
"""`
}

/** Baut System- und Nutzer-Prompt für die Umformulierung. */
export function buildRewritePrompt(input: RewritePromptInput): { system: string; user: string } {
  return {
    system: buildRewriteSystemPrompt(input),
    user: buildRewriteUserPrompt(input, factsBlock(input.facts)),
  }
}

/**
 * Baut System- und Nutzer-Prompt für den ersten von zwei Schritten bei
 * abweichender Zielsprache: die reine Übersetzung der Auswahl.
 *
 * Der Kontext geht auch hier mit – ohne ihn übersetzt das Modell einen aus
 * dem Zusammenhang gerissenen Halbsatz (Bezüge, Anredeform und Zeitform sind
 * dann Ratesache). Dass der Kontext dabei nicht mit zurückkommt, sichert
 * dieselbe ausdrückliche Anweisung wie beim Umformulieren, plus die Prüfung
 * in `domain/rewrite.ts`.
 */
export function buildTranslationPrompt(input: TranslationPromptInput): { system: string; user: string } {
  const system = `Du übersetzt eine markierte Textstelle aus einem Bewerbungsanschreiben von ${LANGUAGE_LABELS[input.sourceLanguage]} nach ${LANGUAGE_LABELS[input.targetLanguage]}. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock:

{
  "translation": string
}

Verbindliche Regeln:

1. Übersetze ausschließlich die markierte Auswahl. Der Text davor und danach ist nur zum Mitlesen da, damit Bezüge und Anredeform stimmen; er gehört nicht in "translation" – auch nicht teilweise.

2. Übersetzen heißt übersetzen: nichts hinzufügen, nichts weglassen, nicht umformulieren, nicht verbessern, nichts an den Adressaten anpassen. Das Anpassen an Stil und Stelle passiert in einem zweiten, getrennten Schritt.

3. ${PLACEHOLDER_RULE}`

  const user = `Quellsprache: ${LANGUAGE_LABELS[input.sourceLanguage]}
Zielsprache: ${LANGUAGE_LABELS[input.targetLanguage]}

Kontext davor – NUR ZUM MITLESEN, nicht zurückgeben:
"""
${input.contextBefore}
"""

MARKIERTE AUSWAHL – nur diese übersetzen:
"""
${input.selection}
"""

Kontext danach – NUR ZUM MITLESEN, nicht zurückgeben:
"""
${input.contextAfter}
"""`

  return { system, user }
}
