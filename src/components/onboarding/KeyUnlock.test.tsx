import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import type { KeyVault, ProviderId } from '@/lib/storage/keyVault'
import { KeyUnlock } from './KeyUnlock'
import type { KeyVaultHandle } from './useKeyVault'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const PASSPHRASE = 'vier-zufaellige-Woerter'

function makeVault(overrides: Partial<KeyVault> = {}): KeyVault {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
    isLocked: vi.fn(() => Promise.resolve(true)),
    unlock: vi.fn(() => Promise.resolve()),
    lock: vi.fn(),
    getKey: vi.fn(() => null),
    getProvider: vi.fn((): ProviderId => 'gemini'),
    clear: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    ...overrides,
  }
}

function setup(options: { vault?: KeyVault | null } = {}) {
  const vault = options.vault === undefined ? makeVault() : options.vault
  const refresh = vi.fn()
  const handle: KeyVaultHandle = { vault, status: 'locked', refresh }
  const view = render(<KeyUnlock keyVault={handle} />)
  return { ...view, vault, refresh, user: userEvent.setup() }
}

function submit(): HTMLElement {
  return screen.getByRole('button', { name: t('onboarding.unlock.submit') })
}

describe('KeyUnlock', () => {
  it('entsperrt mit dem eingegebenen Passwort und liest den Zustand neu', async () => {
    const { user, vault, refresh } = setup()

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), PASSPHRASE)
    await user.click(submit())

    expect(vault?.unlock).toHaveBeenCalledWith(PASSPHRASE)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('lässt ohne Eingabe nicht absenden', () => {
    setup()

    expect(submit()).toBeDisabled()
  })

  it('meldet ein falsches Passwort, ohne die Ausnahme des Tresors durchzureichen', async () => {
    const vault = makeVault({
      unlock: vi.fn(() => Promise.reject(new Error('Passwort falsch oder Datensatz beschädigt.'))),
    })
    const { user } = setup({ vault })

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), 'falsches-Passwort')
    await user.click(submit())

    const field = await screen.findByLabelText(t('onboarding.key.passphraseLabel'))
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(t('onboarding.unlock.wrong'))).toBeInTheDocument()
    expect(screen.queryByText(/Datensatz beschädigt/)).toBeNull()
  })

  it('nimmt die Meldung zurück, sobald weitergetippt wird', async () => {
    const vault = makeVault({ unlock: vi.fn(() => Promise.reject(new Error('nein'))) })
    const { user } = setup({ vault })

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), 'falsch')
    await user.click(submit())
    expect(await screen.findByText(t('onboarding.unlock.wrong'))).toBeInTheDocument()

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), 'er')

    expect(screen.queryByText(t('onboarding.unlock.wrong'))).toBeNull()
  })

  it('behält das Passwort nicht im Zustand, nachdem es seinen Zweck erfüllt hat', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), PASSPHRASE)
    await user.click(submit())

    expect(await screen.findByLabelText(t('onboarding.key.passphraseLabel'))).toHaveValue('')
  })

  it('bietet keinen Weg an, den Schlüssel hier zu ersetzen', () => {
    // OpenAI und Anthropic zeigen einen Schlüssel genau einmal an; ein
    // versehentliches Überschreiben wäre unwiederbringlich. Der Weg dahin
    // steht in den Einstellungen und wird im Hinweistext benannt.
    setup()

    expect(screen.queryByRole('button', { name: t('onboarding.key.submit') })).toBeNull()
    expect(screen.getByText(t('onboarding.unlock.forgotten'))).toBeInTheDocument()
  })

  it('lässt nicht absenden, solange der Tresor noch nicht dasteht', async () => {
    const { user } = setup({ vault: null })

    await user.type(screen.getByLabelText(t('onboarding.key.passphraseLabel')), PASSPHRASE)

    expect(submit()).toBeDisabled()
    expect(screen.getByText(t('onboarding.key.errors.storage'))).toBeInTheDocument()
  })
})
