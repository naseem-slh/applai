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
 * **Die Maße folgen dem Schalter, nicht der Aufbau-Skala.** 20 px Kantenlänge
 * ist ein Feinmaß im Sinne von DESIGN.md: Auf die kleinste Stufe der Skala
 * gebracht (8 px) wäre es unsichtbar, auf die nächste (16 px) noch immer
 * unter der Mindestzielgröße von WCAG 2.5.8. Bedient wird es ohnehin meist
 * über seine Beschriftung, die der Aufrufer mit `<label htmlFor>` daran
 * hängt; 24 × 24 erreicht die Fläche mit dem umgebenden Abstand.
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
        'focus-ring inline-flex size-5 shrink-0 items-center justify-center',
        'rounded-sm border transition-colors',
        'data-[state=unchecked]:border-[var(--color-control-border)]',
        'data-[state=unchecked]:bg-[var(--color-surface-raised)]',
        'data-[state=unchecked]:hover:bg-[var(--color-surface-hover)]',
        'data-[state=checked]:border-[var(--color-accent)]',
        'data-[state=checked]:bg-[var(--color-accent)]',
        // Der unbestimmte Zustand sieht aus wie der gesetzte, trägt aber
        // einen Balken statt eines Hakens. Radix schickt ihn nur, wenn der
        // Aufrufer `checked="indeterminate"` setzt.
        'data-[state=indeterminate]:border-[var(--color-accent)]',
        'data-[state=indeterminate]:bg-[var(--color-accent)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--color-accent-contrast)]">
        {props.checked === 'indeterminate' ? (
          <span className="block h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
