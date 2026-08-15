/**
 * Prompt für die Stellenanzeigen-Analyse (Aufgabe 9, `analyzeJobAd`).
 *
 * **Promptsprache: Deutsch.** Begründung: Applai selbst ist ein deutsches
 * Projekt — Code-Kommentare, Commit-Nachrichten und Dokumentation sind
 * durchgehend Deutsch (`CLAUDE.md`, Abschnitt "Konventionen"). Der Prompt
 * ist ein Entwicklerartefakt wie diese Kommentare, kein Oberflächentext
 * (G8 gilt hier nicht — G8 betrifft, was der *Nutzer* sieht). Alle drei fest
 * verdrahteten Modelle (Gemini, GPT, Claude) folgen deutschen Anweisungen
 * zuverlässig, unabhängig von der Sprache der zu analysierenden Anzeige.
 *
 * **Sprache der erzeugten Freitextfelder (`tone`, `requirements[].text`,
 * `salutation`): die Sprache der Anzeige, nicht die Promptsprache und nicht
 * zwingend Deutsch.** Begründung: `analyzeJobAd(text, provider, apiKey)`
 * bekommt keine `uiLanguage` — die Funktionssignatur (wörtliche Vorgabe der
 * Aufgabenstellung) kennt die Oberflächensprache schlicht nicht, kann sie
 * also nicht steuern. Fest auf Deutsch zu setzen wäre falsch: `salutation`
 * wird laut Aufgabe 12 unverändert in den Briefkopf übernommen, und
 * `docs/spec.md` legt fest "Zielsprache = Sprache der Anzeige" — bei einer
 * englischen Anzeige wird auch der Rest des Anschreibens (Aufgabe 11) auf
 * Englisch verfasst. Eine deutsche Anrede über einem englischen Brief wäre
 * ein gebrochener Briefkopf. Die Beispielanrede in der Aufgabenstellung
 * ("Sehr geehrter Herr Dr. Meier") ist deshalb als *Beispiel* zu lesen,
 * nicht als Sprachvorgabe — sie zeigt nur, dass die Anrede wörtlich
 * übernehmbar sein muss. Dieselbe Sprachregel gilt für `tone` (Aufgabe 13
 * zeigt sie dem Nutzer als Analyse *der Anzeige* an, natürlicherweise in
 * deren eigener Sprache) und für `requirements[].text` (wörtliche
 * Anforderungen aus der Anzeige — eine Übersetzung wäre ein zusätzlicher,
 * unnötiger Verfremdungsschritt, siehe G10).
 *
 * `company`, `position`, `contactPerson` sind Eigennamen bzw. Zitate aus der
 * Anzeige und daher ohnehin sprachunabhängig wörtlich zu übernehmen.
 *
 * **`position` ausdrücklich vollständig.** Ohne die Auflage kürzt ein Modell
 * die Stellenbezeichnung auf ihren Kern — aus „Werkstudent (m/w/d) im
 * Private Banking als Unterstützung für die Bereichsleitung" wurde
 * „Werkstudent (m/w/d) im Private Banking". Im Betreff des Anschreibens
 * fällt das auf: Der Personaler sucht dort die Stelle, auf die beworben
 * wird, und findet eine andere Bezeichnung als in seiner eigenen Anzeige.
 * Gekürzt wird nirgends im Programm — `nullableFactString` schneidet nichts
 * ab —, die Auflage muss also im Prompt stehen.
 */

const REQUIREMENT_KINDS = ['skill', 'experience', 'education', 'language', 'soft'] as const

function buildSystemPrompt(detectedLanguage: 'de' | 'en'): string {
  return `Du analysierst eine Stellenanzeige für eine Bewerbungs-App. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock. Das JSON-Objekt muss exakt diese Form haben:

{
  "language": "de" | "en",
  "company": string | null,
  "position": string | null,
  "contactPerson": string | null,
  "salutation": string | null,
  "requirements": [ { "text": string, "kind": "skill" | "experience" | "education" | "language" | "soft" } ],
  "tone": string
}

Verbindliche Regeln, in dieser Reihenfolge zu prüfen:

1. "language": die Sprache der Stellenanzeige, "de" oder "en". Eine deterministische Vorprüfung hat bereits "${detectedLanguage}" ermittelt – bestätige diesen Wert, sofern der Anzeigentext dem nicht eindeutig widerspricht.

2. "company", "position", "contactPerson": Nenne hier ausschließlich, was wörtlich oder eindeutig erschließbar in der Anzeige steht. Steht eine der drei Angaben NICHT in der Anzeige, ist der Wert für genau dieses Feld null – rate niemals einen plausibel klingenden Namen, erfinde nichts aus Weltwissen, vervollständige nichts. Ein falscher Firmenname ist schlimmer als ein fehlender.

2a. "position" ist die VOLLSTÄNDIGE Stellenbezeichnung, Wort für Wort so, wie sie in der Anzeige steht – auch wenn sie lang ist oder aus mehreren Teilen besteht. Kürze sie nicht, fasse sie nicht zusammen und lasse keinen Zusatz weg. Steht in der Anzeige "Werkstudent (m/w/d) im Private Banking als Unterstützung für die Bereichsleitung", dann ist genau das der Wert – nicht "Werkstudent" und nicht "Werkstudent im Private Banking". Weg bleiben nur Dinge, die nicht zur Bezeichnung gehören: eine vorangestellte Kennziffer, ein angehängter Standort nach Komma, ein Datum.

3. "salutation": die Briefanrede zur wörtlichen Übernahme in einem Anschreiben, in der Sprache der Anzeige (Deutsch z. B. "Sehr geehrter Herr Dr. Meier", Englisch z. B. "Dear Ms. Connolly"), abgeleitet aus "contactPerson" inklusive erkennbarem Titel. Ist "contactPerson" null, MUSS "salutation" ebenfalls null sein – erfinde niemals eine allgemeine Anrede wie "Sehr geehrte Damen und Herren", wenn kein Ansprechpartner genannt ist.

4. "requirements": eine Liste aller klar erkennbaren Anforderungen aus der Anzeige, je ein Eintrag pro Anforderung. "text" ist die Anforderung in der Sprache der Anzeige, kurz und konkret. "kind" ist die treffendste dieser fünf Kategorien: ${REQUIREMENT_KINDS.join(', ')}. Enthält die Anzeige tatsächlich keine erkennbaren Anforderungen, liefere ein leeres Array – erfinde keine Anforderungen, um die Liste zu füllen.

5. "tone": eine kurze Beschreibung (ein Satz, in der Sprache der Anzeige) des Unternehmenstons, z. B. "locker und dynamisch, duzt die Bewerbenden" oder "förmlich und traditionell".

Erfinde niemals Fakten, die nicht in der Anzeige stehen – das gilt am strengsten für Regel 2 und 3.`
}

function buildUserPrompt(text: string, detectedLanguage: 'de' | 'en'): string {
  return `Erkannte Sprache (deterministisch, Stoppwort-Zählung): ${detectedLanguage}

Stellenanzeige:
"""
${text}
"""`
}

/**
 * Baut System- und Nutzer-Prompt für die Stellenanzeigen-Analyse.
 * `detectedLanguage` kommt aus `detectLanguage` (`src/lib/domain/language.ts`)
 * – deterministisch vorgeschaltet, dem Modell nur zur Bestätigung gegeben
 * (siehe Aufgabenstellung).
 */
export function buildJobAdPrompt(text: string, detectedLanguage: 'de' | 'en'): { system: string; user: string } {
  return {
    system: buildSystemPrompt(detectedLanguage),
    user: buildUserPrompt(text, detectedLanguage),
  }
}
