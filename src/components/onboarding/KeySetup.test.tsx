import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { MIN_PASSPHRASE_LENGTH, type KeyVault } from '@/lib/storage/keyVault'
import { KeySetup } from './KeySetup'
import { PROVIDER_LINKS } from './providerLinks'
import type { KeyVaultHandle, KeyVaultStatus } from './useKeyVault'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

// Erkennbar erfundene Werte (G4).
const GEMINI_KEY = 'AIzaSy-BEISPIEL-kein-echter-Schluessel'
const OPENAI_KEY = 'sk-proj-BEISPIEL-kein-echter-Schluessel'
const GOOD_PASSPHRASE = 'vier-zufaellige-Woerter'

// Wie in Select.test.tsx: Radix' Auswahlliste braucht Zeigererfassung und
// scrollIntoView, beides kennt jsdom nicht.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function makeVault(overrides: Partial<KeyVault> = {}): KeyVault {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
    isLocked: vi.fn(() => Promise.resolve(false)),
    unlock: vi.fn(() => Promise.resolve()),
    lock: vi.fn(),
    getKey: vi.fn(() => null),
    getProvider: vi.fn(() => null),
    clear: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    ...overrides,
  }
}

function setup(options: { status?: KeyVaultStatus; vault?: KeyVault } = {}) {
  const vault = options.vault ?? makeVault()
  const refresh = vi.fn()
  const onSaved = vi.fn()
  const handle: KeyVaultHandle = { vault, status: options.status ?? 'empty', refresh }
  const view = render(<KeySetup keyVault={handle} onSaved={onSaved} />)
  return { ...view, vault, refresh, onSaved, user: userEvent.setup() }
}

/** Anbieter über die Radix-Auswahlliste wechseln. */
function chooseProvider(name: string): void {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: t('onboarding.key.providerLabel') }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(screen.getByRole('option', { name }))
}

/** Die Abrechnungsfrage bei Google beantworten. */
function answerBilling(name: string): void {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: t('onboarding.key.billingLabel') }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(screen.getByRole('option', { name }))
}

function keyField(): HTMLInputElement {
  return screen.getByLabelText(t('onboarding.key.apiKeyLabel'))
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: t('onboarding.key.submit') }))
}

describe('KeySetup', () => {
  it('bietet genau die drei fest verdrahteten Anbieter an', () => {
    setup()

    fireEvent.pointerDown(screen.getByRole('combobox', { name: t('onboarding.key.providerLabel') }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Google Gemini',
      'OpenAI',
      'Anthropic',
    ])
  })

  it('zeigt zum gewählten Anbieter die passende Anleitung und den Verweis dorthin', async () => {
    setup()

    expect(screen.getByText(t('onboarding.key.guide.gemini.step1'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Google Gemini/ })).toHaveAttribute(
      'href',
      PROVIDER_LINKS.gemini.keys,
    )

    chooseProvider('OpenAI')

    expect(screen.getByText(t('onboarding.key.guide.openai.step1'))).toBeInTheDocument()
    expect(screen.queryByText(t('onboarding.key.guide.gemini.step1'))).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /OpenAI/ })).toHaveAttribute(
      'href',
      PROVIDER_LINKS.openai.keys,
    )
  })

  it('verlangt für einen kostenpflichtigen Schlüssel ein Passwort und speichert vorher nicht', async () => {
    const { vault, user } = setup()
    chooseProvider('OpenAI')

    await user.type(keyField(), OPENAI_KEY)
    submit()

    expect(vault.save).not.toHaveBeenCalled()
    expect(screen.getByText(t('onboarding.key.errors.passphraseRequired'))).toBeInTheDocument()
    // Der Fokus steht auf dem Feld, das fehlt.
    expect(document.activeElement).toBe(screen.getByLabelText(t('onboarding.key.passphraseLabel')))
  })

  it('speichert einen kostenlosen Gemini-Schlüssel ohne Passwort', async () => {
    const { vault, refresh, onSaved, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    answerBilling(t('onboarding.key.billingFree'))
    submit()

    expect(await screen.findByText(t('onboarding.key.saved'))).toBeInTheDocument()
    expect(vault.save).toHaveBeenCalledWith('gemini', GEMINI_KEY, {
      passphrase: undefined,
      treatAsPaid: false,
    })
    expect(refresh).toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith('gemini')
  })

  it('lässt die Abrechnungsfrage bei Google nicht unbeantwortet', async () => {
    const { vault, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    submit()

    expect(vault.save).not.toHaveBeenCalled()
    expect(screen.getByText(t('onboarding.key.errors.billingUnanswered'))).toBeInTheDocument()
  })

  it('verlangt ein Passwort, sobald der Nutzer die Abrechnung bestätigt, und meldet sie an den Tresor', async () => {
    const { vault, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    expect(screen.queryByLabelText(t('onboarding.key.passphraseLabel'))).not.toBeInTheDocument()

    answerBilling(t('onboarding.key.billingPaid'))
    expect(screen.getByLabelText(t('onboarding.key.passphraseLabel'))).toBeInTheDocument()

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), GOOD_PASSPHRASE)
    await user.type(screen.getByLabelText(t('onboarding.key.passphraseConfirmLabel')), GOOD_PASSPHRASE)
    submit()

    expect(await screen.findByText(t('onboarding.key.saved'))).toBeInTheDocument()
    expect(vault.save).toHaveBeenCalledWith('gemini', GEMINI_KEY, {
      passphrase: GOOD_PASSPHRASE,
      treatAsPaid: true,
    })
  })

  it('erkennt einen sk-Schlüssel auch im Gemini-Feld und fragt dann nicht mehr nach der Abrechnung', async () => {
    const { user } = setup()

    await user.type(keyField(), OPENAI_KEY)

    expect(
      screen.queryByRole('combobox', { name: t('onboarding.key.billingLabel') }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(t('onboarding.key.passphraseLabel'))).toBeInTheDocument()
  })

  it('nennt die Mindestlänge samt Begründung, statt nur die Zahl zu fordern', async () => {
    const { vault, user } = setup()
    chooseProvider('OpenAI')
    await user.type(keyField(), OPENAI_KEY)

    const reason = screen.getByText(
      t('onboarding.key.passphraseWhyLength', { min: MIN_PASSPHRASE_LENGTH }),
    )
    expect(reason).toBeInTheDocument()
    expect(reason.textContent).toContain(String(MIN_PASSPHRASE_LENGTH))
    // Die Begründung, nicht nur die Zahl: der Angriff läuft offline.
    expect(reason.textContent).toMatch(/durchprobieren|try passwords/i)
    // Und die Grenze der eigenen Prüfung wird nicht verschwiegen.
    expect(screen.getByText(t('onboarding.key.passphraseLimits'))).toBeInTheDocument()

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), 'kurzpass')
    await user.type(screen.getByLabelText(t('onboarding.key.passphraseConfirmLabel')), 'kurzpass')
    submit()

    expect(vault.save).not.toHaveBeenCalled()
    expect(
      screen.getByText(t('onboarding.key.errors.passphraseTooShort', { min: MIN_PASSPHRASE_LENGTH })),
    ).toBeInTheDocument()
  })

  it('meldet eine abweichende Wiederholung des Passworts', async () => {
    const { vault, user } = setup()
    chooseProvider('Anthropic')
    await user.type(keyField(), 'sk-ant-BEISPIEL-kein-echter-Schluessel')
    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), GOOD_PASSPHRASE)
    await user.type(screen.getByLabelText(t('onboarding.key.passphraseConfirmLabel')), 'etwas-anderes-Langes')
    submit()

    expect(vault.save).not.toHaveBeenCalled()
    expect(screen.getByText(t('onboarding.key.errors.passphraseMismatch'))).toBeInTheDocument()
  })

  it('zeigt die Hinweise für bezahlte Schlüssel erst, wenn abgerechnet wird', async () => {
    const { user } = setup()

    expect(screen.queryByText(t('onboarding.paidHints.heading'))).not.toBeInTheDocument()

    await user.type(keyField(), OPENAI_KEY)

    expect(screen.getByText(t('onboarding.paidHints.heading'))).toBeInTheDocument()
  })

  it('verbindet Feld, Hinweis und Fehler, statt sie nur nebeneinander zu stellen', async () => {
    const { user } = setup()
    chooseProvider('OpenAI')
    await user.type(keyField(), OPENAI_KEY)
    submit()

    const passphrase = screen.getByLabelText(t('onboarding.key.passphraseLabel'))
    expect(passphrase).toHaveAttribute('type', 'password')
    expect(passphrase).toHaveAttribute('aria-invalid', 'true')

    const describedBy = passphrase.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(describedBy.length).toBe(2)
    const described = describedBy.map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain(t('onboarding.key.errors.passphraseRequired'))
  })

  it('reicht keine Fehlermeldung des Tresors durch, sondern übersetzt sie', async () => {
    const vault = makeVault({
      save: vi.fn(() => Promise.reject(new Error('Auf den Schlüsselspeicher konnte nicht zugegriffen werden.'))),
    })
    const { user } = setup({ vault })

    await user.type(keyField(), GEMINI_KEY)
    answerBilling(t('onboarding.key.billingFree'))
    submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(t('onboarding.key.errors.storage'))
    expect(alert.textContent).not.toMatch(/Schlüsselspeicher konnte nicht/)
  })

  it('bietet bei einem beschädigten Datensatz den Ausweg an, statt den Nutzer auszusperren', async () => {
    const vault = makeVault()
    const { refresh } = setup({ status: 'corrupted', vault })

    expect(screen.getByText(t('onboarding.key.corrupted.body'))).toBeInTheDocument()
    expect(screen.queryByLabelText(t('onboarding.key.apiKeyLabel'))).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: t('onboarding.key.corrupted.action') }))

    await vi.waitFor(() => {
      expect(vault.clear).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('nennt in der Anleitung beide Schlüsselformen und warnt Bestandsnutzer', async () => {
    // Neue Schlüssel aus Google AI Studio beginnen mit „AQ.", nicht mehr mit
    // „AIza". Wer Schritt 3 wörtlich befolgt, dürfte sonst glauben, er habe
    // den falschen Schlüssel erzeugt — im Standardpfad des Standardanbieters.
    for (const language of ['de', 'en'] as const) {
      const step3 = i18n.getFixedT(language)('onboarding.key.guide.gemini.step3')
      expect(step3).toContain('AQ.')
      expect(step3).toContain('AIza')
    }

    const { user } = setup()
    expect(screen.getByText(t('onboarding.key.legacyGeminiKey'))).toBeInTheDocument()
    expect(t('onboarding.key.legacyGeminiKey')).toMatch(/2026/)

    chooseProvider('OpenAI')
    expect(screen.queryByText(t('onboarding.key.legacyGeminiKey'))).not.toBeInTheDocument()
    await user.type(keyField(), OPENAI_KEY)
  })

  it('fragt erneut nach der Abrechnung, wenn ein anderer Schlüssel eingefügt wird', async () => {
    // Der gefährliche Ablauf: kostenlosen Schlüssel mit „nein" beantworten,
    // danach einen abgerechneten darüberkleben. Bliebe die Antwort stehen,
    // läge ein abgerechneter Schlüssel ohne Passwort im Speicher — der Tresor
    // kann das nicht abfangen, weil ein Google-Schlüssel für ihn unauffällig
    // ist.
    const { vault, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    answerBilling(t('onboarding.key.billingFree'))
    const billing = screen.getByRole('combobox', { name: t('onboarding.key.billingLabel') })
    expect(billing).not.toHaveAttribute('data-placeholder')

    await user.type(keyField(), '-zweiter')

    expect(billing).toHaveAttribute('data-placeholder')
    submit()
    expect(vault.save).not.toHaveBeenCalled()
    expect(screen.getByText(t('onboarding.key.errors.billingUnanswered'))).toBeInTheDocument()
  })

  it('nimmt eine Abrechnungsantwort wieder an, sobald derselbe Schlüssel wieder dasteht', async () => {
    const { vault, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    answerBilling(t('onboarding.key.billingFree'))
    await user.type(keyField(), '-zweiter')
    // Zurück auf genau denselben Schlüssel: Die Antwort galt ihm, sie gilt
    // ihm weiter.
    await user.clear(keyField())
    await user.type(keyField(), GEMINI_KEY)

    submit()
    expect(await screen.findByText(t('onboarding.key.saved'))).toBeInTheDocument()
    expect(vault.save).toHaveBeenCalledWith('gemini', GEMINI_KEY, {
      passphrase: undefined,
      treatAsPaid: false,
    })
  })

  it('fragt erneut nach der Abrechnung, wenn der Anbieter gewechselt wird', async () => {
    const { vault, user } = setup()

    await user.type(keyField(), GEMINI_KEY)
    answerBilling(t('onboarding.key.billingFree'))

    chooseProvider('OpenAI')
    chooseProvider('Google Gemini')

    expect(
      screen.getByRole('combobox', { name: t('onboarding.key.billingLabel') }),
    ).toHaveAttribute('data-placeholder')
    submit()
    expect(vault.save).not.toHaveBeenCalled()
    expect(screen.getByText(t('onboarding.key.errors.billingUnanswered'))).toBeInTheDocument()
  })

  it('sagt, dass ein vorhandener Schlüssel ersetzt wird — und sonst nichts', () => {
    for (const status of ['locked', 'unlocked'] as const) {
      const view = render(
        <KeySetup keyVault={{ vault: makeVault(), status, refresh: vi.fn() }} />,
      )
      expect(screen.getByText(t('onboarding.key.replaceHint'))).toBeInTheDocument()
      view.unmount()
    }

    setup({ status: 'empty' })
    expect(screen.queryByText(t('onboarding.key.replaceHint'))).not.toBeInTheDocument()
  })

  it('lässt nicht absenden, solange initialize() noch läuft', () => {
    // Sonst könnte das Speichern von der noch laufenden Entschlüsselung
    // überholt werden: gespeichert der neue Schlüssel, im Arbeitsspeicher
    // der alte.
    setup({ status: 'loading' })

    expect(screen.getByRole('button', { name: t('onboarding.key.submit') })).toBeDisabled()
  })

  it('behauptet beim unlesbaren Schlüssel keine Ursache, die es nicht kennen kann', () => {
    // Derselbe Fehler kommt auch von einem blockierten Speicher (privater
    // Modus, zweites Tab). Die angebotene Handlung ist zerstörend, also darf
    // der Text die Ursache nicht als Tatsache setzen.
    for (const language of ['de', 'en'] as const) {
      const body = i18n.getFixedT(language)('onboarding.key.corrupted.body')
      expect(body).toMatch(/privat|private/i)
      expect(body).toMatch(/neu ?laden|Laden Sie die Seite|Reload/i)
    }

    setup({ status: 'corrupted' })
    expect(screen.getByText(t('onboarding.key.corrupted.body'))).toBeInTheDocument()
  })

  it('hält alle Zwischenüberschriften auf einer Ebene unter der Karte', async () => {
    const { user } = setup()
    await user.type(keyField(), OPENAI_KEY)

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    // Anleitung, Passwort, Hinweise für bezahlte Schlüssel — geschwisterlich,
    // keine davon steckt in einer anderen.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0)
  })

  it('meldet die unsichere Verbindung, statt einen heilen Schlüssel zum Löschen anzubieten', () => {
    // Ohne crypto.subtle scheitert schon initialize(), der Haken meldet
    // deshalb „beschädigt". Der Grund ist aber die Adresszeile, nicht der
    // Datensatz — die Reihenfolge der beiden Zweige entscheidet darüber, ob
    // der Nutzer seinen Schlüssel wegwirft.
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => array })
    try {
      setup({ status: 'corrupted' })
      expect(screen.getByRole('alert')).toHaveTextContent(t('onboarding.key.errors.insecureOrigin'))
      expect(
        screen.queryByRole('button', { name: t('onboarding.key.corrupted.action') }),
      ).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('nimmt über eine unsichere Verbindung gar keine Eingabe entgegen', () => {
    // Auf http: stellt der Browser crypto.subtle nicht bereit; ohne das
    // ließe sich nichts verschlüsseln (siehe requireWebCrypto in crypto.ts).
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => array })
    try {
      setup()
      expect(screen.getByRole('alert')).toHaveTextContent(t('onboarding.key.errors.insecureOrigin'))
      expect(screen.queryByLabelText(t('onboarding.key.apiKeyLabel'))).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
