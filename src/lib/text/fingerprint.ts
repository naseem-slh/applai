/**
 * Der Fingerabdruck eines Textes: SHA-256 seines auf einfachen Leerraum
 * normalisierten Inhalts, hexadezimal.
 *
 * Normalisiert, damit ein anders umbrochener, sonst gleicher Text denselben
 * Abdruck bekommt. WebCrypto, also ohne neue Abhängigkeit (G9).
 *
 * Zwei Nutzer bisher, und beide brauchen dieselbe Frage beantwortet — „ist
 * das noch derselbe Text?": die vorgemerkten Stellen (welcher Brief gehört
 * zu welchem Satz Vormerkungen) und der Auswertungsspeicher (ist diese
 * Stellenanzeige schon einmal gelesen worden). Deshalb liegt die Rechnung
 * hier und nicht in einem von beiden.
 */
export async function textFingerprint(text: string): Promise<string> {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
