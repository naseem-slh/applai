import { useId, useRef, useState, type ReactNode } from 'react'
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
import { Choice } from '@/components/ui/Choice'
import { FIELD_ERROR_CLASS, FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { SectionCard } from '@/components/ui/SectionCard'
import { Switch } from '@/components/ui/Switch'
import { ModelPicker } from '@/components/settings/ModelPicker'
import { PROVIDERS } from '@/lib/ai/provider'
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

/**
 * Eine Zeile in einer Einstellungskarte: links die Beschriftung, rechts das
 * Bedienelement, dazwischen eine Haarlinie zur Zeile darüber.
 *
 * Die Beschriftung ist ein `<span>` und kein `<label>`: Die Schalterreihe
 * daneben trägt ihren Namen selbst über `aria-label`, und ein zweiter
 * Namensgeber ergäbe eine doppelte Ansage.
 */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--color-border)] py-3 first:border-t-0">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      {children}
    </div>
  )
}

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
  // Das Schlüsselformular erscheint erst auf Verlangen. Solange kein
  // Schlüssel hinterlegt ist, steht es ohnehin offen (siehe unten).
  const [keyFormOpen, setKeyFormOpen] = useState(false)
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
      {/* 1100 statt 672 px. Die Einstellungen sind eine Sammlung kurzer
          Schalter, keine Lesespalte: In der schmalen Rinne stand jede
          Auswahlliste allein in ihrer Zeile, und die Seite war dreieinhalb
          Bildschirme hoch. Zwei Spalten bringen sie auf einen. */}
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
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

        {/* Je Zeile zwei Karten auf gleicher Ober- und Unterkante. Die
            niedrigere wird mitgezogen; ihr Inhalt rückt dafür in die Mitte,
            damit die gewonnene Höhe wie Rand aussieht und nicht wie ein
            abgeschnittener Boden. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            headingId={`${prefix}-appearance`}
            heading={t('settings.appearance.heading')}
            variant="default"
            className="flex flex-col"
          >
            <div className="flex flex-1 flex-col justify-center">
              <SettingRow label={t('settings.appearance.label')}>
                <Choice
                  label={t('settings.appearance.label')}
                  value={settings.theme}
                  options={THEMES.map((theme) => ({
                    value: theme,
                    label: t(`settings.appearance.options.${theme}`),
                  }))}
                  onValueChange={(next) => void change({ theme: next })}
                />
              </SettingRow>

              <SettingRow label={t('settings.language.label')}>
                <Choice
                  label={t('settings.language.label')}
                  value={settings.uiLanguage}
                  options={SUPPORTED_LANGUAGES.map((language) => ({
                    value: language,
                    label: t(`settings.language.options.${language}`),
                  }))}
                  onValueChange={(next) => void change({ uiLanguage: next })}
                />
              </SettingRow>
            </div>
          </SectionCard>

          <SectionCard
            headingId={`${prefix}-privacy`}
            heading={t('settings.anonymize.heading')}
            variant="default"
            className="flex flex-col"
          >
            <div className="flex flex-1 flex-col justify-center">
              <div className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <span id={`${prefix}-anonymize-label`} className={FIELD_LABEL_CLASS}>
                    {t('settings.anonymize.label')}
                  </span>
                  <p id={`${prefix}-anonymize-hint`} className={cn('mt-1', FIELD_HINT_CLASS)}>
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

              {/* Kein `role="alert"`: Das ist die Beschreibung eines
                  Zustands, der bestehen bleibt — der Schalter selbst sagt
                  an, dass er aus ist. */}
              {!settings.anonymize && (
                <p className={cn('pb-3', FIELD_ERROR_CLASS)}>{t('settings.anonymize.off')}</p>
              )}

              <div className="border-t border-[var(--color-border)] py-3">
                <span className={cn('mb-2 block', FIELD_LABEL_CLASS)}>
                  {t('settings.truthMode.label')}
                </span>
                <Choice
                  block
                  label={t('settings.truthMode.label')}
                  value={settings.truthMode}
                  options={TRUTH_MODES.map((mode) => ({
                    value: mode,
                    label: t(`settings.truthMode.options.${mode}`),
                  }))}
                  onValueChange={(next) => void change({ truthMode: next })}
                />
                {/* Nur die Erklärung des gewählten Modus. Vorher stand die
                    Frage darüber und die Erklärung darunter, zusammen
                    40 Wörter für eine Auswahl aus drei Wörtern. */}
                <p className={cn('mt-2', FIELD_HINT_CLASS)}>
                  {t(`settings.truthMode.explanations.${settings.truthMode}`)}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            headingId={`${prefix}-key`}
            heading={t('settings.key.heading')}
            variant="default"
            className="flex flex-col"
          >
            <div className="mt-3 flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-semibold text-[var(--color-ink-strong)]">
                  {providerFromVault === null
                    ? t('settings.key.noProvider')
                    : PROVIDERS[providerFromVault].label}
                </span>
                {providerFromVault !== null && (
                  <span className={FIELD_HINT_CLASS}>{t('settings.key.currentProvider')}</span>
                )}
                {/* Das Schlüsselformular stand dauerhaft offen: zwei Felder
                    und 40 Wörter Erklärung für etwas, das man einmal
                    einrichtet. Jetzt kommt es auf Verlangen. */}
                {providerFromVault !== null && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ms-auto"
                    onClick={() => setKeyFormOpen((open) => !open)}
                  >
                    {keyFormOpen ? t('settings.key.cancelReplace') : t('settings.key.replace')}
                  </Button>
                )}
              </div>

              {/* `onSaved` zieht den Anbieter in die Einstellungen nach,
                  damit die Sicherungsdatei ihn trägt. */}
              {(providerFromVault === null || keyFormOpen) && (
                <KeySetup
                  keyVault={keyVault}
                  className="max-w-none"
                  onSaved={(provider, { paid }) => {
                    setKeyFormOpen(false)
                    void change({ provider, paidKey: paid })
                  }}
                />
              )}

              {providerFromVault !== null && (
                <div className="border-t border-[var(--color-border)] pt-3">
                  <ModelPicker
                    fieldId={`${prefix}-model-field`}
                    provider={PROVIDERS[providerFromVault]}
                    apiKey={keyVault.vault?.getKey() ?? null}
                    paidKey={settings.paidKey === true}
                    chain={settings.modelChain?.[providerFromVault] ?? []}
                    onChange={(chain) =>
                      void change({
                        modelChain: { ...settings.modelChain, [providerFromVault]: chain },
                      })
                    }
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            headingId={`${prefix}-backup`}
            heading={t('settings.backup.heading')}
            variant="default"
            className="flex flex-col"
          >
            <div className="flex flex-1 flex-col justify-center gap-3">
              <p className={cn('mt-3', FIELD_HINT_CLASS)}>{t('settings.backup.hint')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" disabled={busy} onClick={() => void handleExport()}>
                  {t('settings.backup.export')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => importRef.current?.click()}
                >
                  {t('settings.backup.import')}
                </Button>
                {/* `hidden` nimmt das Feld aus dem Baum — bedient wird über
                    den Knopf daneben, damit der Weg über die Tastatur
                    derselbe ist wie der mit der Maus. */}
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
              <p className={FIELD_ERROR_CLASS}>{t('settings.backup.importWarning')}</p>
              {backupError !== null && (
                <p role="alert" className={FIELD_ERROR_CLASS}>
                  {t(`settings.backup.errors.${backupError}`)}
                </p>
              )}
              {backupDone !== null && (
                <p
                  role="status"
                  className="text-[length:var(--text-body-sm-size)] text-[var(--color-success)]"
                >
                  {t(`settings.backup.done.${backupDone}`)}
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Die einzige unumkehrbare Handlung der Anwendung steht außerhalb
            des Rasters, über die volle Breite und mit rot getöntem Rand.
            Zwischen „Darstellung" und „Sprache" hat sie nichts verloren. */}
        <SectionCard
          headingId={`${prefix}-delete`}
          heading={t('settings.delete.heading')}
          variant="default"
          className="border-[color-mix(in_oklab,var(--color-error)_35%,var(--color-border))]"
        >
          <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-[16rem] flex-1">
              <p className={FIELD_HINT_CLASS}>{t('settings.delete.body')}</p>

              <details className="mt-2">
                <summary
                  className={cn(
                    'focus-ring w-fit cursor-pointer list-none rounded-sm',
                    'text-[length:var(--text-body-sm-size)] text-[var(--color-accent-text)]',
                  )}
                >
                  {t('settings.delete.keyStays')}
                </summary>
                <p className={cn('mt-1 max-w-[60ch]', FIELD_HINT_CLASS)}>
                  {t('settings.delete.keyStaysBody')}
                </p>
              </details>

              {deleteOutcome !== null && (
                <p
                  role={deleteComplete ? 'status' : 'alert'}
                  className={cn(
                    'mt-3 text-[length:var(--text-body-sm-size)]',
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
            </div>

            <Button variant="danger" disabled={busy} onClick={() => setConfirmOpen(true)}>
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
