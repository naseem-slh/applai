import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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

/** Eingabefeld — dieselbe Gestalt wie der Auswahlauslöser (siehe Select.tsx). */
const INPUT_CLASS = [
  'focus-ring h-10 w-full rounded-md border border-[var(--color-control-border)]',
  'bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-ink)]',
  'transition-colors hover:border-[var(--color-accent)]',
  'aria-invalid:border-[var(--color-error)]',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ')

/**
 * Feldbeschriftung — und dieselbe Klasse an den Zwischenüberschriften des
 * Formulars. Sie sollen die Abschnitte gliedern, nicht rufen: eine
 * Einrichtung, die aus lauter Überschriften besteht, wirkt dringlicher als
 * sie ist.
 */
const LABEL_CLASS = 'font-medium text-[var(--color-ink)]'

const HINT_CLASS =
  'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-muted)]'

const ERROR_CLASS =
  'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-error)]'

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

interface SetupCardProps {
  headingId: string
  heading: string
  className?: string
  children: ReactNode
}

/** Die gemeinsame Hülle der drei Zustände (Formular, unsichere Herkunft,
 *  beschädigter Datensatz): eine hervorgehobene Karte mit ihrer Überschrift. */
function SetupCard({ headingId, heading, className, children }: SetupCardProps) {
  return (
    <Card asChild variant="raised" padding="lg" className={className}>
      <section aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]"
        >
          {heading}
        </h2>
        {children}
      </section>
    </Card>
  )
}

interface TextFieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  type: 'text' | 'password'
  value: string
  autoComplete: string
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
}

/** Beschriftung oben, darunter das Feld, darunter Fehler und Hinweis — mit
 *  den Verweisen, die eine Vorlesesoftware braucht. Ein Platzhalter ersetzt
 *  nie die Beschriftung. */
function TextField({ id, label, hint, error, type, value, autoComplete, inputRef, onChange }: TextFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  // Der Fehler steht vorn — beim Fokussieren soll die Vorlesesoftware
  // zuerst sagen, was zu tun ist, und danach die Regel wiederholen.
  const describedBy = [error === undefined ? null : errorId, hint === undefined ? null : hintId]
    .filter((entry): entry is string => entry !== null)
    .join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        // Der Schlüssel und sein Passwort gehören nicht in die
        // Vervollständigung des Browsers.
        autoComplete={autoComplete}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        aria-invalid={error !== undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={INPUT_CLASS}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {error !== undefined && (
        <p id={errorId} className={ERROR_CLASS}>
          {error}
        </p>
      )}
      {hint !== undefined && (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      )}
    </div>
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
  onSaved?: (provider: ProviderId) => void
  className?: string
}

export function KeySetup({ keyVault, onSaved, className }: KeySetupProps) {
  const { t } = useTranslation()
  const fieldPrefix = useId()
  const headingId = `${fieldPrefix}-heading`
  const guideHeadingId = `${fieldPrefix}-guide`
  const passphraseHeadingId = `${fieldPrefix}-passphrase-heading`
  const billingLabelId = `${fieldPrefix}-billing-label`
  const billingHintId = `${fieldPrefix}-billing-hint`
  const billingErrorId = `${fieldPrefix}-billing-error`

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
      onSaved?.(provider)
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
      <SetupCard headingId={headingId} heading={t('onboarding.key.heading')} className={cardClassName}>
        <p role="alert" className={cn('mt-3', ERROR_CLASS)}>
          {t('onboarding.key.errors.insecureOrigin')}
        </p>
      </SetupCard>
    )
  }

  if (keyVault.status === 'corrupted') {
    return (
      <SetupCard
        headingId={headingId}
        heading={t('onboarding.key.corrupted.heading')}
        className={cardClassName}
      >
        <p className="mt-3">{t('onboarding.key.corrupted.body')}</p>
        {saveError !== null && (
          <p role="alert" className={cn('mt-3', ERROR_CLASS)}>
            {t(`onboarding.key.errors.${saveError}`)}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="danger" size="lg" disabled={clearing} onClick={() => void handleClearCorrupted()}>
            {t('onboarding.key.corrupted.action')}
          </Button>
        </div>
      </SetupCard>
    )
  }

  return (
    <SetupCard headingId={headingId} heading={t('onboarding.key.heading')} className={cardClassName}>
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
        <div className="flex flex-col gap-2">
          {/* Kein <label for>: der Auslöser der Auswahlliste ist ein
              <button>, den eine Beschriftung nicht benennen würde. */}
          <span id={`${fieldPrefix}-provider-label`} className={LABEL_CLASS}>
            {t('onboarding.key.providerLabel')}
          </span>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger aria-labelledby={`${fieldPrefix}-provider-label`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PROVIDERS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <section aria-labelledby={guideHeadingId}>
          <h3 id={guideHeadingId} className={LABEL_CLASS}>
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
            className="focus-ring mt-3 inline-block rounded-sm text-[length:var(--text-body-sm-size)] text-[var(--color-accent)] underline underline-offset-2 hover:decoration-2"
          >
            {t('onboarding.key.guideLink', { provider: providerLabel })}
          </a>
          {provider === 'gemini' && (
            <p className={cn('mt-3', HINT_CLASS)}>{t('onboarding.key.legacyGeminiKey')}</p>
          )}
        </section>

        <TextField
          id={`${fieldPrefix}-api-key`}
          label={t('onboarding.key.apiKeyLabel')}
          hint={t('onboarding.key.apiKeyHint', { provider: providerLabel })}
          error={errorFor('apiKey')}
          type="password"
          value={apiKey}
          autoComplete="off"
          inputRef={apiKeyRef}
          onChange={(next) => {
            setApiKey(next)
            setSaved(false)
          }}
        />

        {showBillingQuestion && (
          <div className="flex flex-col gap-2">
            <span id={billingLabelId} className={LABEL_CLASS}>
              {t('onboarding.key.billingLabel')}
            </span>
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
            <Select
              value={billingActive === null ? '' : billingActive ? 'paid' : 'free'}
              onValueChange={(next) => {
                setBillingAnswer({ forKey: apiKey.trim(), paid: next === 'paid' })
                setSaved(false)
              }}
            >
              <SelectTrigger
                ref={billingRef}
                aria-labelledby={billingLabelId}
                aria-invalid={billingError !== undefined}
                // Fehler zuerst, wie beim Textfeld.
                aria-describedby={
                  billingError === undefined ? billingHintId : `${billingErrorId} ${billingHintId}`
                }
              >
                <SelectValue placeholder={t('onboarding.key.billingPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">{t('onboarding.key.billingFree')}</SelectItem>
                <SelectItem value="paid">{t('onboarding.key.billingPaid')}</SelectItem>
              </SelectContent>
            </Select>
            {billingError !== undefined && (
              <p id={billingErrorId} className={ERROR_CLASS}>
                {billingError}
              </p>
            )}
            <p id={billingHintId} className={HINT_CLASS}>
              {t('onboarding.key.billingHint')}
            </p>
          </div>
        )}

        {passphraseRequired && (
          <section aria-labelledby={passphraseHeadingId} className="flex flex-col gap-4">
            <div>
              <h3 id={passphraseHeadingId} className={LABEL_CLASS}>
                {t('onboarding.key.passphraseHeading')}
              </h3>
              <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
                {t('onboarding.key.passphraseWhyPaid')}
              </p>
              <p className={cn('mt-2', HINT_CLASS)}>
                {t('onboarding.key.passphraseWhyLength', { min: MIN_PASSPHRASE_LENGTH })}
              </p>
              <p className={cn('mt-2', HINT_CLASS)}>{t('onboarding.key.passphraseLimits')}</p>
            </div>

            <TextField
              id={`${fieldPrefix}-passphrase`}
              label={t('onboarding.key.passphraseLabel')}
              hint={t('onboarding.key.passphraseFieldHint', { min: MIN_PASSPHRASE_LENGTH })}
              error={errorFor('passphrase')}
              type="password"
              value={passphrase}
              autoComplete="new-password"
              inputRef={passphraseRef}
              onChange={setPassphrase}
            />
            <TextField
              id={`${fieldPrefix}-passphrase-confirm`}
              label={t('onboarding.key.passphraseConfirmLabel')}
              hint={t('onboarding.key.passphraseNoReset')}
              error={errorFor('passphraseConfirm')}
              type="password"
              value={passphraseConfirm}
              autoComplete="new-password"
              inputRef={passphraseConfirmRef}
              onChange={setPassphraseConfirm}
            />
          </section>
        )}

        {/* Neben dem Passwortabschnitt, nicht darin: die Hinweise gehören
            zum bezahlten Schlüssel, nicht zum Passwort — und so bleiben
            alle drei Zwischenüberschriften auf derselben Ebene. */}
        {passphraseRequired && <PaidKeyHints provider={provider} />}

        {saveError !== null && (
          <p role="alert" className={ERROR_CLASS}>
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
    </SetupCard>
  )
}
