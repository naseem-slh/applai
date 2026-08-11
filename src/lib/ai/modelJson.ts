import { z } from 'zod'
import type { ZodType } from 'zod'

/**
 * Die Zod-Schema-Grenze für Modellantworten (Aufgabe 9, "Zod-Schema als
 * Grenze"). **Übergabe an die Aufgaben 10–12** (Stilprofil, Varianten,
 * Lückenliste): jede Antwort eines `LlmProvider` läuft durch
 * `parseModelJson(schema, raw, label)`, bevor sie das Programm erreicht —
 * kein Aufrufer parst `JSON.parse` selbst. Diese Datei kennt kein konkretes
 * Schema und keine Domäne (`src/lib/ai` kennt laut `CLAUDE.md` kein
 * `src/lib/domain`); die Schemata selbst gehören in die jeweilige Domain-
 * Datei (`src/lib/domain/jobAd.ts` usw.).
 *
 * Grund für den eigenen Baustein statt Wiederholung in jeder Domain-Datei:
 * `LlmRequest.json` (siehe `provider.ts`) nutzt bei Anthropic nur eine
 * Prompt-Anweisung statt eines nativen schemafreien Modus — selbst mit
 * `json: true` kann die Antwort also Fließtext drumherum oder einen
 * Markdown-Codeblock enthalten (siehe `anthropic.ts`,
 * `JSON_ONLY_INSTRUCTION`). Jeder Aufrufer müsste sonst dieselbe
 * Codeblock-/Fließtext-Behandlung einzeln nachbauen.
 */

/**
 * Wird geworfen, wenn eine Modellantwort entweder kein auswertbares JSON
 * enthält (z. B. abgeschnitten mitten im Objekt) oder zwar gültiges JSON,
 * aber nicht dem erwarteten Schema entspricht (z. B. ein fehlendes
 * Pflichtfeld oder ein falscher Typ). Beide Fälle sind **verschieden** von
 * einem legitim fehlenden Wert, den das Schema selbst als `null` zulässt —
 * das ist kein Fehler, sondern ein gültiges Ergebnis (siehe `JobAdSchema`
 * in `src/lib/domain/jobAd.ts`).
 *
 * `label` ist der vom Aufrufer übergebene Kontext (z. B.
 * "Stellenanzeigen-Analyse") — eine reine Entwickler-Diagnose, kein
 * Oberflächentext (G8, siehe `LlmError` in `errors.ts` für dasselbe
 * Prinzip). Die Oberfläche zeigt bei einem Fehlschlag eine übersetzte,
 * generische Meldung; diese Fehlermeldung landet höchstens in der
 * Entwicklerkonsole.
 */
export class ModelResponseError extends Error {
  readonly label: string

  constructor(label: string, message: string) {
    super(message)
    this.name = 'ModelResponseError'
    this.label = label
  }
}

/**
 * Obergrenze für die im Fehlertext zitierte Rohantwort. Eine vollständige,
 * bis zu mehrere tausend Zeichen lange Modellantwort in einer Fehlermeldung
 * ist weder in der Entwicklerkonsole noch in einer Fehlerbenachrichtigung
 * brauchbar (siehe Aufgabenstellung: "ein gekürzter 8000 Zeichen langer
 * Antworttext in einer Fehlermeldung ist unbrauchbar").
 */
const RAW_SNIPPET_LIMIT = 300

function truncateForError(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length <= RAW_SNIPPET_LIMIT) return trimmed
  return `${trimmed.slice(0, RAW_SNIPPET_LIMIT)}…`
}

/**
 * Sucht innerhalb von `raw` den ersten balancierten JSON-Wert (Objekt oder
 * Array) und liefert genau diesen Ausschnitt zurück — unabhängig davon, ob
 * davor/danach ein Markdown-Codeblock-Zaun oder erklärender Fließtext steht
 * (beides behandelt dasselbe Verfahren gleich: es ist einfach Text
 * außerhalb der ersten balancierten Klammer). Berücksichtigt Zeichenketten
 * (inklusive Escapes), damit eine `}`- oder `]`-artige Zeichenfolge
 * *innerhalb* eines JSON-Strings die Klammertiefe nicht verfälscht.
 *
 * Findet keine schließende Klammer (abgeschnittene Antwort), wird der Rest
 * ab der ersten öffnenden Klammer zurückgegeben — `JSON.parse` schlägt
 * darauf mit einem regulären `SyntaxError` fehl, den `parseModelJson`
 * abfängt und in eine verständliche `ModelResponseError` übersetzt.
 * Findet sich gar keine öffnende Klammer, wird `raw` unverändert
 * zurückgegeben (auch das lässt `JSON.parse` kontrolliert scheitern).
 */
function extractJsonCandidate(raw: string): string {
  const openers: Record<string, string> = { '{': '}', '[': ']' }

  for (let start = 0; start < raw.length; start++) {
    const opener = raw[start]
    if (opener !== '{' && opener !== '[') continue
    const closer = openers[opener]!

    let depth = 0
    let inString = false
    let escapeNext = false

    for (let i = start; i < raw.length; i++) {
      const char = raw[i]

      if (inString) {
        if (escapeNext) escapeNext = false
        else if (char === '\\') escapeNext = true
        else if (char === '"') inString = false
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }
      if (char === opener) depth++
      else if (char === closer) {
        depth--
        if (depth === 0) return raw.slice(start, i + 1)
      }
    }

    // Öffnende Klammer gefunden, aber nie wieder auf Tiefe 0 — abgeschnittene
    // Antwort. Rest ab hier zurückgeben, JSON.parse liefert den Fehler.
    return raw.slice(start)
  }

  return raw
}

/**
 * Parst eine rohe Modellantwort gegen ein Zod-Schema — die Grenze, hinter
 * der das übrige Programm nie wieder mit unstrukturiertem Modelltext zu tun
 * hat. Zwei getrennte Fehlerarten (siehe Aufgabenstellung, "fehlerhaftes
 * oder abgeschnittenes JSON wirft eine verständliche Fehlermeldung"):
 *
 * 1. Kein auswertbares JSON (Syntaxfehler, z. B. abgeschnitten) →
 *    `ModelResponseError` ohne Feldbezug.
 * 2. Gültiges JSON, das nicht dem Schema entspricht (Pflichtfeld fehlt,
 *    falscher Typ, ungültiger Enum-Wert) → `ModelResponseError`, deren
 *    Nachricht den betroffenen Feldpfad nennt (erstes Zod-Issue).
 *
 * Unbekannte Zusatzfelder sind **kein** Fehler — Zod entfernt sie beim
 * Parsen eines `z.object(...)`-Schemas standardmäßig (kein `.strict()`).
 * Ein Modell, das ein zusätzliches Feld wie `"confidence"` mitliefert, soll
 * die Analyse nicht scheitern lassen.
 */
export function parseModelJson<T>(schema: ZodType<T>, raw: string, label: string): T {
  const candidate = extractJsonCandidate(raw)

  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch {
    throw new ModelResponseError(
      label,
      `${label}: Modellantwort ist kein gültiges JSON (möglicherweise abgeschnitten). Rohantwort (gekürzt): "${truncateForError(raw)}"`,
    )
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    const path = firstIssue && firstIssue.path.length > 0 ? firstIssue.path.join('.') : '(Wurzel)'
    const detail = firstIssue?.message ?? 'unbekannter Schema-Fehler'
    throw new ModelResponseError(
      label,
      `${label}: Modellantwort entspricht nicht dem erwarteten Schema – Feld "${path}": ${detail}. Rohantwort (gekürzt): "${truncateForError(raw)}"`,
    )
  }

  return result.data
}

/**
 * **Fix-Runde 1** (siehe task-9-report.md): bekannte Platzhalter-Wörter,
 * mit denen Modelle "kein Wert vorhanden" ausdrücken, obwohl der Prompt
 * ausdrücklich `null` verlangt. Ohne diese Liste hätte `nullableFactString`
 * unten ein Modell, das z. B. "unbekannt" statt JSON-`null` schreibt,
 * unbemerkt wie einen echten Wert durchgereicht — genau der G10-Verstoß,
 * den die Zod-Schema-Grenze dieser Aufgabe verhindern soll: ein Aufrufer,
 * der das naheliegende `if (jobAd.company)` schreibt, hätte einen Brief an
 * die Firma "unbekannt" adressiert.
 *
 * Deutsch und Englisch (Applais beide Sprachen), sowohl kurze Abkürzungen
 * als auch ausformulierte Varianten, die Modelle in der Praxis ebenso oft
 * verwenden wie die Abkürzung selbst:
 *
 * - Kurzformen: "n/a", "n.a.", "na", "k.a.", "k. a.", "ka", "tbd", "-".
 * - Ausformuliert Deutsch: "unbekannt", "nicht bekannt", "nicht angegeben",
 *   "keine angabe".
 * - Ausformuliert Englisch: "unknown", "not available", "not applicable",
 *   "not specified", "unspecified", "to be determined", "none".
 * - Sonstige: "null" (ein Modell, das das JSON-Schlüsselwort versehentlich
 *   als Zeichenkette statt als Literal schreibt), "nil", "?", "???".
 *
 * Alle Einträge klein geschrieben — der Abgleich in {@link isPlaceholder}
 * ist case-insensitive und prüft den **gesamten** getrimmten Wert, nie nur
 * einen Teilstring: eine Firma, die zufällig "Unknown Origins GmbH" heißt,
 * ist ein seltener, aber legitimer Name und darf nicht zu `null` werden.
 */
const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  'n/a', 'n.a.', 'na',
  'k.a.', 'k. a.', 'ka',
  'tbd', 'to be determined',
  '-', '–', '—',
  'unbekannt', 'nicht bekannt', 'nicht angegeben', 'keine angabe',
  'unknown', 'not available', 'not applicable', 'not specified', 'unspecified', 'none',
  'null', 'nil', '?', '???',
])

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.toLowerCase())
}

/**
 * Gemeinsame Zod-Grenze für ein nullable "Fakt"-Feld — einen Wert, der laut
 * G10 nur wörtlich aus der Modellantwort übernommen werden darf, niemals
 * erfunden. Gehört seit Fix-Runde 1 in diese Datei statt in `jobAd.ts`,
 * weil das Platzhalter-Problem nicht spezifisch für Stellenanzeigen ist:
 * jedes künftige Schema (Aufgaben 10–12), das ein Modell nach einem
 * optionalen Fakt fragt ("nenne X, falls erkennbar, sonst null"), trifft
 * auf dieselbe Modell-Neigung, statt `null` ein Platzhalterwort zu
 * schreiben. Diese Funktion ist die einzige Stelle, die diesen Fall kennen
 * muss.
 *
 * **Nur für Fakt-Felder verwenden** (Eigennamen, Zitate — z. B.
 * `company`/`position`/`contactPerson`/`salutation` in `jobAd.ts`), **nie**
 * für Freitext, den das Modell selbst formuliert (z. B. `tone` oder
 * `requirements[].text`) — dort könnte ein legitimer Text zufällig ein
 * Platzhalter-Wort *sein* (unwahrscheinlich, aber möglich) oder *enthalten*
 * (die Teilstring-Sicherheit schützt bereits davor, ganz ausschließen sollte
 * die engere Verwendung trotzdem nur bei echten Fakt-Feldern gelten).
 *
 * Normalisiert in dieser Reihenfolge: `null` bleibt `null`; eine (nach dem
 * Trimmen) leere Zeichenkette wird zu `null` (Fix vor Fix-Runde 1: ein
 * Modell, das statt `null` `""` liefert, meint dasselbe); ein bekanntes
 * Platzhalterwort wird zu `null` (Fix-Runde 1); alles andere bleibt der
 * getrimmte Originalwert.
 */
export const nullableFactString = z
  .string()
  .nullable()
  .transform((value) => {
    if (value === null) return null
    const trimmed = value.trim()
    if (trimmed === '' || isPlaceholder(trimmed)) return null
    return trimmed
  })
