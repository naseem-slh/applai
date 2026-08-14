import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Der Umschalter zwischen den Unterlagen der Bewerbung.
 *
 * **Ein Schritt, zwei Dokumente.** Die Seitenspalten gehören der Bewerbung —
 * Anforderungen, Lückenliste, Wahrheitsmodus, Export — und bleiben stehen;
 * nur das Blatt in der Mitte wechselt. Deshalb steht der Umschalter über dem
 * Blatt und nicht in der Kopfzeile: Er sagt „ein anderes Dokument", nicht
 * „ein anderer Arbeitsschritt".
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
    <div
      role="radiogroup"
      aria-label={t('editor.switch.label')}
      className="flex flex-none items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 pt-2.5 lg:px-6"
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
              'focus-ring rounded-t-md border border-b-0 px-3 py-1.5',
              'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]',
              'transition-colors',
              selected
                ? 'border-[var(--color-border)] bg-[var(--color-surface)] font-semibold text-[var(--color-ink-strong)]'
                : 'border-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
            )}
          >
            {t(`editor.switch.${kind}`)}
            {beta.includes(kind) && (
              <span
                aria-hidden="true"
                className="ml-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-1.5 py-0.5 text-[length:var(--text-label-size)] font-semibold tracking-[var(--text-label-tracking)] text-[var(--color-muted)] uppercase"
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
