/**
 * Wie viele Anfragen diese Sitzung den Anbieter gekostet hat.
 *
 * **Warum das sichtbar sein muss.** Die kostenlosen Tarife zählen
 * **Anfragen**, nicht Zeichen — Geminis Freikontingent etwa erlaubt eine
 * einstellige Zahl je Minute und eine begrenzte Zahl je Tag. Wer nicht
 * sieht, was ein Arbeitsschritt kostet, merkt das Ende des Kontingents erst,
 * wenn nichts mehr geht, und hält es dann für eine Störung beim Anbieter.
 * Genau so ist es passiert.
 *
 * **Gezählt werden Versuche, nicht Erfolge.** Eine Anfrage, die mit einem
 * Fehler zurückkommt oder abgebrochen wird, hat den Anbieter trotzdem
 * erreicht und zählt dort mit. Ein Zähler, der nur Gelungenes zählte, wäre
 * genau dann zu niedrig, wenn er gebraucht wird.
 *
 * **Nur diese Sitzung.** Der Zähler steht im Arbeitsspeicher und beginnt bei
 * jedem Laden neu. Er ist eine Auskunft über die eigene Arbeit, keine
 * Buchführung — was der Anbieter gezählt hat, weiß nur der Anbieter, und
 * seine Zahlen stehen in dessen Konsole.
 */

export interface ApiUsage {
  /** Anfragen an den Anbieter, seit die Seite geladen wurde. */
  requests: number
}

const NO_USAGE: ApiUsage = { requests: 0 }

let snapshot: ApiUsage = NO_USAGE
const listeners = new Set<() => void>()

/**
 * Eine Anfrage ist hinausgegangen. Aufgerufen von `fetchOrNetworkError` —
 * der einzigen Stelle, durch die alle drei Anbieter hindurchgehen.
 */
export function recordRequest(): void {
  snapshot = { requests: snapshot.requests + 1 }
  notify()
}

/**
 * Die aktuelle Momentaufnahme. **Referenzgleich, solange sich nichts
 * ändert** — `useSyncExternalStore` vergleicht Identitäten und würde bei
 * einem jedes Mal neu gebauten Objekt endlos neu rendern.
 */
export function usageSnapshot(): ApiUsage {
  return snapshot
}

export function subscribeUsage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Zurück auf null. Heute nur von Tests gebraucht. */
export function resetUsage(): void {
  snapshot = NO_USAGE
  notify()
}

function notify(): void {
  for (const listener of listeners) listener()
}
