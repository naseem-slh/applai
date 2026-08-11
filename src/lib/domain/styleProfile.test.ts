import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import { computeSentenceLength, deriveStyleProfile, detectAddress, styleProfileToPromptFragment } from './styleProfile'
import type { StyleProfile } from './styleProfile'
import {
  ABBREVIATION_SENTENCE_FIXTURE,
  DU_COVER_LETTER_FIXTURE,
  NEUTRAL_COVER_LETTER_FIXTURE,
  SIE_COVER_LETTER_FIXTURE,
} from './styleProfile.fixtures'

/**
 * Abgefangener `LlmProvider`-Stub, identisch zum Muster aus `jobAd.test.ts`
 * (Aufgabe 9) — nie ein echter Netzwerkaufruf.
 */
function stubProvider(response: string | (() => string)): LlmProvider & { lastRequest?: LlmRequest } {
  const provider: LlmProvider & { lastRequest?: LlmRequest } = {
    id: 'gemini',
    label: 'Stub',
    endpoint: 'https://example.invalid',
    generate: (req) => {
      provider.lastRequest = req
      return Promise.resolve(typeof response === 'function' ? response() : response)
    },
  }
  return provider
}

// Zwei zusammenhängende, WÖRTLICHE Sätze aus SIE_COVER_LETTER_FIXTURE (nur
// die Zeilenumbrüche des Fließtexts sind zu Leerzeichen normalisiert — genau
// das, was ein Modell beim Abtippen ebenfalls tun würde).
const SIE_VERBATIM_SAMPLE =
  'Ihre Anzeige spricht mich besonders an, weil Sie großen Wert auf strukturiertes Arbeiten legen – genau das zeichnet mich aus. ' +
  'Gerne überzeuge ich Sie in einem persönlichen Gespräch von meiner Motivation.'

const DU_VERBATIM_SAMPLE =
  'Wenn du auf der Suche nach jemandem bist, der anpackt statt lange zu diskutieren, dann lass uns reden. ' +
  'Ich freue mich, dich und dein Team bald kennenzulernen!'

const VALID_SIE_RESPONSE = JSON.stringify({
  formality: 78,
  traits: ['nennt Ergebnisse mit konkreten Zahlen', 'kurze, direkte Einleitungssätze'],
  sample: SIE_VERBATIM_SAMPLE,
})

describe('computeSentenceLength', () => {
  it('berechnet die durchschnittliche Wortzahl pro Satz für zwei einfache Sätze', () => {
    expect(computeSentenceLength('Das ist ein Satz. Das ist noch ein Satz.')).toBe(4.5)
  })

  it('liefert 0 für einen leeren Text', () => {
    expect(computeSentenceLength('')).toBe(0)
  })

  it('liefert 0 für einen Text, der nur aus Leerraum besteht', () => {
    expect(computeSentenceLength('   \n  ')).toBe(0)
  })

  it('behandelt einen Doppelpunkt vor einer Aufzählung nicht als Satzende', () => {
    const text = 'Meine Kompetenzen sind: Teamarbeit, Kommunikation und Zeitmanagement. Ich freue mich auf das Gespräch.'
    // 2 echte Sätze (7 + 6 Wörter) = 13 / 2 = 6.5 – ein Doppelpunkt-Split hätte 3 "Sätze" ergeben.
    expect(computeSentenceLength(text)).toBe(6.5)
  })

  it('behandelt eine Ellipse nicht als eigenständigen zusätzlichen Satz', () => {
    const text = 'Ich habe lange gezögert... Aber dann habe ich mich entschieden.'
    // 2 echte Sätze (4 + 6 Wörter) = 10 / 2 = 5.0
    expect(computeSentenceLength(text)).toBe(5)
  })

  it('ignoriert Abkürzungen ("Dr.", "z. B.") und ein Tag-Monatsname-Datum ("15. März 2024") beim Zählen der Satzenden', () => {
    // Von Hand ausgezählt (siehe styleProfile.fixtures.ts): genau 3 echte
    // Sätze, 28 Wörter insgesamt → 9.3. Ein naiver Split auf jeden "."
    // würde 8 Fragmente liefern (u. a. "Frau Dr" / " Meier hat mich am 15" /
    // " März 2024 …" / " Themen waren z" / " B" / …) und einen Durchschnitt
    // von 28/8 = 3.5 vortäuschen – deutlich erkennbar falsch.
    expect(computeSentenceLength(ABBREVIATION_SENTENCE_FIXTURE)).toBe(9.3)
  })

  // -------------------------------------------------------------------
  // Fix-Runde 1 (Review-Fund): breitere Abdeckung über die Abkürzungsarten
  // hinweg statt aller 35 Einträge einzeln – je ein Vertreter pro Form.
  // -------------------------------------------------------------------

  it('ignoriert eine mehrteilige Abkürzung mitten im Satz ("u. a.", eigener Fall neben "z. B.")', () => {
    const text = 'Ich habe Erfahrung in der Buchhaltung, u. a. im Rechnungswesen. Das hat mir sehr geholfen.'
    // 2 echte Sätze (10 + 5 Wörter) = 15 / 2 = 7.5
    expect(computeSentenceLength(text)).toBe(7.5)
  })

  it('ignoriert eine einteilige Abkürzung vor einer Zahl mitten im Satz ("Tel.")', () => {
    const text = 'Bei Rückfragen erreichen Sie mich unter Tel. 0170 1234567. Ich freue mich auf Ihre Rückmeldung.'
    // 2 echte Sätze (7 + 6 Wörter) = 13 / 2 = 6.5
    expect(computeSentenceLength(text)).toBe(6.5)
  })

  it('ignoriert eine einteilige Abkürzung mitten im Satz ("bzw.")', () => {
    const text = 'Ich habe Erfahrung im Vertrieb bzw. im Kundenservice gesammelt. Beides bereitet mir Freude.'
    // 2 echte Sätze (9 + 4 Wörter) = 13 / 2 = 6.5
    expect(computeSentenceLength(text)).toBe(6.5)
  })

  it('verschmilzt zwei echte Sätze, wenn eine Abkürzung selbst das Satzende ist (bekannte, dokumentierte Grenze, siehe Kommentar an maskNonTerminalPeriods)', () => {
    const text = 'Ich habe Rechnungen, Angebote, Reports usw. Danach ging ich nach Hause.'
    // Richtig wären 2 Sätze (6 + 5 Wörter = 11 / 2 = 5.5) – nach deutscher
    // Typografie steht nach "usw." KEIN zweiter Punkt, der Abkürzungspunkt
    // IST hier das Satzende. `maskNonTerminalPeriods` maskiert ihn trotzdem
    // unbedingt und verschmilzt beide Sätze zu einem: 11 Wörter / 1 "Satz"
    // = 11.0. Bewusst nicht behoben (siehe Kommentar oben) – dieser Test
    // hält das aktuelle, dokumentierte Verhalten fest, statt es unbemerkt
    // driften zu lassen.
    expect(computeSentenceLength(text)).toBe(11)
  })
})

describe('detectAddress', () => {
  it('erkennt ein "Sie"-Anschreiben trotz einer satzanfangsbedingten Großschreibung von "sie" (Firma statt Anrede)', () => {
    expect(detectAddress(SIE_COVER_LETTER_FIXTURE)).toBe('sie')
  })

  it('erkennt ein "du"-Anschreiben', () => {
    expect(detectAddress(DU_COVER_LETTER_FIXTURE)).toBe('du')
  })

  it('erkennt ein Anschreiben ganz ohne direkte Anrede als "none"', () => {
    expect(detectAddress(NEUTRAL_COVER_LETTER_FIXTURE)).toBe('none')
  })

  it('zählt ein großgeschriebenes "Sie" am Satzanfang NICHT als Höflichkeitsanrede, wenn es die einzige Fundstelle ist', () => {
    // "Sie" bezieht sich hier beide Male auf "Die Musterwerk GmbH" (die
    // Firma), ist aber jeweils nur wegen der Satzanfangsposition
    // großgeschrieben – keine echte Anrede der Leserin/des Lesers. Kein
    // Anrede-/Grußformel-Signal in diesem kurzen Ausschnitt vorhanden.
    const text =
      'Die Musterwerk GmbH wurde 1998 gegründet. Sie beschäftigt heute über 300 Mitarbeitende in ganz Deutschland. ' +
      'Sie exportiert ihre Produkte in über 20 Länder.'
    expect(detectAddress(text)).toBe('none')
  })

  it('liefert "none" für einen leeren Text', () => {
    expect(detectAddress('')).toBe('none')
  })

  it('zählt ein satzanfangsbedingt großgeschriebenes "Ihnen" (Dativ) als sicheren Treffer – die einzige Ausnahme von der Positionsregel', () => {
    // "Ihnen" eröffnet im Deutschen so gut wie nie einen Satz in der
    // 3. Person – deutlich schwächere Zweideutigkeit als bei "sie"/"Ihr"/"Ihre".
    const text = 'Ihnen möchte ich für die Gelegenheit danken, mich vorzustellen.'
    expect(detectAddress(text)).toBe('sie')
  })

  it('erkennt "du" auch dann, wenn alle Treffer satzanfangsbedingt stehen (kein Zweideutigkeitsproblem bei "du"-Formen)', () => {
    const text = 'Du hast sicher schon viel von uns gehört. Dein Team wartet schon auf dich.'
    expect(detectAddress(text)).toBe('du')
  })

  // -------------------------------------------------------------------
  // Fix-Runde 2 (Review-Fund + Koordinator-Entscheidung): Anrede und
  // Grußformel sind jetzt das primäre Signal, der Possessivform-Fallback
  // aus Fix-Runde 1 wurde ersatzlos gestrichen (siehe Kommentarblock über
  // detectAddress in styleProfile.ts für die vollständige Begründung).
  // -------------------------------------------------------------------

  it('erkennt "sie" NICHT als Anrede, wenn "Ihre"/"Ihr" sich auf zuvor genannte Dritte beziehen, statt fälschlich "sie" zu liefern (Gegenbeispiel aus dem Review, das Fix-Runde 1 noch nicht bestand)', () => {
    // "Ihre Anliegen"/"Ihre Zufriedenheit" beziehen sich auf "Kunden" aus
    // dem Vorsatz – 3. Person Plural, keine Anrede. Beide Treffer sind
    // satzanfangsbedingt großgeschrieben und zählen deshalb nicht mehr
    // (kein Possessivform-Fallback mehr, siehe Kommentarblock).
    const text =
      'Beim vorherigen Arbeitgeber betreute ich zahlreiche Kunden. Ihre Anliegen bearbeitete ich stets zügig. ' +
      'Ihre Zufriedenheit lag mir sehr am Herzen.'
    expect(detectAddress(text)).toBe('none')
  })

  it('erkennt "Sie" über die Anrede, wenn im Fließtext ausschließlich satzanfangsbedingt großgeschriebene "Ihre"/"Ihr"-Treffer vorkommen (Anrede ist jetzt das primäre Signal, kein Pronomen-Fallback mehr nötig)', () => {
    const text =
      'Sehr geehrte Damen und Herren,\n\nIhre Anzeige hat mich begeistert. Ihr Unternehmen ist mir positiv aufgefallen. Ihre Referenzen zeigen Qualität.'
    expect(detectAddress(text)).toBe('sie')
  })

  it('BEKANNTE GRENZE: liefert "none" für denselben Text OHNE die Anrede-Zeile – ausschließlich satzanfangsbedingte Pronomen reichen seit Fix-Runde 2 nicht mehr aus (siehe Kommentarblock, Abschnitt "Bekannte Grenze")', () => {
    const text = 'Ihre Anzeige hat mich begeistert. Ihr Unternehmen ist mir positiv aufgefallen. Ihre Referenzen zeigen Qualität.'
    expect(detectAddress(text)).toBe('none')
  })

  it('lässt einen Gleichstand zwischen einem sicheren "Sie"- und einem "du"-Pronomentreffer zugunsten von "du" auflösen (informell gewinnt bei Gleichstand)', () => {
    const text = 'Ich habe Ihre Anzeige gelesen. Kannst du mir mehr erzählen?'
    expect(detectAddress(text)).toBe('du')
  })

  it('lässt einen mitten im Satz großgeschriebenen "Sie"-Treffer gegen einen "du"-Treffer im selben Brief zugunsten von "du" auflösen', () => {
    const text = 'Ich habe gesehen, dass Sie noch Verstärkung suchen. Kannst du mir mehr Details schicken?'
    expect(detectAddress(text)).toBe('du')
  })

  it('nutzt die Anrede in den ersten Zeilen als primäres Signal, auch bei einer vollständigen, realistischen Briefstruktur', () => {
    const text =
      'Sehr geehrte Frau Meier,\n\nhiermit bewerbe ich mich um die ausgeschriebene Stelle als Sachbearbeiter.\n\nMit freundlichen Grüßen\nAlex Berger'
    expect(detectAddress(text)).toBe('sie')
  })

  it('nutzt "Hallo"/"Liebe(r)"/"Hi" als informelles Anrede-Signal', () => {
    const text = 'Hi Team,\n\nich habe eure Stellenanzeige gesehen und möchte mich bewerben.'
    expect(detectAddress(text)).toBe('du')
  })

  it('lässt eine förmliche Anrede gewinnen, auch wenn die Grußformel informell ist ("Viele Grüße" unter einem sonst förmlichen Brief – ein häufiger Praxisfall, siehe Bericht)', () => {
    const text =
      'Sehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich um die ausgeschriebene Stelle.\n\nViele Grüße\nAlex Berger'
    expect(detectAddress(text)).toBe('sie')
  })

  it('lässt eine informelle Anrede gewinnen, auch wenn die Grußformel förmlich ist (symmetrischer Fall zum vorigen Test)', () => {
    const text = 'Hallo Team,\n\nich bewerbe mich hiermit um die ausgeschriebene Stelle.\n\nMit freundlichen Grüßen\nAlex Berger'
    expect(detectAddress(text)).toBe('du')
  })

  it('nutzt die Grußformel als Ersatzsignal, wenn keine Anrede vorhanden ist', () => {
    const text = 'Hiermit bewerbe ich mich um die ausgeschriebene Stelle.\n\nMit freundlichen Grüßen\nAlex Berger'
    expect(detectAddress(text)).toBe('sie')
  })

  it('erkennt "Hiermit" am Zeilenanfang NICHT fälschlich als informelle Anrede ("Hi…")', () => {
    // Regressionsschutz für die Wortgrenze in INFORMAL_SALUTATION_RE – ein
    // sehr häufiger Bewerbungsschreiben-Einstieg, der "Hi" nur als Präfix
    // enthält, kein eigenständiges Wort.
    const text = 'Hiermit bewerbe ich mich um die ausgeschriebene Stelle. Über eine Rückmeldung würde ich mich freuen.'
    expect(detectAddress(text)).toBe('none')
  })
})

describe('deriveStyleProfile', () => {
  it('parst eine gültige Modellantwort zu einem vollständigen StyleProfile (Sie-Anschreiben)', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')

    expect(result.formality).toBe(78)
    expect(result.address).toBe('sie')
    expect(result.sentenceLength).toBeGreaterThan(0)
    expect(result.traits).toEqual(['nennt Ergebnisse mit konkreten Zahlen', 'kurze, direkte Einleitungssätze'])
    expect(result.sample).toBe(SIE_VERBATIM_SAMPLE)
  })

  it('berechnet sentenceLength und address deterministisch, nicht aus der Modellantwort', async () => {
    // Die Modellantwort enthält gar kein sentenceLength/address-Feld –
    // wäre eines davon irrtümlich vom Modell erwartet, würde das Parsen
    // hier bereits scheitern.
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.sentenceLength).toBe(computeSentenceLength(SIE_COVER_LETTER_FIXTURE))
    expect(result.address).toBe(detectAddress(SIE_COVER_LETTER_FIXTURE))
  })

  it('fordert eine JSON-Antwort vom Provider an (json: true)', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.json).toBe(true)
  })

  it('übergibt den Anschreiben-Text unverändert im Nutzer-Prompt', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.user).toContain(SIE_COVER_LETTER_FIXTURE)
  })

  it('erkennt die Sprache des Anschreibens deterministisch und trägt sie in den Systemprompt ein', async () => {
    const englishLetter =
      'Dear Hiring Team,\n\nI was excited to see your job posting and believe my background is a strong match. ' +
      'I would welcome the opportunity to discuss this further.\n\nBest regards,\nAlex Berger'
    const provider = stubProvider(
      JSON.stringify({
        formality: 60,
        traits: ['uses concise sentences'],
        sample: 'I was excited to see your job posting and believe my background is a strong match. I would welcome the opportunity to discuss this further.',
      }),
    )
    await deriveStyleProfile(englishLetter, provider, 'test-key')
    expect(provider.lastRequest?.system).toContain('"en"')
  })

  it('wirft bei fehlerhaftem/abgeschnittenem JSON eine ModelResponseError', async () => {
    const provider = stubProvider('{"formality": 70, "traits": ["x"')
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('wirft eine verständliche Fehlermeldung mit Feldnamen bei fehlendem Pflichtfeld', async () => {
    const raw = JSON.stringify({ formality: 70, traits: ['x'] }) // "sample" fehlt
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(/sample/)
  })

  it('ignoriert eine Modellantwort in einem Markdown-Codeblock', async () => {
    const provider = stubProvider('```json\n' + VALID_SIE_RESPONSE + '\n```')
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(78)
  })

  it('lässt ein unerwartetes Zusatzfeld der Modellantwort unbeanstandet, statt zu scheitern', async () => {
    const withExtraField = JSON.stringify({ ...JSON.parse(VALID_SIE_RESPONSE), confidence: 0.91 })
    const provider = stubProvider(withExtraField)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(78)
  })

  // ---------------------------------------------------------------------
  // G10 hat hier "echte Zähne" (Auftrag): "sample" MUSS wörtlich im
  // Original stehen. Eine Modellantwort mit einem nicht enthaltenen
  // "sample" wird verworfen, nicht stillschweigend übernommen.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn "sample" nicht wörtlich im Original vorkommt (G10)', async () => {
    const raw = JSON.stringify({
      formality: 70,
      traits: ['wirkt zielstrebig'],
      sample: 'Dieser Satz steht so nicht im Originalanschreiben und wurde erfunden.',
    })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(/sample/i)
  })

  it('akzeptiert ein "sample", dessen Zeilenumbrüche im Original von den Leerzeichen der Modellantwort abweichen', async () => {
    // SIE_VERBATIM_SAMPLE hat Leerzeichen an Stellen, an denen die Fixture
    // umgebrochene Zeilen hat – die Rundlauf-Normalisierung muss das
    // gleichsetzen, statt fälschlich "nicht wörtlich" zu melden.
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.sample).toBe(SIE_VERBATIM_SAMPLE)
  })

  // ---------------------------------------------------------------------
  // "formality" außerhalb 0–100 ist eine Schema-Verletzung, kein Zufallswert.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn "formality" über 100 liegt', async () => {
    const raw = JSON.stringify({ formality: 150, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('wirft eine ModelResponseError, wenn "formality" negativ ist', async () => {
    const raw = JSON.stringify({ formality: -5, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  // ---------------------------------------------------------------------
  // formality ↔ address-Kohärenzprüfung (Auftrag: "a du-letter scoring 95
  // is incoherent... make it explicit and testable, not a silent clamp").
  // Nur in RICHTUNG "du" + sehr hohe formality geprüft, siehe Bericht.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn ein "du"-Anschreiben eine formality weit über der du-Grenze bekommt (widerspricht der Prompt-Ankerdefinition)', async () => {
    const raw = JSON.stringify({ formality: 96, traits: ['x'], sample: DU_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(DU_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('akzeptiert eine moderate formality für ein "du"-Anschreiben (kein Widerspruch, keine Ausnahme)', async () => {
    const raw = JSON.stringify({ formality: 60, traits: ['x'], sample: DU_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    const result = await deriveStyleProfile(DU_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(60)
  })

  it('akzeptiert eine niedrige formality für ein "Sie"-Anschreiben (keine Prüfung in dieser Richtung)', async () => {
    const raw = JSON.stringify({ formality: 10, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(10)
  })
})

describe('styleProfileToPromptFragment', () => {
  const baseProfile: StyleProfile = {
    formality: 75,
    sentenceLength: 14.2,
    address: 'sie',
    traits: ['nennt Ergebnisse mit konkreten Zahlen', 'kurze Einleitungssätze'],
    sample: SIE_VERBATIM_SAMPLE,
  }

  it('enthält alle fünf Profilfelder', () => {
    const fragment = styleProfileToPromptFragment(baseProfile)
    expect(fragment).toContain('75')
    expect(fragment).toContain('14.2')
    expect(fragment.toLowerCase()).toMatch(/sie/i)
    expect(fragment).toContain('nennt Ergebnisse mit konkreten Zahlen')
    expect(fragment).toContain('kurze Einleitungssätze')
    expect(fragment).toContain(SIE_VERBATIM_SAMPLE)
  })

  it('ändert sich sichtbar, wenn sich formality ändert – inklusive der Wortwahl, nicht nur der Zahl', () => {
    // Fix-Runde 1 (Review-Fund): die Implementierung variiert bei formality
    // auch die beschreibende Formulierung (describeFormality) – genau die
    // Wortwahl, die das Modell tatsächlich steuert, nicht nur die Zahl.
    // "umgangssprachlichen"/"zurückhaltend" sind bewusst gewählt, weil sie
    // NUR in der jeweiligen Formality-Beschreibung vorkommen – anders als
    // "förmlich" (steckt bereits im festen Label "Förmlichkeit:" und in
    // "verwendet die förmliche Anrede", unabhängig vom Wert) wäre ein
    // Substring-Test darauf kein echter Beleg für die Wortwahländerung.
    const locker = styleProfileToPromptFragment({ ...baseProfile, formality: 10 })
    const foermlich = styleProfileToPromptFragment({ ...baseProfile, formality: 90 })
    expect(locker).not.toBe(foermlich)
    expect(locker).toContain('10')
    expect(foermlich).toContain('90')
    expect(locker.toLowerCase()).toContain('umgangssprachlichen')
    expect(foermlich.toLowerCase()).toContain('zurückhaltend')
    expect(locker.toLowerCase()).not.toContain('zurückhaltend')
    expect(foermlich.toLowerCase()).not.toContain('umgangssprachlichen')
  })

  it('ändert sich sichtbar, wenn sich sentenceLength ändert – inklusive der Wortwahl, nicht nur der Zahl', () => {
    // "prägnante"/"ausführliche" sind bewusst gewählt statt "kurze"/"lange":
    // "kurze" steckt bereits unabhängig vom Wert im festen Trait
    // "kurze Einleitungssätze" von baseProfile, wäre also kein echter Beleg.
    const kurz = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: 6 })
    const lang = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: 28 })
    expect(kurz).not.toBe(lang)
    expect(kurz).toContain('6')
    expect(lang).toContain('28')
    expect(kurz.toLowerCase()).toContain('prägnante')
    expect(lang.toLowerCase()).toContain('ausführliche')
    expect(kurz.toLowerCase()).not.toContain('ausführliche')
    expect(lang.toLowerCase()).not.toContain('prägnante')
  })

  it('ändert sich sichtbar, wenn sich address ändert', () => {
    const sie = styleProfileToPromptFragment({ ...baseProfile, address: 'sie' })
    const du = styleProfileToPromptFragment({ ...baseProfile, address: 'du' })
    const none = styleProfileToPromptFragment({ ...baseProfile, address: 'none' })
    expect(new Set([sie, du, none]).size).toBe(3)
  })

  it('klemmt eine per Regler über 100 hinaus verschobene formality auf 100, statt sie unverändert auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: 130 })
    expect(fragment).toContain('100')
    expect(fragment).not.toContain('130')
  })

  it('klemmt eine negative formality auf 0', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: -20 })
    expect(fragment).toContain('0/100')
  })

  it('klemmt eine negative sentenceLength auf 0, statt sie unverändert auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: -5 })
    expect(fragment).not.toContain('-5')
  })

  it('fällt bei einer nicht-endlichen formality (NaN) auf einen neutralen Wert zurück, statt NaN auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: Number.NaN })
    expect(fragment).not.toContain('NaN')
  })

  it('zeigt einen Platzhaltertext, wenn traits leer ist, statt einen leeren Abschnitt zu erzeugen', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, traits: [] })
    expect(fragment.length).toBeGreaterThan(0)
    expect(fragment).toMatch(/keine|kein/i)
  })

  it('bricht bei einem ungültigen, handbearbeiteten address-Wert nicht ab, sondern fällt sicher zurück', () => {
    const tampered = { ...baseProfile, address: 'invalid' } as unknown as StyleProfile
    expect(() => styleProfileToPromptFragment(tampered)).not.toThrow()
  })
})
