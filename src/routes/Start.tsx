import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  CV_DRAFT_ID,
  LETTER_DRAFT_ID,
  useApp,
  type DocumentScope,
  type LoadedDocument,
  type StartSession,
} from '@/components/app/appContext'
import { Figure } from '@/components/app/Figures'
import { Wordmark } from '@/components/app/Wordmark'
import { KeySetup } from '@/components/onboarding/KeySetup'
import { KeyUnlock } from '@/components/onboarding/KeyUnlock'
import { PrivacyNotice } from '@/components/onboarding/PrivacyNotice'
import { usePrivacyNotice } from '@/components/onboarding/usePrivacyNotice'
import { findDuplicateApplications } from '@/components/start/duplicateApplications'
import { DocumentTile } from '@/components/start/DocumentTile'
import { NOTE_QUERY, RecentDraftChip, RecentDraftNote } from '@/components/start/RecentDraft'
import { useMediaQuery } from '@/components/app/useMediaQuery'
import {
  DEFAULT_LOADERS,
  DocumentLoadError,
  type DocumentLoaders,
  type DocumentLoadReason,
} from '@/components/start/loadDocument'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Collapse } from '@/components/ui/Collapse'
import { Checkbox } from '@/components/ui/Checkbox'
import { ArrowUpIcon } from '@/components/ui/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
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

/**
 * Lässt sich diese Unterlage anpassen?
 *
 * Nein bei einem **mehrspaltig** gesetzten PDF: Die Umwandlung liest es Zeile
 * für Zeile über die ganze Seitenbreite, danach steht der Text der linken und
 * der rechten Spalte ineinander verschränkt (`start.pdf.multiColumn`). Was
 * daraus als Word-Datei herauskäme, sähe aus wie eine Bewerbungsunterlage,
 * wäre aber keine. Als **Faktenquelle** taugt derselbe Text weiterhin: Dort
 * zählt, was dasteht, nicht in welcher Reihenfolge.
 */
function isAdjustable(document: LoadedDocument | null): boolean {
  return document !== null && !document.multiColumn
}

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
  // Ist neben der Karte Platz für die Zettel? Sonst liegt das Angebot als
  // Marke in der Kachel, die es füllen würde.
  const noteRoom = useMediaQuery(NOTE_QUERY)
  const fieldPrefix = useId()

  // `session` ist `null`, solange diese Seite noch nichts übergeben hat.
  // Beim Zurückkommen von der Arbeitsfläche steht der Stand wieder da.
  const [slots, setSlots] = useState<Record<Slot, SlotState>>(() => ({
    letter: { ...EMPTY_SLOT, document: session?.letter ?? null },
    cv: { ...EMPTY_SLOT, document: session?.cv ?? null },
  }))
  /**
   * Der Arbeitsumfang (siehe `StartSession.scope`). Eine frisch abgelegte
   * Unterlage ist angehakt, sofern sie sich anpassen lässt — der Regelfall
   * soll nichts verlangen. Wer nur eine der beiden anpassen will, hakt die
   * andere ab; sie bleibt dann Faktenquelle.
   */
  const [scope, setScope] = useState<DocumentScope>(() => ({
    letter: session?.scope.letter ?? false,
    cv: session?.scope.cv ?? false,
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
      setScope((current) => ({ ...current, [slot]: isAdjustable(loaded) }))
      setRecent((current) => ({ ...current, [slot]: null }))
      adoptName(loaded.text)
    } catch (error) {
      const reason: DocumentLoadReason = error instanceof DocumentLoadError ? error.reason : 'unreadable'
      setSlots((current) => ({ ...current, [slot]: { document: null, busy: false, error: reason } }))
      setScope((current) => ({ ...current, [slot]: false }))
    }
  }

  function handleClear(slot: Slot): void {
    setSlots((current) => ({ ...current, [slot]: { ...EMPTY_SLOT } }))
    setScope((current) => ({ ...current, [slot]: false }))
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
    // Ein fortgesetzter Entwurf entstand aus einer Word-Datei und ist damit
    // immer anpassbar (`multiColumn: false`, siehe oben).
    setScope((current) => ({ ...current, [slot]: true }))
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
  // Eine Arbeitsfläche ohne ein einziges anzupassendes Dokument hätte nichts
  // zu tun. Gefragt wird erst, wenn überhaupt etwas dasteht — sonst stünde
  // die Forderung neben zwei leeren Ablegefeldern.
  if (hasDocument && !scope.letter && !scope.cv) missing.push(t('start.missing.scope'))
  if (jobAdText.trim() === '') missing.push(t('start.missing.jobAd'))
  // Erst fragen, wenn es ein Dokument gibt — vorher steht das Feld gar
  // nicht da, und eine Forderung ohne sichtbares Feld wäre eine Sackgasse.
  if (hasDocument && userName.trim() === '') missing.push(t('start.missing.userName'))

  /** Was Zettel und Marke gleichermaßen brauchen. Der volle Satz geht als
   *  Name mit: Sichtbar stehen zwei Zeilen, angesagt wird „Anschreiben,
   *  gespeichert am 15. August 2026". */
  function recallProps(slot: Slot) {
    const draft = recent[slot]
    const date = formatDate(draft?.savedAt ?? 0, i18n.resolvedLanguage ?? 'de')
    return {
      kind: t(`start.files.${slot}`),
      date,
      label: t(`start.recent.${slot}`, { date }),
      useLabel: t('start.recent.use'),
      discardLabel: t('start.recent.discard'),
      onUse: () => handleUseRecent(slot),
      onDiscard: () => void handleDiscardRecent(slot),
    }
  }

  // Alles beisammen. Der Knopf wippt einmal, die Figur springt auf: Beides
  // sagt dasselbe wie die freigegebene Beschriftung, nur einen Wimpernschlag
  // früher.
  const ready = missing.length === 0 && !busy

  async function handleContinue(): Promise<void> {
    const next: StartSession = {
      letter,
      cv,
      jobAdText: jobAdText.trim(),
      userName: userName.trim(),
      // Nur, was auch dasteht: Ein Haken an einem Feld, das zwischenzeitlich
      // geleert wurde, führte die Arbeitsfläche sonst zu einem Dokument, das
      // es nicht gibt.
      scope: { letter: scope.letter && letter !== null, cv: scope.cv && cv !== null },
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
  // Die Erststart-Zustände sind abgenommen und werden nicht umgebaut. Sie
  // erben nur die geteilten Teile: die Token und die Marke. Ihr Aufbau —
  // eine ruhige Lesespalte statt der Arbeitsfläche darunter — bleibt.
  const gate = (children: ReactNode) => (
    <div className="flex w-full flex-1 flex-col items-center gap-6 px-4 pt-8 pb-8">
      <Wordmark className="[--breite:280px] max-[560px]:[--breite:200px]" />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <h1 className="font-display text-[length:var(--text-display-size)] leading-[var(--text-display-leading)] font-semibold tracking-[var(--text-display-tracking)] text-[var(--ink-strong)]">
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


  return (
    <div
      className={cn(
        // Der Raum ist das Blatt (siehe AppLayout); hier steht die Bühne
        // darauf. `relative`, weil die wartende Figur in ihrer Ecke hängt.
        'relative flex flex-1 flex-col items-center px-3 pt-[46px] pb-6 sm:px-4',
        // Der Abstand hängt an der Fensterhöhe, nicht an einer festen Zahl:
        // Auf hohen Fenstern darf die Marke Luft haben, auf flachen ist jeder
        // Pixel der Karte lieber gegeben als dem Zwischenraum.
        'gap-[clamp(10px,2vh,26px)] short:gap-2',
        // Auf flachen Fenstern gibt zuerst die Marke nach, dann die
        // Kachelhöhe und das Anzeigenfeld. Gemessen ist der ausgefüllte
        // Zustand: Datei da, Anzeige da, Namensfeld ausgeklappt.
        'short:pt-6 short:pb-3 shorter:pt-4 shorter:pb-2 shortest:pt-2 shortest:pb-1',
      )}
    >
      {/* Die Marke steht allein und mittig. Sie sitzt tiefer über einen
          **bildlichen** Versatz und nicht über Polster: Die Bühne setzt sich
          mit ihren auto-Rändern in den verbleibenden Platz neu mittig, ein
          Pixel Polster oben verschöbe die Karte also um einen halben.

          **Drei Spuren, und es gilt die engste.** Breite und Höhe des
          Fensters begrenzen die Marke unabhängig voneinander: Ein flaches
          Fenster hat wenig Platz über der Karte, ein schmales hat eine hohe
          Karte (die Kacheln stehen dort untereinander) und damit ebenfalls
          wenig. Über zwei Medienabfragen allein ließe sich das nicht sagen —
          die eine gewönne gegen die andere, je nachdem, in welcher
          Reihenfolge Tailwind sie ausgibt, und auf einem schmalen **und**
          flachen Fenster gewönne die falsche. `min()` fragt nicht nach
          Reihenfolge, sondern nimmt den kleinsten Wert.

          Die dritte Spur (`--marke-eng`) ist genau dieses Zusammentreffen:
          schmal **und** flach, gestapelte Kacheln bei 667px Fensterhöhe. Dort
          reicht die Seite ohnehin knapp über den Rand (gemessen 34px, vor
          dieser Marke waren es 40); die Marke soll das nicht verschlimmern
          und tut dort das Gegenteil. Sie steht als eigene Eigenschaft und
          nicht als weitere Stufe von `--marke-hoch`, damit gar nicht erst
          eine Reihenfolge entscheidet.

          Dasselbe für den Versatz: Wie tief die Marke sitzen darf, hängt
          daran, wie viel Luft zwischen ihr und der Karte überhaupt bleibt.
          Seine beiden Breitenstufen sind keine eigenen Zahlen, sondern die
          zwei Stellen, an denen der Aufbau selbst umspringt: Ab 1240px fällt
          der reservierte Platz für die Figur in der Ecke weg (siehe unten),
          und ab 640px stehen die Kacheln nebeneinander statt untereinander.
          Beides gibt der Karte Höhe zurück, und genau diese Höhe ist die
          Luft, in die die Marke hineinrücken darf. Unter 640px bleibt keine;
          dort steht sie, wo der Aufbau sie hinsetzt. */}
      <header className="flex w-full max-w-[780px] items-center justify-center">
        <Wordmark
          className={cn(
            '[--breite:min(var(--marke-quer),var(--marke-hoch),var(--marke-eng))]',
            '[--marke-quer:560px] max-[860px]:[--marke-quer:340px] max-[560px]:[--marke-quer:260px]',
            '[--marke-hoch:560px] short:[--marke-hoch:380px]',
            'shorter:[--marke-hoch:300px] shortest:[--marke-hoch:210px]',
            '[--marke-eng:9999px] max-[640px]:shortest:[--marke-eng:150px]',
            'translate-y-[min(var(--senken-quer),var(--senken-hoch))]',
            '[--senken-quer:64px] max-[1240px]:[--senken-quer:12px] max-[640px]:[--senken-quer:0px]',
            '[--senken-hoch:54px] short:[--senken-hoch:64px]',
            'shorter:[--senken-hoch:50px] shortest:[--senken-hoch:34px]',
          )}
        />
      </header>

      <main className="relative my-auto flex w-full max-w-[780px] flex-col gap-6 short:gap-3 shortest:gap-2">
        {/* Der Zwischenstand als Zettel auf dem Blatt — links der, der die
            linke Kachel füllt, rechts der für die rechte.

            **Nicht auf einer Linie, und nicht auf den Figuren.** Links
            schaut die Spähende über die Kartenkante — sie sitzt in der Mitte
            der linken Seite, also liegt der linke Zettel darüber. Rechts
            wartet die Figur unten, also liegt der rechte Zettel unter der
            Kartenmitte, aber über ihr. Diagonal versetzt, jeder anders
            gekippt; dieselbe Regel wie bei den Figuren.

            Der linke sitzt zusätzlich 48px über der Kartenkante: Bündig mit
            ihr las er sich als angesetzter Teil der Karte, versetzt liegt er
            auf dem Blatt daneben.

            Ab 1300px: 780px Karte plus zweimal Zettel und Abstand. Darunter
            übernimmt die Marke an der Kachel. */}
        {noteRoom && recent.letter !== null && slots.letter.document === null && (
          <RecentDraftNote
            {...recallProps('letter')}
            className="-top-12 right-[calc(100%+34px)] rotate-[-3deg]"
          />
        )}
        {noteRoom && recent.cv !== null && slots.cv.document === null && (
          <RecentDraftNote
            {...recallProps('cv')}
            className="bottom-40 left-[calc(100%+34px)] rotate-[2.5deg]"
          />
        )}

        {/* Sichtbar sagt die Seite ihren Zweck über die Kacheln und den
            Knopf. Für Vorlesesoftware bleibt die Ebene-1-Überschrift
            stehen. */}
        <h1 className="sr-only">{t('routes.start.heading')}</h1>

        {storageUnavailable && (
          // Kein `role="alert"`: Das ist ein dauerhafter Zustand, keine
          // Meldung auf eine Handlung hin.
          <Card variant="subtle" padding="md" className="text-[var(--ink)]">
            <p className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
              {t('start.storageUnavailable')}
            </p>
          </Card>
        )}

        <Card
          variant="raised"
          padding="none"
          className={cn(
            'relative flex flex-col gap-[var(--luecke)] p-6',
            // Der Abstand steht als Eigenschaft da, weil ein zugeklappter
            // Bereich ihn zurückgeben muss: Eine Hülle ohne Höhe erzeugt
            // trotzdem eine Lücke, und die stünde sonst dauerhaft in der
            // leeren Karte.
            '[--luecke:16px] short:[--luecke:12px] shorter:[--luecke:8px] shortest:[--luecke:6px]',
            'short:p-4 shorter:p-3 shortest:p-2.5',
          )}
        >
          {/* Schaut um die linke Kante der Karte herum. Ihre Vorlage bringt
              eine eigene Mauer mit, einen Senkrechtstrich; der ist beim
              Zuschnitt entfernt worden, damit die Kante der Karte die Mauer
              ist — so stimmt es auch im Dunkelmodus, wo die Kontur nicht
              schwarz ist. In der Datei sitzt die Kante bei 90,57 % der
              Breite; die 1,5px sind die halbe Konturstärke, weil `left: 0`
              die Innenkante meint.

              Unter 1100px ist links von der Karte kein Platz mehr für sie:
              Bei 780px Karte und 150px Figur bräuchte es 1112px Fenster. */}
          <Figure
            pose="spaehen"
            className={cn(
              'z-[2] hidden [--breite:150px] w-[var(--breite)]',
              'top-[128px] left-[calc(var(--breite)*-0.9057-1.5px)]',
              'min-[1100px]:block',
            )}
          />

          {/* Zwei Kacheln, gleich groß, leicht gegeneinander verdreht.
              `auto-rows-fr` gibt beiden Zeilen dieselbe Höhe — nebeneinander
              ergibt sich das von selbst, untereinander nicht: Dort steht jede
              Kachel in ihrer eigenen Zeile, und die geladene wäre die
              kürzere.

              **In diesem Raster stehen nur die Kacheln.** Alles, was zu einer
              Unterlage zu sagen ist — der Beta-Hinweis einer PDF-Umwandlung,
              der Arbeitsumfang —, steht im Raster darunter. Läge es in
              derselben Zelle, nähme es der Kachel die Höhe weg, die es selbst
              braucht: Die geladene Kachel schrumpfte um genau so viel, wie
              ihr Anhang hoch ist, und stünde neben einer leeren, die doppelt
              so groß ist. */}
          {/* `[grid-auto-rows:1fr]` und **nicht** Tailwinds `auto-rows-fr`:
              Das erzeugt `minmax(0, 1fr)`, setzt die Mindesthöhe der Zeile
              also ausdrücklich auf null — die Zeile nahm damit die Höhe der
              *niedrigeren* Kachel an, und die höhere ragte darüber hinaus.
              `1fr` allein bedeutet `minmax(auto, 1fr)` und ist genau das,
              was die Attrappe führt. */}
          <div className="grid [grid-auto-rows:1fr] grid-cols-1 gap-5 short:gap-3 shortest:gap-2 sm:grid-cols-2">
            {SLOTS.map((slot, index) => {
              const state = slots[slot]
              return (
                <DocumentTile
                  key={slot}
                  label={t(`start.files.${slot}`)}
                  // Was nötig ist und was nicht, sagt die Marke „Optional"
                  // an der Kachel und sonst nichts.
                  flag={slot === 'cv' ? t('start.files.optional') : undefined}
                  tilt={index === 0 ? 'left' : 'right'}
                  accept=".docx,.pdf"
                  document={state.document}
                  busy={state.busy}
                  error={state.error === null ? undefined : t(`start.files.errors.${state.error}`)}
                  onSelect={(file) => void handleSelect(slot, file)}
                  onClear={() => handleClear(slot)}
                  // Der Rückfall für schmale Fenster: Was als Zettel neben der
                  // Karte läge, liegt hier in der Kachel, die es füllen würde.
                  overlay={
                    recent[slot] === null || noteRoom ? undefined : (
                      <RecentDraftChip {...recallProps(slot)} />
                    )
                  }
                />
              )
            })}
          </div>

          {/* Was zu einer abgelegten Unterlage zu sagen ist, steht unter
              ihrer Kachel — in einem Raster mit denselben Spalten, damit die
              Zuordnung über die Spalte läuft und nicht über einen Pfeil.
              Solange nichts abgelegt ist, ist die Zeile leer und fällt in
              sich zusammen. */}
          <Collapse
            open={hasDocument}
            // Zugeklappt gibt die Hülle auch die Lücke zurück, die der
            // Spaltenabstand um sie legt — sonst wäre die leere Karte um
            // genau diesen Abstand höher als vorher.
            className="data-[open=false]:-mb-[var(--luecke)]"
          >
            <div className="grid [grid-auto-rows:1fr] grid-cols-1 gap-5 short:gap-3 shortest:gap-2 sm:grid-cols-2">
              {SLOTS.map((slot) => {
                const state = slots[slot]
                if (state.document === null) return <div key={slot} />
                return (
                  <div key={slot} className="flex flex-col gap-2">
                    {state.document.source === 'pdf' && (
                      <Card variant="subtle" padding="sm" className="text-[var(--ink)]">
                        <p className="text-[length:var(--text-caption-size)] leading-[var(--text-caption-leading)]">
                          {t('start.pdf.beta')}
                        </p>
                        {/* Zusätzlich, nicht ersatzweise: Der Beta-Hinweis
                            gilt für jede PDF-Eingabe, die Warnung zur
                            Mehrspaltigkeit kommt oben drauf, wenn
                            `detectMultiColumn` angeschlagen hat. */}
                        {state.document.multiColumn && (
                          <p className="mt-2 text-[length:var(--text-caption-size)] leading-[var(--text-caption-leading)] font-medium text-[var(--error)]">
                            {t('start.pdf.multiColumn')}
                          </p>
                        )}
                      </Card>
                    )}
                    {/* Der Arbeitsumfang, unmittelbar unter der Unterlage, auf
                        die er sich bezieht — nicht als eigene Frage weiter
                        unten. Wer die Datei ablegt, entscheidet im selben
                        Blick, ob sie angepasst werden soll. */}
                    <div className="flex items-start gap-2 px-1">
                      <Checkbox
                        id={`${fieldPrefix}-scope-${slot}`}
                        checked={scope[slot]}
                        disabled={!isAdjustable(state.document)}
                        onCheckedChange={(next) =>
                          setScope((current) => ({ ...current, [slot]: next === true }))
                        }
                        className="mt-0.5"
                      />
                      {/* Nur die Beschriftung. Der erklärende Satz stand
                          dauerhaft darunter und beschrieb einen Zustand, der
                          gerade nicht eintritt — dieselbe Regel wie am
                          Anonymisierungsschalter der Einstellungen: Die
                          Erklärung erscheint, wenn etwas **nicht** geht,
                          nicht wenn alles seinen Gang geht. */}
                      <label
                        htmlFor={`${fieldPrefix}-scope-${slot}`}
                        className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--ink)]"
                      >
                        {t('start.scope.label')}
                        {!isAdjustable(state.document) && (
                          <span className={cn('block', FIELD_HINT_CLASS)}>
                            {t('start.scope.blocked')}
                          </span>
                        )}
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </Collapse>

          {/* Die Anzeige. Beschriftung, Feld, ein Nebenknopf für PDF —
              derselbe Aufbau wie an jedem Feld, nur mit dem Knopf in der
              Beschriftungszeile statt darunter: Er gehört zum Feld und nicht
              zu dem, was danach kommt. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <label
                htmlFor={`${fieldPrefix}-job-ad-text`}
                className="font-display text-[length:var(--text-heading-size)] font-semibold text-[var(--ink-strong)]"
              >
                {t('start.jobAd.heading')}
              </label>
              <div className="flex items-center gap-3">
                {jobAdBusy && (
                  <p role="status" className="text-[length:var(--text-caption-size)] text-[var(--muted)]">
                    {t('start.jobAd.reading')}
                  </p>
                )}
                {/* Dasselbe Muster wie an der Ablegekachel: verstecktes
                    Dateifeld, ein Knopf davor. Das native Feld brächte seine
                    eigene, in jedem Browser andere Beschriftung („Keine Datei
                    ausgewählt") mit und wäre das einzige Bedienelement der
                    Seite, das nicht wie die übrigen aussieht. */}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={jobAdBusy}
                  aria-label={t('start.jobAd.pdfAria')}
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
                    // Zurücksetzen, damit dieselbe Datei erneut gewählt
                    // werden kann.
                    event.target.value = ''
                  }}
                />
              </div>
            </div>
            <Textarea
              id={`${fieldPrefix}-job-ad-text`}
              value={jobAdText}
              // Kein `rows`: Die Höhe steht als `min-h` am Primitiv und wird
              // auf flachen Fenstern stufenweise kleiner. Ein `rows`-Wert
              // schlüge das und machte das Feld auf jedem Fenster gleich
              // hoch — genau das, was die Höhenstufen verhindern sollen.
              placeholder={t('start.jobAd.placeholder')}
              aria-invalid={jobAdError !== null}
              aria-describedby={jobAdError === null ? undefined : `${fieldPrefix}-job-ad-error`}
              onChange={(event) => setJobAdText(event.target.value)}
              className="short:min-h-28 shorter:min-h-22 shortest:min-h-12"
            />
            {jobAdError !== null && (
              <p
                id={`${fieldPrefix}-job-ad-error`}
                role="alert"
                className="px-1 text-[length:var(--text-caption-size)] leading-[var(--text-caption-leading)] font-medium text-[var(--error)]"
              >
                {t(`start.files.errors.${jobAdError}`)}
              </p>
            )}
            {duplicates.length > 0 && (
              <Card variant="subtle" padding="md" className="mt-1 text-[var(--ink)]">
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
          </div>

          {/* Der Name wird erst gefragt, wenn eine Unterlage daliegt: vorher
              gäbe es nichts, worauf er sich bezöge. Das Feld klappt auf und
              wieder zu, damit die Karte in keiner Richtung springt. Hier ohne
              den Ausgleich für die Lücke: Das Feld stand schon vorher als
              höhenlose Hülle da, und die leere Karte ist mit dieser Lücke
              abgenommen. */}
          <Collapse open={hasDocument}>
            <Field
              id={`${fieldPrefix}-user-name`}
              label={t('start.name.label')}
              hint={nameFromDocument ? t('start.name.detected') : t('start.name.hint')}
              className="px-1"
            >
              {(control) => (
                <Input
                  {...control}
                  value={userName}
                  autoComplete="name"
                  className="shortest:py-2"
                  onChange={(event) => {
                    setUserName(event.target.value)
                    setNameFromDocument(false)
                  }}
                />
              )}
            </Field>
          </Collapse>

          {/* Der Weiter-Knopf steht **in** der Karte, am Ende ihrer Reihe und
              rechts ausgerichtet: Er ist der Abschluss dessen, was darüber
              ausgefüllt wird, und der Pfeil zeigt aus der Karte hinaus.

              Links davon steht, was noch fehlt. Ein gesperrter Knopf nimmt
              keine Zeigerereignisse an und kann deshalb nichts erklären
              (siehe DESIGN.md, Tooltip) — und die Farbe der Kacheln sagt es
              zwar, aber eben nur dem, der sie sieht. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-1">
            {/* Die Bewerbungsliste ist Nachschlagewerk, kein Arbeitsschritt. */}
            <Dialog open={applicationsOpen} onOpenChange={setApplicationsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  {t('start.applications.open', { count: applications.length })}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>{t('start.applications.heading')}</DialogTitle>
                {applications.length === 0 ? (
                  <DialogDescription>{t('start.applications.empty')}</DialogDescription>
                ) : (
                  <div className="mt-4 -mx-2 overflow-x-auto px-2"><table className="w-full border-collapse text-left text-[length:var(--text-body-sm-size)]">
                    <thead>
                      <tr className="border-b-2 border-[var(--line-soft)]">
                        <th scope="col" className="py-2 pr-4 font-display font-semibold">
                          {t('start.applications.company')}
                        </th>
                        <th scope="col" className="py-2 pr-4 font-display font-semibold">
                          {t('start.applications.position')}
                        </th>
                        <th scope="col" className="py-2 font-display font-semibold">
                          {t('start.applications.date')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((application) => (
                        <tr
                          key={application.id}
                          className="border-b-2 border-[var(--line-soft)] last:border-b-0"
                        >
                          <td className="py-2 pr-4">{application.company}</td>
                          <td className="py-2 pr-4">{application.position}</td>
                          <td className="py-2">
                            {formatDate(application.date, i18n.resolvedLanguage ?? 'de')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </DialogContent>
            </Dialog>

            {missing.length > 0 && (
              // **Sichtbar sagt es die Seite selbst:** Die leere Kachel ist
              // tangerine, das Anzeigenfeld ist leer, der Knopf ist grau. Eine
              // Liste daneben schriebe dasselbe ein zweites Mal in Worte.
              //
              // Für den Vorleser gibt es diese zweite Auskunft trotzdem — ihm
              // sagt keine Farbe etwas. Sie steht unmittelbar **vor** dem
              // Knopf und nicht als `aria-describedby` an ihm: Ein gesperrter
              // Knopf nimmt keinen Fokus an, seine Beschreibung würde also nie
              // angesagt.
              <p className="sr-only">
                {`${t('start.missing.heading')} ${missing.join(', ')}`}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              className={cn('w-full sm:ms-auto sm:w-auto', ready && 'motion-safe:animate-pop')}
              disabled={missing.length > 0 || busy}
              onClick={() => void handleContinue()}
            >
              {t('start.continue')}
              <ArrowUpIcon className="size-[17px] rotate-90" />
            </Button>
          </div>
        </Card>
      </main>

      {/* Platz für die Figur in der Ecke.

          Solange das Fenster breit genug ist, dass die Karte gar nicht bis
          dorthin reicht — ab 1240px —, braucht es keinen. Darunter läge sie
          sonst über der Karte und im schlimmsten Fall über dem Weiter-Knopf.

          **Als eigener Kasten und nicht als Polster an der Hülle**: Die
          Polsterung der Hülle wird von den Höhenstufen übersteuert (sie
          stehen nach den Breitenstufen und gewinnen gegen sie), und auf
          einem schmalen, flachen Fenster fiel der Platz damit genau dann
          weg, wenn er am nötigsten war. */}
      <div aria-hidden="true" className="h-[206px] shrink-0 max-[860px]:h-[136px] max-[480px]:h-[96px] min-[1240px]:hidden" />

      {/* Sie tut, was der Nutzer tut: warten. Sie liest, solange etwas fehlt,
          und springt auf, sobald alles beisammen ist — dasselbe, was der
          freigeschaltete Knopf daneben sagt, nur einen Wimpernschlag früher
          und in der Sprache des Hauses. Weil sie nichts Eigenes sagt, ist sie
          für den Vorleser nicht da.

          Beide Fassungen liegen übereinander und stehen auf derselben Linie;
          der Kasten ist so breit wie die breitere von beiden, damit beim
          Wechsel nichts verrutscht. Dass der Kopf dabei nach oben springt,
          macht die Zeichnung von allein: die eine sitzt, die andere steht. */}
      <div
        aria-hidden="true"
        data-testid="buddy"
        className="pointer-events-none absolute right-[clamp(8px,3vw,54px)] bottom-4 h-[190px] w-[168px] max-[860px]:h-[120px] max-[860px]:w-[106px]"
      >
        <Figure
          pose="warten"
          className={cn(
            'bottom-0 left-1/2 h-full w-auto origin-bottom -translate-x-1/2',
            ready && 'opacity-0',
          )}
        />
        <Figure
          pose="jubeln"
          className={cn(
            'bottom-0 left-1/2 h-full w-auto origin-bottom -translate-x-1/2',
            ready ? 'opacity-100 motion-safe:animate-aufspringen' : 'opacity-0',
          )}
        />
      </div>
    </div>
  )
}
