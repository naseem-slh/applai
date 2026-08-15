import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Schalter — sofort wirksames Ja/Nein (Anonymisierung, Wahrheitsmodus,
// dunkle Darstellung). Kein Formularfeld mit Speichern-Knopf.
//
// Der Zustand hängt nie allein an der Farbe: der Knauf steht links oder
// rechts, und Radix meldet role="switch" mit aria-checked. Minze heißt an —
// dieselbe Farbe, die überall sonst „erledigt" sagt.
//
// **Die Maße stammen aus der Attrappe und rechnen sich auf.** 62 × 34 außen,
// davon 3 px Kontur ringsum, macht 56 × 28 innen. Der Knauf ist 24 px groß
// und sitzt mit 2 px Luft oben, unten und an seiner Seite; sein Weg ist
// 56 − 24 − 2 − 2 = 28 px, deshalb `translate-x-7`. Ein Schalter lebt davon,
// flacher zu sein als die Felder um ihn herum; auf Feldhöhe gebracht wäre er
// als Schalter nicht mehr zu erkennen.
export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'focus-ring relative inline-flex h-[34px] w-[62px] shrink-0 items-center',
        'rounded-pill border-[3px] border-[var(--line)] p-0 transition-colors',
        'data-[state=unchecked]:bg-[var(--field)]',
        'data-[state=checked]:bg-[var(--done)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 block size-6 rounded-pill',
          'border-[3px] border-[var(--line)] bg-[var(--card)]',
          // Federnd, nicht gleitend: Der Knauf rastet ein, wie alles in
          // dieser Welt, das einen Anschlag hat.
          'transition-transform duration-200 ease-bounce',
          'data-[state=unchecked]:translate-x-0',
          'data-[state=checked]:translate-x-7',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
