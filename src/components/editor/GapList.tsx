import { useTranslation } from 'react-i18next'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import type { GapEntry } from '@/lib/domain/gaps'
import type { Requirement } from '@/lib/domain/jobAd'
import { cn } from '@/lib/utils'
import { SidePanel } from './SidePanel'
import type { GapAnalysisHandle } from './useGapAnalysis'

/**
 * Was die Anzeige verlangt, und was davon die eigenen Unterlagen decken.
 *
 * **Kein Prozentwert** (`docs/spec.md`, ausdrücklich: „Kein Prozentwert — er
 * wäre erfunden"). Auch keine Zählung „3 von 7 gedeckt" in großer Schrift:
 * Sie ist derselbe Wert in anderer Schreibweise und suggeriert dieselbe
 * Genauigkeit, die es nicht gibt. Was zählt, steht Zeile für Zeile.
 *
 * **Die Anforderungen stehen sofort da, die Bewertung auf Anforderung.** Die
 * Liste selbst kommt aus `jobAd` und kostet keinen Modellaufruf — das ist
 * der „sichtbare Zwischenschritt" der Spezifikation. Ob eine Anforderung
 * gedeckt ist, muss dagegen gefragt werden (siehe `useGapAnalysis`, warum
 * das nicht beim Betreten geschieht).
 *
 * **`evidence` ist eine Einschätzung, kein Zitat.** Weitergabe aus Aufgabe
 * 12: Anders als `sample` im Stilprofil und die Varianten beim Umschreiben
 * wird `evidence` **nicht** auf Wörtlichkeit gegen die Unterlagen geprüft —
 * es ist Modellprosa. Zusammen mit der erzwungenen Kopplung
 * „gedeckt ⇒ evidence vorhanden" entstünde sonst der Eindruck, jede Deckung
 * sei belegt. Deshalb steht die Begründung hier ausdrücklich als
 * Einschätzung des Modells beschriftet und nicht in Anführungszeichen.
 */

export interface GapListProps {
  requirements: readonly Requirement[]
  gaps: GapAnalysisHandle
  defaultOpen: boolean
}

/**
 * Die drei Zustände tragen ihre Bedeutung im **Wort**, nicht in der Farbe
 * (DESIGN.md). Die Farbe ist nur die zweite Spur: `--color-error` für
 * „fehlt", gewöhnliche Textfarbe für alles andere. `--color-warning` wäre
 * für „teilweise" naheliegend und ist als Textfarbe verboten, weil sie
 * 4,5:1 nirgends erreicht.
 */
function statusClass(status: GapEntry['status']): string {
  return status === 'missing'
    ? 'text-[var(--color-error)]'
    : 'text-[var(--color-ink)]'
}

export function GapList({ requirements, gaps, defaultOpen }: GapListProps) {
  const { t } = useTranslation()
  const byIndex = new Map(gaps.entries.map((entry, index) => [index, entry]))

  return (
    <SidePanel
      title={t('editor.gaps.heading')}
      badge={
        <span className={FIELD_HINT_CLASS}>
          {t('editor.gaps.count', { count: requirements.length })}
        </span>
      }
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-4">
        {requirements.length === 0 ? (
          <p className={FIELD_HINT_CLASS}>{t('editor.gaps.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requirements.map((requirement, index) => {
              const entry = byIndex.get(index)
              return (
                <li key={`${index}-${requirement.text}`} className="flex flex-col gap-1">
                  <p className="text-[var(--color-ink)]">{requirement.text}</p>
                  <p className={FIELD_HINT_CLASS}>
                    {t(`editor.gaps.kind.${requirement.kind}`)}
                  </p>
                  {entry !== undefined && (
                    <>
                      <p
                        className={cn(
                          'text-[length:var(--text-body-sm-size)] font-medium',
                          statusClass(entry.status),
                        )}
                      >
                        {t(`editor.gaps.status.${entry.status}`)}
                      </p>
                      {entry.evidence !== null && (
                        <p className={FIELD_HINT_CLASS}>
                          {t('editor.gaps.evidence', { evidence: entry.evidence })}
                        </p>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {requirements.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
            {gaps.status === 'failed' && <AiErrorNotice error={gaps.error} />}
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={gaps.status === 'loading'}
              onClick={gaps.run}
            >
              {gaps.status === 'loading'
                ? t('editor.gaps.running')
                : gaps.status === 'ready'
                  ? t('editor.gaps.again')
                  : t('editor.gaps.run')}
            </Button>
            <p className={FIELD_HINT_CLASS}>
              {gaps.status === 'ready' ? t('editor.gaps.assessment') : t('editor.gaps.hint')}
            </p>
          </div>
        )}
      </div>
    </SidePanel>
  )
}
