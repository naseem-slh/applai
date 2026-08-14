/**
 * Prompt für die Stilprofil-Analyse eines **Lebenslaufs**
 * (`domain/cvStyleProfile.ts`, `deriveCvStyleProfile`).
 *
 * **Promptsprache: Deutsch**, aus demselben Grund wie in
 * `prompts/styleProfile.ts` und `prompts/jobAd.ts` — der Prompt ist ein
 * Entwicklerartefakt, kein Oberflächentext (G8 gilt hier nicht).
 *
 * **Sprache von `traits`: die Sprache des Lebenslaufs.** Die Merkmale werden
 * dem Nutzer als Beobachtung über sein eigenes Dokument angezeigt,
 * natürlicherweise in dessen Sprache.
 *
 * **Ein eigener Prompt, kein Zweig im Anschreiben-Prompt.** Der dort steht,
 * fragt nach Förmlichkeit, Anredeform und Satzlänge. An einem
 * Aufzählungspunkt hat davon nichts etwas zu greifen; ein Prompt, der beides
 * abdecken müsste, führte für jedes Dokument die Hälfte seiner Fragen ins
 * Leere — und ein Modell, dem man Unpassendes zu beantworten gibt,
 * beantwortet es trotzdem.
 *
 * **Drei Felder kommen NICHT vom Modell**: Länge, Schlusszeichen und Person
 * werden deterministisch vorberechnet (siehe `domain/cvStyleProfile.ts`) und
 * hier nur als Zusammenhang mitgegeben — damit die Antwort ihnen nicht
 * offensichtlich widerspricht.
 */

export interface CvStyleMeasurements {
  /** Median der Wörter je Eintrag. */
  bulletLength: number
  terminalPunctuation: boolean
  person: 'none' | 'first'
}

function buildSystemPrompt(detectedLanguage: 'de' | 'en'): string {
  return `Du analysierst die FORM der Einträge eines bestehenden Lebenslaufs für eine Bewerbungs-App. Der Zweck: Eine KI soll später einzelne Einträge dieses Lebenslaufs neu formulieren – und zwar in der EIGENEN Form dieses Dokuments, damit die umformulierte Zeile sich nicht von den Zeilen darüber und darunter unterscheidet. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock. Das JSON-Objekt muss exakt diese Form haben:

{
  "bulletForm": "verbFirst" | "nounPhrase" | "mixed",
  "tense": "present" | "past" | "mixed",
  "traits": string[],
  "sample": string
}

Verbindliche Regeln, in dieser Reihenfolge zu prüfen:

1. "bulletForm": Womit beginnt ein typischer Eintrag unter den Tätigkeiten?
   - "verbFirst": mit einem Verb – "Entwickelt Steuerungssoftware", "Verantwortet das Budget", "Led a team of five".
   - "nounPhrase": mit einem Substantiv – "Entwicklung von Steuerungssoftware", "Verantwortung für das Budget".
   - "mixed": beide Formen kommen etwa gleich häufig vor.
   Beurteile ausschließlich die Einträge unter den Tätigkeiten, nicht Überschriften, Datumszeilen, Anschrift oder Ausbildungsstationen.

2. "tense": In welcher Zeitform stehen die Einträge? "present", "past" oder "mixed". "mixed" ist der Normalfall, wenn laufende Tätigkeiten im Präsens und abgeschlossene in der Vergangenheit stehen – das ist eine bewusste Unterscheidung und kein Widerspruch.

3. "traits": eine Liste kurzer, konkreter Beobachtungen zur Form der Einträge, mindestens ein Eintrag, jeder ein knapper Satz oder Halbsatz in der Sprache des Lebenslaufs (laut Vorprüfung: "${detectedLanguage}"), z. B. "nennt Ergebnisse mit konkreten Zahlen", "nennt die eingesetzte Technik in Klammern", "hält jede Zeile auf eine Zeile". Beschreibe ausschließlich, was tatsächlich erkennbar ist – erfinde keine Eigenschaft, die dort nicht belegt ist.

4. "sample": genau EIN Eintrag, WÖRTLICH und UNVERÄNDERT aus dem Lebenslauf kopiert – keine Paraphrase, keine Korrektur, keine Kürzung, keine Ergänzung. Wähle einen Eintrag, der die übliche Form gut zeigt.

Erfinde niemals ein Formmerkmal, das im Dokument nicht belegt ist – das gilt am strengsten für Regel 4: "sample" wird nach dieser Antwort wörtlich gegen das Original geprüft, eine nicht exakt enthaltene Antwort wird verworfen.`
}

function buildUserPrompt(
  text: string,
  detectedLanguage: 'de' | 'en',
  measurements: CvStyleMeasurements,
): string {
  const length =
    measurements.bulletLength > 0
      ? `${measurements.bulletLength} Wörter (Median über alle Einträge mit mindestens drei Wörtern)`
      : 'nicht bestimmbar – zu wenige mehrwortige Einträge'
  return `Erkannte Sprache (deterministisch, Stoppwort-Zählung): ${detectedLanguage}
Deterministisch ermittelte übliche Eintragslänge: ${length}
Deterministisch ermittelte Satzzeichen am Zeilenende: ${measurements.terminalPunctuation ? 'ja, die Mehrheit der Einträge endet mit einem Punkt' : 'nein, die Einträge enden ohne Satzzeichen'}
Deterministisch ermittelte Person: ${measurements.person === 'first' ? 'Ich-Form' : 'ohne Ich'}

Lebenslauf:
"""
${text}
"""`
}

/**
 * Baut System- und Nutzer-Prompt für die Lebenslauf-Stilanalyse.
 * `detectedLanguage` kommt aus `detectLanguage`, die Messwerte aus
 * `computeBulletLength`, `detectTerminalPunctuation` und `detectPerson`
 * (alle `domain/cvStyleProfile.ts`) — dem Modell nur als Zusammenhang
 * mitgegeben, nie zur Übernahme.
 */
export function buildCvStyleProfilePrompt(
  text: string,
  detectedLanguage: 'de' | 'en',
  measurements: CvStyleMeasurements,
): { system: string; user: string } {
  return {
    system: buildSystemPrompt(detectedLanguage),
    user: buildUserPrompt(text, detectedLanguage, measurements),
  }
}
