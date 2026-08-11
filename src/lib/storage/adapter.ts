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
   * spielen keine Rolle). `null`, wenn keiner gefunden wurde. Löst selbst
   * nichts aus — die Oberfläche entscheidet, was der Hinweis „doppelte
   * Bewerbung" bewirkt.
   */
  findDuplicate(company: string, position: string): Promise<Application | null>
  /** Legt einen Entwurf an oder überschreibt ihn (Schlüssel: `Draft.id`) — so funktioniert das automatische Zwischenspeichern. */
  saveDraft(d: Draft): Promise<void>
  loadDraft(id: string): Promise<Draft | null>
  /**
   * Löscht alle Entwürfe, die älter als `maxAgeMs` sind, und gibt ihre
   * Anzahl zurück. Die Frist ist bewusst ein Parameter, keine Konstante
   * dieser Schicht — siehe `Draft`.
   */
  purgeExpiredDrafts(maxAgeMs: number): Promise<number>
  getSettings(): Promise<Settings>
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
