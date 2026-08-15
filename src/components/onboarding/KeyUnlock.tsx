import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field, FIELD_ERROR_CLASS } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { SectionCard } from '@/components/ui/SectionCard'
import { cn } from '@/lib/utils'
import type { KeyVaultHandle } from './useKeyVault'

/**
 * Der Weg zurück in einen passwortgeschützten Tresor.
 *
 * 13b hat den Zustand `locked` gemeldet, aber niemand fragte das Passwort
 * ab („Kein Entsperr-Weg … gehört zu 13c oder 14"). Er gehört hierher: Die
 * Einstiegsseite ist die Stelle, an der ein Nutzer nach dem Neuladen landet,
 * und ohne entsperrten Tresor kann die Arbeitsfläche nichts.
 *
 * Bewusst **kein** Angebot, den Schlüssel hier zu ersetzen. Das steht in
 * den Einstellungen, und der Unterschied ist wichtig: OpenAI und Anthropic
 * zeigen einen Schlüssel genau einmal an. Wer sein Passwort vergessen hat,
 * soll das an einer Stelle lesen, die es ausspricht, statt versehentlich
 * einen unwiederbringlichen Schlüssel zu überschreiben.
 *
 * Es gibt keinen Fehlversuchszähler und keine Verzögerung. Beides wäre
 * Theater: Der Angriff auf dieses Passwort läuft offline auf einer Kopie
 * der Datenbank, nicht über dieses Formular (siehe `MIN_PASSPHRASE_LENGTH`
 * in `keyVault.ts`).
 */
export interface KeyUnlockProps {
  keyVault: KeyVaultHandle
  className?: string
}

export function KeyUnlock({ keyVault, className }: KeyUnlockProps) {
  const { t } = useTranslation()
  const fieldPrefix = useId()
  const [passphrase, setPassphrase] = useState('')
  const [failed, setFailed] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const vault = keyVault.vault
    if (vault === null || passphrase === '') return

    setUnlocking(true)
    setFailed(false)
    try {
      await vault.unlock(passphrase)
      // Das Passwort hat seinen Zweck erfüllt.
      setPassphrase('')
      keyVault.refresh()
    } catch {
      // Nie `error.message` (G8) — und ohnehin gibt es genau eine
      // brauchbare Auskunft: Es hat nicht gepasst.
      setFailed(true)
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <SectionCard
      headingId={`${fieldPrefix}-heading`}
      heading={t('onboarding.unlock.heading')}
      className={cn('max-w-2xl', className)}
    >
      <p className="mt-3">{t('onboarding.unlock.intro')}</p>

      <form noValidate className="mt-6 flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field
          id={`${fieldPrefix}-passphrase`}
          label={t('onboarding.key.passphraseLabel')}
          hint={t('onboarding.unlock.forgotten')}
          error={failed ? t('onboarding.unlock.wrong') : undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              value={passphrase}
              autoComplete="current-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              onChange={(event) => {
                setPassphrase(event.target.value)
                setFailed(false)
              }}
            />
          )}
        </Field>

        {keyVault.vault === null && (
          <p className={FIELD_ERROR_CLASS}>{t('onboarding.key.errors.storage')}</p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={unlocking || passphrase === '' || keyVault.vault === null}
          >
            {unlocking ? t('onboarding.unlock.submitting') : t('onboarding.unlock.submit')}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
