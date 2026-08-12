import { describe, expect, it } from 'vitest'
import { textFingerprint } from './fingerprint'

describe('textFingerprint', () => {
  it('liefert denselben Abdruck für denselben Text mit anderem Leerraum', async () => {
    const [a, b] = await Promise.all([
      textFingerprint('Sehr geehrte  Damen\n\nund Herren'),
      textFingerprint('  Sehr geehrte Damen und Herren '),
    ])
    expect(a).toBe(b)
  })

  it('liefert verschiedene Abdrücke für verschiedene Texte', async () => {
    const [a, b] = await Promise.all([textFingerprint('Brief A'), textFingerprint('Brief B')])
    expect(a).not.toBe(b)
  })

  it('liefert einen hexadezimalen SHA-256, also 64 Zeichen', async () => {
    expect(await textFingerprint('irgendetwas')).toMatch(/^[0-9a-f]{64}$/)
  })
})
