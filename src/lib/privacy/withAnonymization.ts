import { anonymize, deanonymize } from './anonymize'
import type { AnonymizeHints } from './anonymize'

/**
 * Die Anonymisierungs-Klammer um **jeden** Versand von Nutzertext an einen
 * KI-Anbieter (Aufgabe 11, übergreifender Auftrag).
 *
 * `docs/spec.md` sagt: "Name, Anschrift, Geburtsdatum, Telefon, E-Mail
 * werden **vor dem Senden** durch Platzhalter ersetzt und danach
 * zurückgetauscht. Standardmäßig an, abschaltbar." — *vor dem Senden* heißt
 * vor JEDEM Senden, nicht nur vor dem Umformulieren. Betroffen sind heute
 * schon drei Aufrufwege:
 *
 * - `rewriteSelection` (Aufgabe 11) — Auswahl, Kontext, Faktenbasis,
 *   Stilbaustein,
 * - `deriveStyleProfile` (Aufgabe 10) — das vollständige Anschreiben samt
 *   Briefkopf,
 * - `analyzeGaps` (Aufgabe 12) — die Faktenbasis aus Lebenslauf und
 *   Anschreiben.
 *
 * Deshalb liegt diese Klammer **nicht** in `domain/rewrite.ts`, sondern
 * neben `anonymize`/`deanonymize` in `src/lib/privacy`: Sie gehört zur
 * Datenschutz-Verantwortung, nicht zur Umformulierung, und jede der drei
 * Stellen ruft dieselbe Funktion auf, statt den Zyklus dreimal nachzubauen.
 *
 * ---------------------------------------------------------------------------
 * SO RUFEN DIE ANDEREN AUFGABEN AUF
 * ---------------------------------------------------------------------------
 * Aufgabe 10 (`deriveStyleProfile`, unverändert übernommen — die Funktion ist
 * gegenüber dem Inhalt von `letterText` opak, siehe task-10-report.md):
 *
 * ```ts
 * const profil = await withAnonymization(
 *   { letterText },
 *   { enabled: settings.anonymize, userName },
 *   (felder) => deriveStyleProfile(felder.letterText, provider, apiKey),
 *   (p, zurueck) => ({ ...p, sample: zurueck(p.sample), traits: p.traits.map(zurueck) }),
 * )
 * ```
 *
 * Die Wörtlichkeitsprüfung von `sample` (Aufgabe 10) läuft dabei gegen genau
 * den anonymisierten Text, den das Modell gesehen hat — Prüfung und Modell
 * sehen dieselbe Fassung, die Zusammensetzung ist deshalb unkritisch.
 *
 * Aufgabe 12 (`analyzeGaps`) — die Stellenanzeige gehört bewusst NICHT in die
 * Klammer (öffentliches Dokument der Firma, siehe `domain/jobAd.ts`), die
 * Faktenbasis schon:
 *
 * ```ts
 * const luecken = await withAnonymization(
 *   { facts },
 *   { enabled: settings.anonymize, userName },
 *   (felder) => analyzeGaps(jobAd, felder.facts, provider, apiKey),
 *   (eintraege, zurueck) =>
 *     eintraege.map((e) => ({ ...e, evidence: e.evidence === null ? null : zurueck(e.evidence) })),
 * )
 * ```
 *
 * Aufgabe 13 (Oberfläche) ruft die Klammer nicht selbst auf, sondern liefert
 * ihre beiden Eingaben: `enabled` aus `Settings.anonymize` (Aufgabe 6,
 * standardmäßig an) und `userName` (siehe unten).
 *
 * `rewriteSelection` (Aufgabe 11) ruft die Klammer intern auf und bekommt
 * `AnonymizationSettings` als vierten, **pflichtigen** Parameter — siehe dort.
 *
 * ---------------------------------------------------------------------------
 * WARUM ALLE FELDER IN EINEM EINZIGEN DURCHLAUF ANONYMISIERT WERDEN
 * ---------------------------------------------------------------------------
 * `anonymize` nummeriert Platzhalter je Aufruf durch ([EMAIL], [EMAIL_2], …).
 * Würde man jedes Feld einzeln anonymisieren und die Zuordnungen danach
 * zusammenführen, bekämen zwei verschiedene E-Mail-Adressen in zwei
 * verschiedenen Feldern beide den Platzhalter `[EMAIL]` — beim Rücktausch
 * gewänne eine von beiden und stünde anschließend an der falschen Stelle im
 * Brief. Das ist kein theoretischer Fall: Auswahl und Faktenbasis stammen aus
 * demselben Bewerbungsvorgang und enthalten regelmäßig mehrere Kontaktdaten.
 *
 * Deshalb werden alle Felder mit einem Trenner zu EINEM Text verbunden,
 * gemeinsam anonymisiert und danach wieder aufgeteilt. Es gibt genau eine
 * Zuordnung (`PiiMap`) für den gesamten Vorgang — auch über mehrere
 * Modellaufrufe hinweg (Übersetzen + Anpassen in Aufgabe 11).
 *
 * Der Trenner (`\n` + Markierung + laufende Nummer + Markierung + `\n`) kann
 * durch Nutzertext nicht gefälscht werden: `joinFields` zählt die Nummer so
 * lange hoch, bis das Zusammensetzen und Wiederauftrennen den Ausgangszustand
 * exakt reproduziert. Keine Erkennungsregel aus `anonymize.ts` kann über den
 * Trenner hinweggreifen — alle Muster dort verwenden ausschließlich
 * waagerechten Leerraum (`[ \t]`), nie `\s`, und die Namenssuche sucht eine
 * getrimmte Ganzphrase. Zwei benachbarte Felder können also auch keinen
 * gemeinsamen Fehltreffer erzeugen.
 */

export interface AnonymizationSettings {
  /**
   * Aus `Settings.anonymize` (Aufgabe 6) — laut `docs/spec.md` standardmäßig
   * an und abschaltbar. Bei `false` geht der Text im Klartext an den
   * Anbieter und der Rücktausch ist die Identität; der Aufrufer braucht
   * dafür keinen zweiten Codeweg.
   */
  enabled: boolean
  /**
   * Der Name des Nutzers — wird als `hints.name` an `anonymize`
   * durchgereicht. **Pflichtfeld, bewusst nicht optional** (`string | null`
   * statt `name?: string`): Aufgabe 8 erkennt den Namen ohne Hinweis nur
   * über die ersten acht nicht-leeren Zeilen des übergebenen Textes. Eine
   * markierte Textstelle mitten im Anschreiben hat aber gar keinen
   * Kopfbereich — ohne Hinweis fände die Erkennung dort schlicht nichts und
   * der Klarname ginge an den Anbieter. Ein optionales Feld hätte man beim
   * Aufruf stillschweigend weglassen können; so muss jeder Aufrufer die
   * Frage beantworten, und `null` ist die ausdrückliche Antwort "unbekannt,
   * Kopfzeilen-Heuristik muss reichen".
   *
   * **Woher der Wert kommt:** aus dem Dokument, das die Oberfläche ohnehin
   * vollständig vorliegen hat (Anschreiben bzw. Lebenslauf, Aufgaben 2–4),
   * bzw. aus einer Korrektur des Nutzers. Die Oberfläche (Aufgabe 13)
   * ermittelt ihn EINMAL auf dem Volltext und reicht ihn an alle Aufrufe
   * weiter — nicht die Domänenfunktionen, die je nur einen Ausschnitt sehen.
   */
  userName: string | null
  /** Zusätzlicher E-Mail-Hinweis, falls die Oberfläche eine untypische Adresse kennt (z. B. ohne Punkt-TLD). */
  userEmail?: string | null
}

/**
 * Markierung des internen Feldtrenners — Unicode-Private-Use-Bereich, wie
 * das Klammer-Escaping in `anonymize.ts` (dort U+E000/U+E001). Im Quelltext
 * bewusst als Escape geschrieben, nicht als unsichtbares Rohzeichen.
 */
const FIELD_MARKER = '\uE010'

function joinFields(values: string[]): { joined: string; delimiter: string } {
  for (let n = 0; ; n++) {
    const delimiter = `\n${FIELD_MARKER}${n}${FIELD_MARKER}\n`
    const joined = values.join(delimiter)
    const parts = joined.split(delimiter)
    // Selbstprüfung statt Vermutung: nur ein Trenner, der den Ausgangszustand
    // exakt wiederherstellt, wird verwendet.
    if (parts.length === values.length && parts.every((part, i) => part === values[i])) {
      return { joined, delimiter }
    }
  }
}

function hintsFrom(settings: AnonymizationSettings): AnonymizeHints {
  const hints: AnonymizeHints = {}
  if (settings.userName && settings.userName.trim() !== '') hints.name = settings.userName
  if (settings.userEmail && settings.userEmail.trim() !== '') hints.email = settings.userEmail
  return hints
}

function identity(text: string): string {
  return text
}

/**
 * Anonymisiert alle `fields` in einem gemeinsamen Durchlauf, übergibt die
 * anonymisierte Fassung an `send` und tauscht die persönlichen Daten über
 * `restore` wieder in das Ergebnis zurück.
 *
 * `restore` ist ein **Pflichtparameter**, kein optionaler Rückgabewert: Der
 * Aufrufer kann den Rücktausch dadurch nicht vergessen, und nur er weiß,
 * welche Felder seines Ergebnistyps Text enthalten (bei Aufgabe 11 der
 * Variantentext UND die unbelegten Aussagen). Bei abgeschalteter
 * Anonymisierung bekommt `restore` die Identitätsfunktion — derselbe
 * Codeweg, nur ohne Ersetzung.
 *
 * Rückgabewerte sind IMMER zurückgetauscht. Ein Aufrufer, der ein Ergebnis
 * weiterverarbeitet und erneut sendet (Aufgabe 13), anonymisiert also
 * wieder Klartext und nie bereits gesetzte Platzhalter.
 */
export async function withAnonymization<F extends string, T>(
  fields: Record<F, string>,
  settings: AnonymizationSettings,
  send: (fields: Record<F, string>) => Promise<T>,
  restore: (result: T, restoreText: (text: string) => string) => T,
): Promise<T> {
  const keys = Object.keys(fields) as F[]

  if (!settings.enabled || keys.length === 0) {
    return restore(await send(fields), identity)
  }

  const { joined, delimiter } = joinFields(keys.map((key) => fields[key]))
  const { text, map } = anonymize(joined, hintsFrom(settings))

  const parts = text.split(delimiter)
  if (parts.length !== keys.length) {
    // Kann nach Konstruktion nicht eintreten (siehe Doc-Kommentar oben);
    // trotzdem laut statt still, weil ein verschobenes Feld sonst
    // unbemerkt fremden Text an das Modell schickte.
    throw new Error(
      `Anonymisierung: Feldtrenner wurde beim Anonymisieren verändert (${parts.length} statt ${keys.length} Felder).`,
    )
  }

  const anonymized = {} as Record<F, string>
  keys.forEach((key, i) => {
    anonymized[key] = parts[i]!
  })

  const result = await send(anonymized)
  return restore(result, (value) => deanonymize(value, map))
}

/** Nur für `withAnonymization.test.ts` — der Test baut damit einen absichtlich kollidierenden Feldinhalt. */
export const _internal = { FIELD_MARKER }
