import type { ProviderId } from './keyVault'

/**
 * Die Speicherschnittstelle von Applai.
 *
 * Diese Datei enthält ausschließlich Typen und die Schnittstelle selbst,
 * keine Umsetzung. `indexeddb.ts` implementiert `StorageAdapter` gegen
 * IndexedDB (die einzige heutige Umsetzung); eine spätere serverseitige
 * Umsetzung (Entscheidung „Erweiterbarkeit" in `docs/spec.md`) hängt sich
 * genau hier ein. Kein anderer Programmteil greift direkt auf IndexedDB zu —
 * jeder Zugriff läuft über `StorageAdapter`.
 */

/** Ein Eintrag der Bewerbungsliste: Firma, Stelle, Datum — nur im Browser. */
export interface Application {
  id: string
  company: string
  position: string
  /** ISO-Datum (`YYYY-MM-DD`) oder ein anderes von der Oberfläche gewähltes Format — die Schnittstelle schreibt keines vor. */
  date: string
}

/**
 * Automatischer Zwischenstand eines bearbeiteten Anschreibens.
 *
 * `docxBase` ist der eigentliche Dokumentinhalt (G5: nicht in `localStorage`,
 * nur in IndexedDB) — das gepatchte `.docx` als Bytes, aus denen die
 * Oberfläche jederzeit weiterarbeiten kann. `purgeExpiredDrafts` löscht
 * Entwürfe, die älter als eine vom Aufrufer übergebene Frist sind (laut
 * `docs/spec.md`: 7 Tage — diese Zahl gehört der aufrufenden Seite, nicht
 * der Speicherschicht).
 */
export interface Draft {
  id: string
  docxBase: ArrayBuffer
  text: string
  /** Zeitpunkt des letzten Speicherns, `Date.now()`-Millisekunden. */
  savedAt: number
  /**
   * Kennung der Stellenanzeige, für die die selbsttätige
   * Briefkopf-Übernahme (`src/routes/Editor.tsx`) beim Brief-Entwurf
   * zuletzt gelaufen ist — ein `textFingerprint` (`lib/text/fingerprint.ts`)
   * des Anzeigentexts. Diese Schicht kennt weder den Fingerabdruck-Algorithmus
   * noch, wofür er steht; sie legt den Wert nur ab und gibt ihn unverändert
   * zurück (dieselbe Zurückhaltung wie bei `CachedAnalysis.key`).
   *
   * Ausschließlich beim Brief-Entwurf gesetzt (`LETTER_DRAFT_ID`), nie beim
   * Lebenslauf — der hat keinen Briefkopf.
   *
   * **Ein fehlender Wert bedeutet „noch nie übernommen"**, nicht „für jede
   * Anzeige schon erledigt". Das ist die einzig sichere Richtung: Ein
   * älterer Entwurf aus der Zeit vor diesem Feld (oder ein über eine ältere
   * Sicherungsdatei wiederhergestellter) trägt es nicht, und die
   * Arbeitsfläche muss die Übernahme dafür trotzdem einmal versuchen dürfen
   * — sonst bliebe genau der Fall, für den es die selbsttätige Übernahme
   * gibt, für immer ohne sie.
   */
  letterheadAppliedFor?: string
}

/**
 * Eine vorgemerkte Stelle in ihrer speicherbaren Form.
 *
 * `text` ist der Wortlaut zum Zeitpunkt des Vormerkens und dient
 * ausschließlich als **Suchanker**, um die Stelle in einem später
 * überarbeiteten Anschreiben wiederzufinden — nicht als wiederverwendbarer
 * Textbaustein. `before` und `after` lösen mehrdeutige Treffer auf, wenn
 * derselbe Wortlaut mehrfach im Brief steht.
 *
 * Ankertexte sind Briefinhalt und liegen deshalb wie Entwürfe in IndexedDB,
 * nie in `localStorage` (G5).
 */
export interface MarkAnchor {
  text: string
  before: string
  after: string
  from: number
  to: number
}

/**
 * Alle vorgemerkten Stellen zu **einem** Anschreiben.
 *
 * `id` ist der Fingerabdruck des Anschreibens (SHA-256 seines normalisierten
 * Textes, siehe `components/editor/marks.ts`), nicht eine vom Nutzer
 * vergebene Kennung: Die Stellen werden ohne Zutun gemerkt und beim nächsten
 * Öffnen desselben Briefes selbsttätig wiederhergestellt.
 */
export interface MarkSet {
  id: string
  anchors: MarkAnchor[]
  /** Zeitpunkt des letzten Speicherns, `Date.now()`-Millisekunden. */
  savedAt: number
}

/**
 * Eine gespeicherte Auswertung: das Ergebnis eines Modellaufrufs, der
 * ausschließlich von seinen Eingaben abhängt.
 *
 * `key` ist ein Fingerabdruck über Art, Modell und Eingabetext (siehe
 * `lib/ai/analysisCache.ts`) — gleiche Eingabe, gleicher Schlüssel. Damit
 * wird derselbe Aufruf nie zweimal bezahlt.
 *
 * `value` ist bewusst `unknown`: Diese Schicht kennt die Fachtypen nicht und
 * soll sie nicht kennen. Wer liest, prüft das Gelesene gegen sein eigenes
 * Schema, bevor er es benutzt.
 */
export interface CachedAnalysis {
  key: string
  value: unknown
  /** Zeitpunkt des Ablegens, `Date.now()`-Millisekunden. */
  savedAt: number
}

/**
 * Wahrheitsgrenze beim Formulieren. Hier definiert, weil `Settings` sie
 * braucht; in Aufgabe 11 (Textvarianten) wiederverwendet.
 */
export type TruthMode = 'strict' | 'bridge' | 'free'

/** Nutzereinstellungen. `getSettings()` liefert sinnvolle Vorgaben, bevor je etwas gespeichert wurde — siehe `indexeddb.ts`. */
export interface Settings {
  provider: ProviderId
  /**
   * Vorgänger von {@link Settings.modelChain}: genau ein Modell je Anbieter.
   * Wird beim Lesen in eine einelementige Kette übernommen und danach nicht
   * mehr geschrieben. Steht hier, damit eine bereits getroffene Wahl nicht
   * stillschweigend verschwindet.
   *
   * @deprecated Zugunsten von `modelChain`.
   */
  models?: Partial<Record<ProviderId, string>>
  /**
   * Die Modellkette je Anbieter, in der Reihenfolge, in der sie versucht
   * wird. Leer oder fehlend heißt: das voreingestellte Modell.
   *
   * Eine Kette statt eines Modells, weil die kostenlosen Kontingente je
   * Modell zählen: Ist das erste erschöpft, kann das zweite die Arbeit
   * weiterführen, statt den Nutzer bis zum nächsten Tag stehen zu lassen
   * (siehe `lib/ai/fallback.ts`).
   */
  modelChain?: Partial<Record<ProviderId, string[]>>
  /**
   * Ob der hinterlegte Schlüssel abgerechnet wird — die Antwort, die der
   * Nutzer beim Einrichten gegeben hat.
   *
   * Kein Geheimnis und deshalb hier statt im Tresor: Der Tresor benutzt
   * dieselbe Antwort als Sperre („kostenpflichtig nur mit Passwort"),
   * behält sie aber nicht. Gebraucht wird sie für die Modellauswahl: Im
   * kostenlosen Tarif sind Pro-Modelle regelmäßig nicht enthalten, und ein
   * Modell anzubieten, das zuverlässig 429 antwortet, ist schlechter als es
   * wegzulassen. Fehlt die Angabe, wird vom kostenlosen Tarif ausgegangen,
   * denn das ist die Voreinstellung der Anwendung.
   */
  paidKey?: boolean
  /**
   * Sollen die vorgemerkten Stellen für die nächste Bewerbung erhalten
   * bleiben?
   *
   * Früher geschah das ungefragt. Das ist eine Entscheidung über
   * Briefinhalte — die Anker tragen den Wortlaut der Stellen —, und die
   * gehört dem Nutzer. Ohne Angabe wird nichts behalten: Die zurückhaltende
   * Vorgabe ist die, die nichts speichert.
   */
  keepMarks?: boolean
  uiLanguage: 'de' | 'en'
  anonymize: boolean
  truthMode: TruthMode
  theme: 'light' | 'dark' | 'system'
  /**
   * Der Maßstab der Arbeitsfläche in Prozent (25–100), wie ihn der
   * Maßstabsregler unten rechts am Blatt stellt.
   *
   * Eine Ansichtseinstellung, kein Dokumentinhalt: gespeichert wird eine
   * Zahl, sonst nichts (G5 bleibt unberührt). Ein Wert für beide Unterlagen
   * — wer den Brief herauszoomt, will den Lebenslauf daneben nicht wieder
   * herangeholt bekommen.
   *
   * Wahlfrei, weil jeder vor dieser Aufgabe gespeicherte Datensatz ohne ihn
   * auskommt. Gelesen wird er ausschließlich durch `clampZoom`
   * (`components/editor/zoom.ts`), das Fehlen und Unsinn auf 100 % zieht.
   */
  zoom?: number
}

export interface StorageAdapter {
  listApplications(): Promise<Application[]>
  addApplication(a: Omit<Application, 'id'>): Promise<Application>
  /**
   * Sucht einen bereits vorhandenen Eintrag mit derselben Firma und
   * derselben Stelle (Groß-/Kleinschreibung und umgebende Leerzeichen
   * spielen keine Rolle). `null`, wenn keiner gefunden wurde. Ein leerer
   * Suchbegriff ist kein Sonderfall: er passt nur auf einen gespeicherten
   * Wert, der nach demselben Trimmen ebenfalls leer ist. Löst selbst nichts
   * aus — die Oberfläche entscheidet, was der Hinweis „doppelte Bewerbung"
   * bewirkt.
   */
  findDuplicate(company: string, position: string): Promise<Application | null>
  /** Legt einen Entwurf an oder überschreibt ihn (Schlüssel: `Draft.id`) — so funktioniert das automatische Zwischenspeichern. */
  saveDraft(d: Draft): Promise<void>
  loadDraft(id: string): Promise<Draft | null>
  /**
   * Löscht genau einen Entwurf. Das ist die „nach Export"-Hälfte von G5
   * (`docs/spec.md`: „Entwürfe … gelöscht nach Export oder nach 7 Tagen") —
   * `purgeExpiredDrafts` deckt nur die zweite Hälfte ab, die Fristlöschung;
   * ein zu klein gewähltes `maxAgeMs` wäre kein Ersatz, weil es jeden
   * Entwurf träfe, nicht nur den gerade exportierten.
   *
   * Löst bei einer unbekannten Kennung **nicht**: Der erwartete Aufrufer
   * (Aufgabe 15) ruft dies unmittelbar nach einem erfolgreichen Export auf,
   * wenn die Kennung sicher existiert; ein doppelter Aufruf (etwa durch ein
   * zweites Browser-Tab oder einen zwischenzeitlichen Ablauf durch
   * `purgeExpiredDrafts`) soll dieselbe Wirkung haben wie ein einziger, statt
   * eine Ausnahme zu werfen, die der Aufrufer eigens abfangen müsste. Damit
   * verhält sich diese Methode wie `IDBObjectStore.delete()` selbst und wie
   * `loadDraft()` (liefert `null` statt zu werfen) — „fehlt bereits" ist in
   * dieser Schicht durchgehend kein Fehlerfall.
   */
  deleteDraft(id: string): Promise<void>
  /**
   * Löscht alle Entwürfe, die älter als `maxAgeMs` sind, und gibt ihre
   * Anzahl zurück. Die Frist ist bewusst ein Parameter, keine Konstante
   * dieser Schicht — siehe `Draft`.
   */
  purgeExpiredDrafts(maxAgeMs: number): Promise<number>
  /**
   * Alle gemerkten Sätze vorgemerkter Stellen. Die Oberfläche braucht das
   * für zweierlei: um beim Öffnen eines überarbeiteten Anschreibens auf den
   * zuletzt gespeicherten Satz zurückzufallen, und um die Zahl der Sätze
   * begrenzt zu halten. **Wie viele es höchstens sein dürfen, entscheidet
   * die aufrufende Seite** — dieselbe Trennung wie bei `purgeExpiredDrafts`,
   * dessen Frist ebenfalls ein Parameter und keine Konstante dieser Schicht
   * ist.
   */
  listMarkSets(): Promise<MarkSet[]>
  /** Der Satz zu diesem Anschreiben, `null` wenn zu ihm nichts gemerkt ist. */
  loadMarkSet(id: string): Promise<MarkSet | null>
  /** Legt einen Satz an oder überschreibt ihn (Schlüssel: `MarkSet.id`). */
  saveMarkSet(set: MarkSet): Promise<void>
  /** Löscht genau einen Satz. Löst bei unbekannter Kennung nicht — siehe `deleteDraft`. */
  deleteMarkSet(id: string): Promise<void>
  /**
   * Alle abgelegten Auswertungen. Die aufrufende Seite hält damit die Menge
   * begrenzt — wie viele sinnvoll sind, weiß sie, nicht diese Schicht
   * (dieselbe Trennung wie bei `purgeExpiredDrafts` und `listMarkSets`).
   */
  listCachedAnalyses(): Promise<CachedAnalysis[]>
  loadCachedAnalysis(key: string): Promise<CachedAnalysis | null>
  saveCachedAnalysis(entry: CachedAnalysis): Promise<void>
  /** Löst bei unbekanntem Schlüssel nicht — siehe `deleteDraft`. */
  deleteCachedAnalysis(key: string): Promise<void>
  getSettings(): Promise<Settings>
  /**
   * `true`, sobald einmal `saveSettings` (oder `importAll`) gelaufen ist —
   * `false`, solange `getSettings()` nur die Vorgaben zurückgibt.
   *
   * Ergänzt in Aufgabe 13c, weil die Oberfläche die Frage sonst nicht
   * beantworten kann: `getSettings()` liefert bei leerem Speicher
   * `DEFAULT_SETTINGS` und ist damit von einem Datensatz, der zufällig
   * dieselben Werte trägt, nicht zu unterscheiden. Genau darauf beruht aber
   * die Vorauswahl der Oberflächensprache nach der Browsersprache: Die
   * Speicherschicht liefert fest `'de'` (siehe `DEFAULT_SETTINGS`), die
   * Vorauswahl gehört der Oberfläche. Ohne diese Auskunft müsste sie raten,
   * und jede Heuristik („der Datensatz sieht aus wie die Vorgabe") würde
   * eine ausdrückliche Wahl überschreiben: Wer in einem englischen Browser
   * bewusst Deutsch einstellt, speichert genau `DEFAULT_SETTINGS` und
   * bekäme bei jedem Neuladen wieder Englisch.
   */
  hasSettings(): Promise<boolean>
  saveSettings(s: Settings): Promise<void>
  /** Bewerbungsliste, Entwürfe und Einstellungen als eine verlustfreie Sicherungsdatei — die „Sicherung" aus `docs/spec.md`. */
  exportAll(): Promise<Blob>
  /** Ersetzt den gesamten Bestand durch den Inhalt der Sicherungsdatei (Wiederherstellung, kein Zusammenführen). */
  importAll(file: File): Promise<void>
  /**
   * Löscht Bewerbungsliste, Entwürfe und Einstellungen restlos. Rührt den
   * Schlüsseltresor (`keyVault.ts`, eigene Datenbank) nicht an — der Knopf
   * „Alle Daten löschen" in der Oberfläche muss deshalb **beide** aufrufen,
   * diesen Aufruf und `KeyVault.clear()`.
   */
  clearAll(): Promise<void>
}
