import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '@/components/app/appContext'
import { KeySetup } from '@/components/onboarding/KeySetup'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Field, FIELD_ERROR_CLASS, FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { SectionCard } from '@/components/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { ModelPicker } from '@/components/settings/ModelPicker'
import { PROVIDERS, providerFor } from '@/lib/ai/provider'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n/i18n'
import type { Settings as StoredSettings, TruthMode } from '@/lib/storage/adapter'
import { cn } from '@/lib/utils'

/**
 * Die Einstellungen: alles, was die Anwendung dauerhaft merkt, an einer
 * Stelle — und der einzige Ort, an dem sie sich vollständig wieder
 * entfernen lässt.
 *
 * Zwei Dinge, die hier nicht offensichtlich sind:
 *
 * - **Der Anbieter steht beim Schlüssel, nicht als eigene Einstellung.**
 *   Er gehört zum Schlüssel: Ein Gemini-Schlüssel spricht nicht mit OpenAI.
 *   Maßgeblich ist deshalb der Anbieter im Tresor (`getProvider()`);
 *   `Settings.provider` führt ihn nur mit, damit er in der Sicherungsdatei
 *   steht. Gepflegt wird er über `KeySetup.onSaved` — genau der Anschluss,
 *   den 13b dafür vorgesehen hat. Eine zweite Auswahlliste daneben wäre
 *   eine zweite Quelle der Wahrheit.
 * - **„Alle Daten löschen" rührt zwei Datenbanken an.** Der Speicher und
 *   der Schlüsseltresor sind getrennt (siehe `clearAll` in `adapter.ts`).
 *   Beide werden unabhängig voneinander versucht und beide Ergebnisse
 *   werden gemeldet — ein „erledigt", das nur für die Hälfte gilt, wäre
 *   hier die schlimmste Sorte Fehler. Der Knopf ist zugleich der einzige
 *   Ausweg für jemanden, dessen Tresor beschädigt ist, und muss deshalb
 *   auch dann arbeiten, wenn eine der beiden Seiten nicht antwortet.
 */

const THEMES = ['light', 'dark', 'system'] as const
const TRUTH_MODES: readonly TruthMode[] = ['strict', 'bridge', 'free']

/** Ergebnis von „Alle Daten löschen" — beide Hälften einzeln. */
interface DeleteOutcome {
  storage: boolean
  vault: boolean
}

export default function SettingsRoute() {
  const { t } = useTranslation()
  const { storage, keyVault, settings, updateSettings, reloadSettings, storageUnavailable } = useApp()
  const prefix = useId()

  const [saveFailed, setSaveFailed] = useState(false)
  const [backupError, setBackupError] = useState<'export' | 'import' | null>(null)
  const [backupDone, setBackupDone] = useState<'export' | 'import' | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOutcome, setDeleteOutcome] = useState<DeleteOutcome | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)

  async function change(patch: Partial<StoredSettings>): Promise<void> {
    setSaveFailed(false)
    try {
      await updateSettings(patch)
    } catch {
      // Nie `error.message` (G8). Der sichtbare Stand ist bereits
      // zurückgedreht (siehe AppProvider); hier bleibt zu sagen, dass
      // nichts gespeichert wurde.
      setSaveFailed(true)
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true)
    setBackupError(null)
    setBackupDone(null)
    try {
      const blob = await storage.exportAll()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      // Sprechender Name mit Datum, damit mehrere Sicherungen
      // unterscheidbar bleiben.
      anchor.download = `applai-sicherung-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      // Freigeben ja, aber erst im nächsten Durchlauf der Ereignisschleife.
      // Der Download beginnt asynchron; wird die Objekt-URL noch in derselben
      // Aufgabe freigegeben, brechen ihn mehrere Browser stillschweigend ab.
      // Ohne Freigabe wiederum hielte sie den Blob bis zum Verlassen der
      // Seite im Speicher.
      setTimeout(() => URL.revokeObjectURL(url), 0)
      // „Erstellt", nicht „heruntergeladen": Ob der Browser die Datei
      // wirklich abgelegt hat, erfährt diese Seite nicht — ein `<a download>`
      // meldet weder Erfolg noch Abbruch zurück.
      setBackupDone('export')
    } catch {
      setBackupError('export')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file: File): Promise<void> {
    setBusy(true)
    setBackupError(null)
    setBackupDone(null)
    try {
      await storage.importAll(file)
      // `importAll` ersetzt auch die Einstellungen — ohne dieses Nachlesen
      // zeigte die Oberfläche den Stand von vor dem Import.
      await reloadSettings()
      keyVault.refresh()
      setBackupDone('import')
    } catch {
      // `importAll` wirft erklärende deutsche Zeichenketten (beschädigt,
      // unbekannte Version). Sie sind nicht übersetzt und dürfen deshalb
      // nicht in die Oberfläche (G8) — sichtbar wird eine Meldung, die
      // beide Fälle abdeckt.
      setBackupError('import')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteEverything(): Promise<void> {
    setBusy(true)
    setConfirmOpen(false)
    const vault = keyVault.vault
    // `allSettled` statt `all`: Scheitert eine Hälfte, soll die andere
    // trotzdem gelöscht werden — und der Nutzer erfahren, welche geblieben
    // ist.
    const [storageResult, vaultResult] = await Promise.allSettled([
      storage.clearAll(),
      vault === null
        ? Promise.reject(new Error('Der Schlüsseltresor steht nicht zur Verfügung.'))
        : vault.clear(),
    ])
    setDeleteOutcome({
      storage: storageResult.status === 'fulfilled',
      vault: vaultResult.status === 'fulfilled',
    })
    await reloadSettings()
    keyVault.refresh()
    setBusy(false)
  }

  const providerFromVault = keyVault.vault?.getProvider() ?? null
  const deleteComplete = deleteOutcome !== null && deleteOutcome.storage && deleteOutcome.vault

  return (
    <div className="w-full px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Seitentitel in Überschrift-, nicht in Display-Größe: Die
            Kopfzeile ist mit 58px bewusst niedrig, und ein Titel von 44px
            darunter kippt das Verhältnis. Display bleibt dem einen Fall
            vorbehalten, in dem eine Seite nur aus einer Aussage besteht. */}
        <h1 className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]">
          {t('routes.settings.heading')}
        </h1>

        {(storageUnavailable || saveFailed) && (
          <Card variant="subtle" padding="md" className="text-[var(--color-ink)]">
            <p role="alert" className="text-[length:var(--text-body-sm-size)]">
              {storageUnavailable ? t('settings.storageUnavailable') : t('settings.saveFailed')}
            </p>
          </Card>
        )}

        <SectionCard
          headingId={`${prefix}-appearance`}
          heading={t('settings.appearance.heading')}
          variant="default"
        >
          <p className={cn('mt-3', FIELD_HINT_CLASS)}>{t('settings.appearance.hint')}</p>
          <Field
            id={`${prefix}-theme`}
            label={t('settings.appearance.label')}
            labelledBy
            className="mt-4 max-w-sm"
          >
            {({ id, ...aria }) => (
              <Select
                value={settings.theme}
                onValueChange={(next) => void change({ theme: next as StoredSettings['theme'] })}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((theme) => (
                    <SelectItem key={theme} value={theme}>
                      {t(`settings.appearance.options.${theme}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </SectionCard>

        <SectionCard
          headingId={`${prefix}-language`}
          heading={t('settings.language.heading')}
          variant="default"
        >
          <p className={cn('mt-3', FIELD_HINT_CLASS)}>{t('settings.language.hint')}</p>
          <Field
            id={`${prefix}-language-select`}
            label={t('settings.language.label')}
            labelledBy
            className="mt-4 max-w-sm"
          >
            {({ id, ...aria }) => (
              <Select
                value={settings.uiLanguage}
                onValueChange={(next) => void change({ uiLanguage: next as StoredSettings['uiLanguage'] })}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {t(`settings.language.options.${language}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </SectionCard>

        <SectionCard
          headingId={`${prefix}-privacy`}
          heading={t('settings.anonymize.heading')}
          variant="default"
        >
          <div className="mt-3 flex items-start justify-between gap-6">
            <div className="max-w-[65ch]">
              <span id={`${prefix}-anonymize-label`} className={FIELD_LABEL_CLASS}>
                {t('settings.anonymize.label')}
              </span>
              <p id={`${prefix}-anonymize-hint`} className={cn('mt-2', FIELD_HINT_CLASS)}>
                {t('settings.anonymize.hint')}
              </p>
            </div>
            <Switch
              checked={settings.anonymize}
              aria-labelledby={`${prefix}-anonymize-label`}
              aria-describedby={`${prefix}-anonymize-hint`}
              onCheckedChange={(checked) => void change({ anonymize: checked })}
            />
          </div>
          {/* Kein `role="alert"`: Das ist die Beschreibung eines Zustands,
              der bestehen bleibt — der Schalter selbst sagt an, dass er aus
              ist. */}
          {!settings.anonymize && (
            <p className={cn('mt-4', FIELD_ERROR_CLASS)}>{t('settings.anonymize.off')}</p>
          )}
        </SectionCard>

        <SectionCard
          headingId={`${prefix}-truth`}
          heading={t('settings.truthMode.heading')}
          variant="default"
        >
          <p className={cn('mt-3 max-w-[65ch]', FIELD_HINT_CLASS)}>{t('settings.truthMode.hint')}</p>
          <Field
            id={`${prefix}-truth-select`}
            label={t('settings.truthMode.label')}
            labelledBy
            className="mt-4 max-w-sm"
          >
            {({ id, ...aria }) => (
              <Select
                value={settings.truthMode}
                onValueChange={(next) => void change({ truthMode: next as TruthMode })}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRUTH_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`settings.truthMode.options.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <p className="mt-4 max-w-[65ch] text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
            {t(`settings.truthMode.explanations.${settings.truthMode}`)}
          </p>
        </SectionCard>

        <section aria-labelledby={`${prefix}-key`} className="flex flex-col gap-3">
          <h2
            id={`${prefix}-key`}
            className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]"
          >
            {t('settings.key.heading')}
          </h2>
          <p className={FIELD_HINT_CLASS}>
            {providerFromVault === null
              ? t('settings.key.noProvider')
              : t('settings.key.currentProvider', { provider: PROVIDERS[providerFromVault].label })}
          </p>
          {/* `onSaved` zieht den Anbieter in die Einstellungen nach, damit die
              Sicherungsdatei ihn trägt. Die Überschrift der Karte kommt aus
              `KeySetup` selbst — sie ist hier eine `h2` neben der obigen und
              keine eigene Ebene. */}
          <KeySetup
            keyVault={keyVault}
            className="max-w-none"
            onSaved={(provider, { paid }) => void change({ provider, paidKey: paid })}
          />
        </section>

        {providerFromVault !== null && (
          <SectionCard
            headingId={`${prefix}-model`}
            heading={t('settings.model.heading')}
            variant="default"
          >
            <ModelPicker
              fieldId={`${prefix}-model-field`}
              provider={providerFor(providerFromVault, settings.models?.[providerFromVault])}
              apiKey={keyVault.vault?.getKey() ?? null}
              paidKey={settings.paidKey === true}
              value={settings.models?.[providerFromVault]}
              onChange={(model) =>
                void change({ models: { ...settings.models, [providerFromVault]: model } })
              }
            />
          </SectionCard>
        )}

        <SectionCard
          headingId={`${prefix}-backup`}
          heading={t('settings.backup.heading')}
          variant="default"
        >
          <p className={cn('mt-3 max-w-[65ch]', FIELD_HINT_CLASS)}>{t('settings.backup.hint')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => void handleExport()}>
              {t('settings.backup.export')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => importRef.current?.click()}>
              {t('settings.backup.import')}
            </Button>
            {/* `hidden` nimmt das Feld aus dem Baum — bedient wird über den
                Knopf daneben, damit der Weg über die Tastatur derselbe ist
                wie der mit der Maus. */}
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.item(0) ?? null
                if (file !== null) void handleImport(file)
                event.target.value = ''
              }}
            />
          </div>
          <p className={cn('mt-3', FIELD_ERROR_CLASS)}>{t('settings.backup.importWarning')}</p>
          {backupError !== null && (
            <p role="alert" className={cn('mt-3', FIELD_ERROR_CLASS)}>
              {t(`settings.backup.errors.${backupError}`)}
            </p>
          )}
          {backupDone !== null && (
            <p
              role="status"
              className="mt-3 text-[length:var(--text-body-sm-size)] text-[var(--color-success)]"
            >
              {t(`settings.backup.done.${backupDone}`)}
            </p>
          )}
        </SectionCard>

        <SectionCard
          headingId={`${prefix}-delete`}
          heading={t('settings.delete.heading')}
          variant="default"
        >
          <p className="mt-3 max-w-[65ch] text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
            {t('settings.delete.body')}
          </p>

          {deleteOutcome !== null && (
            <p
              role={deleteComplete ? 'status' : 'alert'}
              className={cn(
                'mt-4 text-[length:var(--text-body-sm-size)]',
                deleteComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]',
              )}
            >
              {deleteComplete
                ? t('settings.delete.done')
                : deleteOutcome.storage
                  ? t('settings.delete.vaultFailed')
                  : deleteOutcome.vault
                    ? t('settings.delete.storageFailed')
                    : t('settings.delete.bothFailed')}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <Button variant="danger" size="lg" disabled={busy} onClick={() => setConfirmOpen(true)}>
              {t('settings.delete.action')}
            </Button>
          </div>
        </SectionCard>

        {/* Rückfrage vor dem Löschen: Es gibt kein Zurück, und die
            Sicherungsdatei ist die einzige Rettung. */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogTitle>{t('settings.delete.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.delete.confirmBody')}</DialogDescription>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                {t('settings.delete.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void handleDeleteEverything()}>
                {t('settings.delete.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
