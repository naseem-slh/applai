import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Eine Reihe von zwei bis vier Möglichkeiten, von denen genau eine gilt.
 *
 * **Warum nicht die Auswahlliste.** Bis zum Aufräumen der Einstellungen
 * standen Darstellung, Sprache und Wahrheitsgrenze in je einem `Select`.
 * Drei Nachteile auf einmal: Die Möglichkeiten sind unsichtbar, bis man
 * öffnet; es kostet zwei Klicks statt einem; und eine 380 px breite Liste
 * in einer 672 px breiten Spalte lässt die halbe Zeile leer. Bei zwei oder
 * drei kurzen Werten ist die Reihe in jeder Hinsicht die bessere Bauform.
 * Ab etwa fünf Werten kehrt sich das um, dann ist die Liste richtig.
 *
 * **Radix' ToggleGroup, nicht selbst gebaut.** Sie bringt die Pfeiltasten,
 * `role="radiogroup"` samt Zustand und den einen Tabulatorhalt für die
 * ganze Reihe mit. Das Paket `radix-ui` liegt bereits im Projekt; es kommt
 * also keine Abhängigkeit dazu (G9).
 *
 * **`type="single"` mit erzwungenem Wert.** Ohne `value !== ''`-Schranke
 * ließe Radix das erneute Drücken des aktiven Knopfes die Auswahl leeren.
 * Eine Darstellung „gar keine" gibt es aber nicht.
 */

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

export interface ChoiceProps<T extends string> {
  /** Zugänglicher Name der Reihe, etwa „Darstellung". */
  label: string
  value: T
  options: readonly ChoiceOption<T>[]
  onValueChange: (value: T) => void
  disabled?: boolean
  /** Über die volle Breite, mit gleich breiten Feldern. */
  block?: boolean
  className?: string
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled,
  block = false,
  className,
}: ChoiceProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      aria-label={label}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== '') onValueChange(next as T)
      }}
      className={cn(
        'inline-flex overflow-hidden rounded-md border border-[var(--color-control-border)]',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((option, index) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'focus-ring h-9 px-3 text-[length:var(--text-body-sm-size)] whitespace-nowrap',
            'bg-[var(--color-surface-raised)] text-[var(--color-ink)]',
            'hover:bg-[var(--color-surface-hover)]',
            // Trennlinie zwischen den Feldern statt einer Kontur um jedes:
            // Die Reihe ist ein Bedienelement, nicht drei nebeneinander.
            index > 0 && 'border-l border-[var(--color-control-border)]',
            // Der aktive Wert trägt die Akzentfläche. Weiß auf #0077B6
            // erreicht 4,6:1 und damit AA für Fließtext (siehe design.css).
            'data-[state=on]:bg-[var(--color-accent)] data-[state=on]:font-semibold',
            'data-[state=on]:text-[var(--color-accent-contrast)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            block && 'flex-1',
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}
