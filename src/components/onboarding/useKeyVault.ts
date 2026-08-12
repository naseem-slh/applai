import { useCallback, useEffect, useRef, useState } from 'react'
import { createKeyVault, type KeyVault } from '@/lib/storage/keyVault'

/**
 * Die Verdrahtung des Schlüsseltresors an den Lebenszyklus von React.
 *
 * Drei Dinge nimmt dieser Haken ab, die `keyVault.ts` ausdrücklich vom
 * Aufrufer verlangt:
 *
 * 1. `initialize()` läuft **genau einmal** je Tresor. Ohne den Aufruf sähe
 *    ein gespeicherter Schlüssel aus wie gar keiner, weil `getKey()` bewusst
 *    synchron ist und nie in den Speicher schaut.
 * 2. `destroy()` läuft beim Abbau. Der Tresor hängt sich im Konstruktor an
 *    `window` und an `visibilitychange`; ohne den Aufruf bliebe bei jedem
 *    Neuaufbau ein weiterer Satz Zuhörer stehen.
 * 3. Der Tresor entsteht **im Effekt**, nicht beim Rendern. Unter
 *    `StrictMode` läuft ein Effekt in der Entwicklung zweimal (Aufbau,
 *    Abbau, Aufbau); ein außerhalb erzeugter Tresor wäre nach dem ersten
 *    Abbau zerstört und beim zweiten Aufbau unbrauchbar.
 *
 * Bewusst **kein** Context: heute braucht ihn eine einzige Ansicht. Wer ihn
 * an mehreren Stellen im Baum braucht (Aufgabe 13c/14), legt einen Context
 * um dieses Ergebnis — der Haken bleibt dann die eine Stelle, die den Tresor
 * erzeugt.
 */
export type KeyVaultStatus =
  /** Wird geladen — `initialize()` läuft noch. */
  | 'loading'
  /** Kein Schlüssel hinterlegt. Das ist der Erststart. */
  | 'empty'
  /** Ein Schlüssel liegt da, ist aber passwortgeschützt und nicht entsperrt. */
  | 'locked'
  /** Ein Schlüssel liegt im Arbeitsspeicher und ist benutzbar. */
  | 'unlocked'
  /** Der gespeicherte Datensatz ist beschädigt — nur Löschen hilft. */
  | 'corrupted'

export interface KeyVaultHandle {
  /** `null`, solange der erste Effekt nicht gelaufen ist. */
  readonly vault: KeyVault | null
  readonly status: KeyVaultStatus
  /** Zustand neu ermitteln, etwa nach `save()` oder `clear()`. */
  readonly refresh: () => void
}

async function readStatus(vault: KeyVault): Promise<KeyVaultStatus> {
  if (vault.getKey() !== null) return 'unlocked'
  return (await vault.isLocked()) ? 'locked' : 'empty'
}

export function useKeyVault(createVault: () => KeyVault = createKeyVault): KeyVaultHandle {
  const [vault, setVault] = useState<KeyVault | null>(null)
  const [status, setStatus] = useState<KeyVaultStatus>('loading')
  const [revision, setRevision] = useState(0)
  // Das Versprechen aus `initialize()`. Der Zustandseffekt wartet darauf,
  // bevor er fragt — sonst meldete er für einen ohne Passwort abgelegten
  // Schlüssel „gesperrt", weil die Entschlüsselung noch läuft.
  const initialized = useRef<Promise<void> | null>(null)
  // Die Fabrik liegt in einem Ref, und der Aufbaueffekt läuft mit leerer
  // Abhängigkeitsliste. Sonst wäre der naheliegendste Aufruf überhaupt —
  // `useKeyVault(() => createKeyVault(fuenfMinuten))` — eine Endlosschleife:
  // Die Pfeilfunktion bekommt bei jedem Rendern eine neue Identität, der
  // Effekt räumte auf und baute neu auf, beides löst ein Rendern aus, und
  // jeder Durchlauf öffnete zusätzlich eine IndexedDB-Verbindung. ESLint
  // sieht das nicht, weil der Fehler an der Aufrufstelle entsteht. Eine
  // Zusicherung, die der Code erzwingt, ist besser als eine, die der nächste
  // Aufrufer einhalten muss.
  const factory = useRef(createVault)
  factory.current = createVault

  useEffect(() => {
    const created = factory.current()
    const ready = created.initialize()
    // Der Fehler wird unten ausgewertet; dieser Haken verhindert nur, dass
    // die Ablehnung in der Zwischenzeit als unbehandelt gilt.
    ready.catch(() => {})
    initialized.current = ready
    setVault(created)
    return () => {
      created.destroy()
      initialized.current = null
      setVault(null)
      setStatus('loading')
    }
    // Absichtlich leer, und von ESLint auch so anerkannt: In der Liste
    // stünde sonst nur `createVault`. Der Tresor entsteht genau einmal je
    // Einhängung, unabhängig davon, wie der Aufrufer die Fabrik schreibt.
  }, [])

  useEffect(() => {
    if (vault === null) return
    const ready = initialized.current
    let cancelled = false
    void (async () => {
      try {
        await ready
        const next = await readStatus(vault)
        if (!cancelled) setStatus(next)
      } catch {
        // `initialize()` und `isLocked()` werfen beide, wenn der Datensatz
        // nicht dem Schema entspricht — etwa bei einer unplausiblen
        // Rundenzahl. Von außen sieht das gleich aus, und der Ausweg ist
        // derselbe: löschen und neu hinterlegen.
        if (!cancelled) setStatus('corrupted')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vault, revision])

  const refresh = useCallback(() => {
    setRevision((current) => current + 1)
  }, [])

  return { vault, status, refresh }
}
