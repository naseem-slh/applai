/**
 * Prompt für die Stilprofil-Analyse (Aufgabe 10, `deriveStyleProfile`).
 *
 * **Promptsprache: Deutsch**, aus demselben Grund wie in `prompts/jobAd.ts`
 * (Aufgabe 9): der Prompt ist ein Entwicklerartefakt, kein Oberflächentext
 * (G8 gilt hier nicht). Alle drei fest verdrahteten Modelle folgen deutschen
 * Anweisungen zuverlässig, unabhängig von der Sprache des Anschreibens.
 *
 * **Sprache von "traits" (dem einzigen freien Fließtextfeld der
 * Modellantwort): die Sprache des Anschreibens**, aus demselben Grund wie
 * `tone`/`requirements[].text` in Aufgabe 9 – Aufgabe 13 zeigt die Merkmale
 * dem Nutzer als Analyse *seines eigenen Textes* an, natürlicherweise in
 * dessen eigener Sprache, nicht übersetzt.
 *
 * **"sentenceLength" und "address" kommen NICHT vom Modell** (siehe
 * `domain/styleProfile.ts`, `computeSentenceLength`/`detectAddress`) – sie
 * werden deterministisch vorberechnet und dem Modell hier nur als Kontext
 * mitgegeben, u. a. damit "formality" nicht offensichtlich widerspricht
 * (ein laut Vorprüfung "du"-Text kann kaum als 100/100 "durchgehend Sie"
 * eingestuft werden). `domain/styleProfile.ts` erzwingt diesen Zusammenhang
 * zusätzlich noch einmal nach dem Parsen (`assertCoherentFormality`) – der
 * Prompt allein ist nur die erste, nicht die einzige Schicht.
 */

type Address = 'sie' | 'du' | 'none'

const ADDRESS_LABELS: Record<Address, string> = {
  sie: '"Sie" (förmlich)',
  du: '"du" (persönlich)',
  none: 'keine direkte Anrede der Leserin/des Lesers erkennbar',
}

function buildSystemPrompt(detectedLanguage: 'de' | 'en'): string {
  return `Du analysierst den Schreibstil eines bestehenden Bewerbungsanschreibens für eine Bewerbungs-App. Der Zweck: Eine KI soll später einzelne Textstellen dieses Anschreibens neu formulieren – und zwar im EIGENEN Stil dieser Person, nicht in einem allgemein "guten" oder neutralen Stil. Antworte ausschließlich mit einem einzigen JSON-Objekt – kein Fließtext davor oder danach, kein Markdown-Codeblock. Das JSON-Objekt muss exakt diese Form haben:

{
  "formality": number,
  "traits": string[],
  "sample": string
}

Verbindliche Regeln, in dieser Reihenfolge zu prüfen:

1. "formality": eine Zahl zwischen 0 und 100, wie förmlich das Anschreiben insgesamt wirkt.
   - 0 bedeutet: sehr locker – durchgehend "du"-Anrede, umgangssprachliche Wendungen, kurze, direkte Sätze, ggf. Ausrufe.
   - 50 bedeutet: neutral-professionell – klare, vollständige Sätze, kaum Floskeln, weder betont locker noch steif.
   - 100 bedeutet: sehr förmlich – durchgehend "Sie"-Anrede mit vollständigen Titeln, traditionelle Höflichkeitsfloskeln, keine Umgangssprache.
   Ordne den Text ausschließlich anhand der tatsächlichen Wortwahl und Anredeform entlang dieser Skala ein. Eine deterministische Vorprüfung hat die Anredeform und die durchschnittliche Satzlänge bereits ermittelt (siehe Nutzer-Prompt) – "formality" darf diesen beiden Werten nicht offensichtlich widersprechen: ein Text, der laut Vorprüfung durchgehend "du" verwendet, kann kaum bei 100 liegen (100 bedeutet per Definition durchgehend "Sie").

2. "traits": eine Liste kurzer, konkreter Beobachtungen zum Schreibstil, mindestens ein Eintrag, jeder ein knapper Satz oder Halbsatz in der Sprache des Anschreibens (laut Vorprüfung: "${detectedLanguage}"), z. B. "nennt Ergebnisse mit konkreten Zahlen" oder "beginnt Absätze mit kurzen Hauptsätzen". Beschreibe ausschließlich, was im Text tatsächlich erkennbar ist – erfinde keine Eigenschaft, die dort nicht belegt ist.

3. "sample": genau zwei Sätze, WÖRTLICH und UNVERÄNDERT aus dem Originaltext kopiert – keine Paraphrase, keine Korrektur, keine Kürzung, keine Ergänzung. Die beiden Sätze müssen zusammenhängend so im Anschreiben vorkommen und den Stil gut zeigen.

Erfinde niemals einen Stileindruck, der im Text nicht belegt ist – das gilt am strengsten für Regel 3: "sample" wird nach dieser Antwort wörtlich gegen den Originaltext geprüft, eine nicht exakt enthaltene Antwort wird verworfen.`
}

function buildUserPrompt(text: string, detectedLanguage: 'de' | 'en', address: Address, sentenceLength: number): string {
  return `Erkannte Sprache (deterministisch, Stoppwort-Zählung): ${detectedLanguage}
Deterministisch ermittelte Anredeform: ${ADDRESS_LABELS[address]}
Deterministisch ermittelte durchschnittliche Satzlänge: ${sentenceLength} Wörter pro Satz

Anschreiben:
"""
${text}
"""`
}

/**
 * Baut System- und Nutzer-Prompt für die Stilprofil-Analyse. `detectedLanguage`
 * kommt aus `detectLanguage` (`src/lib/domain/language.ts`), `address` aus
 * `detectAddress` und `sentenceLength` aus `computeSentenceLength` (beide
 * `src/lib/domain/styleProfile.ts`) – alle drei deterministisch vorberechnet,
 * dem Modell nur als Kontext mitgegeben (siehe Kommentar oben).
 */
export function buildStyleProfilePrompt(
  text: string,
  detectedLanguage: 'de' | 'en',
  address: Address,
  sentenceLength: number,
): { system: string; user: string } {
  return {
    system: buildSystemPrompt(detectedLanguage),
    user: buildUserPrompt(text, detectedLanguage, address, sentenceLength),
  }
}
