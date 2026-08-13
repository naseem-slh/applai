import { createContext, use } from 'react'
import type { Settings, StorageAdapter } from '@/lib/storage/adapter'
import type { KeyVaultHandle } from '@/components/onboarding/useKeyVault'

/**
 * Der gemeinsame Zustand über den Ansichten hinweg: Speicher,
 * Schlüsseltresor, Einstellungen und der Übergabestand von der
 * Einstiegsseite an die Arbeitsfläche.
 *
 * Bewusst **eine** Stelle statt vier Kontexten: Alles hier entsteht
 * genau einmal beim Start der Anwendung und ändert sich selten. Wer den
 * Zuschnitt später feiner braucht (weil ein häufiges Ereignis alles neu
 * rendert), teilt ihn auf — heute wäre das Vorratsarbeit.
 *
 * 13b hatte `useKeyVault` ausdrücklich ohne Kontext gebaut, mit der Regel:
 * „Wer ihn an mehreren Stellen braucht (13c/14), legt einen Context um das
 * Ergebnis." Genau das passiert hier: Einstiegsseite und Einstellungen
 * brauchen denselben Tresor, und zwei Tresore wären zwei Sätze
 * Ereignis-Zuhörer auf `window` und zwei Untätigkeitsuhren.
 */

/**
 * Ein geladenes Dokument, so wie die Einstiegsseite es an die Arbeitsfläche
 * weitergibt.
 *
 * Absichtlich **ohne** `DocxDocument`: Das trägt einen lebenden XML-Baum,
 * und ein veränderlicher DOM in einem React-Kontext ist eine Quelle für
 * Zustände, die niemand nachvollzieht. Die Arbeitsfläche ruft `parseDocx`
 * selbst auf den Bytes auf — einmal mehr geparst, dafür eine Übergabe, die
 * nur aus Werten besteht.
 */
export interface LoadedDocument {
  /**
   * Der Dateiname, wie ihn der Nutzer gewählt hat. `null` bei einem aus dem
   * Speicher zurückgeholten Entwurf: Der Datensatz `Draft` führt keinen
   * Namen (siehe `adapter.ts`), und ihn dort zu ergänzen wäre eine
   * Schemaänderung samt neuem Stand der Sicherungsdatei.
   */
  fileName: string | null
  /**
   * Woher das Dokument stammt. `pdf` löst den Beta-Hinweis aus; `draft`
   * heißt „aus dem Speicher zurückgeholt" — dann ist die Herkunft nicht
   * mehr bekannt (siehe `fileName`).
   */
  source: 'docx' | 'pdf' | 'draft'
  /** Die `.docx`-Bytes, aus denen weitergearbeitet wird (bei PDF: das Ergebnis der Umwandlung). */
  docxBase: ArrayBuffer
  /** Der Fließtext des Dokuments. */
  text: string
  /** Nur bei `source === 'pdf'` aussagekräftig: mindestens eine Seite war mehrspaltig. */
  multiColumn: boolean
  /**
   * Bei `source === 'draft'` (aus dem Speicher zurückgeholt) unverändert aus
   * `Draft.letterheadAppliedFor` übernommen — bei `'docx'`/`'pdf'` immer
   * `undefined`, ein frisch geladenes Dokument hat naturgemäß noch keine
   * selbsttätige Übernahme hinter sich.
   *
   * Die Arbeitsfläche liest diesen Wert genau einmal, beim Aufbau ihres
   * eigenen Anfangszustands (siehe `Editor.tsx`) — sie schreibt nie
   * hierher zurück, das übernimmt `useDraftAutosave` direkt über die
   * Speicherschicht.
   */
  letterheadAppliedFor?: string
}

/**
 * Was die Einstiegsseite an die Arbeitsfläche übergibt.
 *
 * Es gibt diesen Datensatz **nur vollständig**: Er entsteht in
 * `Start.handleContinue`, und der Weiter-Knopf ist gesperrt, solange
 * `userName` leer ist. Solange die Einstiegsseite nichts übergeben hat,
 * steht im Kontext `null` und nicht etwa ein leerer Stand.
 *
 * Das ist Übergabe 1 aus Aufgabe 11, und es ist bewusst der Typ, der sie
 * hält, nicht ein Kommentar: Ein leeres `userName` läuft in
 * `withAnonymization` **genau wie `null`** durch `resolveNameHint`, das dann
 * den ersten namensförmigen Feldtreffer nimmt. Das kann eine Firmierung
 * sein, und der Klarname des Bewerbers ginge unersetzt an den Anbieter. Ein
 * `StartSession` mit leerem Namen darf deshalb gar nicht erst hinschreibbar
 * sein.
 *
 * Die Arbeitsfläche reicht `userName` unverändert an
 * `AnonymizationSettings.userName` weiter. Sie erreicht ihn nur unter
 * `RequireSession` (siehe `App.tsx`) und bekommt damit nie eine Sitzung, die
 * es nicht gibt.
 */
export interface StartSession {
  letter: LoadedDocument | null
  cv: LoadedDocument | null
  jobAdText: string
  userName: string
}

/**
 * Die Kennungen der beiden Entwürfe. Es gibt kein `listDrafts` in
 * `StorageAdapter` — der Zugriff läuft über bekannte Kennungen, und die
 * stehen hier, damit die Arbeitsfläche (Aufgabe 14) und der Export
 * (Aufgabe 15) dieselben verwenden und nicht je eigene erfinden.
 */
export const LETTER_DRAFT_ID = 'letter'
export const CV_DRAFT_ID = 'cv'

/**
 * Die Frist aus `docs/spec.md` („gelöscht nach Export oder nach 7 Tagen").
 * Sie steht hier und nicht in der Speicherschicht, weil `adapter.ts` sie
 * ausdrücklich der aufrufenden Seite zuschreibt.
 */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface AppContextValue {
  storage: StorageAdapter
  keyVault: KeyVaultHandle
  settings: Settings
  /** Ändert einzelne Felder, speichert sofort und wendet Sprache und Erscheinungsbild an. Wirft, wenn das Speichern scheitert. */
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  /** Nach `importAll` oder `clearAll`: Einstellungen neu einlesen und anwenden. */
  reloadSettings: () => Promise<void>
  /** Der Übergabestand der Einstiegsseite, `null`, solange sie nichts übergeben hat. */
  session: StartSession | null
  setSession: (next: StartSession) => void
  /**
   * `true`, sobald die Einstellungen gelesen und abgelaufene Entwürfe
   * gelöscht sind. Erst danach darf eine Ansicht einen Entwurf anbieten —
   * vorher könnte sie einen anbieten, der im selben Moment abläuft.
   */
  storageReady: boolean
  /**
   * `true`, wenn die Einstellungen nicht gelesen werden konnten (privater
   * Modus, gesperrter Speicher). Die Anwendung läuft dann mit den Vorgaben
   * weiter — sonst käme man nicht einmal mehr an „Alle Daten löschen".
   */
  storageUnavailable: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export { AppContext }

export function useApp(): AppContextValue {
  const value = use(AppContext)
  if (value === null) {
    throw new Error('useApp() außerhalb von <AppProvider> aufgerufen.')
  }
  return value
}
