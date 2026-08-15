import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import type { LocatedClaim } from './unbackedClaims'

/**
 * Die unbelegten Aussagen im Brief, einzeln bestätigbar — und die
 * Exportsperre, solange eine davon offen ist.
 *
 * Das ist die dritte Hälfte von G10 (Markierung, Einzelbestätigung,
 * Exportsperre). Die Markierung im Text macht `DocumentView` über
 * `claimParagraphs`; hier stehen die Aussagen im Wortlaut, mit je einem
 * Knopf.
 *
 * **Warum die Aussagen hier zitiert werden und nicht im Absatz farbig
 * unterlegt sind.** Eine Hervorhebung *innerhalb* eines Absatzes bräuchte
 * ein Zwischenelement im Absatztext — genau das, was die Offset-Rechnung
 * der Arbeitsfläche ausschließt (`documentSelection.ts`, Kopfkommentar: der
 * Textinhalt eines Absatzes im DOM ist zeichengleich mit `Paragraph.text`).
 * Ein Zwischenelement dort verschöbe jede Markierung und damit jede
 * Ersetzung um die Länge der eingefügten Auszeichnung; das ist der eine
 * Fehler, den dieses Projekt an der Datei des Nutzers nicht machen darf.
 *
 * Erreicht wird dasselbe auf dem Weg, den 14a für die festgehaltenen
 * Absätze vorgezeichnet hat: **Der Absatz** bekommt eine Kontur, und die
 * Aussage steht daneben im Wortlaut. Farbe trägt die Bedeutung damit nie
 * allein (DESIGN.md, Kontrast) — sie ist der Wegweiser, der Text ist die
 * Auskunft. Die genauere Hervorhebung bleibt für 14c offen, wo dieselbe
 * Frage für die Fremdfirmen-Treffer noch einmal gestellt wird.
 *
 * **Bestätigen heißt nicht ändern.** Der Knopf hebt nur die Sperre für
 * diese eine Aussage auf; am Text ändert er nichts. Wer die Aussage nicht
 * bestätigen will, löscht oder überschreibt sie im Dokument — dann findet
 * `locateClaims` sie nicht mehr und die Sperre fällt von selbst weg.
 */

export interface ClaimGuardProps {
  /** Alle im aktuellen Stand auffindbaren Aussagen, bestätigte eingeschlossen. */
  claims: readonly LocatedClaim[]
  onConfirm: (id: string) => void
  headingId: string
}

export function ClaimGuard({ claims, onConfirm, headingId }: ClaimGuardProps) {
  const { t } = useTranslation()
  const pending = claims.filter((claim) => !claim.confirmed)

  // Kein Kasten, solange nichts dasteht. Ein dauerhaft sichtbarer
  // Leerzustand („keine unbelegten Aussagen") wäre eine Auskunft über etwas,
  // das im strengen Modus nie eintritt.
  if (claims.length === 0) return null

  return (
    // `default`, nicht `subtle`: Der gedämpfte Hinweistext (`--color-muted`)
    // erreicht auf `surface-alt` keine 4,5:1 (DESIGN.md, Kontrast), und die
    // Fundstellen unter jeder Aussage sind genau solcher Text.
    <Card asChild variant="default" padding="md">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h3
          id={headingId}
          className="text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
        >
          {t('editor.claims.heading')}
        </h3>

        {/* Die Sperre selbst. `role="status"`, nicht `alert`: Sie steht
            schon da, bevor jemand exportieren will, und ist eine
            Zustandsauskunft, keine Unterbrechung. */}
        <p
          role="status"
          className={
            pending.length > 0
              ? 'text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-error)]'
              : 'text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink)]'
          }
        >
          {pending.length > 0
            ? t('editor.claims.blocked', { count: pending.length })
            : t('editor.claims.released')}
        </p>

        <ul className="flex flex-col gap-3">
          {claims.map((claim) => (
            <li key={claim.id} className="flex flex-col gap-2">
              <p className="text-[var(--color-ink)]">
                <q>{claim.text}</q>
              </p>
              <p className={FIELD_HINT_CLASS}>
                {t('editor.claims.location', {
                  paragraphs: claim.paragraphs.map((index) => index + 1).join(', '),
                  count: claim.paragraphs.length,
                })}
              </p>
              {claim.confirmed ? (
                <p className={FIELD_HINT_CLASS}>{t('editor.claims.confirmed')}</p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => onConfirm(claim.id)}
                >
                  {t('editor.claims.confirm')}
                </Button>
              )}
            </li>
          ))}
        </ul>

        <p className={FIELD_HINT_CLASS}>{t('editor.claims.hint')}</p>
      </section>
    </Card>
  )
}
