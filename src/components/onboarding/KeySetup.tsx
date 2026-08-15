import { useId, useRef, useState, type ComponentProps, type FormEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, FIELD_ERROR_CLASS, FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { SectionCard } from '@/components/ui/SectionCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
import { PROVIDERS } from '@/lib/ai/provider'
import { MIN_PASSPHRASE_LENGTH, PROVIDER_IDS, isProviderId, type ProviderId } from '@/lib/storage/keyVault'
import { cn } from '@/lib/utils'
import { PaidKeyHints } from './PaidKeyHints'
import type { KeyVaultHandle } from './useKeyVault'
import { PROVIDER_LINKS } from './providerLinks'
import {
  needsBillingQuestion,
  requiresPassphrase,
  validateKeyForm,
  type KeyFormField,
  type KeyFormValues,
} from './validateKeyForm'

/**
 * Die Schlüsseleinrichtung: Anbieter wählen, Anleitung lesen, Schlüssel
 * einfügen — und, sobald abgerechnet wird, ein Passwort vergeben.
 *
 * Drei Dinge, die hier nicht offensichtlich sind:
 *
 * - **`PROVIDERS` wird nur für den Namen gelesen.** Die Oberfläche ruft
 *   keinen Anbieter auf (Architekturgrenze in `CLAUDE.md`); sie braucht die
 *   Beschriftung und sonst nichts.
 * - **Kein durchgereichter `error.message`.** Der Tresor wirft feste
 *   deutsche Zeichenketten. Sichtbar wird ausschließlich Übersetztes (G8):
 *   die erwartbaren Fälle über `validateKeyForm`, alles Übrige als eine
 *   allgemeine Meldung.
 * - **Kein „Passwort anzeigen".** Der Schlüssel wird eingefügt, nicht
 *   getippt, und diese Anwendung rechnet ausdrücklich mit einem geteilten
 *   Rechner. Stattdessen wird das Passwort zweimal eingegeben — es lässt
 *   sich nicht zurücksetzen, ein Tippfehler kostet sonst die Einrichtung.
 */

const GUIDE_STEPS = ['step1', 'step2', 'step3', 'step4'] as const

/**
 * Auf einer unsicheren Herkunft (`http:` außerhalb von `localhost`) stellt
 * der Browser `crypto.subtle` überhaupt nicht bereit. Dann lässt sich kein
 * Schlüssel verschlüsseln, und das Formular auszufüllen wäre vergebliche
 * Mühe — siehe `requireWebCrypto()` in `crypto.ts`.
 */
function webCryptoMissing(): boolean {
  return globalThis.crypto?.subtle === undefined
}

interface SecretInputProps extends Omit<ComponentProps<typeof Input>, 'ref' | 'type'> {
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Ein Feld für den Schlüssel und für das Passwort. Immer `type="password"`
 * — es gibt bewusst kein „Passwort anzeigen" (siehe Kopfkommentar) — und
 * ohne jede Hilfe des Browsers: Ein API-Schlüssel gehört nicht in die
 * Vervollständigung, in die Rechtschreibprüfung oder in die
 * Großschreibkorrektur eines Mobilgeräts.
 */
function SecretInput({ inputRef, ...props }: SecretInputProps) {
  return (
    <Input
      ref={inputRef}
      type="password"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="none"
      {...props}
    />
  )
}

export interface KeySetupProps {
  /** Ergebnis von `useKeyVault()`. Erzeugt und zerstört wird der Tresor dort. */
  keyVault: KeyVaultHandle
  /**
   * Nach erfolgreichem Speichern. Der Tresor merkt sich den Anbieter selbst
   * (`getProvider()`); wer ihn zusätzlich in den Einstellungen führen will
   * (`Settings.provider`, Aufgabe 13c), tut das hier.
   */
  /**
   * Gemeldet wird auch, ob der Schlüssel abgerechnet wird. Die Antwort gab
   * der Nutzer ohnehin; sie noch einmal zu erfragen wäre eine Zumutung, und
   * die Modellauswahl braucht sie (siehe `Settings.paidKey`).
   */
  onSaved?: (provider: ProviderId, options: { paid: boolean }) => void
  className?: string
}

export function KeySetup({ keyVault, onSaved, className }: KeySetupProps) {
  const { t } = useTranslation()
  const fieldPrefix = useId()
  const headingId = `${fieldPrefix}-heading`
  const guideHeadingId = `${fieldPrefix}-guide`
  const passphraseHeadingId = `${fieldPrefix}-passphrase-heading`

  const [provider, setProvider] = useState<ProviderId>('gemini')
  const [apiKey, setApiKey] = useState('')
  // Die Abrechnungsantwort wird zusammen mit dem Schlüssel festgehalten, für
  // den sie gegeben wurde. Sie gilt für genau diesen Schlüssel: Wer einen
  // kostenlosen Schlüssel mit „nein" beantwortet und danach einen
  // abgerechneten darüberklebt, muss erneut gefragt werden — sonst läge ein
  // abgerechneter Schlüssel ohne Passwort im Speicher, und der Tresor kann
  // das nicht abfangen, weil ein Google-Schlüssel für ihn unauffällig ist.
  // Abgeleitet statt zurückgesetzt, damit kein Änderungsweg das Zurücksetzen
  // vergessen kann.
  const [billingAnswer, setBillingAnswer] = useState<{ forKey: string; paid: boolean } | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<'storage' | 'insecureOrigin' | null>(null)
  const [clearing, setClearing] = useState(false)

  const apiKeyRef = useRef<HTMLInputElement | null>(null)
  const billingRef = useRef<HTMLButtonElement | null>(null)
  const passphraseRef = useRef<HTMLInputElement | null>(null)
  const passphraseConfirmRef = useRef<HTMLInputElement | null>(null)

  const billingActive =
    billingAnswer !== null && billingAnswer.forKey === apiKey.trim() ? billingAnswer.paid : null
  const values: KeyFormValues = { provider, apiKey, billingActive, passphrase, passphraseConfirm }
  const providerLabel = PROVIDERS[provider].label
  const showBillingQuestion = needsBillingQuestion(provider, apiKey)
  const passphraseRequired = requiresPassphrase(values)
  // Fehler erscheinen erst nach dem ersten Absendeversuch. Wer tippt, soll
  // nicht bei jedem Zeichen angemeckert werden.
  const issues = submitted ? validateKeyForm(values) : []
  const errorFor = (field: KeyFormField): string | undefined => {
    const issue = issues.find((entry) => entry.field === field)
    return issue === undefined ? undefined : t(`onboarding.key.errors.${issue.messageKey}`, issue.values)
  }
  const billingError = errorFor('billing')

  function handleProviderChange(next: string): void {
    if (!isProviderId(next)) return
    setProvider(next)
    // Die Abrechnungsantwort gilt für genau einen Schlüssel bei genau einem
    // Anbieter; nach dem Wechsel wäre sie geraten.
    setBillingAnswer(null)
    setSubmitted(false)
    setSaved(false)
    setSaveError(null)
  }

  function focusField(field: KeyFormField): void {
    const target: RefObject<HTMLElement | null> = {
      apiKey: apiKeyRef,
      billing: billingRef,
      passphrase: passphraseRef,
      passphraseConfirm: passphraseConfirmRef,
    }[field]
    target.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmitted(true)
    setSaved(false)
    setSaveError(null)

    const found = validateKeyForm(values)
    if (found.length > 0) {
      focusField(found[0].field)
      return
    }

    const vault = keyVault.vault
    if (vault === null) return

    setSaving(true)
    try {
      await vault.save(provider, apiKey.trim(), {
        passphrase: passphraseRequired ? passphrase : undefined,
        treatAsPaid: billingActive === true,
      })
      // Das Passwort hat seinen Zweck erfüllt; es weiter im Zustand der
      // Komponente zu halten, brächte nichts ein.
      setPassphrase('')
      setPassphraseConfirm('')
      setSubmitted(false)
      setSaved(true)
      keyVault.refresh()
      onSaved?.(provider, { paid: billingActive === true })
    } catch {
      // Nie `error.message` (G8) — und die unsichere Herkunft wird an der
      // Ursache erkannt, nicht am Text der Ausnahme.
      setSaveError(webCryptoMissing() ? 'insecureOrigin' : 'storage')
    } finally {
      setSaving(false)
    }
  }

  async function handleClearCorrupted(): Promise<void> {
    const vault = keyVault.vault
    if (vault === null) return
    setClearing(true)
    try {
      await vault.clear()
      keyVault.refresh()
    } catch {
      setSaveError('storage')
    } finally {
      setClearing(false)
    }
  }

  const cardClassName = cn('max-w-2xl', className)

  // Vor der Prüfung auf einen beschädigten Datensatz: Fehlt crypto.subtle,
  // scheitert schon `initialize()` und der Haken meldete „beschädigt" —
  // der Nutzer bekäme dann angeboten, seinen völlig heilen Schlüssel zu
  // löschen, obwohl nur die Adresszeile http statt https sagt.
  if (webCryptoMissing()) {
    return (
      <SectionCard headingId={headingId} heading={t('onboarding.key.heading')} className={cardClassName}>
        <p role="alert" className={cn('mt-3', FIELD_ERROR_CLASS)}>
          {t('onboarding.key.errors.insecureOrigin')}
        </p>
      </SectionCard>
    )
  }

  if (keyVault.status === 'corrupted') {
    return (
      <SectionCard
        headingId={headingId}
        heading={t('onboarding.key.corrupted.heading')}
        className={cardClassName}
      >
        <p className="mt-3">{t('onboarding.key.corrupted.body')}</p>
        {saveError !== null && (
          <p role="alert" className={cn('mt-3', FIELD_ERROR_CLASS)}>
            {t(`onboarding.key.errors.${saveError}`)}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="danger" size="lg" disabled={clearing} onClick={() => void handleClearCorrupted()}>
            {t('onboarding.key.corrupted.action')}
          </Button>
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard headingId={headingId} heading={t('onboarding.key.heading')} className={cardClassName}>
      <p className="mt-3">{t('onboarding.key.intro')}</p>

      {/* Es liegt schon ein Schlüssel da (entsperrt oder passwortgeschützt).
          Speichern ersetzt ihn — und bei OpenAI und Anthropic ist ein
          Schlüssel nach dem Anlegen nie wieder einsehbar. Das gehört gesagt,
          bevor jemand darüberschreibt. */}
      {(keyVault.status === 'locked' || keyVault.status === 'unlocked') && (
        <Card variant="subtle" padding="md" className="mt-4 text-[var(--color-ink)]">
          <p className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
            {t('onboarding.key.replaceHint')}
          </p>
        </Card>
      )}

      <form noValidate className="mt-6 flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        {/* `labelledBy`: der Auslöser der Auswahlliste ist ein <button>,
            den ein <label for> nicht benennen würde. */}
        <Field id={`${fieldPrefix}-provider`} label={t('onboarding.key.providerLabel')} labelledBy>
          {({ id, ...aria }) => (
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_IDS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {PROVIDERS[entry].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <section aria-labelledby={guideHeadingId}>
          <h3 id={guideHeadingId} className={FIELD_LABEL_CLASS}>
            {t('onboarding.key.guideHeading', { provider: providerLabel })}
          </h3>
          <ol className="mt-2 list-decimal space-y-2 pl-6 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
            {GUIDE_STEPS.map((step) => (
              <li key={step}>{t(`onboarding.key.guide.${provider}.${step}`)}</li>
            ))}
          </ol>
          <a
            href={PROVIDER_LINKS[provider].keys}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring mt-3 inline-block rounded-sm text-[length:var(--text-body-sm-size)] text-[var(--accent-text)] underline underline-offset-2 hover:decoration-2"
          >
            {t('onboarding.key.guideLink', { provider: providerLabel })}
          </a>
          {provider === 'gemini' && (
            <p className={cn('mt-3', FIELD_HINT_CLASS)}>{t('onboarding.key.legacyGeminiKey')}</p>
          )}
        </section>

        <Field
          id={`${fieldPrefix}-api-key`}
          label={t('onboarding.key.apiKeyLabel')}
          hint={t('onboarding.key.apiKeyHint', { provider: providerLabel })}
          error={errorFor('apiKey')}
        >
          {(control) => (
            <SecretInput
              {...control}
              value={apiKey}
              autoComplete="off"
              inputRef={apiKeyRef}
              onChange={(event) => {
                setApiKey(event.target.value)
                setSaved(false)
              }}
            />
          )}
        </Field>

        {showBillingQuestion && (
          <Field
            id={`${fieldPrefix}-billing`}
            label={t('onboarding.key.billingLabel')}
            hint={t('onboarding.key.billingHint')}
            error={billingError}
            labelledBy
          >
            {/* Ohne Vorauswahl, und deshalb eine Auswahlliste statt eines
                Schalters: Ein Schalter stünde von Anfang an auf „nein",
                und diese Vermutung würde einen abgerechneten Schlüssel
                ohne Passwort ablegen. Der Platzhalter zwingt zur Antwort. */}
            {/* Vollständig gesteuert: Radix zeigt den Platzhalter bei einer
                leeren Zeichenkette genauso wie bei `undefined`. Damit fällt
                die Anzeige von selbst auf „Bitte wählen" zurück, sobald die
                Antwort nicht mehr zum eingegebenen Schlüssel gehört — ohne
                die Auswahlliste neu einzuhängen und ihr dabei den Fokus zu
                nehmen. */}
            {({ id, ...aria }) => (
              <Select
                value={billingActive === null ? '' : billingActive ? 'paid' : 'free'}
                onValueChange={(next) => {
                  setBillingAnswer({ forKey: apiKey.trim(), paid: next === 'paid' })
                  setSaved(false)
                }}
              >
                <SelectTrigger id={id} ref={billingRef} {...aria}>
                  <SelectValue placeholder={t('onboarding.key.billingPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">{t('onboarding.key.billingFree')}</SelectItem>
                  <SelectItem value="paid">{t('onboarding.key.billingPaid')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
        )}

        {passphraseRequired && (
          <section aria-labelledby={passphraseHeadingId} className="flex flex-col gap-4">
            <div>
              <h3 id={passphraseHeadingId} className={FIELD_LABEL_CLASS}>
                {t('onboarding.key.passphraseHeading')}
              </h3>
              <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
                {t('onboarding.key.passphraseWhyPaid')}
              </p>
              <p className={cn('mt-2', FIELD_HINT_CLASS)}>
                {t('onboarding.key.passphraseWhyLength', { min: MIN_PASSPHRASE_LENGTH })}
              </p>
              <p className={cn('mt-2', FIELD_HINT_CLASS)}>{t('onboarding.key.passphraseLimits')}</p>
            </div>

            <Field
              id={`${fieldPrefix}-passphrase`}
              label={t('onboarding.key.passphraseLabel')}
              hint={t('onboarding.key.passphraseFieldHint', { min: MIN_PASSPHRASE_LENGTH })}
              error={errorFor('passphrase')}
            >
              {(control) => (
                <SecretInput
                  {...control}
                  value={passphrase}
                  autoComplete="new-password"
                  inputRef={passphraseRef}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              )}
            </Field>
            <Field
              id={`${fieldPrefix}-passphrase-confirm`}
              label={t('onboarding.key.passphraseConfirmLabel')}
              hint={t('onboarding.key.passphraseNoReset')}
              error={errorFor('passphraseConfirm')}
            >
              {(control) => (
                <SecretInput
                  {...control}
                  value={passphraseConfirm}
                  autoComplete="new-password"
                  inputRef={passphraseConfirmRef}
                  onChange={(event) => setPassphraseConfirm(event.target.value)}
                />
              )}
            </Field>
          </section>
        )}

        {/* Neben dem Passwortabschnitt, nicht darin: die Hinweise gehören
            zum bezahlten Schlüssel, nicht zum Passwort — und so bleiben
            alle drei Zwischenüberschriften auf derselben Ebene. */}
        {passphraseRequired && <PaidKeyHints provider={provider} />}

        {saveError !== null && (
          <p role="alert" className={FIELD_ERROR_CLASS}>
            {t(`onboarding.key.errors.${saveError}`)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-[length:var(--text-body-sm-size)] text-[var(--color-success)]">
            {t('onboarding.key.saved')}
          </p>
        )}

        <div className="flex justify-end">
          {/* Auch bei `loading` gesperrt: Der Tresor ist dann zwar schon da,
              aber `initialize()` läuft noch. Ein Speichern in diesem Fenster
              könnte von der noch laufenden Entschlüsselung überholt werden —
              gespeichert wäre der neue Schlüssel, im Arbeitsspeicher der
              alte. */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={saving || keyVault.vault === null || keyVault.status === 'loading'}
          >
            {saving ? t('onboarding.key.submitting') : t('onboarding.key.submit')}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
