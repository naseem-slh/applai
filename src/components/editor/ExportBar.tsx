import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { CopyIcon, DownloadIcon, PrinterIcon } from '@/components/ui/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import type { DocxDocument } from '@/lib/docx/model'
import { copyToClipboard, toPlainText } from '@/lib/export/clipboard'
import { buildFileName, downloadDocx } from '@/lib/export/docx'

/**
 * Die drei Ausgabewege: Word-Datei, PDF über den Druckdialog, Reintext in
 * der Zwischenablage.
 *
 * **Was „Export" heißt — und was nicht.** Nur der **Word-Download**
 * schließt die Bewerbung ab: Er trägt sie in die Liste ein und löscht den
 * Zwischenstand (`docs/spec.md`: „gelöscht nach Export oder nach 7 Tagen").
 * Die beiden anderen Wege tun das ausdrücklich nicht, und zwar aus je einem
 * eigenen Grund:
 *
 * - **Der Druckdialog meldet keinen Erfolg.** `afterprint` feuert auch dann,
 *   wenn der Nutzer abgebrochen hat; die Browser unterscheiden das nicht.
 *   Den Zwischenstand daraufhin zu löschen hieße, die Arbeit einer Stunde
 *   wegzuwerfen, weil jemand in eine Vorschau geschaut hat. Das ist der eine
 *   Fehler, den ein Werkzeug für Bewerbungen nicht machen darf.
 * - **Das Kopierfeld ist für Online-Formulare.** Wer den Text dorthin
 *   kopiert, steht mitten im Ausfüllen und ist gerade nicht fertig.
 *
 * Der Preis ist benannt: Wer ausschließlich als PDF oder über ein Formular
 * bewirbt, bekommt keinen Eintrag in der Liste, solange er nicht zusätzlich
 * die Word-Datei erzeugt. Ein dritter Knopf „Bewerbung eintragen" wäre die
 * Alternative; sie steht nicht im Plan, und ein automatischer Eintrag auf
 * einen Verdacht hin wäre die schlechtere Wahl als ein fehlender.
 *
 * **Die Exportsperre** (G10) gilt für alle drei Wege gleich: Solange eine
 * unbestätigte erfundene Aussage im Brief steht, geht nichts hinaus — auch
 * kein Reintext. Der Grund steht im `ClaimGuard` darüber, nicht hier: ein
 * gesperrter Knopf, der seine eigene Sperre erklärt, verdoppelt die
 * Auskunft.
 */

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; action: 'docx' | 'copy' }
  | { kind: 'failed'; action: 'docx' | 'copy' }

export interface ExportBarProps {
  document: DocxDocument
  /** Die Firma aus der ausgewerteten Anzeige, für Dateiname und Liste. */
  company: string | null
  /** Wird gesperrt, solange unbestätigte erfundene Aussagen im Text stehen. */
  blocked: boolean
  /**
   * Trägt die Bewerbung ein und löscht den Zwischenstand. Wird **nur** nach
   * dem Word-Download gerufen (siehe oben). Wirft nicht: Ein gescheiterter
   * Eintrag darf den erzeugten Brief nicht als Fehlschlag erscheinen lassen.
   */
  onExported: () => void
  /**
   * Öffnet den Durchlauf für die nächste Ausschreibung. `null`, solange es
   * nichts abzuarbeiten gibt — ohne vorgemerkte Stelle bliebe vom Durchlauf
   * nur der Briefkopf, und dafür ist er nicht gebaut.
   */
  onNextPosting: (() => void) | null
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
    setState({ kind: 'working' })
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

  const handleCopy = useCallback(async () => {
    const result = await copyToClipboard(toPlainText(docx.text))
    setState(result === 'copied' ? { kind: 'done', action: 'copy' } : { kind: 'failed', action: 'copy' })
  }, [docx])

  // Kein eigener Zustand: Der Druckdialog blockiert den Hauptstrang, und was
  // danach geschieht, weiß diese Ansicht nicht (siehe Kopfkommentar).
  const handlePrint = useCallback(() => window.print(), [])

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
            darunter zu zweit: Nur er schließt die Bewerbung ab (siehe
            Kopfkommentar), und das soll man sehen, ohne es zu lesen.

            Die Beschriftungen sind kurz, weil das Sinnbild die Hälfte der
            Aussage trägt. Was ein kurzes Wort offenlässt, sagt das
            Hinweisfähnchen: Radix hängt es als `aria-describedby` an, der
            sichtbare Text bleibt also der Name des Knopfes (WCAG 2.5.3). */}
        <Button
          variant="primary"
          disabled={blocked || state.kind === 'working'}
          onClick={() => void handleDownload()}
          className="w-full"
        >
          <DownloadIcon />
          {t('editor.export.docx')}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Tooltip content={t('editor.export.pdfTooltip')}>
            <Button variant="secondary" disabled={blocked} onClick={handlePrint}>
              <PrinterIcon />
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
            hinaus. Gesperrt ohne vorgemerkte Stellen — dann hätte der
            Durchlauf nichts zu tun. */}
        {onNextPosting !== null && (
          <Button variant="secondary" onClick={onNextPosting} className="w-full">
            {t('editor.reapply.trigger')}
          </Button>
        )}

        {/* Der eine Halbsatz bleibt sichtbar statt im Fähnchen: Ein
            gesperrter Knopf nimmt keine Zeigerereignisse an und zeigt sein
            Fähnchen deshalb nie, und auf einem Gerät mit Fingerbedienung
            gibt es kein Überfahren. Dass ein PDF durch Drucken entsteht,
            ist die einzige der drei Auskünfte, die niemand errät. */}
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
      return t('editor.export.working')
    case 'done':
      return state.action === 'docx' ? t('editor.export.docxDone') : t('editor.export.copyDone')
    case 'failed':
      return state.action === 'docx' ? t('editor.export.docxFailed') : t('editor.export.copyFailed')
    case 'idle':
      return ''
  }
}
