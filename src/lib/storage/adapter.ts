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
}

/**
 * Wahrheitsgrenze beim Formulieren. Hier definiert, weil `Settings` sie
 * braucht; in Aufgabe 11 (Textvarianten) wiederverwendet.
 */
export type TruthMode = 'strict' | 'bridge' | 'free'

/** Nutzereinstellungen. `getSettings()` liefert sinnvolle Vorgaben, bevor je etwas gespeichert wurde — siehe `indexeddb.ts`. */
export interface Settings {
  provider: ProviderId
  uiLanguage: 'de' | 'en'
  anonymize: boolean
  truthMode: TruthMode
  theme: 'light' | 'dark' | 'system'
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
