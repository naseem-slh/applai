import { describe, expect, it } from 'vitest'
import { anonymize, deanonymize } from './anonymize'
import type { PiiMap } from './anonymize'

// ---------------------------------------------------------------------------
// Deterministischer Pseudozufallsgenerator für die Eigenschaftstests weiter
// unten (mulberry32). Bewusst keine Abhängigkeit (G9, kein fast-check o. Ä.)
// und bewusst *nicht* Math.random(): ein fester Seed macht einen
// fehlschlagenden Lauf reproduzierbar, statt in CI zu flackern.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

// Baustoffe für generierte Anschreiben-artige Texte: Namen, Adressen,
// Telefonformen (alle vier Formen aus der Aufgabenstellung), E-Mails,
// Geburtsdatums-Zeilen und "Fließtext"-Fragmente mit Datum, das *kein*
// Geburtsdatum ist.
const NAMES = ['Max Mustermann', 'Erika Musterfrau', 'Jan-Peter Müller-Schmidt', 'Ayşe Yılmaz']
const STREETS = ['Musterstraße 12', 'Hauptweg 5', 'Berliner Allee 10-12', 'Am Stadtpark 3a']
const PLACES = ['12345 Musterstadt', '01067 Dresden', '80331 München']
const PHONES = ['+49 170 1234567', '0170/1234567', '(030) 12 34 56', '0170-123 45 67']
const EMAILS = ['max.mustermann@beispiel.de', 'erika_musterfrau@web.example', 'j.mueller@firma-xyz.org']
const BIRTHDATE_LINES = ['Geburtsdatum: 03.05.1990', 'geboren am 17.11.1985', 'geb. 24.12.1979']
const NON_BIRTHDATE_LINES = [
  'seit 03.2021 tätig als Entwicklerin',
  'Berlin, 11.08.2026',
  'von 01.03.2019 bis 31.08.2021 bei der Musterfirma GmbH',
  'Praktikum 06/2018 – 09/2018',
]
const PROSE = [
  'Sehr geehrte Damen und Herren,',
  'mit großem Interesse habe ich Ihre Stellenausschreibung gelesen.',
  'Meine Erfahrung als Projektleiterin passt sehr gut zu den Anforderungen.',
  'Über die Einladung zu einem persönlichen Gespräch würde ich mich freuen.',
  'Mit freundlichen Grüßen',
]

// Baut einen zufälligen, aber Anschreiben-förmigen Text: Kopfzeile (Name +
// Adresse, wie in einem echten Anschreiben), dann eine zufällige Auswahl
// weiterer Zeilen. Der Name steht bewusst zuerst, damit die
// Kopfbereich-Erkennung ihn zuverlässig findet.
function generateLetter(rng: () => number): { text: string; name: string } {
  const name = pick(rng, NAMES)
  const lines: string[] = [name, pick(rng, STREETS), pick(rng, PLACES), pick(rng, PHONES), pick(rng, EMAILS), '']
  const bodyLineCount = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < bodyLineCount; i++) {
    const choice = rng()
    if (choice < 0.15) lines.push(pick(rng, BIRTHDATE_LINES))
    else if (choice < 0.35) lines.push(pick(rng, NON_BIRTHDATE_LINES))
    else lines.push(pick(rng, PROSE))
  }
  lines.push('', name)
  return { text: lines.join('\n'), name }
}

describe('anonymize/deanonymize', () => {
  describe('Rundlauf als Eigenschaft (viele generierte Eingaben)', () => {
    it('deanonymize(anonymize(t).text, map) === t für 300 generierte Anschreiben', () => {
      const rng = mulberry32(1337)
      for (let i = 0; i < 300; i++) {
        const { text } = generateLetter(rng)
        const { text: anonymized, map } = anonymize(text)
        const restored = deanonymize(anonymized, map)
        expect(restored).toBe(text)
      }
    })

    it('gilt auch bei übergebenen hints (name/email), für 100 weitere generierte Texte', () => {
      const rng = mulberry32(2026)
      for (let i = 0; i < 100; i++) {
        const { text, name } = generateLetter(rng)
        const hintEmail = pick(rng, EMAILS)
        const { text: anonymized, map } = anonymize(text, { name, email: hintEmail })
        const restored = deanonymize(anonymized, map)
        expect(restored).toBe(text)
      }
    })

    it('gilt auch für beliebigen "Rauschtext" ohne erkennbare PII, für 100 generierte Texte', () => {
      const rng = mulberry32(4242)
      for (let i = 0; i < 100; i++) {
        const lineCount = 1 + Math.floor(rng() * 6)
        const lines: string[] = []
        for (let j = 0; j < lineCount; j++) lines.push(pick(rng, PROSE))
        const text = lines.join('\n')
        const { text: anonymized, map } = anonymize(text)
        expect(deanonymize(anonymized, map)).toBe(text)
      }
    })
  })

  describe('Beispieltext mit allen fünf Arten', () => {
    const text = [
      'Max Mustermann',
      'Musterstraße 12',
      '12345 Musterstadt',
      '+49 170 1234567',
      'max.mustermann@beispiel.de',
      '',
      'Geburtsdatum: 03.05.1990',
      '',
      'Sehr geehrte Damen und Herren,',
      'seit 03.2021 bin ich als Entwicklerin tätig.',
      '',
      'Mit freundlichen Grüßen',
      'Max Mustermann',
    ].join('\n')

    it('ersetzt E-Mail, Telefon, Geburtsdatum, Adresse (PLZ+Ort und Straße+Hausnummer) und Namen', () => {
      const { text: anonymized, map } = anonymize(text)

      expect(anonymized).toContain('[NAME]')
      expect(anonymized).toContain('[EMAIL]')
      expect(anonymized).toContain('[TEL]')
      expect(anonymized).toContain('[ADRESSE]')
      expect(anonymized).toContain('[GEBURTSDATUM]')

      expect(anonymized).not.toContain('Mustermann')
      expect(anonymized).not.toContain('max.mustermann@beispiel.de')
      expect(anonymized).not.toContain('+49 170 1234567')
      expect(anonymized).not.toContain('Musterstraße')
      expect(anonymized).not.toContain('12345')
      expect(anonymized).not.toContain('03.05.1990')

      // "seit 03.2021" ist kein Geburtsdatum (kein Tag, kein Label) und bleibt stehen.
      expect(anonymized).toContain('seit 03.2021')

      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('der Platzhaltertext ist zeichengenau wie in der Aufgabenstellung vorgegeben', () => {
      const { map } = anonymize(text)
      const placeholders = Object.keys(map)
      expect(placeholders).toContain('[NAME]')
      expect(placeholders).toContain('[EMAIL]')
      expect(placeholders).toContain('[TEL]')
      expect(placeholders).toContain('[GEBURTSDATUM]')
      expect(placeholders.some((p) => p === '[ADRESSE]' || p === '[ADRESSE_2]')).toBe(true)
    })
  })

  describe('mehrfaches Vorkommen', () => {
    it('derselbe Name mehrfach im Text erhält denselben Platzhalter', () => {
      const text = [
        'Max Mustermann',
        '',
        'Sehr geehrte Damen und Herren,',
        'mein Name ist Max Mustermann und ich bewerbe mich hiermit.',
        'Max Mustermann hat bereits fünf Jahre Erfahrung.',
        '',
        'Mit freundlichen Grüßen',
        'Max Mustermann',
        'Max Mustermann',
      ].join('\n')

      const { text: anonymized, map } = anonymize(text)
      const occurrences = anonymized.split('[NAME]').length - 1
      expect(occurrences).toBe(5)
      expect(Object.values(map).filter((v) => v === 'Max Mustermann')).toHaveLength(1)
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('zwei unterschiedliche E-Mail-Adressen im selben Text erhalten unterschiedliche Platzhalter', () => {
      const text = [
        'Max Mustermann',
        'Kontakt privat: max.mustermann@beispiel.de',
        'Portfolio-Kontakt: portfolio@max-mustermann.example',
      ].join('\n')

      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[EMAIL]')
      expect(anonymized).toContain('[EMAIL_2]')
      expect(map['[EMAIL]']).not.toBe(map['[EMAIL_2]'])
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('zwei unterschiedliche Telefonnummern im selben Text erhalten unterschiedliche Platzhalter', () => {
      const text = ['Max Mustermann', 'Mobil: 0170/1234567', 'Festnetz: (030) 12 34 56'].join('\n')

      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[TEL]')
      expect(anonymized).toContain('[TEL_2]')
      expect(map['[TEL]']).not.toBe(map['[TEL_2]'])
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('PLZ+Ort und Straße+Hausnummer erhalten zwei unterschiedliche ADRESSE-Platzhalter', () => {
      const text = ['Max Mustermann', 'Musterstraße 12', '12345 Musterstadt'].join('\n')
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[ADRESSE]')
      expect(anonymized).toContain('[ADRESSE_2]')
      expect(map['[ADRESSE]']).not.toBe(map['[ADRESSE_2]'])
      expect(deanonymize(anonymized, map)).toBe(text)
    })
  })

  describe('zwei Personen mit gleichem Vornamen', () => {
    it('nur der erkannte Name (Kopfbereich) wird ersetzt, eine andere Person mit gleichem Vornamen bleibt unangetastet', () => {
      const text = [
        'Max Mustermann',
        '',
        'Sehr geehrte Damen und Herren,',
        'meine letzte Führungskraft, Herr Max Weber, kann Auskunft geben.',
        '',
        'Mit freundlichen Grüßen',
        'Max Mustermann',
      ].join('\n')

      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[NAME]')
      expect(anonymized).toContain('Max Weber')
      expect(anonymized).not.toContain('Mustermann')
      expect(deanonymize(anonymized, map)).toBe(text)
    })
  })

  describe('Name als Teilstring eines anderen Wortes', () => {
    it('"Wagner" als Nachname wird ersetzt, "Wagnerstraße" (ohne Hausnummer, also keine Adressfundstelle) bleibt unangetastet', () => {
      const text = [
        'Peter Wagner',
        '',
        'Ich bin in der Wagnerstraße aufgewachsen.',
        'Peter Wagner bewirbt sich hiermit.',
      ].join('\n')
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).not.toContain('Peter Wagner')
      expect(anonymized).toContain('Wagnerstraße')
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('"Wagnerstraße 8" als vollständige Adresse wird trotzdem korrekt (als Adresse) ersetzt', () => {
      const text = ['Peter Wagner', 'Wagnerstraße 8', '', 'Peter Wagner bewirbt sich hiermit.'].join('\n')
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).not.toContain('Peter Wagner')
      expect(anonymized).not.toContain('Wagnerstraße')
      expect(anonymized).toContain('[ADRESSE]')
      expect(deanonymize(anonymized, map)).toBe(text)
    })
  })

  describe('bereits im Text vorhandener Platzhaltertext', () => {
    it('ein Text, der bereits wörtlich "[NAME]" enthält, übersteht den Rundlauf unverändert', () => {
      const text = [
        'Max Mustermann',
        '',
        'Anmerkung: das Bewerbungsformular verlangt an dieser Stelle [NAME] als Eingabe.',
        '',
        'Mit freundlichen Grüßen',
        'Max Mustermann',
      ].join('\n')

      const { text: anonymized, map } = anonymize(text)
      const restored = deanonymize(anonymized, map)
      expect(restored).toBe(text)
      // Der wörtliche Platzhaltertext im Beispiel darf nicht als Schlüssel im
      // PiiMap auftauchen — der echte Name muss trotzdem ersetzt sein.
      expect(anonymized).toContain('[NAME]')
    })

    it('übersteht auch mehrere verschiedene bereits vorhandene Platzhalter-Literale', () => {
      const text = 'Vorlage: [NAME], [EMAIL], [TEL], [ADRESSE], [GEBURTSDATUM] — bitte ausfüllen.'
      const { text: anonymized, map } = anonymize(text)
      expect(deanonymize(anonymized, map)).toBe(text)
    })
  })

  describe('Telefonformen', () => {
    it.each([
      ['+49 170 1234567', '+49 170 1234567'],
      ['0170/1234567', '0170/1234567'],
      ['(030) 12 34 56', '(030) 12 34 56'],
      ['0170-1234567', '0170-1234567'],
      ['0170.123.45.67', '0170.123.45.67'],
    ])('erkennt die Form %s', (_label, phone) => {
      const text = `Max Mustermann\nTelefon: ${phone}\nBitte melden.`
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[TEL]')
      expect(anonymized).not.toContain(phone)
      expect(deanonymize(anonymized, map)).toBe(text)
    })
  })

  describe('Datum, das kein Geburtsdatum ist', () => {
    it.each(NON_BIRTHDATE_LINES)('bleibt unangetastet: %s', (line) => {
      const text = `Max Mustermann\n\n${line}\n\nMit freundlichen Grüßen`
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain(line)
    })

    it('ein Datum ohne Geburtsdatums-Label bleibt auch dann unangetastet, wenn es TT.MM.JJJJ-förmig ist', () => {
      const text = 'Max Mustermann\n\nBerlin, 11.08.2026\n\nSehr geehrte Damen und Herren,'
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain('11.08.2026')
      expect(anonymized).not.toContain('[GEBURTSDATUM]')
    })

    it('ein Beschäftigungszeitraum (zwei volle Daten) bleibt vollständig unangetastet', () => {
      const text = 'Max Mustermann\n\nvon 01.03.2019 bis 31.08.2021 bei der Musterfirma GmbH tätig.'
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain('01.03.2019')
      expect(anonymized).toContain('31.08.2021')
      expect(anonymized).not.toContain('[GEBURTSDATUM]')
    })
  })

  describe('Geburtsdatum wird erkannt', () => {
    it.each(['Geburtsdatum: 03.05.1990', 'geboren am 03.05.1990', 'geb. 03.05.1990'])(
      'erkennt die Form "%s"',
      (line) => {
        const text = `Max Mustermann\n\n${line}\n\nMit freundlichen Grüßen`
        const { text: anonymized, map } = anonymize(text)
        expect(anonymized).toContain('[GEBURTSDATUM]')
        expect(anonymized).not.toContain('03.05.1990')
        expect(deanonymize(anonymized, map)).toBe(text)
      },
    )

    it('unterscheidet ein Geburtsdatum von einem direkt daneben stehenden Beschäftigungsdatum', () => {
      const text = 'Max Mustermann\n\nGeburtsdatum: 03.05.1990\nBeschäftigt seit: 01.03.2019\n'
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain('[GEBURTSDATUM]')
      expect(anonymized).toContain('01.03.2019')
    })
  })

  describe('Adresse: Postleitzahl, die wie eine Telefonnummer aussehen könnte', () => {
    it('eine mit 0 beginnende PLZ mit Ort wird als Adresse erkannt, nicht als Telefonnummer', () => {
      const text = 'Max Mustermann\nMusterweg 3\n01067 Dresden\n'
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).not.toContain('01067')
      expect(anonymized).not.toContain('[TEL]')
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('eine IBAN wird nicht als Telefonnummer erkannt', () => {
      const text = 'Max Mustermann\nIBAN: DE89 3704 0044 0532 0130 00\n'
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain('DE89 3704 0044 0532 0130 00')
      expect(anonymized).not.toContain('[TEL]')
    })

    it('ein reiner Jahresbereich (kein volles Datum) wird nicht als Telefonnummer erkannt', () => {
      const text = 'Max Mustermann\nBerufserfahrung 2019 - 2021 als Projektleiterin\n'
      const { text: anonymized } = anonymize(text)
      expect(anonymized).toContain('2019 - 2021')
      expect(anonymized).not.toContain('[TEL]')
    })
  })

  describe('hints', () => {
    it('hints.name gewinnt gegenüber der eigenen Kopfbereich-Erkennung', () => {
      const text = ['Max Mustermann', '', 'Mit freundlichen Grüßen', 'Erika Musterfrau'].join('\n')
      const { text: anonymized, map } = anonymize(text, { name: 'Erika Musterfrau' })
      expect(anonymized).toContain('Max Mustermann')
      expect(anonymized).toContain('[NAME]')
      expect(map['[NAME]']).toBe('Erika Musterfrau')
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('hints.email wird ersetzt, auch wenn er nicht zum generischen E-Mail-Muster passt', () => {
      const unusualEmail = 'kontakt@intranet'
      const text = `Max Mustermann\nErreichbar unter ${unusualEmail} im internen Netz.`
      const { text: anonymized, map } = anonymize(text, { email: unusualEmail })
      expect(anonymized).toContain('[EMAIL]')
      expect(anonymized).not.toContain(unusualEmail)
      expect(map['[EMAIL]']).toBe(unusualEmail)
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('ohne hints.name wird der Name aus dem Kopfbereich erkannt', () => {
      const text = ['Erika Musterfrau', 'Musterweg 1', '', 'Mit freundlichen Grüßen', 'Erika Musterfrau'].join('\n')
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[NAME]')
      expect(map['[NAME]']).toBe('Erika Musterfrau')
    })
  })

  describe('Randfälle', () => {
    it('leerer Text bleibt leer, keine Platzhalter, leere Map', () => {
      const { text: anonymized, map } = anonymize('')
      expect(anonymized).toBe('')
      expect(map).toEqual({})
      expect(deanonymize(anonymized, map)).toBe('')
    })

    it('Text ganz ohne erkennbare PII bleibt unverändert, Map ist leer', () => {
      const text = 'Dies ist ein einfacher Satz ohne irgendwelche persönlichen Daten.'
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toBe(text)
      expect(map).toEqual({})
    })

    it('kein Kopfbereich-Name erkennbar: Text bleibt beim Namen unverändert, andere Kategorien funktionieren weiter', () => {
      const text = 'Sehr geehrte Damen und Herren,\n\nmax.mustermann@beispiel.de\n\nMit freundlichen Grüßen'
      const { text: anonymized, map } = anonymize(text)
      expect(anonymized).toContain('[EMAIL]')
      expect(deanonymize(anonymized, map)).toBe(text)
    })

    it('die zurückgegebene map ist ein PiiMap (Platzhalter -> Original)', () => {
      const text = 'Max Mustermann\nmax.mustermann@beispiel.de'
      const { map }: { map: PiiMap } = anonymize(text)
      expect(map['[NAME]']).toBe('Max Mustermann')
      expect(map['[EMAIL]']).toBe('max.mustermann@beispiel.de')
    })
  })

  describe('Ende-zu-Ende an einem realistischen Anschreiben', () => {
    // Synthetisches Anschreiben, keine echte Person. Enthält alle fünf
    // Kategorien, mehrere Nicht-Geburtsdaten und eine PLZ, die mit 0 beginnt.
    const letter = [
      'Max Mustermann',
      'Musterstraße 12',
      '01067 Dresden',
      'Telefon: 0170/1234567',
      'E-Mail: max.mustermann@beispiel.de',
      'Geburtsdatum: 03.05.1990',
      '',
      'Musterfirma GmbH',
      'Frau Erika Beispiel',
      'Beispielweg 1',
      '10115 Berlin',
      '',
      'Dresden, 11.08.2026',
      '',
      'Bewerbung als Senior-Entwicklerin',
      '',
      'Sehr geehrte Frau Beispiel,',
      '',
      'mit großem Interesse habe ich Ihre Stellenausschreibung gelesen. Seit 03.2021',
      'bin ich als Entwicklerin bei der Beispiel AG tätig, von 01.09.2017 bis 28.02.2021',
      'war ich bei der Musterfirma GmbH angestellt. Mein Vorgesetzter dort, Herr Max Weber,',
      'steht für Auskünfte gerne zur Verfügung.',
      '',
      'Über die Einladung zu einem persönlichen Gespräch würde ich mich freuen.',
      '',
      'Mit freundlichen Grüßen',
      'Max Mustermann',
    ].join('\n')

    it('ersetzt alle fünf Kategorien und übersteht den Rundlauf vollständig', () => {
      const { text: anonymized, map } = anonymize(letter)

      // Alle fünf Platzhalterarten kommen vor.
      expect(anonymized).toMatch(/\[NAME\]/)
      expect(anonymized).toMatch(/\[EMAIL\]/)
      expect(anonymized).toMatch(/\[TEL\]/)
      expect(anonymized).toMatch(/\[ADRESSE(_\d+)?\]/)
      expect(anonymized).toMatch(/\[GEBURTSDATUM\]/)

      // Absenderdaten sind weg.
      expect(anonymized).not.toContain('Mustermann')
      expect(anonymized).not.toContain('max.mustermann@beispiel.de')
      expect(anonymized).not.toContain('0170/1234567')
      expect(anonymized).not.toContain('Musterstraße')
      expect(anonymized).not.toContain('01067')
      expect(anonymized).not.toContain('03.05.1990')

      // Andere Person (Max Weber) bleibt unangetastet.
      expect(anonymized).toContain('Max Weber')

      // Nicht-Geburtsdaten bleiben stehen.
      expect(anonymized).toContain('Seit 03.2021')
      expect(anonymized).toContain('11.08.2026')
      expect(anonymized).toContain('01.09.2017')
      expect(anonymized).toContain('28.02.2021')

      // Rundlauf.
      expect(deanonymize(anonymized, map)).toBe(letter)
    })
  })
})
