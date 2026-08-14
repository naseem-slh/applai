import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { VaultLockedError } from '@/components/app/aiErrorKey'
import {
  CV_DRAFT_ID,
  LETTER_DRAFT_ID,
  useApp,
  type StartSession,
} from '@/components/app/appContext'
import { CvStyleProfilePanel } from '@/components/editor/CvStyleProfilePanel'
import { DocumentColumn } from '@/components/editor/DocumentColumn'
import { DocumentSwitch, type DocumentKind } from '@/components/editor/DocumentSwitch'
import { ExportBar, type ExportDocument } from '@/components/editor/ExportBar'
import { GapList } from '@/components/editor/GapList'
import { LanguagePrompt } from '@/components/editor/LanguagePrompt'
import { LetterheadPanel } from '@/components/editor/LetterheadPanel'
import { applyLetterhead, type LetterheadApplication } from '@/components/editor/letterheadApply'
import { MarkPanel } from '@/components/editor/MarkPanel'
import { ProofreadingPanel } from '@/components/editor/ProofreadingPanel'
import { StyleProfilePanel } from '@/components/editor/StyleProfilePanel'
import { TruthModeSwitch } from '@/components/editor/TruthModeSwitch'
import type { EditorSelection } from '@/components/editor/documentSelection'
import { findForeignCompanies } from '@/components/editor/foreignCompanies'
import { ReapplyDialog } from '@/components/editor/ReapplyDialog'
import { ReapplyStatus } from '@/components/editor/ReapplyStatus'
import { useReapply, type ReapplyDocument } from '@/components/editor/useReapply'
import {
  buildRewriteRequest,
  CV_DEFAULT_SLIDERS,
  defaultSliders,
  factsFrom,
  type RewriteSliders,
} from '@/components/editor/rewriteRequest'
import { useDocumentWorkspace } from '@/components/editor/useDocumentWorkspace'
import { useGapAnalysis } from '@/components/editor/useGapAnalysis'
import { useApplicationAnalysis } from '@/components/editor/useApplicationAnalysis'
import { usePrecisePointer } from '@/components/editor/usePrecisePointer'
import { useWideViewport } from '@/components/editor/useWideViewport'
import { clampZoom } from '@/components/editor/zoom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { providerFor, withSignal } from '@/lib/ai/provider'
import { isoDate } from '@/lib/export/docx'
import type { JobAd } from '@/lib/domain/jobAd'
import { detectLanguage } from '@/lib/domain/language'
import { suggestLetterhead, type Letterhead } from '@/lib/domain/letterhead'
import { rewriteSelection, type RewriteDocument, type Variant } from '@/lib/domain/rewrite'
import type { CvStyleProfile } from '@/lib/domain/cvStyleProfile'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import type { TruthMode } from '@/lib/storage/adapter'
import { textFingerprint } from '@/lib/text/fingerprint'
import { cn } from '@/lib/utils'

/**
 * Die Arbeitsfläche — die **Schale** der Bewerbung.
 *
 * Sie hält, was für die ganze Bewerbung gilt und es genau einmal gibt:
 *
 * - `useApplicationAnalysis` liest beim Betreten einmal die Stellenanzeige und
 *   das Stilprofil (14b) — beides braucht `rewriteSelection` als Pflichtfeld.
 * - `useGapAnalysis` füllt die Lückenliste, `findForeignCompanies` die
 *   Fremdfirmen-Warnung, `TruthModeSwitch` verschiebt die Wahrheitsgrenze.
 * - Der Briefkopf: Vorschlag, selbsttätige Übernahme, Bericht. Er hängt an
 *   der Anzeige und an der Liste früherer Firmen, also an der Bewerbung.
 * - Export, Bewerbungseintrag und der Durchlauf für die nächste
 *   Ausschreibung.
 *
 * Was **ein Dokument** für sich hat — Verlauf, Markierung, vorgemerkte
 * Stellen, Entwurf, unbelegte Aussagen und der eine Weg, auf dem sich sein
 * Text ändert — liegt in `useDocumentWorkspace`. Die Schale ruft ihn je
 * Dokument einmal auf; die Begründung für diese Richtung steht dort.
 *
 * **Der Modellaufruf wird hier zusammengesetzt, nicht in der Überlagerung.**
 * `VariantPopover` bekommt eine fertige Funktion und kennt weder Anbieter
 * noch Schlüssel noch Anonymisierung; hier laufen Sitzung, Einstellungen und
 * Tresor ohnehin zusammen. Aus demselben Grund liegt das Stilprofil hier und
 * nicht im Dokument-Haken: Brief und Lebenslauf haben verschiedene Profile
 * mit verschiedenen Typen.
 *
 * Kein eigenes `<main>`: Das steht einmal in `AppLayout` um den `<Outlet />`.
 */

export default function Editor() {
  const { session } = useApp()

  // `/editor` liegt hinter `RequireSession` (siehe `App.tsx`): Ohne
  // Übergabestand wird umgeleitet, bevor diese Ansicht rendert. Der
  // Compiler kennt diesen Wächter nicht, deshalb steht die Frage hier
  // trotzdem. Beantwortet wird sie mit derselben Umleitung, nicht mit einem
  // nachgebauten Leerzustand: Ein erfundenes `StartSession` hätte einen
  // leeren `userName`, und genau das verbietet Übergabe 1 (siehe
  // `appContext.ts`).
  if (session === null) return <Navigate to="/" replace />
  return <EditorWorkspace session={session} />
}

/**
 * Was als **Beta** gekennzeichnet ist.
 *
 * Der Lebenslauf ist der jüngste Teil der Anwendung: Sein Stilprofil, sein
 * Prompt und die Faktenprüfung haben noch keine Bewerbungssaison hinter
 * sich. Gekennzeichnet wird deshalb nach demselben Muster wie die
 * PDF-Umwandlung (`docs/spec.md`): sichtbare Marke am Reiter, dazu ein
 * Prüfhinweis über dem Blatt. **Gesperrt wird nichts** — eine Beta, die man
 * nicht benutzen kann, erzeugt keine Erfahrung, aus der sie herauswachsen
 * könnte.
 */
const BETA_DOCUMENTS: readonly DocumentKind[] = ['cv']

function EditorWorkspace({ session }: { session: StartSession }) {
  const { t } = useTranslation()
  const { storage, keyVault, settings, updateSettings, setSession } = useApp()
  const headingId = useId()
  const claimsHeadingId = useId()

  const precise = usePrecisePointer()
  // Nur für den Anfangszustand der aufklappbaren Bereiche, siehe dort.
  const wide = useWideViewport()

  /**
   * Der Arbeitsumfang, geprüft: Haken **und** vorhandenes Dokument. Der
   * Haken allein genügt nicht — eine Sitzung, die aus einer Sicherungsdatei
   * oder einem Test stammt, kann ihn tragen, ohne dass die Unterlage
   * dabeiliegt (siehe `StartSession.scope`).
   */
  const letter = session.scope.letter ? session.letter : null
  const cv = session.scope.cv ? session.cv : null

  /**
   * Fingerabdruck der aktuellen Stellenanzeige (`textFingerprint`,
   * `lib/text/fingerprint.ts`), über den rohen Anzeigentext — bewusst NICHT
   * über `analysisCacheKey` (Art + Modell + Text): Ein Wechsel des
   * Anbieters oder Modells ändert nicht, welche ANZEIGE das ist, und genau
   * die Anzeige ist die Einheit, „je Stellenanzeige" (Schaden 2, siehe der
   * ausführliche Kommentar am Übernahme-Effekt weiter unten). Berechnet
   * unabhängig von der eigentlichen Auswertung — sie liegt lange vor dem
   * ersten Modellaufruf vor, kostet also keine spürbare Verzögerung.
   */
  const [jobAdFingerprint, setJobAdFingerprint] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void textFingerprint(session.jobAdText).then((fingerprint) => {
      if (!cancelled) setJobAdFingerprint(fingerprint)
    })
    return () => {
      cancelled = true
    }
  }, [session.jobAdText])

  /**
   * Die Kennung der Anzeige, für die die selbsttätige Briefkopf-Übernahme
   * zuletzt gelaufen ist — die Sperre ÜBER SITZUNGEN HINWEG (Schaden 2).
   * Beginnt mit dem Wert aus einem fortgesetzten Entwurf, falls vorhanden
   * (`Draft.letterheadAppliedFor`, über `session.letter` gereicht, siehe
   * `Start.handleUseRecent`); `useDraftAutosave` schreibt jede spätere
   * Änderung in den Entwurf zurück, unabhängig davon, ob sich dabei auch
   * der Dokumentinhalt ändert (siehe dort).
   */
  const [appliedForFingerprint, setAppliedForFingerprint] = useState<string | null>(
    session.letter?.letterheadAppliedFor ?? null,
  )

  const letterWorkspace = useDocumentWorkspace({
    kind: 'letter',
    draftId: LETTER_DRAFT_ID,
    source: letter,
    storage,
    precise,
    keepMarks: settings.keepMarks === true,
    letterheadAppliedFor: appliedForFingerprint,
  })

  const cvWorkspace = useDocumentWorkspace({
    kind: 'cv',
    draftId: CV_DRAFT_ID,
    source: cv,
    storage,
    precise,
    keepMarks: settings.keepMarks === true,
  })

  /**
   * Welches Dokument gerade auf dem Tisch liegt.
   *
   * Beide bleiben eingehängt — der ruhende nur verborgen, siehe unten. Ein
   * Wechsel darf weder den Rückgängig-Verlauf noch die vorgemerkten Stellen
   * verwerfen, und ein Neuaufbau parste das `word/document.xml` jedes Mal
   * neu.
   */
  const available = useMemo<DocumentKind[]>(
    () => [letter === null ? null : ('letter' as const), cv === null ? null : ('cv' as const)]
      .filter((kind): kind is DocumentKind => kind !== null),
    [letter, cv],
  )
  const [active, setActive] = useState<DocumentKind>(() => (letter === null ? 'cv' : 'letter'))
  const activeKind: DocumentKind = available.includes(active) ? active : (available[0] ?? 'letter')
  const activeWorkspace = activeKind === 'cv' ? cvWorkspace : letterWorkspace

  const docx = letterWorkspace.document
  const marks = letterWorkspace.marks

  // Der Anbieter kommt aus dem Tresor, nicht aus den Einstellungen: Er
  // gehört zum Schlüssel (ein Gemini-Schlüssel spricht nicht mit OpenAI),
  // und `Settings.provider` führt ihn nur mit, damit er in der
  // Sicherungsdatei steht (siehe `Settings.tsx`).
  const vaultProvider = keyVault.vault?.getProvider() ?? null
  const apiKey = keyVault.vault?.getKey() ?? null
  // Das Modell kommt aus den Einstellungen, der Anbieter aus dem Tresor.
  // `useMemo`, weil `providerFor` bei jedem Aufruf ein neues Objekt baut und
  // die Auswertung an der Identität des Anbieters hängt.
  const chosenChain = settings.modelChain?.[vaultProvider ?? 'gemini']
  const provider = useMemo(
    () => (vaultProvider === null ? null : providerFor(vaultProvider, chosenChain)),
    [vaultProvider, chosenChain],
  )

  const privacy = useMemo(
    () => ({ enabled: settings.anonymize, userName: session.userName }),
    [settings.anonymize, session.userName],
  )

  const analysis = useApplicationAnalysis({
    jobAdText: session.jobAdText,
    // `null`, nicht `''`: Was nicht im Arbeitsumfang liegt, wird gar nicht
    // erst ausgewertet. Ein Stilprofil des leeren Textes kostete eine
    // Anfrage und beschriebe nichts.
    letterText: letter?.text ?? null,
    cvText: cv?.text ?? null,
    provider,
    apiKey,
    privacy,
    storage,
  })

  /**
   * Die Sprache des vorhandenen Anschreibens, deterministisch erkannt
   * (Aufgabe 9, kein Modellaufruf). Gemessen wird am **hochgeladenen** Text,
   * nicht am Arbeitsstand: Sonst könnte eine einzelne übersetzte Textstelle
   * die erkannte Sprache des ganzen Briefes kippen und damit die
   * Zielsprache für alles Weitere.
   */
  const letterLanguage = useMemo<'de' | 'en'>(
    () => detectLanguage(letter?.text ?? cv?.text ?? ''),
    [letter, cv],
  )

  /**
   * Die Zielsprache der Umformulierung.
   *
   * `docs/spec.md`: „Zielsprache = Sprache der Anzeige. **Nachfrage nur bei
   * Abweichung.**" Beides steckt in diesen zwei Zuständen: Angefangen wird
   * bei der Sprache des Briefes (dabei bleibt es, solange die Anzeige
   * dieselbe hat), und weicht die Anzeige ab, entscheidet der Nutzer einmal
   * im Dialog. Bis er entschieden hat, wird nichts übersetzt.
   */
  const [targetLanguage, setTargetLanguage] = useState<'de' | 'en' | null>(null)
  const [languageAsked, setLanguageAsked] = useState(false)

  const adLanguage = analysis.jobAd?.language ?? null
  const languageDiffers = adLanguage !== null && adLanguage !== letterLanguage
  const askingLanguage = languageDiffers && !languageAsked

  useEffect(() => {
    // Stimmen die Sprachen überein, ist die Frage beantwortet, ohne dass sie
    // gestellt wurde — der Regelfall darf nichts verlangen.
    if (adLanguage !== null && !languageDiffers) setTargetLanguage(letterLanguage)
  }, [adLanguage, languageDiffers, letterLanguage])

  /**
   * Die Faktenbasis: hochgeladener Lebenslauf und hochgeladenes Anschreiben.
   *
   * **Immer beide, unabhängig vom Arbeitsumfang** — und immer der
   * hochgeladene Stand, nie der laufende. Eine Unterlage, die nicht angepasst
   * wird, bleibt Faktenquelle; genau dafür ist sie da. Und der laufende Stand
   * schlösse eine Schleife: Eine im freien Modus erfundene Zeile im
   * Lebenslauf würde zum Beleg für den nächsten Satz im Anschreiben, und G10
   * wäre über einen Umweg ausgehebelt, den niemand sieht.
   */
  const facts = useMemo(
    () => factsFrom({ cv: session.cv?.text ?? null, letter: session.letter?.text ?? null }),
    [session.cv, session.letter],
  )

  /**
   * Das korrigierte Stilprofil und die Reglerstellung.
   *
   * Beide beginnen bei dem, was die Auswertung geliefert hat, und gehören ab
   * dann dem Nutzer: `StyleProfilePanel` schreibt hier hinein, und
   * `buildRewriteRequest` liest von hier, nicht mehr aus `analysis`. Die
   * Übernahme läuft über einen Effekt und nicht über einen Anfangswert, weil
   * die Auswertung erst nach dem ersten Rendern ankommt.
   */
  const [style, setStyle] = useState<StyleProfile | null>(null)
  const [sliders, setSliders] = useState<RewriteSliders | null>(null)

  const derivedStyle = analysis.style
  useEffect(() => {
    if (derivedStyle === null) return
    setStyle(derivedStyle)
    setSliders(defaultSliders(derivedStyle))
  }, [derivedStyle])

  /**
   * Dasselbe für den Lebenslauf. Ein eigenes Paar Zustände statt eines
   * gemeinsamen: Die beiden Profile teilen kein einziges Feld (siehe
   * `RewriteDocument`), und ein Umschalten dürfte die Korrekturen am jeweils
   * anderen nicht verwerfen.
   */
  const [cvStyle, setCvStyle] = useState<CvStyleProfile | null>(null)
  const [cvSliders, setCvSliders] = useState<RewriteSliders>(CV_DEFAULT_SLIDERS)

  const derivedCvStyle = analysis.cvStyle
  useEffect(() => {
    if (derivedCvStyle === null) return
    setCvStyle(derivedCvStyle)
    setCvSliders(CV_DEFAULT_SLIDERS)
  }, [derivedCvStyle])

  /**
   * Der Briefkopfvorschlag (Aufgabe 12, ohne KI). `today` entsteht einmal je
   * Auswertung; ein bei jedem Rendern neues `new Date()` würde den Vorschlag
   * unaufhörlich neu berechnen und die Korrekturen des Nutzers überschreiben.
   *
   * Ein Wechsel der Oberflächensprache erzeugt den Vorschlag dagegen
   * absichtlich neu: Datum und Betreff sind sprachabhängig, und ein
   * deutscher Betreff in einer englischen Oberfläche wäre das falschere
   * Ergebnis als eine verlorene Korrektur — die Wahl trifft der Nutzer
   * bewusst, mitten in der Arbeit am Brief so gut wie nie.
   */
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null)
  /**
   * Zu welcher `jobAd` der aktuelle `letterhead`-Stand gehört — eigener
   * Zustand statt eines Refs, damit er sich mit `letterhead` in **demselben**
   * Rendervorgang aktualisiert (React fasst beide `setState`-Aufrufe im
   * Effekt unten zu einem einzigen Nachrendern zusammen). Ein Ref wäre hier
   * zu schnell: Er änderte sich schon im selben Durchlauf, in dem dieser
   * Effekt läuft, während `letterhead` selbst erst beim nächsten Rendern den
   * neuen Vorschlag trüge — die Übernahme unten läse dann eine `jobAd`, die
   * nicht mehr zu ihrem `letterhead` passt.
   */
  const [letterheadFor, setLetterheadFor] = useState<JobAd | null>(null)

  const { jobAd } = analysis
  const uiLanguage = settings.uiLanguage
  useEffect(() => {
    if (jobAd === null) return
    setLetterhead(suggestLetterhead(jobAd, uiLanguage, new Date()))
    setLetterheadFor(jobAd)
  }, [jobAd, uiLanguage])

  /**
   * Die Fremdfirmen-Warnung, am **laufenden** Dokumentstand: Sie soll
   * verschwinden, sobald der Name berichtigt ist.
   */
  const [knownCompanies, setKnownCompanies] = useState<string[]>([])
  // Abgeschlossen, gleich ob mit oder ohne Ergebnis: Die selbsttätige
  // Übernahme des Briefkopfs wartet darauf, sonst fände sie nie einen
  // Empfänger — siehe der Effekt weiter unten.
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    void storage
      .listApplications()
      .then((applications) => {
        if (!cancelled) {
          setKnownCompanies(applications.map((entry) => entry.company))
          setCompaniesLoaded(true)
        }
      })
      .catch(() => {
        // Ein nicht erreichbarer Speicher ist bereits über
        // `storageUnavailable` sichtbar (siehe `AppProvider`). Ohne Liste
        // gibt es hier schlicht nichts zu warnen — geladen ist der Zustand
        // trotzdem, sonst bliebe die selbsttätige Übernahme für immer aus.
        if (!cancelled) setCompaniesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage])

  /**
   * Die selbsttätige Übernahme des Briefkopfs.
   *
   * **Einmal je Stellenanzeige**, nicht einmal überhaupt: Der Ref merkt sich
   * die `jobAd`, für die bereits übernommen wurde. Analysiert der Nutzer zu
   * demselben Brief eine zweite Anzeige, soll erneut übernommen werden —
   * dann steht im Briefkopf ja die vorige Firma und er ist selbst der alte
   * Briefkopf geworden. Dass `docx`, `marks` und `letterhead` in der
   * Abhängigkeitsliste stehen, ist unschädlich: Der Ref-Vergleich lässt den
   * Rumpf je Anzeige nur einmal durchlaufen, und dann mit den Werten dieses
   * Rendervorgangs.
   *
   * Gewartet wird auf `companiesLoaded`: Ohne die Liste früherer Firmen gibt
   * es keinen Anker für den Empfänger, und ein zu früher Lauf fände ihn nie.
   *
   * **Und auf `letterheadFor`**: Der Vorschlagseffekt oben setzt `letterhead`
   * und `letterheadFor` zusammen, aber erst beim **nächsten** Rendern. Ändert
   * sich `jobAd`, läuft dieser Effekt schon einmal mit der neuen `jobAd` und
   * dem noch alten `letterhead` — ohne die Wache würde der veraltete
   * Briefkopf (samt alter Firma) übernommen, und der Ref oben markierte die
   * neue Anzeige fälschlich als erledigt, sodass der richtige Briefkopf nie
   * mehr zum Zug käme.
   *
   * **„Einmal je Anzeige" über zwei Sperren, für zwei verschiedene Fälle.**
   * `appliedFor` (der Ref) ist die Sperre INNERHALB einer Sitzung — sie
   * genügt so lange, wie die Komponente lebt: Analysiert der Nutzer zu
   * demselben Brief eine zweite Anzeige, ändert sich `jobAd`, der
   * Ref-Vergleich schlägt fehl, und die Übernahme läuft (bewusst) erneut.
   *
   * Ein Ref stirbt aber mit der Komponente. Über „zuletzt bearbeitet"
   * (`Start.handleUseRecent`) lädt die Anwendung `draft.docxBase` — den
   * Arbeitsstand einer VORIGEN Sitzung, in dem der Briefkopf für die
   * damalige Anzeige schon steht — in eine NEU gemountete Arbeitsfläche,
   * mit einem frischen, leeren `appliedFor`. Ohne weitere Sperre liefe die
   * Übernahme deshalb ein zweites Mal.
   *
   * Ein zu grobes Gegenmittel wäre, die Übernahme für JEDEN fortgesetzten
   * Entwurf ganz auszulassen (`LoadedDocument.source === 'draft'`) — das
   * verhindert zwar das Überschreiben, verhindert aber auch den Hauptfall,
   * für den die Anwendung gebaut ist: gestriges Anschreiben fortsetzen,
   * eine NEUE Stellenanzeige einfügen. Dort sollen Empfänger, Datum und
   * Betreff sehr wohl automatisch einziehen.
   *
   * Die tatsächliche Sperre ÜBER SITZUNGEN HINWEG ist deshalb feiner: die
   * Kennung der Anzeige selbst (`jobAdFingerprint`, `textFingerprint` des
   * rohen Anzeigentexts, oben berechnet), abgeglichen mit
   * `appliedForFingerprint` — dessen Anfangswert aus
   * `Draft.letterheadAppliedFor` stammt (`Start.handleUseRecent` reicht ihn
   * über `session.letter.letterheadAppliedFor` durch, `useDraftAutosave`
   * schreibt jede Änderung zurück). „Dieselbe Anzeige wie beim letzten Mal"
   * heißt: keine zweite Übernahme. „Andere (oder noch nie erfasste)
   * Anzeige" heißt: Übernahme läuft, wie beim ersten Mal.
   *
   * Ein reiner Text-Vergleich je Feld (Befund 4, `letterheadApply.ts` —
   * überspringt Treffer, deren `previous` bereits zeichengleich mit dem
   * neuen Wert ist) wurde erwogen und bleibt zusätzlich bestehen, reicht
   * aber allein nicht: Er fängt nur den Fall, in dem der neue Vorschlag
   * zufällig mit dem alten übereinstimmt, nicht den Fall einer bewussten
   * Handkorrektur, die vom neuen Vorschlag abweicht — genau die würde ein
   * reiner Text-Vergleich weiterhin überschreiben.
   */
  const appliedFor = useRef<JobAd | null>(null)
  const [application, setApplication] = useState<LetterheadApplication | null>(null)
  const commit = letterWorkspace.commit
  useEffect(() => {
    if (docx === null || jobAd === null || letterhead === null || !companiesLoaded) return
    // Siehe oben: `letterhead` muss zur laufenden `jobAd` gehören.
    if (letterheadFor !== jobAd) return
    if (appliedFor.current === jobAd) return
    // Der Fingerabdruck der Anzeige muss vorliegen, bevor die Sperre über
    // Sitzungen hinweg geprüft werden kann — er ist praktisch sofort da
    // (siehe oben), aber theoretisch für einen Rendervorgang `null`.
    if (jobAdFingerprint === null) return
    appliedFor.current = jobAd

    // Dieselbe Anzeige wie beim letzten Mal (diese Sitzung ODER eine
    // vorige) — keine zweite Übernahme, siehe der ausführliche Kommentar
    // oben.
    if (appliedForFingerprint === jobAdFingerprint) return

    const result = applyLetterhead(docx, letterhead, marks, knownCompanies, jobAd.company)
    setApplication(result)
    if (result.changes.length > 0) commit(result.document, result.marks)
    // Für DIESE Anzeige ist die Entscheidung gefallen — unabhängig vom
    // Ergebnis (auch wenn nichts gefunden oder alles schon richtig war):
    // Ein erneuter Versuch für dieselbe Anzeige sähe wieder denselben
    // Stand und liefe ins Leere oder, schlimmer, gegen eine inzwischen
    // vorgenommene Handkorrektur.
    setAppliedForFingerprint(jobAdFingerprint)
  }, [
    docx,
    jobAd,
    letterhead,
    letterheadFor,
    marks,
    knownCompanies,
    companiesLoaded,
    commit,
    jobAdFingerprint,
    appliedForFingerprint,
  ])

  /**
   * Rückgängig nimmt auch den Bericht mit: Er bezeichnet Änderungen, die es
   * danach nicht mehr gibt.
   */
  const undoActive = activeWorkspace.undo
  const undoAll = useCallback(() => {
    undoActive()
    // Der Briefkopfbericht gehört zum Anschreiben. Nach einem Rückgängig im
    // Lebenslauf steht er unverändert weiter da, und das ist richtig — dort
    // wurde nichts an ihm zurückgenommen.
    if (activeKind === 'letter') setApplication(null)
  }, [undoActive, activeKind])

  const foreign = useMemo(
    () => findForeignCompanies(docx, jobAd?.company ?? null, knownCompanies),
    [docx, jobAd, knownCompanies],
  )
  // Auch im Lebenslauf: Eine Zeile, die noch auf die vorige Ausschreibung
  // gemünzt ist, steht dort genauso oft wie im Brief. Die Prüfung ist
  // deterministisch und kostet keine Anfrage (siehe `foreignCompanies.ts`).
  const cvForeign = useMemo(
    () => findForeignCompanies(cvWorkspace.document, jobAd?.company ?? null, knownCompanies),
    [cvWorkspace.document, jobAd, knownCompanies],
  )

  const gaps = useGapAnalysis({ jobAd, facts, provider, apiKey, privacy })

  /**
   * Der Modellaufruf, einmal gebaut und von beiden Dokumenten benutzt.
   *
   * Was sich je Dokument unterscheidet — das Stilprofil und damit der Prompt
   * — kommt als `document` herein (`RewriteDocument`). Alles andere gehört
   * der Bewerbung: Anzeige, Faktenbasis, Wahrheitsmodus, Zielsprache,
   * Anbieter, Tresor, Anonymisierung. Ein zweiter Aufrufort daneben wäre ein
   * zweiter Ort, an dem G3, G4 und die Anonymisierung zu beachten wären.
   */
  const rewriteWith = useCallback(
    async (
      document: RewriteDocument,
      documentSliders: RewriteSliders,
      current: EditorSelection,
      signal: AbortSignal,
    ): Promise<Variant[]> => {
      // Nicht erreichbar, solange `ready` unten den Knopf sperrt — aber der
      // Typ weiß das nicht, und ein stiller Rückgabewert wäre schlechter als
      // ein sichtbarer Fehler.
      if (jobAd === null || targetLanguage === null || provider === null) {
        throw new Error('Umformulierung ohne Auswertung, Zielsprache oder Anbieter angefordert.')
      }

      // Der Schlüssel wird **jetzt** gelesen, nicht beim Rendern: Der Tresor
      // sperrt sich nach der Untätigkeitsfrist selbst und meldet das an
      // niemanden (siehe `VaultLockedError`). Ein beim Rendern
      // eingeschlossener Schlüssel ginge sonst noch los, nachdem der Tresor
      // ihn vergessen hat. `refresh()` bringt den gesperrten Zustand
      // zugleich in die Oberfläche, wo er hingehört.
      const key = keyVault.vault?.getKey() ?? null
      if (key === null) {
        keyVault.refresh()
        throw new VaultLockedError()
      }

      return rewriteSelection(
        buildRewriteRequest({
          selection: current,
          jobAd,
          document,
          facts,
          truthMode: settings.truthMode,
          targetLanguage,
          sliders: documentSliders,
        }),
        withSignal(provider, signal),
        key,
        privacy,
      )
    },
    [jobAd, targetLanguage, provider, keyVault, facts, settings.truthMode, privacy],
  )

  const rewriteLetter = useCallback(
    (current: EditorSelection, signal: AbortSignal): Promise<Variant[]> => {
      if (style === null || sliders === null) {
        throw new Error('Umformulierung des Anschreibens ohne Stilprofil angefordert.')
      }
      return rewriteWith({ kind: 'letter', style }, sliders, current, signal)
    },
    [rewriteWith, style, sliders],
  )

  const rewriteCv = useCallback(
    (current: EditorSelection, signal: AbortSignal): Promise<Variant[]> => {
      if (cvStyle === null) {
        throw new Error('Umformulierung des Lebenslaufs ohne Stilprofil angefordert.')
      }
      return rewriteWith({ kind: 'cv', style: cvStyle }, cvSliders, current, signal)
    },
    [rewriteWith, cvStyle, cvSliders],
  )

  const setJobAdText = useCallback(
    (text: string) => setSession({ ...session, jobAdText: text }),
    [session, setSession],
  )

  const [reapplyOpen, setReapplyOpen] = useState(false)

  /**
   * Der Durchlauf für die nächste Ausschreibung.
   *
   * Er bekommt ausschließlich Vorhandenes gereicht: `rewrite` ist dasselbe,
   * das die Variantenauswahl von Hand benutzt, `applyEdit` derselbe eine Weg,
   * auf dem sich Brieftext ändert. Die neue Anzeige setzt er über die
   * Sitzung — `useApplicationAnalysis` wertet sie dann von allein aus, samt
   * Zwischenspeicher, Fehleranzeige und selbsttätigem Briefkopf.
   */
  const reapplyDocuments = useMemo<ReapplyDocument[]>(
    () =>
      available.map((kind) => {
        const workspace = kind === 'cv' ? cvWorkspace : letterWorkspace
        return {
          kind,
          docx: workspace.document,
          marks: workspace.marks,
          rewrite: kind === 'cv' ? rewriteCv : rewriteLetter,
          applyEdit: workspace.applyEdit,
          addClaims: workspace.claims.add,
          restoreOriginal: workspace.restoreOriginal,
        }
      }),
    [available, cvWorkspace, letterWorkspace, rewriteCv, rewriteLetter],
  )

  const reapply = useReapply({
    documents: reapplyDocuments,
    setJobAdText,
    currentJobAdText: session.jobAdText,
    jobAd: analysis.jobAd,
  })

  /**
   * Nach dem Word-Export: Bewerbung eintragen und den Zwischenstand löschen
   * (`docs/spec.md`: „gelöscht nach Export oder nach 7 Tagen"). Nur der
   * Word-Download löst das aus — warum, steht in `ExportBar`.
   *
   * Beide Schritte werden **einzeln** versucht und beide Fehler
   * verschluckt: Der Brief ist zu diesem Zeitpunkt bereits erzeugt, und ein
   * gescheiterter Listeneintrag darf ihn nicht als Fehlschlag erscheinen
   * lassen. Ein nicht gelöschter Entwurf läuft ohnehin nach sieben Tagen ab
   * (`purgeExpiredDrafts`).
   */
  const applicationRecorded = useRef(false)
  const handleExported = useCallback(
    (kind: DocumentKind) => {
      // **Eine Bewerbung, ein Eintrag** — auch wenn zwei Dateien
      // herauskommen. Ein Ref und kein Zustand: Der Wert steuert keine
      // Anzeige, und ein Nachrendern mitten im Download wäre eine Wirkung
      // ohne Zweck.
      if (!applicationRecorded.current) {
        applicationRecorded.current = true
        void storage
          .addApplication({
            company: jobAd?.company ?? '',
            position: jobAd?.position ?? '',
            date: isoDate(new Date()),
          })
          .catch(() => {})
      }
      // Der Zwischenstand **dieser** Unterlage. Den der anderen zu löschen
      // hieße, Arbeit wegzuwerfen, die noch nicht heraus ist.
      void storage.deleteDraft(kind === 'cv' ? CV_DRAFT_ID : LETTER_DRAFT_ID).catch(() => {})
    },
    [storage, jobAd],
  )

  const changeTruthMode = useCallback(
    (next: TruthMode) => {
      // Scheitert das Speichern, bleibt der bisherige Modus stehen (siehe
      // `updateSettings`). Sichtbar ist das an der Auswahlliste selbst, die
      // dann nicht umspringt — eine zweite Meldung an dieser Stelle wäre
      // eine Doppelung der Einstellungen-Ansicht.
      void updateSettings({ truthMode: next }).catch(() => {})
    },
    [updateSettings],
  )

  /**
   * Der Maßstab der Arbeitsfläche, in Prozent.
   *
   * **Warum hier und nicht in `DocumentColumn`.** Beide Unterlagen teilen
   * sich einen Wert: Wer den Brief herauszoomt, um die ganze Seite zu sehen,
   * will den Lebenslauf daneben nicht wieder herangeholt bekommen. Die
   * Spalte gibt es zweimal, die Schale einmal — also hält die Schale ihn.
   *
   * **Warum abgeleitet und nicht abgeschrieben.** Der gesicherte Wert steht
   * in den Einstellungen, und die kommen aus der IndexedDB — also erst ein
   * paar Lidschläge nach dem ersten Bild. Ein Zustand, der ihn beim ersten
   * Rendern einmal abschreibt, bliebe auf der Voreinstellung stehen: Wer die
   * Seite unmittelbar auf `/editor` neu lädt, bekäme seinen Maßstab nicht
   * zurück, weil diese Ansicht nicht auf `storageReady` wartet. Der Zustand
   * hier hält deshalb nur, was gerade **gezogen** wird; ruht der Regler,
   * gilt der gesicherte Wert.
   *
   * **Warum es diesen Zwischenzustand überhaupt gibt.** Am Regler entstehen
   * beim Ziehen dutzende Werte. Jeden davon zu sichern hieße dutzende
   * Schreibvorgänge in die IndexedDB für eine einzige Geste; gesichert wird
   * erst beim Loslassen (`onValueCommit`).
   */
  const [draggedZoom, setDraggedZoom] = useState<number | null>(null)
  const zoom = draggedZoom ?? clampZoom(settings.zoom)
  const commitZoom = useCallback(
    (next: number) => {
      // `updateSettings` setzt den neuen Wert sofort und nimmt ihn nur
      // zurück, wenn das Speichern scheitert — dann springt der Regler
      // zurück, genau wie die Auswahlliste beim Wahrheitsmodus. Deshalb darf
      // der Zwischenzustand hier fallen: Ohne ihn gilt wieder der gesicherte
      // Wert, und der steht schon auf `next`.
      void updateSettings({ zoom: next }).catch(() => {})
      setDraggedZoom(null)
    },
    [updateSettings],
  )

  // Strg+Z am Fenster, nicht an der Dokumentfläche: Der Verlauf soll auch
  // dann greifen, wenn der Fokus auf einem Knopf der Leiste steht. Eingabe-
  // und Textfelder behalten ihr eigenes Rückgängig.
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key.toLowerCase() !== 'z') return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      undoAll()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undoAll])

  /** Die Dokumente, die tatsächlich bearbeitet werden — in der Reihenfolge des Umschalters. */
  const openWorkspaces = available.map((kind) => (kind === 'cv' ? cvWorkspace : letterWorkspace))

  /**
   * Dieselben Dokumente für den Export. Die Wächter unten schließen ein
   * fehlendes `document` bereits aus; der Typ weiß das nicht, und eine
   * Zusicherung wäre hier eine Behauptung statt einer Prüfung.
   */
  const exportDocuments: ExportDocument[] = openWorkspaces.flatMap((workspace) =>
    workspace.document === null
      ? []
      : [
          {
            kind: workspace.kind,
            document: workspace.document,
            blocked: workspace.claims.exportBlocked,
          },
        ],
  )

  const heading = (
    <h1 className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]">
      {t('routes.editor.heading')}
    </h1>
  )

  /** Rahmen für die Zustände, die keine Arbeitsfläche sind (kein Brief,
   *  Fehler, Ladevorgang). Sie sind Lesestoff, keine Werkbank, und stehen
   *  deshalb in einer ruhigen Spalte statt im Dreispalter darunter. */
  const state = (children: ReactNode) => (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">{children}</div>
    </div>
  )

  const backToStart = (
    <Button asChild variant="secondary" className="self-start">
      <Link to="/">{t('editor.backToStart')}</Link>
    </Button>
  )

  // Ein Arbeitsumfang ohne Dokument: Die Einstiegsseite lässt das nicht zu
  // (der Weiter-Knopf bleibt gesperrt), eine aus einer Sicherungsdatei
  // wiederhergestellte Sitzung kann es aber tragen. Ein echter Zustand des
  // Produkts, kein nachgebauter Leerzustand.
  if (available.length === 0) {
    return state(
      <>
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-ink)]">{t('editor.noDocument.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.noDocument.body')}</p>
          {backToStart}
        </Card>
      </>,
    )
  }

  if (openWorkspaces.some((workspace) => workspace.failed)) {
    return state(
      <>
        {heading}
        <Card variant="subtle" padding="lg" className="flex max-w-[65ch] flex-col gap-3">
          <p className="font-medium text-[var(--color-error)]">{t('editor.failed.heading')}</p>
          <p className="text-[var(--color-ink)]">{t('editor.failed.body')}</p>
          {backToStart}
        </Card>
      </>,
    )
  }

  if (openWorkspaces.some((workspace) => workspace.loading || workspace.document === null)) {
    return state(
      <>
        {heading}
        <p role="status" className={FIELD_HINT_CLASS}>
          {t('editor.loading')}
        </p>
      </>,
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Den Titel trägt der Schrittreiter in der Kopfzeile bereits sichtbar.
          Hier bleibt er für Vorlesesoftware stehen, damit die Ansicht eine
          Ebene-1-Überschrift behält, ohne sie zweimal zu zeigen. */}
      <h1 className="sr-only">{t('routes.editor.heading')}</h1>

      {/* Drei Spalten über die volle Fensterbreite: links, was die Anzeige
          verlangt und was vorgemerkt ist, in der Mitte das Dokument, rechts
          die Stellschrauben und die Ausgabe.

          **Die Reihenfolge im Aufbau ist eine andere als die im Bild.** Das
          Dokument steht im HTML zuerst, damit Tastatur und Vorlesesoftware
          zuerst an es kommen; die Spalten werden erst über `col-start` an
          ihren Platz gesetzt.

          Bis `xl` liegen beide Spalten zusammen rechts, weil ein Brief
          zwischen zwei Spalten sonst zu schmal würde. `xl:contents` löst den
          Sammelbehälter dann auf, und seine beiden Bereiche werden selbst zu
          Rasterfeldern — so steht jeder Bereich genau einmal im Aufbau statt
          zweimal für zwei Fensterbreiten.

          `grid-rows-[minmax(0,1fr)]`: Ohne das wächst die Rasterzeile mit
          ihrem Inhalt, und der Rahmen mit `lg:overflow-hidden` schneidet ab,
          ohne dass man an den Rest kommt. */}
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          'lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)]',
          'xl:grid-cols-[19rem_minmax(0,1fr)_21rem]',
        )}
      >
        {/* Beide Dokumente stehen im Aufbau, das ruhende auf `display: none`.
            Ein Wechsel soll weder den Rückgängig-Verlauf noch die
            vorgemerkten Stellen verwerfen — und ein Neuaufbau parste das
            `word/document.xml` jedes Mal neu. Verborgen heißt hier
            vollständig verborgen: Vorlesesoftware und Tabulatorfolge lassen
            einen `display: none`-Teilbaum aus, eine zweite Auszeichnung
            braucht es dafür nicht. */}
        <div className="flex min-h-0 flex-col lg:col-start-1 lg:row-start-1 xl:col-start-2">
          <DocumentSwitch
            available={available}
            active={activeKind}
            onChange={setActive}
            // Der Lebenslauf ist neu und ausdrücklich als Beta
            // gekennzeichnet — dieselbe Linie wie bei der PDF-Umwandlung
            // (`docs/spec.md`). Fällt die Kennzeichnung weg, fällt hier ein
            // Wort weg.
            beta={BETA_DOCUMENTS}
          />
          {letter !== null && (
            <section
              aria-labelledby={`${headingId}-letter`}
              className={cn('flex min-h-0 flex-1 flex-col', activeKind !== 'letter' && 'hidden')}
            >
              <DocumentColumn
                workspace={letterWorkspace}
                headingId={`${headingId}-letter`}
                claimsHeadingId={`${claimsHeadingId}-letter`}
                heading={t('editor.document.heading')}
                fineSelection={precise}
                rewrite={rewriteLetter}
                rewriteReady={analysis.status === 'ready' && style !== null}
                onUndo={undoAll}
                zoom={zoom}
                onZoomChange={setDraggedZoom}
                onZoomCommit={commitZoom}
                foreignParagraphs={foreign.paragraphs}
                letterheadParagraphs={application?.changes.map((change) => change.paragraph) ?? []}
                // Der Auswertungsstand gehört der **Bewerbung** und steht
                // deshalb genau einmal da — beim sichtbaren Dokument. Zweimal
                // im Aufbau wäre es dieselbe Meldung an zwei Stellen, und
                // eine davon in einem verborgenen Teilbaum.
                status={
                  activeKind === 'letter' ? (
                    <AnalysisStatus analysis={analysis} hasKey={apiKey !== null} />
                  ) : undefined
                }
              />
            </section>
          )}
          {cv !== null && (
            <section
              aria-labelledby={`${headingId}-cv`}
              className={cn('flex min-h-0 flex-1 flex-col', activeKind !== 'cv' && 'hidden')}
            >
              <DocumentColumn
                workspace={cvWorkspace}
                headingId={`${headingId}-cv`}
                claimsHeadingId={`${claimsHeadingId}-cv`}
                heading={t('editor.document.cvHeading')}
                fineSelection={precise}
                // Kein „Ganzes Dokument": Ein Lebenslauf am Stück
                // umformuliert verliert seine Gliederung — Überschriften,
                // Datumsspalten, Tabellenzellen. Gewählt wird absatzweise.
                allowWholeDocument={false}
                rewrite={rewriteCv}
                rewriteReady={analysis.status === 'ready' && cvStyle !== null}
                onUndo={undoAll}
                zoom={zoom}
                onZoomChange={setDraggedZoom}
                onZoomCommit={commitZoom}
                foreignParagraphs={cvForeign.paragraphs}
                notice={
                  <p className={FIELD_HINT_CLASS}>
                    <strong className="font-semibold">{t('editor.beta.badge')}</strong>{' '}
                    {t('editor.beta.cv')}
                  </p>
                }
                status={
                  activeKind === 'cv' ? (
                    <AnalysisStatus analysis={analysis} hasKey={apiKey !== null} />
                  ) : undefined
                }
              />
            </section>
          )}
        </div>

        {/* Sammelbehälter der beiden Spalten, siehe `xl:contents` oben. */}
        <div
          className={cn(
            'flex min-h-0 flex-col border-[var(--color-border)]',
            'lg:col-start-2 lg:row-start-1 lg:overflow-y-auto lg:border-l',
            'xl:contents',
          )}
        >
          <aside
            aria-label={t('editor.sidePanel.reference')}
            // `[&>*]:shrink-0`: In einer Spalte mit eigenem Blättern
            // dürfen die Kinder standardmäßig schrumpfen — und sie tun es,
            // statt die Spalte blättern zu lassen. Sichtbar war das daran,
            // dass „Briefkopf" zu einem Streifen gequetscht unter
            // „Schreibstil" lag und dessen Textfeld unten abgeschnitten
            // war. Ein Bereich muss seine natürliche Höhe behalten; scrollen
            // soll die Spalte.
            className={cn(
              'flex flex-col gap-3 border-t border-[var(--color-border)] p-4 lg:border-t-0',
              'xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-r',
              '[&>*]:shrink-0',
            )}
          >
            {/* Die Merkliste zeigt die Stellen des **sichtbaren** Dokuments.
                Sie ist dokumentunabhängig gebaut; welche Stellen darin
                stehen, entscheidet der Umschalter. */}
            <MarkPanel
              marks={activeWorkspace.marks}
              unresolved={activeWorkspace.markHandle.unresolved}
              restore={activeWorkspace.markHandle.restore}
              activeId={activeWorkspace.activeMarkId}
              keep={settings.keepMarks === true}
              onKeepChange={(next) => {
                // Scheitert das Speichern, bleibt der Schalter stehen, wo er
                // war — dieselbe Behandlung wie beim Wahrheitsmodus.
                void updateSettings({ keepMarks: next }).catch(() => {})
              }}
              onSelect={activeWorkspace.selectMark}
              onToggleDone={activeWorkspace.markHandle.setDone}
              onRemove={activeWorkspace.markHandle.remove}
              onClearAll={activeWorkspace.markHandle.clearAll}
              onDismiss={activeWorkspace.markHandle.dismiss}
              // Als einziger Bereich beginnt die Merkliste auch auf schmalen
              // Geräten offen, sobald etwas darin steht.
              //
              // Vormerken kann man mit dem Finger nicht: Dafür braucht es die
              // Feinmarkierung, und die gibt es nur mit einem genauen
              // Zeigegerät (`docs/spec.md`, `usePrecisePointer`). Eine bereits
              // vorgemerkte Stelle anzutippen und umformulieren zu lassen geht
              // aber sehr wohl. Unterwegs ist die wiederhergestellte Liste
              // damit das Einzige, was die Anwendung überhaupt brauchbar
              // macht — und wäre ausgerechnet der Bereich, den man erst unter
              // dreien hervorklappen müsste.
              //
              // Leer bleibt sie zu: Eine aufgeklappte Fläche, in der „Noch
              // nichts vorgemerkt" steht, kostet auf einem Telefon nur Platz.
              defaultOpen={
                wide ||
                activeWorkspace.marks.length > 0 ||
                activeWorkspace.markHandle.unresolved.length > 0
              }
            />
            {analysis.jobAd !== null && (
              // Beginnt immer zugeklappt, auch auf breiten Geräten: Die
              // Anforderungen sind Nachschlagestoff für zwischendurch, nicht
              // der Einstieg in die Arbeit. Aufgeklappt schöben sie die
              // Merkliste nach unten, mit der man tatsächlich arbeitet.
              <GapList requirements={analysis.jobAd.requirements} gaps={gaps} defaultOpen={false} />
            )}
          </aside>

          <aside
            aria-label={t('editor.sidePanel.label')}
            className={cn(
              'flex flex-col gap-3 border-t border-[var(--color-border)] p-4',
              'xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l',
              // Siehe die Spalte links: sonst quetschen sich die Bereiche
              // gegenseitig, statt dass die Spalte blättert.
              '[&>*]:shrink-0',
            )}
          >
            {/* Die Ausgabe steht **oben**, nicht am Fuß der Spalte. Sie ist
                zwar das Ende der Arbeit, aber der am häufigsten gesuchte
                Knopf des ganzen Bildschirms — und darunter hängt mit
                „Nächste Anzeige" der Einstieg in die nächste Bewerbung.
                Am Fuß lag beides unter drei aufklappbaren Bereichen und war
                auf einem kleineren Fenster nur nach dem Blättern zu sehen. */}
            <div>
              {/* Der Export gehört der **Bewerbung**: Er zeigt jede Unterlage
                  im Arbeitsumfang, nicht nur die sichtbare. Wer beide
                  angepasst hat, sieht hier, was noch fehlt, und muss zum
                  Herunterladen nicht erst umschalten. */}
              <ExportBar
                documents={exportDocuments}
                company={jobAd?.company ?? null}
                onExported={handleExported}
                onNextPosting={() => setReapplyOpen(true)}
              />
              <ReapplyStatus
                state={reapply.state}
                onChoose={reapply.choose}
                onRetry={reapply.retry}
                onSkip={reapply.skip}
                onCancel={reapply.cancel}
              />
            </div>

            {/* Der Wahrheitsmodus stand bisher unter der Markierungsleiste.
                Er gilt für die ganze Sitzung und nicht für diese eine
                Markierung, gehört also zu den Stellschrauben. */}
            <TruthModeSwitch value={settings.truthMode} onChange={changeTruthMode} />

            {/* Die Textprüfung zeigt das **sichtbare** Dokument: Sie meldet
                Fundstellen, und eine Fundstelle im verborgenen Teilbaum
                anzuspringen führte ins Leere.

                Aufgeklappt, sobald sie etwas gefunden hat. Zugeklappt wäre
                sie zwar leiser, aber dann hinge die ganze Auskunft wieder an
                der Wellenlinie, die nur findet, wer ohnehin hinsieht. */}
            <ProofreadingPanel
              findings={activeWorkspace.proofreading}
              onSelect={(finding) => activeWorkspace.revealRange(finding.range)}
              onApply={(finding) =>
                activeWorkspace.applyEdit(finding.range, finding.suggestion)
              }
              defaultOpen={activeWorkspace.proofreading.length > 0}
            />
            {activeKind === 'cv' && cvStyle !== null && (
              <CvStyleProfilePanel
                style={cvStyle}
                onChange={setCvStyle}
                sliders={cvSliders}
                onSlidersChange={setCvSliders}
                // Zugeklappt wie das Stilprofil des Anschreibens, aus
                // demselben Grund: abgeleitet und gemessen, bevor der Nutzer
                // hier ankommt.
                defaultOpen={false}
              />
            )}
            {activeKind === 'letter' && letterhead !== null && (
              <LetterheadPanel
                letterhead={letterhead}
                onChange={setLetterhead}
                onInsert={letterWorkspace.insertAtSelection}
                foreign={foreign}
                application={application}
                onDismissApplication={() => setApplication(null)}
                // Zugeklappt wie das Stilprofil, auch auf breiten Fenstern:
                // Der Briefkopf ist vorgeschlagen und meist schon selbst
                // übernommen, bevor der Nutzer hier ankommt — er will
                // nachgesehen und selten berichtigt werden. Dass etwas
                // übernommen wurde, steht ohnehin im Brief selbst: Die
                // geänderten Absätze tragen dort ihre eigene Kontur.
                defaultOpen={false}
              />
            )}
            {activeKind === 'letter' && style !== null && sliders !== null && (
              <StyleProfilePanel
                style={style}
                onChange={setStyle}
                sliders={sliders}
                onSlidersChange={setSliders}
                // Zugeklappt auch auf breiten Fenstern: Das Stilprofil ist
                // gelesen und gemessen, bevor der Nutzer hier ankommt — es
                // will nachgesehen und selten korrigiert werden, nicht
                // dauernd angesehen.
                defaultOpen={false}
              />
            )}
          </aside>
        </div>
      </div>

      <ReapplyDialog
        open={reapplyOpen}
        onOpenChange={setReapplyOpen}
        // Über **alle** Unterlagen im Arbeitsumfang: Der Durchlauf arbeitet
        // sie in einem Zug ab, und was er kosten wird, ist die Summe.
        markCount={openWorkspaces.reduce((sum, workspace) => sum + workspace.marks.length, 0)}
        unresolvedCount={openWorkspaces.reduce(
          (sum, workspace) => sum + workspace.markHandle.unresolved.length,
          0,
        )}
        onStart={(text, mode) => {
          setReapplyOpen(false)
          reapply.start(text, mode)
        }}
      />

      {adLanguage !== null && (
        <LanguagePrompt
          open={askingLanguage}
          adLanguage={adLanguage}
          letterLanguage={letterLanguage}
          onDecide={(target) => {
            setTargetLanguage(target)
            setLanguageAsked(true)
          }}
        />
      )}
    </div>
  )
}

/**
 * Der Zustand der beiden Auswertungen, in einem Satz.
 *
 * Sie laufen im Hintergrund und ohne sie gibt es keine Varianten — deshalb
 * muss dastehen, woran es liegt, wenn der Knopf gesperrt ist. Der Fehlertext
 * kommt aus `aiErrorKey`, nie aus der Ausnahme selbst (G8).
 *
 * Im Erfolgsfall steht hier **nichts**. Was gelesen wurde, zeigt 14c in der
 * Seitenspalte; eine Erfolgsmeldung dazwischen wäre eine Zeile, die nur beim
 * ersten Mal etwas sagt.
 */
function AnalysisStatus({
  analysis,
  hasKey,
}: {
  analysis: ReturnType<typeof useApplicationAnalysis>
  hasKey: boolean
}) {
  const { t } = useTranslation()

  if (analysis.status === 'ready') return null

  if (analysis.status === 'idle') {
    // Ohne Schlüssel im Arbeitsspeicher ist der Tresor gesperrt oder leer.
    // Die Einstiegsseite führt durch beides; hier steht nur, warum die
    // Arbeitsfläche gerade nichts fragen kann.
    return hasKey ? null : (
      <p role="status" className={FIELD_HINT_CLASS}>
        {t('vault.locked')}
      </p>
    )
  }

  if (analysis.status === 'loading') {
    return (
      <p role="status" className={FIELD_HINT_CLASS}>
        {t('editor.analysis.loading')}
      </p>
    )
  }

  return (
    <AiErrorNotice
      error={analysis.error}
      onRetry={analysis.retry}
      retryLabel={t('editor.analysis.retry')}
    />
  )
}
