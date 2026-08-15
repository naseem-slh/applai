// Nutzt `fake-indexeddb` (jsdom bringt kein IndexedDB mit), weil der zweite
// Teil dieser Datei gegen einen echten Tresor prüft.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MIN_PASSPHRASE_LENGTH, createKeyVault, type KeyVault } from '@/lib/storage/keyVault'
import {
  needsBillingQuestion,
  requiresPassphrase,
  validateKeyForm,
  type KeyFormValues,
} from './validateKeyForm'

// Erkennbar erfundene Werte — im Repository liegt nie ein echter Schlüssel (G4).
const GEMINI_KEY = 'AIzaSy-BEISPIEL-kein-echter-Schluessel'
const OPENAI_KEY = 'sk-proj-BEISPIEL-kein-echter-Schluessel'
const GOOD_PASSPHRASE = 'vier-zufaellige-Woerter'

function form(overrides: Partial<KeyFormValues> = {}): KeyFormValues {
  return {
    provider: 'gemini',
    apiKey: GEMINI_KEY,
    billingActive: false,
    passphrase: '',
    passphraseConfirm: '',
    ...overrides,
  }
}

function messageKeys(values: KeyFormValues): string[] {
  return validateKeyForm(values).map((issue) => issue.messageKey)
}

describe('needsBillingQuestion', () => {
  it('fragt bei Google, weil ein AIza-Schlüssel seine Abrechnung nicht verrät', () => {
    expect(needsBillingQuestion('gemini', GEMINI_KEY)).toBe(true)
    expect(needsBillingQuestion('gemini', '')).toBe(true)
  })

  it('fragt nicht, wo die Antwort schon feststeht', () => {
    expect(needsBillingQuestion('openai', OPENAI_KEY)).toBe(false)
    expect(needsBillingQuestion('anthropic', 'sk-ant-BEISPIEL')).toBe(false)
    // sk-… im Gemini-Feld: kostenpflichtig, also nichts mehr zu fragen.
    expect(needsBillingQuestion('gemini', OPENAI_KEY)).toBe(false)
  })
})

describe('requiresPassphrase', () => {
  it('verlangt ein Passwort bei OpenAI und Anthropic ohne Rückfrage', () => {
    expect(requiresPassphrase(form({ provider: 'openai', apiKey: OPENAI_KEY }))).toBe(true)
    expect(requiresPassphrase(form({ provider: 'anthropic', apiKey: 'sk-ant-BEISPIEL' }))).toBe(true)
  })

  it('verlangt es bei Google erst, wenn die Abrechnung bestätigt wurde', () => {
    expect(requiresPassphrase(form({ billingActive: null }))).toBe(false)
    expect(requiresPassphrase(form({ billingActive: false }))).toBe(false)
    expect(requiresPassphrase(form({ billingActive: true }))).toBe(true)
  })

  it('verlangt es auch für einen sk-Schlüssel im Gemini-Feld', () => {
    expect(requiresPassphrase(form({ provider: 'gemini', apiKey: OPENAI_KEY }))).toBe(true)
  })
})

describe('validateKeyForm', () => {
  it('nimmt einen kostenlosen Gemini-Schlüssel ohne Passwort an', () => {
    expect(messageKeys(form())).toEqual([])
  })

  it('nimmt einen kostenpflichtigen Schlüssel mit tauglichem Passwort an', () => {
    expect(
      messageKeys(
        form({
          provider: 'openai',
          apiKey: OPENAI_KEY,
          passphrase: GOOD_PASSPHRASE,
          passphraseConfirm: GOOD_PASSPHRASE,
        }),
      ),
    ).toEqual([])
  })

  it('meldet einen leeren Schlüssel und fragt dann nicht auch noch nach der Abrechnung', () => {
    expect(messageKeys(form({ apiKey: '   ', billingActive: null }))).toEqual(['emptyKey'])
  })

  it('meldet Steuerzeichen im Schlüssel', () => {
    expect(messageKeys(form({ apiKey: `${GEMINI_KEY}\nsk-noch-einer` }))).toEqual(['controlCharacters'])
  })

  it('verlangt eine Antwort auf die Abrechnungsfrage, sobald ein Schlüssel dasteht', () => {
    expect(messageKeys(form({ billingActive: null }))).toEqual(['billingUnanswered'])
  })

  it('blockiert einen kostenpflichtigen Schlüssel ohne Passwort', () => {
    expect(messageKeys(form({ provider: 'openai', apiKey: OPENAI_KEY }))).toEqual(['passphraseRequired'])
  })

  it('nennt die Mindestlänge mit der Zahl aus dem Tresor', () => {
    const issues = validateKeyForm(
      form({ provider: 'openai', apiKey: OPENAI_KEY, passphrase: 'kurzpass', passphraseConfirm: 'kurzpass' }),
    )
    expect(issues).toEqual([
      { field: 'passphrase', messageKey: 'passphraseTooShort', values: { min: MIN_PASSPHRASE_LENGTH } },
    ])
  })

  it('lehnt ein einziges wiederholtes Zeichen ab, obwohl es lang genug ist', () => {
    const repeated = 'a'.repeat(MIN_PASSPHRASE_LENGTH)
    expect(
      messageKeys(
        form({ provider: 'openai', apiKey: OPENAI_KEY, passphrase: repeated, passphraseConfirm: repeated }),
      ),
    ).toEqual(['passphraseRepeated'])
  })

  it('lehnt ein Passwort ab, das im Schlüssel selbst steht', () => {
    const inKey = 'BEISPIEL-kein-echter'
    expect(inKey.length).toBeGreaterThanOrEqual(MIN_PASSPHRASE_LENGTH)
    expect(
      messageKeys(
        form({ billingActive: true, passphrase: inKey, passphraseConfirm: inKey }),
      ),
    ).toEqual(['passphraseInKey'])
  })

  it('meldet eine abweichende Wiederholung, aber erst wenn das Passwort selbst taugt', () => {
    expect(
      messageKeys(
        form({ billingActive: true, passphrase: GOOD_PASSPHRASE, passphraseConfirm: `${GOOD_PASSPHRASE}x` }),
      ),
    ).toEqual(['passphraseMismatch'])
    // Zu kurz **und** abweichend: nur der Mangel, der zuerst zählt.
    expect(
      messageKeys(form({ billingActive: true, passphrase: 'kurz', passphraseConfirm: 'anders' })),
    ).toEqual(['passphraseTooShort'])
  })
})

/**
 * Der eigentliche Zweck dieser Datei: Die Prüfung der Oberfläche wiederholt
 * Regeln, die der Tresor selbst durchsetzt (siehe Kopfkommentar von
 * `validateKeyForm.ts`). Diese Doppelung darf nicht auseinanderlaufen —
 * also wird sie hier am echten Tresor gemessen.
 */
describe('Deckungsgleich mit dem Tresor', () => {
  const vaults: KeyVault[] = []

  function newVault(): KeyVault {
    const vault = createKeyVault()
    vaults.push(vault)
    return vault
  }

  afterEach(async () => {
    for (const vault of vaults.splice(0)) {
      await vault.clear()
      vault.destroy()
    }
  })

  const rejected: { name: string; values: KeyFormValues }[] = [
    { name: 'leerer Schlüssel', values: form({ apiKey: '  ' }) },
    { name: 'Steuerzeichen', values: form({ apiKey: `${GEMINI_KEY}\nzweite-Zeile` }) },
    {
      name: 'kostenpflichtig ohne Passwort',
      values: form({ provider: 'openai', apiKey: OPENAI_KEY }),
    },
    {
      name: 'Passwort zu kurz',
      values: form({ provider: 'openai', apiKey: OPENAI_KEY, passphrase: 'kurzpass', passphraseConfirm: 'kurzpass' }),
    },
    {
      name: 'Passwort aus einem wiederholten Zeichen',
      values: form({
        provider: 'openai',
        apiKey: OPENAI_KEY,
        passphrase: 'a'.repeat(MIN_PASSPHRASE_LENGTH),
        passphraseConfirm: 'a'.repeat(MIN_PASSPHRASE_LENGTH),
      }),
    },
    {
      name: 'Passwort steht im Schlüssel',
      values: form({
        billingActive: true,
        passphrase: 'BEISPIEL-kein-echter',
        passphraseConfirm: 'BEISPIEL-kein-echter',
      }),
    },
  ]

  for (const { name, values } of rejected) {
    it(`lehnt ab, was auch der Tresor ablehnt: ${name}`, async () => {
      expect(validateKeyForm(values).length).toBeGreaterThan(0)

      const vault = newVault()
      await vault.initialize()
      await expect(
        vault.save(values.provider, values.apiKey, {
          passphrase: values.passphrase === '' ? undefined : values.passphrase,
          treatAsPaid: values.billingActive === true,
        }),
      ).rejects.toThrow()
      expect(vault.getKey()).toBeNull()
    })
  }

  it('nimmt an, was auch der Tresor annimmt: kostenloser Schlüssel ohne Passwort', async () => {
    const values = form()
    expect(validateKeyForm(values)).toEqual([])

    const vault = newVault()
    await vault.initialize()
    await vault.save(values.provider, values.apiKey, { treatAsPaid: false })
    expect(vault.getKey()).toBe(GEMINI_KEY)
  })

  it('nimmt an, was auch der Tresor annimmt: kostenpflichtiger Schlüssel mit Passwort', async () => {
    const values = form({
      provider: 'openai',
      apiKey: OPENAI_KEY,
      passphrase: GOOD_PASSPHRASE,
      passphraseConfirm: GOOD_PASSPHRASE,
    })
    expect(validateKeyForm(values)).toEqual([])

    const vault = newVault()
    await vault.initialize()
    await vault.save(values.provider, values.apiKey, {
      passphrase: values.passphrase,
      treatAsPaid: false,
    })
    expect(vault.getKey()).toBe(OPENAI_KEY)
  })
})
