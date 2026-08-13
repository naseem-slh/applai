import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog'
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

/** Ein reines Kalenderdatum ohne Uhrzeit, das Format von `Application.date`. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Ein Datum lesbar machen, ohne bei einem unerwarteten Format zu scheitern.
 *
 * „2026-05-04" liest `new Date` nach der Sprachnorm als **UTC**-Mitternacht;
 * `toLocaleDateString` rechnet danach in die Ortszeit zurück und zeigt
 * westlich von Greenwich den Vortag. Dieselbe Zeichenkette mit angehängter
 * Uhrzeit, aber ohne Zeitzone, gilt dagegen als Ortszeit, und der Tag bleibt
 * der, der dasteht. Zeitstempel in Millisekunden (`Draft.savedAt`) sind
 * davon nicht betroffen, sie tragen ihren Zeitpunkt schon eindeutig.
 */
function formatDate(value: string | number, language: string): string {
  const date =
    typeof value === 'string' && CALENDAR_DATE.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value)
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

  // `session` ist `null`, solange diese Seite noch nichts übergeben hat.
  // Beim Zurückkommen von der Arbeitsfläche steht der Stand wieder da.
  const [slots, setSlots] = useState<Record<Slot, SlotState>>(() => ({
    letter: { ...EMPTY_SLOT, document: session?.letter ?? null },
    cv: { ...EMPTY_SLOT, document: session?.cv ?? null },
  }))
  const [jobAdText, setJobAdText] = useState(session?.jobAdText ?? '')
  const [jobAdBusy, setJobAdBusy] = useState(false)
  const [jobAdError, setJobAdError] = useState<DocumentLoadReason | null>(null)
  const [userName, setUserName] = useState(session?.userName ?? '')
  const [nameFromDocument, setNameFromDocument] = useState(false)
  const [applications, setApplications] = useState<Application[]>([])
  const [applicationsOpen, setApplicationsOpen] = useState(false)
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
      // Unverändert weitergereicht (Schaden 2): Die Arbeitsfläche erkennt
      // daran, für welche Anzeige die selbsttätige Briefkopf-Übernahme in
      // einer vorigen Sitzung schon lief — ohne diesen Wert liefe sie ein
      // zweites Mal und überschriebe jede Handkorrektur des Nutzers.
      letterheadAppliedFor: draft.letterheadAppliedFor,
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
              // Bei einem fortgesetzten Entwurf (`source === 'draft'`) trägt
              // `entry.document` diese Kennung bereits aus `handleUseRecent`
              // — sie muss auch dieses (erste, noch vor der Arbeitsfläche
              // laufende) Ablegen überstehen, sonst wäre sie kurzzeitig
              // verloren, bis die Arbeitsfläche selbst das nächste Mal
              // sichert. Bei einem frisch geladenen Dokument ist der Wert
              // `undefined` — korrekt, denn dafür lief noch nichts.
              letterheadAppliedFor: entry.document.letterheadAppliedFor,
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

  // Onboarding und Tresorzustände gehen der Einstiegsseite vor. Sie sind
  // Lesestoff, keine Arbeitsfläche, und stehen deshalb in einer ruhigen
  // Spalte statt im zweispaltigen Aufbau darunter.
  const gate = (children: ReactNode) => (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]">
          {t('routes.start.heading')}
        </h1>
        {children}
      </div>
    </div>
  )

  if (keyVault.status === 'loading') return gate(null)
  if (privacy.visible) return gate(<PrivacyNotice onAccept={privacy.accept} />)
  if (keyVault.status === 'empty' || keyVault.status === 'corrupted') {
    return gate(
      // Wie in den Einstellungen: Der Tresor ist die maßgebliche Quelle
      // des Anbieters, `Settings.provider` zieht nur nach, damit die
      // Sicherungsdatei ihn trägt. Scheitert das Nachziehen, ist das
      // folgenlos — deshalb keine Meldung.
      <KeySetup
        keyVault={keyVault}
        onSaved={(provider, { paid }) => {
          void updateSettings({ provider, paidKey: paid }).catch(() => {})
        }}
      />,
    )
  }
  if (keyVault.status === 'locked') return gate(<KeyUnlock keyVault={keyVault} />)

  const recentVisible = SLOTS.some(
    (slot) => recent[slot] !== null && slots[slot].document === null,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Die Überschrift trägt der Schrittreiter in der Kopfzeile bereits
          sichtbar. Hier bleibt sie für Vorlesesoftware stehen, damit die
          Seite eine Ebene-1-Überschrift behält, ohne sie zweimal zu zeigen. */}
      <h1 className="sr-only">{t('routes.start.heading')}</h1>

      {storageUnavailable && (
        // Kein `role="alert"`: Das ist ein dauerhafter Zustand, keine
        // Meldung auf eine Handlung hin.
        <p className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-5 py-3 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-ink)] sm:px-8">
          {t('start.storageUnavailable')}
        </p>
      )}

      {/* Zwei Spalten, beide für sich scrollbar: links das Material, rechts
          die Ausschreibung. Nebeneinander statt untereinander, damit beides
          zugleich zu sehen ist und die Seite als Ganzes nicht blättert. */}
      <div className="grid min-h-0 flex-1 gap-8 overflow-y-auto px-5 py-6 sm:px-8 lg:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)] lg:overflow-hidden lg:pb-0">
        <section
          aria-labelledby={`${fieldPrefix}-documents`}
          className="flex min-h-0 flex-col lg:overflow-y-auto lg:pb-6"
        >
          <h2
            id={`${fieldPrefix}-documents`}
            className="text-[length:var(--text-subheading-size)] leading-[var(--text-subheading-leading)] font-semibold text-[var(--color-ink-strong)]"
          >
            {t('start.documents.heading')}
          </h2>

          {/* Die Regel „eines von beiden genügt" stand hier als Satz davor.
              Sie steht jetzt als Kennzeichen „Optional" am Lebenslauf: Wer
              die beiden Felder sieht, liest die Regel dort ab, statt sie
              vorweg erklärt zu bekommen. */}

          {recentVisible && (
            <SectionCard
              headingId={`${fieldPrefix}-recent`}
              heading={t('start.recent.heading')}
              variant="subtle"
              className="mt-4"
            >
              <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-ink)]">
                {t('start.recent.body')}
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {SLOTS.map((slot) => {
                  const draft = recent[slot]
                  if (draft === null || slots[slot].document !== null) return null
                  return (
                    <li key={slot} className="flex flex-wrap items-center gap-2">
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

          <div className="mt-4 flex flex-col gap-5">
            {SLOTS.map((slot) => {
              const state = slots[slot]
              return (
                <div key={slot} className="flex flex-col gap-2">
                  <FileDrop
                    label={t(`start.files.${slot}`)}
                    description={t(`start.files.${slot}Description`)}
                    // Das Anschreiben nennt sein Format, der Lebenslauf
                    // seinen Rang. Zwei gleich aussehende Ablegefelder
                    // ließen sonst offen, welches davon nötig ist.
                    meta={
                      slot === 'letter' ? (
                        <span className={FIELD_HINT_CLASS}>{t('start.files.formats')}</span>
                      ) : (
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-0.5 text-[length:var(--text-label-size)] font-semibold tracking-[var(--text-label-tracking)] text-[var(--color-muted)] uppercase">
                          {t('start.files.optional')}
                        </span>
                      )
                    }
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
                          (siehe DESIGN.md). */}
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
              className="mt-4"
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
        </section>

        <section
          aria-labelledby={`${fieldPrefix}-job-ad`}
          className="flex min-h-0 flex-col lg:overflow-y-auto lg:pb-6"
        >
          <h2
            id={`${fieldPrefix}-job-ad`}
            className="text-[length:var(--text-subheading-size)] leading-[var(--text-subheading-leading)] font-semibold text-[var(--color-ink-strong)]"
          >
            {t('start.jobAd.heading')}
          </h2>

          <Field
            id={`${fieldPrefix}-job-ad-text`}
            label={t('start.jobAd.label')}
            hint={t('start.jobAd.hint')}
            error={jobAdError === null ? undefined : t(`start.files.errors.${jobAdError}`)}
            className="mt-3"
          >
            {(control) => (
              <Textarea
                {...control}
                value={jobAdText}
                rows={10}
                onChange={(event) => setJobAdText(event.target.value)}
                className="min-h-[12rem] lg:min-h-[16rem]"
              />
            )}
          </Field>

          {/* Dasselbe Muster wie am Ablegefeld: verstecktes Dateifeld, ein
              Knopf davor. Das native Feld brächte seine eigene, in jedem
              Browser andere Beschriftung („Keine Datei ausgewählt") mit und
              wäre das einzige Bedienelement der Seite, das nicht wie die
              übrigen aussieht. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={jobAdBusy}
              onClick={() => jobAdPdfRef.current?.click()}
            >
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
          {/* Warum es keinen Link gibt, ist eine Begründung für etwas, das
              gar nicht angeboten wird. Sie stand als 27-Wort-Absatz
              dauerhaft da und beantwortete eine Frage, die die meisten nie
              stellen. Wer sie stellt, klappt sie auf. */}
          <details className="mt-2">
            <summary
              className={cn(
                'focus-ring w-fit cursor-pointer list-none rounded-sm text-[var(--color-accent-text)]',
                'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]',
              )}
            >
              {t('start.jobAd.pdfWhy')}
            </summary>
            <p className={cn('mt-1 max-w-[60ch]', FIELD_HINT_CLASS)}>{t('start.jobAd.pdfHint')}</p>
          </details>

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

        </section>
      </div>

      {/* Die Fußleiste steht fest am unteren Rand und sagt in Worten, was
          noch fehlt. Ein gesperrter Knopf nimmt keine Zeigerereignisse an
          und kann deshalb nichts erklären (siehe DESIGN.md, Tooltip). */}
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 py-3 sm:px-8">
        <Button
          variant="primary"
          size="lg"
          disabled={missing.length > 0 || busy}
          onClick={() => void handleContinue()}
        >
          {t('start.continue')}
        </Button>
        {missing.length > 0 && (
          // Je Punkt eine eigene Zeile, nicht ein zusammengezogener Satz:
          // Wer zwei Dinge nachzuholen hat, soll zwei Dinge sehen.
          //
          // Ist nichts offen, steht hier nichts: Der freigegebene Knopf
          // daneben sagt es schon, und „Alles da. Weiter zur Arbeitsfläche."
          // wiederholte nur seine Beschriftung.
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className={FIELD_HINT_CLASS}>{t('start.missing.heading')}</p>
            <ul className={cn('flex flex-wrap gap-x-4 gap-y-1', FIELD_HINT_CLASS)}>
              {missing.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Die Bewerbungsliste ist Nachschlagewerk, kein Arbeitsschritt. Sie
            stand bis zum Aufräumen unter der Stellenausschreibung, im Weg
            der einen Sache, um die es hier geht. Jetzt liegt sie hinter
            einem Verweis am Rand der Fußleiste. Die Warnung vor einer
            Doppelbewerbung bleibt davon unberührt: Die schlägt oben an der
            Anzeige auf, wo sie gebraucht wird. */}
        <Dialog open={applicationsOpen} onOpenChange={setApplicationsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="ms-auto">
              {t('start.applications.open', { count: applications.length })}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>{t('start.applications.heading')}</DialogTitle>
            {applications.length === 0 ? (
              <DialogDescription>{t('start.applications.empty')}</DialogDescription>
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
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
