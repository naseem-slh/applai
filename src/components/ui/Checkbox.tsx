import type { ComponentProps } from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { CheckIcon } from './icons'
import { cn } from '@/lib/utils'

/**
 * Ein Kontrollkästchen — eine Eigenschaft, die gesetzt ist oder nicht.
 *
 * **Wann dieses und wann der Schalter.** Der `Switch` sagt „ab jetzt gilt
 * etwas anderes": Anonymisierung an, dunkle Darstellung an. Er wirkt sofort
 * und verändert das Verhalten der Anwendung. Das Kästchen sagt „diese Sache
 * hat diese Eigenschaft" — etwa, dass eine Merkliste für die nächste
 * Bewerbung aufgehoben werden soll. Beides mit demselben Bedienelement zu
 * zeigen, nähme dem Schalter genau die Aussage, für die er gebaut ist.
 *
 * **Die Maße folgen dem Schalter, nicht der Aufbau-Skala.** 24 px Kantenlänge
 * ist ein Feinmaß im Sinne von DESIGN.md und zugleich genau die
 * Mindestzielgröße aus WCAG 2.5.8. Der Radius ist die kleinste Stufe der
 * Skala (`--radius-sheet`, 8 px): `--radius-control` (16 px) machte aus einem
 * 24-px-Kästchen fast einen Kreis, und ein Kreis heißt in jeder Oberfläche
 * „genau eines von mehreren". Bedient wird es ohnehin meist über seine
 * Beschriftung, die der Aufrufer mit `<label htmlFor>` daran hängt.
 *
 * **Es hat die harte Kante wie alles, was man anfasst.** Sie war das
 * Einzige, was dieses Kästchen von der übrigen Welt trennte: ein flaches
 * Rechteck zwischen lauter Dingen mit Fußpunkt. `pop-press` gibt ihm die
 * Kante samt Druckpunkt — 3 px, das Maß der kleinen Knöpfe, nicht die 8 px
 * der Karten. Der Schalter daneben bekommt sie ausdrücklich **nicht**: Er ist
 * eine Rille, in der ein Knauf läuft, und Rillen liegen nicht auf.
 *
 * **Gesetzt wird es mit einem Ruck.** Das Kästchen macht denselben kurzen
 * Satz wie der freigeschaltete Weiter-Knopf (`animate-pop`), das Häkchen
 * kommt mit der Blende der Überlagerungen herein. Beides sind vorhandene
 * Bewegungen des Hauses; eine eigene wäre eine Bewegung mehr, die niemand
 * wiedererkennt.
 *
 * **Das Häkchen ist nie die einzige Auskunft.** Radix meldet
 * `role="checkbox"` samt `aria-checked`; die Glyphe ist deshalb
 * `aria-hidden` und trägt nur die sichtbare Hälfte.
 */
export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'focus-ring pop-press inline-flex size-6 shrink-0 items-center justify-center',
        'rounded-sheet border-[3px] [--pop-height:3px] [--pop-lift:2px]',
        'data-[state=unchecked]:border-[var(--line-soft)]',
        'data-[state=unchecked]:bg-[var(--field)]',
        'data-[state=unchecked]:not-disabled:hover:border-[var(--accent-line)]',
        // Leer trägt es die weiche Kontur, also auch die weiche Kante —
        // dieselbe Regel wie am stillen Knopf. Gesetzt springen beide auf
        // die volle Tinte.
        'data-[state=unchecked]:[--pop-color:var(--line-soft)]',
        // Gesetzt heißt „erledigt", und erledigt ist in dieser Welt minzgrün.
        // Die Kontur springt dabei auf die volle Tinte: Das Kästchen ist
        // gefüllt und damit kein Feld mehr, sondern eine Aussage.
        'data-[state=checked]:border-[var(--line)]',
        'data-[state=checked]:bg-[var(--done)]',
        'data-[state=checked]:animate-pop',
        // Der unbestimmte Zustand sieht aus wie der gesetzte, trägt aber
        // einen Balken statt eines Hakens. Radix schickt ihn nur, wenn der
        // Aufrufer `checked="indeterminate"` setzt.
        'data-[state=indeterminate]:border-[var(--line)]',
        'data-[state=indeterminate]:bg-[var(--done)]',
        // Gesperrt ist kein Ding mehr, das man anfassen kann: Die Kante geht
        // mit weg, sonst läge da ein Knopf, der sich nicht drücken lässt.
        'disabled:cursor-not-allowed disabled:opacity-50',
        'disabled:[--pop-color:transparent] disabled:[--pop-shadow:0_0_0_transparent]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex animate-content-in items-center justify-center text-[var(--done-ink)]">
        {props.checked === 'indeterminate' ? (
          <span className="block h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
