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
 *
 * **Eine Pille mit Abschnitten, nicht drei Knöpfe nebeneinander.** Die Reihe
 * trägt außen die weiche Tinte eines Eingabefeldes — sie ist ein Feld, in
 * dem etwas gewählt wird. Die getroffene Wahl bekommt die Akzentfläche
 * **und** eine eigene Kontur in voller Tinte: Sie ist damit nicht nur an der
 * Farbe zu erkennen, sondern auch an der Linie ringsum.
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
        'inline-flex max-w-full gap-[3px] rounded-pill border-[3px] border-[var(--line-soft)]',
        'bg-[var(--field)] p-[3px]',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'focus-ring rounded-pill border-[3px] border-transparent px-[15px]',
            'pt-[7px] pb-[8px] font-display text-[length:var(--text-body-sm-size)]',
            // `min-w-0` statt `whitespace-nowrap`: Auf einem 360px breiten
            // Fenster passen „Hell", „Dunkel" und „Wie das System"
            // nebeneinander nicht in eine Zeile, und eine Reihe, die sich
            // nicht kleinmachen kann, schiebt die ganze Karte über den
            // Fensterrand. Lieber bricht eine lange Beschriftung um.
            'min-w-0 font-semibold transition-colors',
            'text-[var(--muted)] not-disabled:hover:text-[var(--ink-strong)]',
            // Die getroffene Wahl: Akzentfläche **und** volle Tinte ringsum.
            // `accent-ink` auf Tangerine erreicht 6,89:1 (siehe DESIGN.md).
            'data-[state=on]:border-[var(--line)] data-[state=on]:bg-[var(--accent)]',
            'data-[state=on]:text-[var(--accent-ink)]',
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
