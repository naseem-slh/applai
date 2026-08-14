import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { CopyIcon, DownloadIcon } from '@/components/ui/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { hasTables } from '@/lib/docx/parse'
import type { DocxDocument } from '@/lib/docx/model'
import { copyToClipboard, toPlainText } from '@/lib/export/clipboard'
import { buildFileName, downloadDocx } from '@/lib/export/docx'

/**
 * Die drei Ausgabewege: Word-Datei, PDF-Datei, Reintext in der Zwischenablage.
 *
 * **Was „Export" heißt — und was nicht.** Word-Datei und PDF schließen die
 * Bewerbung ab: Beide tragen sie in die Liste ein und löschen den
 * Zwischenstand (`docs/spec.md`: „gelöscht nach Export oder nach 7 Tagen").
 * Das Kopierfeld tut das ausdrücklich nicht — wer den Text in ein
 * Online-Formular kopiert, steht mitten im Ausfüllen und ist gerade nicht
 * fertig.
 *
 * **Warum das PDF früher nicht mitzählte.** Es entstand über den Druckdialog,
 * und der meldet keinen Erfolg: `afterprint` feuert auch nach einem Abbruch,
 * die Browser unterscheiden das nicht. Den Zwischenstand daraufhin zu löschen
 * hieße, die Arbeit einer Stunde wegzuwerfen, weil jemand in eine Vorschau
 * geschaut hat. Seit das PDF hier selbst erzeugt wird (`lib/export/pdf`), ist
 * es so eindeutig wie der Word-Download: Entweder die Datei ist entstanden,
 * oder es gab einen Fehler. Der Grund für die Ausnahme ist weggefallen.
 *
 * **Die Exportsperre** (G10) gilt für alle drei Wege gleich: Solange eine
 * unbestätigte erfundene Aussage im Brief steht, geht nichts hinaus — auch
 * kein Reintext. Der Grund steht im `ClaimGuard` darüber, nicht hier: ein
 * gesperrter Knopf, der seine eigene Sperre erklärt, verdoppelt die
 * Auskunft.
 */

/** Welcher Weg gerade gelaufen ist — für die Meldung darunter. */
export type ExportAction = 'docx' | 'pdf' | 'copy'

export type ExportDocumentKind = 'letter' | 'cv'

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'working'; action: 'docx' | 'pdf'; document: ExportDocumentKind }
  | { kind: 'done'; action: ExportAction; document: ExportDocumentKind }
  | { kind: 'failed'; action: ExportAction; document: ExportDocumentKind }

/** Eine Unterlage, wie sie aus der Arbeitsfläche herauskommt. */
export interface ExportDocument {
  kind: ExportDocumentKind
  document: DocxDocument
  /**
   * Unbestätigte erfundene Aussagen in **genau diesem** Dokument.
   *
   * Je Dokument, nicht gesamt: Eine offene Aussage im Lebenslauf hält ein
   * fertiges Anschreiben nicht auf. Die Sperre trifft die Datei, in der die
   * unbelegte Aussage steht — alles andere wäre Sippenhaft.
   */
  blocked: boolean
}

/**
 * Der erste Teil des Dateinamens je Unterlage. Deutsch und nicht über
 * i18next, aus dem Grund, der in `buildFileName` steht.
 */
const FILE_BASE_NAME: Record<ExportDocumentKind, string> = {
  letter: 'Anschreiben',
  cv: 'Lebenslauf',
}

export interface ExportBarProps {
  /**
   * Die Unterlagen im Arbeitsumfang, in der Reihenfolge des Umschalters.
   *
   * **Der Bereich gehört der Bewerbung, nicht dem sichtbaren Dokument.** Wer
   * beide angepasst hat, sieht auf einen Blick, was noch fehlt, und muss zum
   * Herunterladen nicht erst umschalten. „Ich habe den Lebenslauf vergessen"
   * wäre sonst ein Zustand, den die Oberfläche nirgends anzeigt.
   */
  documents: readonly ExportDocument[]
  /** Die Firma aus der ausgewerteten Anzeige, für Dateiname und Liste. */
  company: string | null
  /**
   * Trägt die Bewerbung ein und löscht den Zwischenstand **dieser**
   * Unterlage. Wird nach jeder erzeugten Datei gerufen, nicht nach dem
   * Kopieren (siehe oben). Wirft nicht: Ein gescheiterter Eintrag darf die
   * erzeugte Datei nicht als Fehlschlag erscheinen lassen.
   *
   * Die Bewerbung selbst gehört **einmal** in die Liste, auch wenn zwei
   * Dateien herauskommen. Dass der zweite Aufruf keinen zweiten Eintrag
   * erzeugt, sichert die Schale zu (`Editor.tsx`) — sie kennt die Bewerbung,
   * dieser Bereich kennt nur Dateien.
   */
  onExported: (kind: ExportDocumentKind) => void
  /**
   * Öffnet den Durchlauf für die nächste Ausschreibung.
   *
   * **Immer da, auch ohne vorgemerkte Stelle.** Der Knopf war einmal an
   * `marks.length > 0` gebunden und verschwand deshalb genau dann, wenn eine
   * Vormerkung wegfiel — der Weg in die nächste Bewerbung war dann schlicht
   * nicht mehr auffindbar, ohne dass irgendetwas erklärte, warum. Ohne
   * Stellen ist der Durchlauf nicht sinnlos: Er stellt die hochgeladenen
   * Unterlagen her, wertet die neue Anzeige aus und setzt den Briefkopf.
   * Was er kosten wird, sagt der Dialog vor dem Start.
   */
  onNextPosting: () => void
}

export function ExportBar({ documents, company, onExported, onNextPosting }: ExportBarProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  const working = state.kind === 'working'
  const several = documents.length > 1

  const runDocx = useCallback(
    async (entry: ExportDocument) => {
      setState({ kind: 'working', action: 'docx', document: entry.kind })
      try {
        await downloadDocx(
          entry.document,
          buildFileName(company, new Date(), undefined, FILE_BASE_NAME[entry.kind]),
        )
        setState({ kind: 'done', action: 'docx', document: entry.kind })
        onExported(entry.kind)
      } catch {
        // `serializeDocx` kann an einem beschädigten Baum scheitern, und der
        // Download selbst an einer verweigerten Objekt-URL. Beides ist für den
        // Nutzer dasselbe: Die Datei ist nicht entstanden.
        setState({ kind: 'failed', action: 'docx', document: entry.kind })
      }
    },
    [company, onExported],
  )

  const runPdf = useCallback(
    async (entry: ExportDocument) => {
      // Der sichtbare Zwischenzustand ist hier nicht nur Höflichkeit: Beim
      // ersten Mal werden das Satzwerk und die Schriften geladen.
      setState({ kind: 'working', action: 'pdf', document: entry.kind })
      try {
        // Nachgeladen wie die PDF-Einlesestrecke in `loadDocument.ts`: Wer nur
        // die Word-Datei herunterlädt, soll den Schriftsatz nie im Bündel
        // haben.
        const { downloadPdf } = await import('@/lib/export/pdf')
        await downloadPdf(
          entry.document,
          buildFileName(company, new Date(), '.pdf', FILE_BASE_NAME[entry.kind]),
        )
        setState({ kind: 'done', action: 'pdf', document: entry.kind })
        onExported(entry.kind)
      } catch {
        setState({ kind: 'failed', action: 'pdf', document: entry.kind })
      }
    },
    [company, onExported],
  )

  const runCopy = useCallback(async (entry: ExportDocument) => {
    const result = await copyToClipboard(toPlainText(entry.document.text))
    setState(
      result === 'copied'
        ? { kind: 'done', action: 'copy', document: entry.kind }
        : { kind: 'failed', action: 'copy', document: entry.kind },
    )
  }, [])

  return (
    <Card asChild variant="default" padding="md">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h3
          id={headingId}
          className="text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
        >
          {t('editor.export.heading')}
        </h3>

        {documents.map((entry) => {
          // Am Dokument abgelesen statt hereingereicht: Ob eine Tabelle darin
          // steht, ist eine Eigenschaft der Datei und keine Entscheidung des
          // Aufrufers.
          const pdfBlocked = hasTables(entry.document.doc)
          return (
            <div key={entry.kind} className="flex flex-col gap-2">
              {/* Die Überschrift steht nur da, wenn es etwas zu unterscheiden
                  gibt. Bei einer einzigen Unterlage wäre „Anschreiben" über
                  drei Knöpfen eine Auskunft, die niemand braucht. */}
              {several && (
                <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink)]">
                  {t(`editor.switch.${entry.kind}`)}
                </p>
              )}

              {/* Der Word-Download über die ganze Breite, die beiden Nebenwege
                  darunter zu zweit: Er reicht das Original mit allem, was daran
                  hängt, unangetastet weiter — das PDF wird neu gesetzt und kommt
                  dem Original nahe, ohne es zu sein.

                  Die Beschriftungen sind kurz, weil das Sinnbild die Hälfte der
                  Aussage trägt. Was ein kurzes Wort offenlässt, sagt das
                  Hinweisfähnchen: Radix hängt es als `aria-describedby` an, der
                  sichtbare Text bleibt also der Name des Knopfes (WCAG 2.5.3). */}
              <Button
                variant="primary"
                disabled={entry.blocked || working}
                onClick={() => void runDocx(entry)}
                className="w-full"
              >
                <DownloadIcon />
                {t('editor.export.docx')}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                {/* **Die Tabellensperre.** Der PDF-Satz kennt keine Tabellen
                    (`lib/export/pdf/layout.ts`), und ein zweispaltiger
                    Lebenslauf IST eine Tabelle. Das PDF käme still ohne seine
                    Spalten heraus — eine Datei, die aussieht wie eine
                    Bewerbungsunterlage und keine ist. Der Grund steht im
                    Hinweisfähnchen, nicht nur im gesperrten Knopf: Eine Sperre
                    ohne Begründung ist eine Sackgasse. */}
                <Tooltip
                  content={
                    pdfBlocked ? t('editor.export.pdfBlockedTooltip') : t('editor.export.pdfTooltip')
                  }
                >
                  <Button
                    variant="secondary"
                    disabled={entry.blocked || pdfBlocked || working}
                    onClick={() => void runPdf(entry)}
                  >
                    <DownloadIcon />
                    {t('editor.export.pdf')}
                  </Button>
                </Tooltip>
                <Tooltip content={t('editor.export.copyTooltip')}>
                  <Button
                    variant="secondary"
                    disabled={entry.blocked}
                    onClick={() => void runCopy(entry)}
                  >
                    <CopyIcon />
                    {t('editor.export.copy')}
                  </Button>
                </Tooltip>
              </div>
            </div>
          )
        })}

        {/* Die nächste Bewerbung steht **unter** der Ausgabe, nicht
            daneben: Sie ist der Schritt danach, nicht einer der drei Wege
            hinaus. */}
        <Button variant="secondary" onClick={onNextPosting} className="w-full">
          {t('editor.reapply.trigger')}
        </Button>

        {/* Der eine Halbsatz bleibt sichtbar statt im Fähnchen: Ein
            gesperrter Knopf nimmt keine Zeigerereignisse an und zeigt sein
            Fähnchen deshalb nie, und auf einem Gerät mit Fingerbedienung
            gibt es kein Überfahren. Dass das PDF neu gesetzt wird und dem
            Original nur nahekommt, ist die einzige der drei Auskünfte, die
            niemand errät — und die einzige, die jemanden überraschen könnte,
            der beide Dateien nebeneinanderlegt. */}
        <p className={FIELD_HINT_CLASS}>{t('editor.export.pdfHint')}</p>

        {/* Eine Zustandsauskunft, keine Unterbrechung: `role="status"`. Der
            Bereich steht immer da, damit eine Vorlesesoftware die Meldung
            ansagt, wenn sie erscheint — ein erst dann eingehängtes Element
            wird von manchen nicht bemerkt. */}
        <p
          role="status"
          className={
            state.kind === 'failed'
              ? 'text-[length:var(--text-body-sm-size)] text-[var(--color-error)]'
              : FIELD_HINT_CLASS
          }
        >
          {message(state, t, several)}
        </p>
      </section>
    </Card>
  )
}

/**
 * Die Meldung nennt die Unterlage nur, wenn es mehr als eine gibt — sonst
 * stünde „Anschreiben: Datei erzeugt" da, wo es gar keine zweite gibt.
 */
function message(
  state: ExportState,
  t: (key: string) => string,
  several: boolean,
): string {
  if (state.kind === 'idle') return ''

  const text =
    state.kind === 'working'
      ? state.action === 'docx'
        ? t('editor.export.working')
        : t('editor.export.pdfWorking')
      : t(`editor.export.${state.action}${state.kind === 'done' ? 'Done' : 'Failed'}`)

  return several ? `${t(`editor.switch.${state.document}`)}: ${text}` : text
}
