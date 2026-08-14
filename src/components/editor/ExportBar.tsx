import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { CopyIcon, DownloadIcon } from '@/components/ui/icons'
import { Tooltip } from '@/components/ui/Tooltip'
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

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'working'; action: 'docx' | 'pdf' }
  | { kind: 'done'; action: ExportAction }
  | { kind: 'failed'; action: ExportAction }

export interface ExportBarProps {
  document: DocxDocument
  /** Die Firma aus der ausgewerteten Anzeige, für Dateiname und Liste. */
  company: string | null
  /** Wird gesperrt, solange unbestätigte erfundene Aussagen im Text stehen. */
  blocked: boolean
  /**
   * Trägt die Bewerbung ein und löscht den Zwischenstand. Wird nach jeder
   * erzeugten Datei gerufen, nicht nach dem Kopieren (siehe oben). Wirft
   * nicht: Ein gescheiterter Eintrag darf den erzeugten Brief nicht als
   * Fehlschlag erscheinen lassen.
   */
  onExported: () => void
  /**
   * Öffnet den Durchlauf für die nächste Ausschreibung.
   *
   * **Immer da, auch ohne vorgemerkte Stelle.** Der Knopf war einmal an
   * `marks.length > 0` gebunden und verschwand deshalb genau dann, wenn eine
   * Vormerkung wegfiel — der Weg in die nächste Bewerbung war dann schlicht
   * nicht mehr auffindbar, ohne dass irgendetwas erklärte, warum. Ohne
   * Stellen ist der Durchlauf nicht sinnlos: Er stellt das hochgeladene
   * Anschreiben her, wertet die neue Anzeige aus und setzt den Briefkopf.
   * Was er kosten wird, sagt der Dialog vor dem Start.
   */
  onNextPosting: () => void
}

export function ExportBar({
  document: docx,
  company,
  blocked,
  onExported,
  onNextPosting,
}: ExportBarProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  const handleDownload = useCallback(async () => {
    setState({ kind: 'working', action: 'docx' })
    try {
      await downloadDocx(docx, buildFileName(company, new Date()))
      setState({ kind: 'done', action: 'docx' })
      onExported()
    } catch {
      // `serializeDocx` kann an einem beschädigten Baum scheitern, und der
      // Download selbst an einer verweigerten Objekt-URL. Beides ist für den
      // Nutzer dasselbe: Die Datei ist nicht entstanden.
      setState({ kind: 'failed', action: 'docx' })
    }
  }, [docx, company, onExported])

  const handlePdf = useCallback(async () => {
    // Der sichtbare Zwischenzustand ist hier nicht nur Höflichkeit: Beim
    // ersten Mal werden das Satzwerk und die Schriften geladen.
    setState({ kind: 'working', action: 'pdf' })
    try {
      // Nachgeladen wie die PDF-Einlesestrecke in `loadDocument.ts`: Wer nur
      // die Word-Datei herunterlädt, soll den Schriftsatz nie im Bündel
      // haben.
      const { downloadPdf } = await import('@/lib/export/pdf')
      await downloadPdf(docx, buildFileName(company, new Date(), '.pdf'))
      setState({ kind: 'done', action: 'pdf' })
      onExported()
    } catch {
      setState({ kind: 'failed', action: 'pdf' })
    }
  }, [docx, company, onExported])

  const handleCopy = useCallback(async () => {
    const result = await copyToClipboard(toPlainText(docx.text))
    setState(result === 'copied' ? { kind: 'done', action: 'copy' } : { kind: 'failed', action: 'copy' })
  }, [docx])

  const working = state.kind === 'working'

  return (
    <Card asChild variant="default" padding="md">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h3
          id={headingId}
          className="text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
        >
          {t('editor.export.heading')}
        </h3>

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
          disabled={blocked || working}
          onClick={() => void handleDownload()}
          className="w-full"
        >
          <DownloadIcon />
          {t('editor.export.docx')}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Tooltip content={t('editor.export.pdfTooltip')}>
            <Button
              variant="secondary"
              disabled={blocked || working}
              onClick={() => void handlePdf()}
            >
              <DownloadIcon />
              {t('editor.export.pdf')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.export.copyTooltip')}>
            <Button variant="secondary" disabled={blocked} onClick={() => void handleCopy()}>
              <CopyIcon />
              {t('editor.export.copy')}
            </Button>
          </Tooltip>
        </div>

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
          {message(state, t)}
        </p>
      </section>
    </Card>
  )
}

function message(state: ExportState, t: (key: string) => string): string {
  switch (state.kind) {
    case 'working':
      return state.action === 'docx' ? t('editor.export.working') : t('editor.export.pdfWorking')
    case 'done':
      return t(`editor.export.${state.action}Done`)
    case 'failed':
      return t(`editor.export.${state.action}Failed`)
    case 'idle':
      return ''
  }
}
