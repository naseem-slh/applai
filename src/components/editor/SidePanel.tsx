import { useId, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

/**
 * Ein Bereich der ruhigen Spalte neben dem Brief: Briefkopf, Lückenliste,
 * Stilprofil.
 *
 * **`<details>` statt eines nachgebauten Aufklappers.** Der Browser bringt
 * die Tastaturbedienung, den Zustand und die Ansage an die Vorlesesoftware
 * mit; `design.css` führt `summary` bereits in der Liste der Elemente, die
 * einen Fokusring bekommen. Ein Radix-Primitiv dafür wäre eine Abhängigkeit
 * mehr (G9) für etwas, das HTML kann.
 *
 * **Offen auf breiten Fenstern, zugeklappt auf schmalen** — der Plan
 * verlangt „auf schmalen Bildschirmen als aufklappbarer Bereich". Die
 * Entscheidung fällt **einmal**, beim ersten Rendern (`defaultOpen`): Wer
 * einen Bereich von Hand zuklappt, soll ihn nicht dadurch wieder
 * aufgerissen bekommen, dass er das Fenster breiter zieht. Deshalb
 * `defaultOpen` und kein gesteuertes `open`.
 *
 * Die Überschrift ist ein `<h3>` **im** `<summary>`: Der Bereich soll in der
 * Überschriftenliste einer Vorlesesoftware auftauchen (unter der `<h2>` der
 * Dokumentspalte), und das Aufklappelement bleibt trotzdem das, was es ist.
 */

export interface SidePanelProps {
  title: ReactNode
  /** Kurze Auskunft rechts in der Kopfzeile, etwa eine Anzahl. */
  badge?: ReactNode
  defaultOpen: boolean
  children: ReactNode
  className?: string
}

export function SidePanel({ title, badge, defaultOpen, children, className }: SidePanelProps) {
  const headingId = useId()

  return (
    <Card asChild variant="default" padding="none" className={cn('overflow-hidden', className)}>
      <details open={defaultOpen}>
        {/* `list-none` samt Webkit-Regel: Das Dreieck des Browsers säße vor
            der Überschrift und brächte eine zweite, nicht gestaltbare
            Zeichnung in eine Oberfläche ohne Sinnbild-Paket (DESIGN.md). */}
        <summary
          className={cn(
            'focus-ring flex cursor-pointer list-none items-center justify-between gap-3',
            'rounded-lg px-4 py-3 select-none',
            'hover:bg-[var(--color-surface-hover)]',
            '[&::-webkit-details-marker]:hidden',
          )}
        >
          <h3
            id={headingId}
            className="text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
          >
            {title}
          </h3>
          <span className="flex items-center gap-2">
            {badge}
            <ChevronGlyph />
          </span>
        </summary>
        <div className="border-t border-[var(--color-border)] px-4 py-4">{children}</div>
      </details>
    </Card>
  )
}

/**
 * Der Aufklapp-Winkel, wie in `Select.tsx` — viertes Inline-Sinnbild des
 * Projekts, kein Paket (G2, G9). Er dreht sich mit dem Zustand des
 * `<details>` und ist `aria-hidden`: Was er sagt, sagt das Element selbst
 * schon über `aria-expanded`.
 */
function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
