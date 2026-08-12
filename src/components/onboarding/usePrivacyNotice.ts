import { useCallback, useState } from 'react'
import type { KeyVaultStatus } from './useKeyVault'

/**
 * Wann der Erststart-Hinweis erscheint — die vollständige Regel, damit
 * Aufgabe 13c sie nur noch einhängt und nicht neu erfinden muss.
 *
 * Sichtbar, solange **beides** gilt:
 *
 * 1. Es ist kein Schlüssel hinterlegt (`status === 'empty'`). Das ist der
 *    Erststart und wieder der Zustand nach „Alle Daten löschen".
 * 2. Der Hinweis wurde **in dieser Sitzung** noch nicht bestätigt.
 *
 * Der zweite Teil ist nötig, weil `PrivacyNotice.onAccept` den Zustand des
 * Tresors nicht ändern kann: Ohne ihn bliebe der Knopf „Verstanden, weiter"
 * wirkungslos, solange kein Schlüssel gespeichert ist — also genau in der
 * Lage, für die er gedacht ist.
 *
 * **Bewusst nicht dauerhaft gespeichert.** Ein „gelesen"-Kennzeichen in den
 * Einstellungen wäre entweder eines, das eine Datenlöschung überlebt (dann
 * bekäme jemand, der alle Spuren beseitigt hat, den Hinweis nie wieder zu
 * sehen), oder eines, das sie nicht überlebt — und dann ist es genau diese
 * Regel, nur mit einem Feld mehr im Schema. Der Preis ist ehrlich benannt:
 * nach einem Neuladen erscheint der Hinweis wieder, solange kein Schlüssel
 * hinterlegt ist. Für eine Offenlegung ist Wiederholung der harmlose
 * Fehlerfall.
 *
 * Während `status === 'loading'` erscheint nichts. Das Fenster ist eine
 * Lesung aus IndexedDB lang; etwas zu zeigen, das gleich wieder verschwindet,
 * wäre unruhiger als der kurze Leerraum.
 */
export interface PrivacyNoticeGate {
  /** An `PrivacyNotice` binden: nur rendern, wenn `true`. */
  readonly visible: boolean
  /** An `PrivacyNotice.onAccept` binden. Mehrfaches Aufrufen schadet nicht. */
  readonly accept: () => void
}

export function usePrivacyNotice(status: KeyVaultStatus): PrivacyNoticeGate {
  const [acceptedThisSession, setAcceptedThisSession] = useState(false)

  const accept = useCallback(() => {
    setAcceptedThisSession(true)
  }, [])

  return { visible: status === 'empty' && !acceptedThisSession, accept }
}
