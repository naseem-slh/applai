import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import type { Letterhead } from '@/lib/domain/letterhead'
import { cn } from '@/lib/utils'
import { SidePanel } from './SidePanel'
import type { ForeignCompanies } from './foreignCompanies'
import type { LetterheadApplication } from './letterheadApply'

/**
 * Der Briefkopf: Empfänger, Datum, Betreff und Anrede — vorgeschlagen,
 * korrigierbar, und **einzeln** in den Brief einzusetzen.
 *
 * **Was „Übernahme" hier heißt** (`docs/spec.md`: „werden vorgeschlagen und
 * sind vor Übernahme prüfbar"): Der Nutzer markiert die Stelle im Brief, die
 * ersetzt werden soll, und setzt das Feld dort ein. Der naheliegende Weg —
 * den vorhandenen Briefkopf selbst finden und überschreiben — ist bewusst
 * nicht gegangen: Ein Anschreiben trägt Empfänger, Datum, Betreff und Anrede
 * in beliebig vielen Absätzen, in beliebiger Reihenfolge, oft in einer
 * Tabelle oder einem Textrahmen. Wer sie automatisch sucht, rät; und wer
 * beim Raten danebenliegt, überschreibt eine falsche Zeile in genau der
 * Datei, deren Unversehrtheit dieses Projekt verspricht. Die Markierung ist
 * die Angabe, die der Nutzer ohnehin macht — und sie ist genau.
 *
 * Eingesetzt wird über denselben Weg wie eine übernommene Variante
 * (`replaceRange` + `commit`, siehe `Editor.tsx`), ist also ein eigener
 * Verlaufsschritt und mit Strg+Z zurückzunehmen.
 *
 * **Die Fremdfirmen-Warnung steht hier**, weil sie dieselbe Frage stellt wie
 * der Empfänger: An wen ist dieser Brief gerichtet? Sie läuft ohne KI
 * (`findForeignCompanyNames`, Aufgabe 12) und fängt den klassischen
 * Kopierfehler ab — eine frühere Bewerbung als Vorlage, der alte Firmenname
 * blieb stehen. Markiert wird im Text der Absatz, hier steht der Name.
 *
 * **Seit der selbsttätigen Übernahme** setzt die Arbeitsfläche die sicher
 * gefundenen Felder selbst ein (`letterheadApply.ts`). Der Einsetzen-Knopf
 * bleibt trotzdem: Er ist der Weg für jedes Feld, das nicht sicher gefunden
 * wurde — die oben beschriebene Begründung gegen das Raten gilt unverändert.
 * Der Bericht darunter nennt Alt und Neu je Feld und macht damit einen
 * Teilersatz sichtbar, den die Absatzkontur allein nicht zeigen kann.
 */

export interface LetterheadPanelProps {
  letterhead: Letterhead
  onChange: (next: Letterhead) => void
  /**
   * Setzt einen Wert an der Markierung ein. `null`, solange nichts markiert
   * ist — dann sind die Knöpfe gesperrt und der Hinweis darunter sagt,
   * warum.
   */
  onInsert: ((value: string) => void) | null
  foreign: ForeignCompanies
  /**
   * Das Ergebnis der selbsttätigen Übernahme, `null`, solange keine
   * stattfand oder der Nutzer den Bericht weggeklickt hat.
   */
  application: LetterheadApplication | null
  onDismissApplication: () => void
  defaultOpen: boolean
}

const FIELDS = ['recipient', 'date', 'subject', 'salutation'] as const

export function LetterheadPanel({
  letterhead,
  onChange,
  onInsert,
  foreign,
  application,
  onDismissApplication,
  defaultOpen,
}: LetterheadPanelProps) {
  const { t } = useTranslation()
  const prefix = useId()

  return (
    <SidePanel
      title={t('editor.letterhead.heading')}
      badge={
        foreign.hits.length > 0 ? (
          <span className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-error)]">
            {t('editor.letterhead.foreign.badge', { count: foreign.hits.length })}
          </span>
        ) : undefined
      }
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-4">
        {FIELDS.map((field) => (
          <Field
            key={field}
            id={`${prefix}-${field}`}
            label={t(`editor.letterhead.fields.${field}`)}
          >
            {({ id, ...aria }) => (
              <div className="flex items-start gap-2">
                <Input
                  id={id}
                  {...aria}
                  value={letterhead[field]}
                  onChange={(event) => onChange({ ...letterhead, [field]: event.target.value })}
                />
                <Button
                  variant="secondary"
                  size="md"
                  disabled={onInsert === null || letterhead[field].trim() === ''}
                  onClick={() => onInsert?.(letterhead[field])}
                >
                  {t('editor.letterhead.insert')}
                </Button>
              </div>
            )}
          </Field>
        ))}

        <p className={FIELD_HINT_CLASS}>
          {onInsert === null
            ? t('editor.letterhead.insertHintNoSelection')
            : t('editor.letterhead.insertHint')}
        </p>

        {application !== null && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-info)]">
              {t('editor.letterhead.applied.heading')}
            </p>
            {application.changes.length === 0 ? (
              <p className={FIELD_HINT_CLASS}>{t('editor.letterhead.applied.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {application.changes.map((change) => (
                  <li key={change.field} className="text-[length:var(--text-body-sm-size)]">
                    <span className="font-medium">{t(`editor.letterhead.fields.${change.field}`)}</span>{' '}
                    {t('editor.letterhead.applied.change', {
                      previous: change.previous,
                      next: change.next,
                    })}
                  </li>
                ))}
                {application.missing.map((field) => (
                  <li
                    key={field}
                    className="text-[length:var(--text-body-sm-size)] text-[var(--color-muted)]"
                  >
                    <span className="font-medium">{t(`editor.letterhead.fields.${field}`)}</span>{' '}
                    {t('editor.letterhead.applied.missing')}
                  </li>
                ))}
              </ul>
            )}
            <p className={FIELD_HINT_CLASS}>{t('editor.letterhead.applied.hint')}</p>
            <div>
              <Button variant="secondary" size="md" onClick={onDismissApplication}>
                {t('editor.letterhead.applied.dismiss')}
              </Button>
            </div>
          </div>
        )}

        {foreign.hits.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
            <p
              role="alert"
              className={cn(
                'text-[length:var(--text-body-sm-size)] font-medium',
                'text-[var(--color-error)]',
              )}
            >
              {t('editor.letterhead.foreign.heading', { count: foreign.hits.length })}
            </p>
            <ul className="flex flex-col gap-1 text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
              {foreign.hits.map((hit) => (
                <li key={`${hit.name}-${hit.index}`}>
                  {hit.paragraph === null
                    ? hit.name
                    : t('editor.letterhead.foreign.entry', {
                        name: hit.name,
                        number: hit.paragraph + 1,
                      })}
                </li>
              ))}
            </ul>
            <p className={FIELD_HINT_CLASS}>{t('editor.letterhead.foreign.body')}</p>
          </div>
        )}
      </div>
    </SidePanel>
  )
}
