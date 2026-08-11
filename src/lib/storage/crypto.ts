/**
 * Kryptografische Grundbausteine des Schlüsseltresors.
 *
 * Diese Datei kennt weder API-Schlüssel noch IndexedDB: sie rechnet
 * ausschließlich mit Zeichenketten, Bytes und `CryptoKey`-Objekten. Alles
 * Fachliche — was verschlüsselt wird, wo es liegt und wie lange es im
 * Arbeitsspeicher bleibt — steht in `keyVault.ts`.
 *
 * Genutzt wird ausschließlich WebCrypto (`crypto.subtle`), also eine
 * Browser-Funktion ohne jede Abhängigkeit (G9). Schlüsselmaterial entsteht
 * hier grundsätzlich mit `extractable: false`: JavaScript kann damit rechnen,
 * die Rohbytes aber nie auslesen.
 */

/** AES-GCM prüft zusätzlich die Integrität — ein verändertes Chiffrat schlägt fehl. */
const AES_ALGORITHM = 'AES-GCM'

/** Schlüssellänge in Bit. 256 ist der übliche Wert für AES-GCM. */
export const AES_KEY_LENGTH = 256

/**
 * PBKDF2-Runden. Die Aufgabenstellung nennt 210 000 als Untergrenze; das ist
 * die OWASP-Empfehlung für PBKDF2-HMAC-SHA-512. Für SHA-256 — das hier
 * verwendet wird — empfiehlt OWASP 600 000 Runden, und dabei bleibt es.
 * Gemessen kostet das auf einem Bürorechner rund 100 ms, auf einem älteren
 * Mobilgerät ein bis zwei Sekunden. Das fällt einmal beim Entsperren an und
 * ist die Verlangsamung eines Wörterbuchangriffs wert.
 *
 * Der tatsächlich verwendete Wert wird im Datensatz mitgespeichert (siehe
 * `keyVault.ts`), damit dieser Wert später erhöht werden kann, ohne bereits
 * gespeicherte Schlüssel unlesbar zu machen.
 */
export const PBKDF2_ITERATIONS = 600_000

/** Hash-Funktion der Schlüsselableitung. */
export const PBKDF2_HASH = 'SHA-256'

/** Länge des zufälligen Salzes in Byte (128 Bit). */
export const SALT_LENGTH = 16

/**
 * Länge des Initialisierungsvektors in Byte. 96 Bit ist die von NIST für
 * AES-GCM empfohlene Länge. Der IV wird für jede Verschlüsselung neu gezogen
 * und nie wiederverwendet — bei AES-GCM ist eine Wiederverwendung mit
 * demselben Schlüssel fatal.
 */
export const IV_LENGTH = 12

/**
 * Bytes, die WebCrypto unmittelbar annimmt.
 *
 * Seit TypeScript 5.7 ist `Uint8Array` über seinen Puffertyp generisch, und
 * `BufferSource` verlangt ausdrücklich einen `ArrayBuffer` (kein
 * `SharedArrayBuffer`). Ohne diese Festlegung müsste an jeder Übergabe an
 * `crypto.subtle` eine Typzusicherung stehen.
 */
export type Bytes = Uint8Array<ArrayBuffer>

/** Ein Chiffrat samt des zugehörigen, einmalig verwendeten IV. */
export interface EncryptedPayload {
  readonly iv: Bytes
  readonly ciphertext: Bytes
}

/** Kryptografisch sichere Zufallsbytes. */
export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Leitet aus einem Passwort und einem Salz einen AES-GCM-Schlüssel ab
 * (Stufe 2 — Passwortschutz).
 *
 * Der abgeleitete Schlüssel ist nicht extrahierbar; er existiert nur, solange
 * eine Referenz darauf gehalten wird, und lässt sich aus Passwort und Salz
 * jederzeit neu erzeugen. `iterations` ist überschreibbar, damit ein mit einem
 * älteren Wert gespeicherter Datensatz weiterhin gelesen werden kann.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Bytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase)
  try {
    const material = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveKey'])
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
      material,
      { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
      // extractable: false — das abgeleitete Schlüsselmaterial soll auch dann
      // nicht auslesbar sein, wenn der Tresor entsperrt ist.
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    // Die Zeichenkette selbst lässt sich in JavaScript nicht überschreiben;
    // ihre Byte-Kopie hier aber schon.
    passphraseBytes.fill(0)
  }
}

/**
 * Erzeugt den Geräteschlüssel (Stufe 1 — ohne Passwort).
 *
 * `extractable: false` ist der ganze Punkt: Der Schlüssel wird als Objekt in
 * IndexedDB abgelegt, aber selbst der Code dieser Seite bekommt seine
 * Rohbytes nie zu sehen — `crypto.subtle.exportKey` verweigert die Ausgabe.
 * In den Entwicklerwerkzeugen steht damit nur ein Chiffrat und ein
 * undurchsichtiges Schlüsselobjekt.
 *
 * Ehrlich benannte Grenze: Code, der **auf dieser Seite** läuft, kann den
 * Browser weiterhin bitten, mit diesem Schlüssel zu entschlüsseln. Stufe 1
 * schützt gegen beiläufiges Nachsehen und gegen einen geteilten Rechner,
 * nicht gegen aktiven Schadcode in der Seite. Wer einen kostenpflichtigen
 * Schlüssel ablegt, braucht deshalb Stufe 2 (Passwort).
 */
export async function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGORITHM, length: AES_KEY_LENGTH }, false, ['encrypt', 'decrypt'])
}

/** Verschlüsselt eine Zeichenkette mit einem frischen, einmaligen IV. */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_LENGTH)
  const plaintextBytes = new TextEncoder().encode(plaintext)
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, plaintextBytes)
    return { iv, ciphertext: new Uint8Array(ciphertext) }
  } finally {
    plaintextBytes.fill(0)
  }
}

/**
 * Entschlüsselt ein Chiffrat. Schlägt fehl bei falschem Schlüssel und ebenso
 * bei verändertem Chiffrat — dafür sorgt der Authentizitätsanteil von
 * AES-GCM. Die Meldung bleibt hier bewusst allgemein; welcher Fall der
 * wahrscheinliche ist, weiß erst `keyVault.ts`.
 */
export async function decryptString(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  let plaintextBytes: ArrayBuffer
  try {
    plaintextBytes = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv: payload.iv }, key, payload.ciphertext)
  } catch {
    // Bewusst ohne `cause`: die ursprüngliche Ausnahme (`OperationError`)
    // sagt nichts Zusätzliches, und je weniger im Fehlerobjekt landet, desto
    // weniger kann in ein Protokoll geraten.
    throw new Error('Entschlüsselung fehlgeschlagen: falscher Schlüssel oder beschädigte Daten.')
  }
  const bytes = new Uint8Array(plaintextBytes)
  try {
    return new TextDecoder().decode(bytes)
  } finally {
    bytes.fill(0)
  }
}
