import { describe, expect, it } from 'vitest'
import type { LlmProvider } from '../ai/provider'
import { deriveStyleProfile } from '../domain/styleProfile'
import { _internal, withAnonymization } from './withAnonymization'
import type { AnonymizationSettings } from './withAnonymization'

/**
 * Tests für die wiederverwendbare Anonymisierungs-Klammer (Aufgabe 11,
 * übergreifender Auftrag): Sie liegt zwischen JEDEM Versand von Nutzertext
 * und dem Anbieter — nicht nur beim Umschreiben (Aufgabe 11), sondern auch
 * bei `deriveStyleProfile` (Aufgabe 10) und `analyzeGaps` (Aufgabe 12).
 */

const NAME = 'Max Mustermann'
const AN: AnonymizationSettings = { enabled: true, userName: NAME }
const AUS: AnonymizationSettings = { enabled: false, userName: NAME }

describe('withAnonymization', () => {
  it('ersetzt persönliche Daten in jedem Feld, bevor die Anbieterfunktion sie sieht', async () => {
    let gesehen: { selection: string; facts: string } | undefined

    const ergebnis = await withAnonymization(
      {
        selection: 'Als Teamleiter hat Max Mustermann drei Projekte verantwortet.',
        facts: 'E-Mail: max@beispiel.de, Telefon: (030) 12 34 56',
      },
      AN,
      (felder) => {
        gesehen = felder
        return Promise.resolve('fertig')
      },
      (r) => r,
    )

    expect(gesehen?.selection).toContain('[NAME]')
    expect(gesehen?.selection).not.toContain('Mustermann')
    expect(gesehen?.facts).toContain('[EMAIL]')
    expect(gesehen?.facts).toContain('[TEL]')
    expect(gesehen?.facts).not.toContain('max@beispiel.de')
    expect(ergebnis).toBe('fertig')
  })

  it('vergibt für denselben Wert in zwei Feldern denselben Platzhalter', async () => {
    let gesehen: { a: string; b: string } | undefined

    await withAnonymization(
      { a: 'Rückfragen an max@beispiel.de.', b: 'Bitte an max@beispiel.de senden.' },
      AN,
      (felder) => {
        gesehen = felder
        return Promise.resolve(null)
      },
      (r) => r,
    )

    expect(gesehen?.a).toContain('[EMAIL]')
    expect(gesehen?.b).toContain('[EMAIL]')
  })

  it('vergibt für zwei verschiedene Werte derselben Kategorie zwei verschiedene Platzhalter (feldübergreifend kollisionsfrei)', async () => {
    let gesehen: { a: string; b: string } | undefined

    const zurueck = await withAnonymization(
      { a: 'Privat: max@beispiel.de', b: 'Dienstlich: buero@beispiel.de' },
      AN,
      (felder) => {
        gesehen = felder
        return Promise.resolve(`${felder.a} | ${felder.b}`)
      },
      (r, restore) => restore(r),
    )

    // Ohne einen gemeinsamen Durchlauf über alle Felder hätten beide Felder
    // je ein eigenes "[EMAIL]" bekommen — der Rücktausch würde dann eine der
    // beiden Adressen an der falschen Stelle wiederherstellen.
    expect(gesehen?.a).toContain('[EMAIL]')
    expect(gesehen?.b).toContain('[EMAIL_2]')
    expect(zurueck).toBe('Privat: max@beispiel.de | Dienstlich: buero@beispiel.de')
  })

  it('tauscht die persönlichen Daten im Ergebnis wieder zurück', async () => {
    const ergebnis = await withAnonymization(
      { selection: 'Max Mustermann, erreichbar unter max@beispiel.de.' },
      AN,
      (felder) => Promise.resolve({ texte: [`Neu: ${felder.selection}`] }),
      (r, restore) => ({ texte: r.texte.map(restore) }),
    )

    expect(ergebnis.texte[0]).toBe('Neu: Max Mustermann, erreichbar unter max@beispiel.de.')
  })

  it('sendet bei abgeschalteter Anonymisierung den unveränderten Text und tauscht nichts zurück', async () => {
    let gesehen: { selection: string } | undefined

    const ergebnis = await withAnonymization(
      { selection: 'Max Mustermann, erreichbar unter max@beispiel.de.' },
      AUS,
      (felder) => {
        gesehen = felder
        return Promise.resolve({ text: `${felder.selection} [NAME]` })
      },
      (r, restore) => ({ text: restore(r.text) }),
    )

    expect(gesehen?.selection).toBe('Max Mustermann, erreichbar unter max@beispiel.de.')
    // Der Rücktausch ist bei abgeschalteter Anonymisierung die Identität —
    // ein zufälliges "[NAME]" in der Antwort bleibt genau so stehen.
    expect(ergebnis.text).toBe('Max Mustermann, erreichbar unter max@beispiel.de. [NAME]')
  })

  it('nutzt userName als Namenshinweis, wenn der Name nicht im Kopfbereich steht', async () => {
    let mitHinweis: { selection: string } | undefined
    let ohneHinweis: { selection: string } | undefined

    const auswahl = 'Deshalb hat Max Mustermann das gesamte Projekt geleitet.'

    await withAnonymization({ selection: auswahl }, AN, (f) => {
      mitHinweis = f
      return Promise.resolve(null)
    }, (r) => r)

    await withAnonymization({ selection: auswahl }, { enabled: true, userName: null }, (f) => {
      ohneHinweis = f
      return Promise.resolve(null)
    }, (r) => r)

    expect(mitHinweis?.selection).toBe('Deshalb hat [NAME] das gesamte Projekt geleitet.')
    // Ohne Hinweis greift nur die Kopfzeilen-Heuristik aus Aufgabe 8 — eine
    // markierte Textstelle mitten im Brief hat aber keinen Kopfbereich.
    expect(ohneHinweis?.selection).toContain('Max Mustermann')
  })

  it('reicht userEmail als Hinweis durch', async () => {
    let gesehen: { facts: string } | undefined

    await withAnonymization(
      { facts: 'Intern erreichbar unter kontakt@intranet.' },
      { enabled: true, userName: NAME, userEmail: 'kontakt@intranet' },
      (f) => {
        gesehen = f
        return Promise.resolve(null)
      },
      (r) => r,
    )

    expect(gesehen?.facts).toContain('[EMAIL]')
  })

  it('hält die Felder auseinander, auch wenn eines leer ist', async () => {
    let gesehen: { vorher: string; auswahl: string; nachher: string } | undefined

    await withAnonymization(
      { vorher: '', auswahl: 'Max Mustermann bewirbt sich.', nachher: 'Mit freundlichen Grüßen' },
      AN,
      (f) => {
        gesehen = f
        return Promise.resolve(null)
      },
      (r) => r,
    )

    expect(gesehen?.vorher).toBe('')
    expect(gesehen?.auswahl).toBe('[NAME] bewirbt sich.')
    expect(gesehen?.nachher).toBe('Mit freundlichen Grüßen')
  })

  it('übersteht Feldinhalte, die wie der interne Feldtrenner aussehen', async () => {
    // Der Feldtrenner darf durch Nutzertext nicht fälschbar sein, sonst
    // landete Text im falschen Feld. Er wird deshalb so lange hochgezählt,
    // bis er im zusammengesetzten Text nicht mehr vorkommt.
    const marker = _internal.FIELD_MARKER
    const gemein = ['Zeile eins', `${marker}0${marker}`, 'Zeile zwei mit Max Mustermann'].join('\n')
    let gesehen: { a: string; b: string } | undefined

    const zurueck = await withAnonymization({ a: gemein, b: 'Zweites Feld' }, AN, (f) => {
      gesehen = f
      return Promise.resolve(`${f.a}||${f.b}`)
    }, (r, restore) => restore(r))

    expect(gesehen?.b).toBe('Zweites Feld')
    expect(gesehen?.a).toContain('Zeile eins')
    expect(gesehen?.a).toContain('Zeile zwei mit [NAME]')
    expect(zurueck).toBe(`${gemein}||Zweites Feld`)
  })

  it('übersteht einen im Original wörtlich vorhandenen Platzhaltertext', async () => {
    const ergebnis = await withAnonymization(
      { a: 'Der Baustein [NAME] steht wörtlich im Dokument.', b: 'Unterschrift: Max Mustermann' },
      AN,
      (f) => Promise.resolve(`${f.a}||${f.b}`),
      (r, restore) => restore(r),
    )

    expect(ergebnis).toBe('Der Baustein [NAME] steht wörtlich im Dokument.||Unterschrift: Max Mustermann')
  })
})

/**
 * Beweis, dass die Klammer um Aufgabe 10 passt, OHNE Aufgabe 10 zu ändern:
 * `deriveStyleProfile` ist gegenüber dem Inhalt von `letterText` opak, die
 * Wörtlichkeitsprüfung von `sample` läuft gegen genau den Text, den auch das
 * Modell gesehen hat (also die anonymisierte Fassung), und das Ergebnis kommt
 * zurückgetauscht heraus.
 */
describe('withAnonymization um deriveStyleProfile (Aufgabe 10, unverändert)', () => {
  const BRIEF = `Max Mustermann
Musterstraße 12
12345 Musterstadt
max@beispiel.de

Sehr geehrte Frau Vogt,

als Max Mustermann bringe ich die geforderte Erfahrung mit. Ihre Anzeige hat mich sofort angesprochen.

Mit freundlichen Grüßen
Max Mustermann`

  it('zeigt dem Modell nur den anonymisierten Brief und liefert das Stilprofil im Klartext zurück', async () => {
    let gesehen = ''
    const provider: LlmProvider = {
      id: 'gemini',
      label: 'Stub',
      endpoint: 'https://example.invalid',
      generate: (req) => {
        gesehen = req.user
        return Promise.resolve(
          JSON.stringify({
            formality: 75,
            traits: ['spricht die Leserin direkt an'],
            // Wörtlich aus dem ANONYMISIERTEN Brief — genau das, was das
            // Modell dort lesen kann.
            sample: 'als [NAME] bringe ich die geforderte Erfahrung mit. Ihre Anzeige hat mich sofort angesprochen.',
          }),
        )
      },
    }

    const profil = await withAnonymization(
      { letterText: BRIEF },
      { enabled: true, userName: 'Max Mustermann' },
      (felder) => deriveStyleProfile(felder.letterText, provider, 'test-key'),
      (p, zurueck) => ({ ...p, sample: zurueck(p.sample), traits: p.traits.map(zurueck) }),
    )

    expect(gesehen).toContain('[NAME]')
    expect(gesehen).not.toContain('Max Mustermann')
    expect(gesehen).not.toContain('max@beispiel.de')
    expect(profil.sample).toBe(
      'als Max Mustermann bringe ich die geforderte Erfahrung mit. Ihre Anzeige hat mich sofort angesprochen.',
    )
    expect(profil.address).toBe('sie')
  })
})
