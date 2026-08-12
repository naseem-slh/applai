import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  CV_DRAFT_ID,
  LETTER_DRAFT_ID,
  useApp,
  type LoadedDocument,
  type StartSession,
} from '@/components/app/appContext'
import { KeySetup } from '@/components/onboarding/KeySetup'
import { KeyUnlock } from '@/components/onboarding/KeyUnlock'
import { PrivacyNotice } from '@/components/onboarding/PrivacyNotice'
import { usePrivacyNotice } from '@/components/onboarding/usePrivacyNotice'
import { findDuplicateApplications } from '@/components/start/duplicateApplications'
import { FileDrop } from '@/components/start/FileDrop'
import {
  DEFAULT_LOADERS,
  DocumentLoadError,
  type DocumentLoaders,
  type DocumentLoadReason,
} from '@/components/start/loadDocument'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/ui/SectionCard'
import { detectHeadName } from '@/lib/privacy/anonymize'
import type { Application, Draft } from '@/lib/storage/adapter'
import { cn } from '@/lib/utils'

/**
 * Die Einstiegsseite: Unterlagen ablegen, Stellenausschreibung einfügen,
 * weiter zur Arbeitsfläche.
 *
 * Sie ist zugleich der Ort, an dem das Onboarding hängt. Solange kein
 * Schlüssel hinterlegt ist, steht hier der Datenschutzhinweis und danach
 * die Schlüsseleinrichtung — wann welcher, sagt `usePrivacyNotice`, nicht
 * diese Datei (13b hat die Regel dort samt Begründung abgelegt).
 *
 * **Der Name des Nutzers wird hier bestimmt** (Übergabe 1). Einmal, auf dem
 * Gesamtdokument, über `detectHeadName` — und wenn das nichts findet, wird
 * gefragt. Der Weiter-Knopf bleibt gesperrt, solange das Feld leer ist. Das
 * ist keine Bequemlichkeitsprüfung: Ohne gesetzten Namen sucht sich
 * `resolveNameHint` in `withAnonymization` den ersten namensförmigen
 * Treffer aus irgendeinem Feld — eine Firmierung kann gewinnen, und der
 * Klarname des Bewerbers ginge unersetzt an den Anbieter.
 *
 * **Kein Anbieteraufruf.** Diese Ansicht liest Dateien, mehr nicht. Die
 * Analyse der Anzeige, das Stilprofil und alles Weitere gehören zur
 * Arbeitsfläche (Aufgabe 14) und laufen dort über `withAnonymization`
 * (Übergabe 7).
 */

/** Ein Ablegefeld je Unterlage. Mehr als zwei gibt es im ersten Bauabschnitt nicht. */
type Slot = 'letter' | 'cv'

const SLOTS = ['letter', 'cv'] as const

interface SlotState {
  document: LoadedDocument | null
  busy: boolean
  error: DocumentLoadReason | null
}

const EMPTY_SLOT: SlotState = { document: null, busy: false, error: null }

const DRAFT_ID: Record<Slot, string> = { letter: LETTER_DRAFT_ID, cv: CV_DRAFT_ID }

/** Ein Datum lesbar machen, ohne bei einem unerwarteten Format zu scheitern. */
function formatDate(value: string | number, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' })
}

export interface StartProps {
  /**
   * Das Einlesen von Dateien, austauschbar. Vorgabe ist der echte Weg über
   * `parseDocx` und pdf.js; Tests setzen eine Attrappe ein, statt pdf.js in
   * jeden Test der Oberfläche zu ziehen.
   */
  loaders?: DocumentLoaders
}

export default function Start({ loaders = DEFAULT_LOADERS }: StartProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { storage, keyVault, session, setSession, storageReady, storageUnavailable, updateSettings } =
    useApp()
  const privacy = usePrivacyNotice(keyVault.status)
  const fieldPrefix = useId()

  const [slots, setSlots] = useState<Record<Slot, SlotState>>(() => ({
    letter: { ...EMPTY_SLOT, document: session.letter },
    cv: { ...EMPTY_SLOT, document: session.cv },
  }))
  const [jobAdText, setJobAdText] = useState(session.jobAdText)
  const [jobAdBusy, setJobAdBusy] = useState(false)
  const [jobAdError, setJobAdError] = useState<DocumentLoadReason | null>(null)
  const [userName, setUserName] = useState(session.userName)
  const [nameFromDocument, setNameFromDocument] = useState(false)
  const [applications, setApplications] = useState<Application[]>([])
  const jobAdPdfRef = useRef<HTMLInputElement | null>(null)
  const [recent, setRecent] = useState<Record<Slot, Draft | null>>({ letter: null, cv: null })

  const letter = slots.letter.document
  const cv = slots.cv.document

  useEffect(() => {
    if (!storageReady) return
    let cancelled = false
    void (async () => {
      try {
        const [list, letterDraft, cvDraft] = await Promise.all([
          storage.listApplications(),
          storage.loadDraft(LETTER_DRAFT_ID),
          storage.loadDraft(CV_DRAFT_ID),
        ])
        if (cancelled) return
        setApplications(list)
        setRecent({ letter: letterDraft, cv: cvDraft })
      } catch {
        // Ein nicht erreichbarer Speicher steht bereits als Hinweis oben
        // auf der Seite; eine leere Liste ist hier die richtige Anzeige.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storage, storageReady])

  // Der jeweils gültige Name, damit `adoptName` ihn lesen kann, ohne in
  // seiner Abhängigkeitsliste zu stehen (und damit bei jedem Tastendruck
  // eine neue Identität zu bekommen).
  const currentName = useRef(userName)
  currentName.current = userName

  /**
   * Den Namen aus dem Dokument übernehmen, solange keiner dasteht
   * (Übergabe 1). Einmal, auf dem **Gesamtdokument** — nicht später je
   * Textausschnitt, wo `detectHeadName` mangels Kopfbereich nichts fände.
   * Was hier herauskommt, ist ein Vorschlag: Das Feld steht sichtbar da und
   * ist zu ändern, denn die Erkennung nimmt notfalls die erste
   * namensförmige Zeile und die kann auch eine Firmierung sein.
   */
  const adoptName = useCallback((text: string) => {
    if (currentName.current.trim() !== '') return
    const detected = detectHeadName(text)
    if (detected === undefined) return
    currentName.current = detected
    setUserName(detected)
    setNameFromDocument(true)
  }, [])

  async function handleSelect(slot: Slot, file: File): Promise<void> {
    setSlots((current) => ({ ...current, [slot]: { document: null, busy: true, error: null } }))
    try {
      const loaded = await loaders.loadDocument(file)
      setSlots((current) => ({ ...current, [slot]: { document: loaded, busy: false, error: null } }))
      setRecent((current) => ({ ...current, [slot]: null }))
      adoptName(loaded.text)
    } catch (error) {
      const reason: DocumentLoadReason = error instanceof DocumentLoadError ? error.reason : 'unreadable'
      setSlots((current) => ({ ...current, [slot]: { document: null, busy: false, error: reason } }))
    }
  }

  function handleClear(slot: Slot): void {
    setSlots((current) => ({ ...current, [slot]: { ...EMPTY_SLOT } }))
  }

  function handleUseRecent(slot: Slot): void {
    const draft = recent[slot]
    if (draft === null) return
    const loaded: LoadedDocument = {
      fileName: null,
      source: 'draft',
      docxBase: draft.docxBase,
      text: draft.text,
      multiColumn: false,
    }
    setSlots((current) => ({ ...current, [slot]: { document: loaded, busy: false, error: null } }))
    setRecent((current) => ({ ...current, [slot]: null }))
    adoptName(draft.text)
  }

  async function handleDiscardRecent(slot: Slot): Promise<void> {
    setRecent((current) => ({ ...current, [slot]: null }))
    try {
      await storage.deleteDraft(DRAFT_ID[slot])
    } catch {
      // `deleteDraft` löst bei einer unbekannten Kennung ohnehin nicht aus;
      // scheitert der Speicher als Ganzes, sagt das der Hinweis oben.
    }
  }

  async function handleJobAdPdf(file: File): Promise<void> {
    setJobAdBusy(true)
    setJobAdError(null)
    try {
      setJobAdText(await loaders.loadPdfText(file))
    } catch (error) {
      setJobAdError(error instanceof DocumentLoadError ? error.reason : 'unreadable')
    } finally {
      setJobAdBusy(false)
    }
  }

  const hasDocument = letter !== null || cv !== null
  const busy = slots.letter.busy || slots.cv.busy || jobAdBusy
  const missing: string[] = []
  if (!hasDocument) missing.push(t('start.missing.document'))
  if (jobAdText.trim() === '') missing.push(t('start.missing.jobAd'))
  // Erst fragen, wenn es ein Dokument gibt — vorher steht das Feld gar
  // nicht da, und eine Forderung ohne sichtbares Feld wäre eine Sackgasse.
  if (hasDocument && userName.trim() === '') missing.push(t('start.missing.userName'))

  async function handleContinue(): Promise<void> {
    const next: StartSession = {
      letter,
      cv,
      jobAdText: jobAdText.trim(),
      userName: userName.trim(),
    }
    setSession(next)
    // Der Zwischenstand ist zugleich das, was beim nächsten Start als
    // „zuletzt benutzt" angeboten wird. Er läuft nach sieben Tagen ab —
    // dafür sorgt `purgeExpiredDrafts` beim Start (siehe AppProvider).
    try {
      const savedAt = Date.now()
      await Promise.all(
        SLOTS.map((slot) => ({ slot, document: next[slot] }))
          .filter((entry): entry is { slot: Slot; document: LoadedDocument } => entry.document !== null)
          .map((entry) =>
            storage.saveDraft({
              id: DRAFT_ID[entry.slot],
              docxBase: entry.document.docxBase,
              text: entry.document.text,
              savedAt,
            }),
          ),
      )
    } catch {
      // Ein nicht gespeicherter Zwischenstand darf den Weg zur
      // Arbeitsfläche nicht versperren — die Übergabe selbst steht bereits.
    }
    void navigate('/editor')
  }

  const duplicates = findDuplicateApplications(jobAdText, applications)

  const heading = (
    <h1 className="text-[length:var(--text-display-size)] leading-[var(--text-display-leading)] font-semibold tracking-[var(--text-display-tracking)] text-[var(--color-ink-strong)]">
      {t('routes.start.heading')}
    </h1>
  )

  // Onboarding und Tresorzustände gehen der Einstiegsseite vor.
  if (keyVault.status === 'loading') {
    return <div className="flex flex-col gap-6">{heading}</div>
  }
  if (privacy.visible) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <PrivacyNotice onAccept={privacy.accept} />
      </div>
    )
  }
  if (keyVault.status === 'empty' || keyVault.status === 'corrupted') {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        {/* Wie in den Einstellungen: Der Tresor ist die maßgebliche Quelle
            des Anbieters, `Settings.provider` zieht nur nach, damit die
            Sicherungsdatei ihn trägt. Scheitert das Nachziehen, ist das
            folgenlos — deshalb keine Meldung. */}
        <KeySetup
          keyVault={keyVault}
          onSaved={(provider) => {
            void updateSettings({ provider }).catch(() => {})
          }}
        />
      </div>
    )
  }
  if (keyVault.status === 'locked') {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <KeyUnlock keyVault={keyVault} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {heading}
      <p className="max-w-[65ch]">{t('start.intro')}</p>

      {storageUnavailable && (
        // Kein `role="alert"`: Das ist ein dauerhafter Zustand, keine
        // Meldung auf eine Handlung hin.
        <Card variant="subtle" padding="md" className="text-[var(--color-ink)]">
          <p className="text-[length:var(--text-body-sm-size)]">{t('start.storageUnavailable')}</p>
        </Card>
      )}

      {SLOTS.some((slot) => recent[slot] !== null && slots[slot].document === null) && (
        <SectionCard
          headingId={`${fieldPrefix}-recent`}
          heading={t('start.recent.heading')}
          variant="subtle"
        >
          <p className="mt-3 text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
            {t('start.recent.body')}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {SLOTS.map((slot) => {
              const draft = recent[slot]
              if (draft === null || slots[slot].document !== null) return null
              return (
                <li key={slot} className="flex flex-wrap items-center gap-3">
                  <span className="text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
                    {t(`start.recent.${slot}`, {
                      date: formatDate(draft.savedAt, i18n.resolvedLanguage ?? 'de'),
                    })}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => handleUseRecent(slot)}>
                    {t('start.recent.use')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDiscardRecent(slot)}>
                    {t('start.recent.discard')}
                  </Button>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      <SectionCard headingId={`${fieldPrefix}-documents`} heading={t('start.documents.heading')}>
        <p className="mt-3 max-w-[65ch]">{t('start.documents.rule')}</p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {SLOTS.map((slot) => {
            const state = slots[slot]
            return (
              <div key={slot} className="flex flex-col gap-3">
                <FileDrop
                  label={t(`start.files.${slot}`)}
                  description={t(`start.files.${slot}Description`)}
                  accept=".docx,.pdf"
                  document={state.document}
                  busy={state.busy}
                  error={state.error === null ? undefined : t(`start.files.errors.${state.error}`)}
                  onSelect={(file) => void handleSelect(slot, file)}
                  onClear={() => handleClear(slot)}
                />
                {state.document?.source === 'pdf' && (
                  <Card variant="subtle" padding="sm" className="text-[var(--color-ink)]">
                    <p className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
                      {t('start.pdf.beta')}
                    </p>
                    {/* Zusätzlich, nicht ersatzweise: Der Beta-Hinweis gilt
                        für jede PDF-Eingabe, die Warnung zur
                        Mehrspaltigkeit kommt oben drauf, wenn
                        `detectMultiColumn` angeschlagen hat.

                        In `--color-error`, nicht in `--color-warning`:
                        Letzteres erreicht auf keiner hellen Fläche 4,5:1
                        (3,12 auf `surface-alt`, siehe DESIGN.md). */}
                    {state.document.multiColumn && (
                      <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-error)]">
                        {t('start.pdf.multiColumn')}
                      </p>
                    )}
                  </Card>
                )}
              </div>
            )
          })}
        </div>

        {hasDocument && (
          <Field
            id={`${fieldPrefix}-user-name`}
            label={t('start.name.label')}
            hint={nameFromDocument ? t('start.name.detected') : t('start.name.hint')}
            className="mt-6 max-w-sm"
          >
            {(control) => (
              <Input
                {...control}
                value={userName}
                autoComplete="name"
                onChange={(event) => {
                  setUserName(event.target.value)
                  setNameFromDocument(false)
                }}
              />
            )}
          </Field>
        )}
      </SectionCard>

      <SectionCard headingId={`${fieldPrefix}-job-ad`} heading={t('start.jobAd.heading')}>
        <Field
          id={`${fieldPrefix}-job-ad-text`}
          label={t('start.jobAd.label')}
          hint={t('start.jobAd.hint')}
          error={jobAdError === null ? undefined : t(`start.files.errors.${jobAdError}`)}
          className="mt-4"
        >
          {(control) => (
            <Textarea
              {...control}
              value={jobAdText}
              rows={10}
              onChange={(event) => setJobAdText(event.target.value)}
            />
          )}
        </Field>

        {/* Dasselbe Muster wie am Ablegefeld: verstecktes Dateifeld, ein
            Knopf davor. Das native Feld brächte seine eigene, in jedem
            Browser andere Beschriftung („Keine Datei ausgewählt") mit und
            wäre das einzige Bedienelement der Seite, das nicht wie die
            übrigen aussieht. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={jobAdBusy} onClick={() => jobAdPdfRef.current?.click()}>
            {t('start.jobAd.pdfLabel')}
          </Button>
          <input
            ref={jobAdPdfRef}
            type="file"
            accept=".pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.item(0) ?? null
              if (file !== null) void handleJobAdPdf(file)
              // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
              event.target.value = ''
            }}
          />
          {jobAdBusy && (
            <p role="status" className="text-[length:var(--text-body-sm-size)]">
              {t('start.jobAd.reading')}
            </p>
          )}
        </div>
        <p className={cn('mt-2', FIELD_HINT_CLASS)}>{t('start.jobAd.pdfHint')}</p>
      </SectionCard>

      <SectionCard headingId={`${fieldPrefix}-applications`} heading={t('start.applications.heading')}>
        {duplicates.length > 0 && (
          <Card variant="subtle" padding="md" className="mt-4 text-[var(--color-ink)]">
            <p
              role="alert"
              className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]"
            >
              {t('start.applications.duplicate', {
                entries: duplicates
                  .map((entry) =>
                    t('start.applications.duplicateEntry', {
                      company: entry.company,
                      position: entry.position,
                      date: formatDate(entry.date, i18n.resolvedLanguage ?? 'de'),
                    }),
                  )
                  .join('; '),
              })}
            </p>
          </Card>
        )}

        {applications.length === 0 ? (
          <p className={cn('mt-4', FIELD_HINT_CLASS)}>{t('start.applications.empty')}</p>
        ) : (
          <table className="mt-4 w-full border-collapse text-left text-[length:var(--text-body-sm-size)]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('start.applications.company')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('start.applications.position')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('start.applications.date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr
                  key={application.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="py-2 pr-4">{application.company}</td>
                  <td className="py-2 pr-4">{application.position}</td>
                  <td className="py-2">
                    {formatDate(application.date, i18n.resolvedLanguage ?? 'de')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <div className="flex flex-col items-end gap-3">
        {missing.length > 0 && (
          // Ein gesperrter Knopf nimmt keine Zeigerereignisse an und kann
          // deshalb nichts erklären (siehe DESIGN.md, Tooltip). Was fehlt,
          // steht daneben.
          <div className="text-right">
            <p className={FIELD_HINT_CLASS}>{t('start.missing.heading')}</p>
            <ul className={cn('mt-2 flex flex-col gap-1', FIELD_HINT_CLASS)}>
              {missing.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          disabled={missing.length > 0 || busy}
          onClick={() => void handleContinue()}
        >
          {t('start.continue')}
        </Button>
      </div>
    </div>
  )
}
