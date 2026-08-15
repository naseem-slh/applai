import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { SidePanel } from './SidePanel'
import { visibleText, type ProofreadingFinding } from './proofreading'

/**
 * Was die Textprüfung gefunden hat, Zeile für Zeile.
 *
 * **Warum es die Liste gibt, obwohl es die Wellenlinie gibt.** Eine
 * Wellenlinie findet nur, wer ohnehin auf das richtige Wort schaut. Ohne
 * Liste weiß niemand, dass der Brief überhaupt drei Befunde trägt, und
 * niemand kann sie der Reihe nach abarbeiten. Word hält aus genau diesem
 * Grund neben der Wellenlinie ein Prüffenster. Nebenbei ist das auch der
 * Weg, der ohne Maus funktioniert — der Klick auf die Wellenlinie ist es
 * nicht.
 *
 * **Die Regel steht als Wort da, nicht nur als Farbe** (DESIGN.md): Die
 * Wellenlinie im Text ist die zweite Spur, nicht die einzige.
 *
 * Ein Klick auf den Eintrag springt an die Stelle — derselbe Handgriff wie
 * in der Merkliste (`selectMark`).
 */

export interface ProofreadingPanelProps {
  findings: readonly ProofreadingFinding[]
  /** An die Stelle springen: markieren und ins Bild rollen. */
  onSelect: (finding: ProofreadingFinding) => void
  onApply: (finding: ProofreadingFinding) => void
  defaultOpen: boolean
}

export function ProofreadingPanel({
  findings,
  onSelect,
  onApply,
  defaultOpen,
}: ProofreadingPanelProps) {
  const { t } = useTranslation()

  return (
    <SidePanel
      title={t('editor.proofreading.heading')}
      badge={
        <span className={FIELD_HINT_CLASS}>
          {t('editor.proofreading.count', { count: findings.length })}
        </span>
      }
      defaultOpen={defaultOpen}
    >
      {findings.length === 0 ? (
        <p className={FIELD_HINT_CLASS}>{t('editor.proofreading.none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((finding) => (
            <li key={finding.id} className="flex flex-col gap-1">
              <button
                type="button"
                className="focus-ring self-start rounded-md text-left text-[var(--color-ink)] hover:underline"
                onClick={() => onSelect(finding)}
              >
                {t('editor.proofreading.replace', {
                  found: visibleText(finding.found),
                  suggestion: visibleText(finding.suggestion),
                })}
              </button>
              <p className={FIELD_HINT_CLASS}>
                {finding.paragraph === null
                  ? t(`editor.proofreading.rules.${finding.rule}`)
                  : t('editor.proofreading.entry', {
                      rule: t(`editor.proofreading.rules.${finding.rule}`),
                      paragraph: finding.paragraph + 1,
                    })}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => onApply(finding)}
              >
                {t('editor.proofreading.apply')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  )
}
