import { describe, expect, it } from 'vitest'
import {
  AES_KEY_LENGTH,
  IV_LENGTH,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  decryptString,
  deriveKeyFromPassphrase,
  encryptString,
  generateDeviceKey,
  randomBytes,
} from './crypto'

const PASSPHRASE = 'ein-hinreichend-langes-Passwort'
const PLAINTEXT = 'sk-proj-Beispielwert-nur-fuer-den-Test'

describe('crypto', () => {
  describe('randomBytes', () => {
    it('liefert die gewünschte Länge und bei jedem Aufruf andere Bytes', () => {
      const first = randomBytes(SALT_LENGTH)
      const second = randomBytes(SALT_LENGTH)
      expect(first).toHaveLength(SALT_LENGTH)
      expect(second).toHaveLength(SALT_LENGTH)
      expect(Array.from(first)).not.toEqual(Array.from(second))
    })
  })

  describe('Parameter', () => {
    it('hält die vereinbarten PBKDF2-Mindestwerte ein', () => {
      // Untergrenze aus der Aufgabenstellung; der tatsächliche Wert liegt
      // höher (siehe Begründung in crypto.ts).
      expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(210_000)
      expect(PBKDF2_HASH).toBe('SHA-256')
      expect(SALT_LENGTH).toBeGreaterThanOrEqual(16)
      expect(IV_LENGTH).toBe(12)
      expect(AES_KEY_LENGTH).toBe(256)
    })
  })

  describe('deriveKeyFromPassphrase', () => {
    it('leitet aus gleichem Passwort und gleichem Salz denselben Schlüssel ab', async () => {
      const salt = randomBytes(SALT_LENGTH)
      const keyA = await deriveKeyFromPassphrase(PASSPHRASE, salt)
      const keyB = await deriveKeyFromPassphrase(PASSPHRASE, salt)

      // Nicht-extrahierbare Schlüssel lassen sich nicht direkt vergleichen —
      // der Beweis läuft über Kreuz: mit A verschlüsselt, mit B entschlüsselt.
      const payload = await encryptString(keyA, PLAINTEXT)
      await expect(decryptString(keyB, payload)).resolves.toBe(PLAINTEXT)
    })

    it('leitet aus unterschiedlichem Salz unterschiedliche Schlüssel ab', async () => {
      const keyA = await deriveKeyFromPassphrase(PASSPHRASE, randomBytes(SALT_LENGTH))
      const keyB = await deriveKeyFromPassphrase(PASSPHRASE, randomBytes(SALT_LENGTH))
      const payload = await encryptString(keyA, PLAINTEXT)

      await expect(decryptString(keyB, payload)).rejects.toThrow()
    })

    it('erzeugt einen nicht auslesbaren Schlüssel', async () => {
      const key = await deriveKeyFromPassphrase(PASSPHRASE, randomBytes(SALT_LENGTH))

      expect(key.extractable).toBe(false)
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
    })
  })

  describe('generateDeviceKey', () => {
    it('erzeugt einen Schlüssel, dessen Rohbytes nie auslesbar sind', async () => {
      const key = await generateDeviceKey()

      expect(key.extractable).toBe(false)
      expect(key.algorithm.name).toBe('AES-GCM')
      // Der eigentliche Beweis: WebCrypto verweigert den Export.
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
      await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow()
    })

    it('kann trotzdem ver- und entschlüsseln', async () => {
      const key = await generateDeviceKey()
      const payload = await encryptString(key, PLAINTEXT)

      await expect(decryptString(key, payload)).resolves.toBe(PLAINTEXT)
    })
  })

  describe('encryptString', () => {
    it('benutzt für jede Verschlüsselung einen neuen IV', async () => {
      const key = await generateDeviceKey()
      const first = await encryptString(key, PLAINTEXT)
      const second = await encryptString(key, PLAINTEXT)

      expect(first.iv).toHaveLength(IV_LENGTH)
      expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv))
      // Gleicher Klartext, gleicher Schlüssel — trotzdem anderes Chiffrat.
      expect(Array.from(first.ciphertext)).not.toEqual(Array.from(second.ciphertext))
    })

    it('legt den Klartext nirgends im Chiffrat ab', async () => {
      const key = await generateDeviceKey()
      const payload = await encryptString(key, PLAINTEXT)
      const asLatin1 = String.fromCharCode(...payload.ciphertext)

      expect(asLatin1).not.toContain(PLAINTEXT)
    })

    it('überträgt auch Sonderzeichen und Umlaute unverändert', async () => {
      const key = await generateDeviceKey()
      const text = 'Schlüssel-mit-Ümläuten-und-€-Zeichen'
      const payload = await encryptString(key, text)

      await expect(decryptString(key, payload)).resolves.toBe(text)
    })
  })

  describe('decryptString', () => {
    it('wirft bei falschem Passwort und verrät dabei nichts', async () => {
      const salt = randomBytes(SALT_LENGTH)
      const right = await deriveKeyFromPassphrase(PASSPHRASE, salt)
      const wrong = await deriveKeyFromPassphrase('falsches-Passwort', salt)
      const payload = await encryptString(right, PLAINTEXT)

      const error = await decryptString(wrong, payload).then(
        () => null,
        (reason: unknown) => reason as Error,
      )

      expect(error).toBeInstanceOf(Error)
      const dump = `${error?.message} ${error?.stack ?? ''} ${JSON.stringify(error)}`
      expect(dump).not.toContain(PLAINTEXT)
      expect(dump).not.toContain(PASSPHRASE)
    })

    it('wirft bei manipuliertem Chiffrat (AES-GCM prüft die Integrität)', async () => {
      const key = await generateDeviceKey()
      const payload = await encryptString(key, PLAINTEXT)
      const tampered = Uint8Array.from(payload.ciphertext)
      tampered[0] ^= 0xff

      await expect(decryptString(key, { iv: payload.iv, ciphertext: tampered })).rejects.toThrow()
    })
  })
})
