import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Der Umschalter zwischen den Unterlagen der Bewerbung.
 *
 * **Ein Schritt, zwei Dokumente.** Die Seitenspalten gehören der Bewerbung —
 * Anforderungen, Lückenliste, Wahrheitsmodus, Export — und bleiben stehen;
 * nur das Blatt in der Mitte wechselt.
 *
 * Er steht in der Kopfzeile, rechts neben der Marke. Er gehört zur Anwendung
 * und nicht zum Blatt: Er sagt, **woran** man arbeitet, und nicht, was man
 * damit macht. Die Mittelspalte trägt dadurch nur noch die Seite, und die
 * beginnt auf derselben Höhe wie die beiden Seitenspalten.
 *
 * **Er erscheint nur, wenn es etwas zu schalten gibt** — bei einer Bewerbung,
 * die nur den Lebenslauf verlangt, wäre eine Leiste mit einem einzigen
 * Eintrag eine Wahl, die keine ist.
 *
 * **`radiogroup`, nicht `tablist`.** Die beiden Dokumente sind kein
 * Reitersatz über einem gemeinsamen Inhalt: Beide bleiben eingehängt, jedes
 * behält seinen Verlauf und seine Markierung, und der ruhende ist nicht
 * entladen, sondern nur verborgen. Eine Auswahl beschreibt das richtig, ein
 * Reiter würde eine Umschaltung von Inhalt versprechen, die hier nicht
 * stattfindet.
 */

export type DocumentKind = 'letter' | 'cv'

export interface DocumentSwitchProps {
  /** Was zur Wahl steht — in dieser Reihenfolge. Weniger als zwei zeigt nichts. */
  available: readonly DocumentKind[]
  active: DocumentKind
  onChange: (kind: DocumentKind) => void
  /**
   * Welche Unterlagen als **Beta** gekennzeichnet sind.
   *
   * Die Marke ist `aria-hidden`: Sie wiederholt sichtbar, was der
   * Prüfhinweis über dem Blatt ohnehin ausspricht (siehe `DocumentColumn`).
   * Sie in den Namen des Reiters zu ziehen hieße, Vorlesesoftware dasselbe
   * Wort zweimal ansagen zu lassen — einmal beim Umschalten, einmal darunter.
   */
  beta?: readonly DocumentKind[]
}

export function DocumentSwitch({ available, active, onChange, beta = [] }: DocumentSwitchProps) {
  const { t } = useTranslation()

  if (available.length < 2) return null

  return (
    // Dieselbe Pille mit Abschnitten wie die Auswahlreihe (`ui/Choice`),
    // aber mit voller Tinte und harter Kante statt weicher: Sie steht in der
    // Kopfzeile auf dem Blatt und nicht in einer Karte, und dort trägt jedes
    // Element die kräftige Kontur.
    <div
      role="radiogroup"
      aria-label={t('editor.switch.label')}
      className={cn(
        'pop inline-flex flex-none items-center gap-[3px] rounded-pill',
        'border-[3px] border-[var(--line)] bg-[var(--card)] p-[3px] [--pop-height:4px]',
      )}
    >
      {available.map((kind) => {
        const selected = kind === active
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(kind)}
            className={cn(
              'focus-ring rounded-pill border-[3px] border-transparent px-4 pt-[7px] pb-[8px]',
              'font-display text-[length:var(--text-body-sm-size)] font-semibold',
              'whitespace-nowrap transition-colors',
              selected
                ? 'border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'text-[var(--muted)] hover:text-[var(--ink-strong)]',
            )}
          >
            {t(`editor.switch.${kind}`)}
            {beta.includes(kind) && (
              <span
                aria-hidden="true"
                className="ml-2 rounded-pill border-2 border-[var(--line-soft)] bg-[var(--field)] px-1.5 py-0.5 text-[length:var(--text-label-size)] font-semibold tracking-[var(--text-label-tracking)] text-[var(--muted)] uppercase"
              >
                {t('editor.beta.badge')}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
