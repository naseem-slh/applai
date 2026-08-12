/**
 * Prompt für die Lückenliste (Aufgabe 12, `domain/gaps.ts`, `analyzeGaps`).
 *
 * **Promptsprache: Deutsch**, aus demselben Grund wie in `prompts/jobAd.ts`
 * und `prompts/rewrite.ts` – der Prompt ist ein Entwicklerartefakt, kein
 * Oberflächentext (G8 gilt hier nicht).
 *
 * **Sprache von "evidence" (dem einzigen freien Fließtextfeld der
 * Modellantwort): die Sprache der Stellenanzeige (`language`-Parameter,
 * `jobAd.language`)**, aus demselben Grund wie `tone`/`requirements[].text`
 * in Aufgabe 9 und `traits` in Aufgabe 10 – `docs/spec.md`: "Zielsprache =
 * Sprache der Anzeige". Die Lückenliste ist ein Analyseergebnis ÜBER die
 * Anzeige, wird also natürlicherweise in deren Sprache formuliert, nicht in
 * einer separaten Oberflächensprache.
 *
 * **Diese Datei kennt `src/lib/domain` nicht** (Architektur-Grenze,
 * `CLAUDE.md`): `Requirement`/`JobAd` werden deshalb nicht importiert,
 * sondern als schmale {@link GapsPromptInput} übergeben – dasselbe Muster
 * wie `JobAdSummary` in `prompts/rewrite.ts`.
 *
 * **"index" statt Anforderungstext als Bindeglied:** Jede Anforderung trägt
 * im Prompt eine fortlaufende Nummer (0-basiert), und die Modellantwort
 * verweist ausschließlich über diese Nummer zurück (siehe unten,
 * Regel 1). `domain/gaps.ts` bindet jeden Eintrag der Antwort über "index"
 * an das ORIGINAL-`Requirement`-Objekt aus der Eingabe – der von der
 * Antwort mitgelieferte Anforderungstext (den es hier bewusst gar nicht
 * gibt) würde nie geprüft und könnte unbemerkt vom tatsächlichen Text
 * abweichen. Derselbe Grundsatz wie bei der Anrede in Aufgabe 9: nicht dem
 * Modell-Echo vertrauen, wenn die Eingabe selbst schon die verlässliche
 * Quelle ist.
 */

export interface GapRequirementInput {
  index: number
  text: string
  kind: string
}

export interface GapsPromptInput {
  requirements: GapRequirementInput[]
  /** `jobAd.language` – steuert nur die Sprache von "evidence", siehe Doc-Kommentar oben. */
  language: 'de' | 'en'
  /** Fließtext aus Lebenslauf und/oder bestehendem Anschreiben – die einzige zulässige Beleg-Quelle. */
  facts: string
}

const LANGUAGE_LABELS: Record<'de' | 'en', string> = { de: 'Deutsch', en: 'Englisch' }

function buildSystemPrompt(language: 'de' | 'en'): string {
  return `Du prüfst für eine Bewerbungs-App, welche Anforderungen einer Stellenanzeige durch die vorliegenden Fakten der Bewerberin/des Bewerbers (Lebenslauf und/oder bestehendes Anschreiben) tatsächlich gedeckt sind. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock. Das JSON-Objekt muss exakt diese Form haben:

{
  "assessments": [ { "index": number, "status": "covered" | "partial" | "missing", "evidence": string | null } ]
}

Verbindliche Regeln, in dieser Reihenfolge zu prüfen:

1. Liefere für JEDE unten nummerierte Anforderung genau EINEN Eintrag in "assessments" – nicht mehr, nicht weniger. "index" ist exakt die Nummer der Anforderung aus der Liste unten (0-basiert). Kein Index darf doppelt vorkommen, keiner darf fehlen.

2. "status": "covered", wenn die Fakten die Anforderung eindeutig und konkret belegen. "partial", wenn die Fakten sie nur teilweise, abgeschwächt oder über verwandte (aber nicht identische) Erfahrung belegen. "missing", wenn die Fakten dazu nichts hergeben.

3. "evidence": bei "covered" und "partial" eine kurze Begründung (ein Satz, in ${LANGUAGE_LABELS[language]}), die sich AUSSCHLIESSLICH auf tatsächlich in den Fakten stehende Angaben stützt – kein Weltwissen, keine Vermutung, keine Ergänzung plausibel klingender Details, die dort nicht stehen. Bei "missing" ist "evidence" null.

4. Gib NIRGENDS eine Zahl, einen Prozentwert oder eine Bewertungsskala für den Deckungsgrad an – weder als eigenes Feld noch als Teil von "evidence" (verboten sind z. B. Formulierungen wie "70% abgedeckt" oder "7 von 10 Anforderungen erfüllt"). Der Status ("covered"/"partial"/"missing") ist die einzige zulässige Aussage über den Deckungsgrad.

Erfinde niemals eine Deckung, die die Fakten nicht hergeben – ein zu Unrecht als "covered" oder "partial" markierter Punkt ist schlimmer als ein ehrlich als "missing" markierter, weil er später unbelegt in einem Anschreiben landen könnte.`
}

function buildUserPrompt(input: GapsPromptInput): string {
  const requirementLines = input.requirements
    .map((r) => `${r.index}. [${r.kind}] ${r.text}`)
    .join('\n')

  return `Anforderungen der Stellenanzeige (Sprache: ${LANGUAGE_LABELS[input.language]}):
${requirementLines}

Fakten aus Lebenslauf/Anschreiben:
"""
${input.facts}
"""`
}

/** Baut System- und Nutzer-Prompt für die Lückenanalyse. */
export function buildGapsPrompt(input: GapsPromptInput): { system: string; user: string } {
  return {
    system: buildSystemPrompt(input.language),
    user: buildUserPrompt(input),
  }
}
