import { useState, type ComponentProps } from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Regler — bewusst nur in wenigen, benennbaren Stufen statt stufenlos von
// 0 bis 100. In Aufgabe 14 steuern zwei davon die Formulierung des
// Auftrags an das Modell (förmlich ↔ locker, kurz ↔ ausführlich); ein Wert
// wie „63" wäre dort ohne Bedeutung — und eine Modelltemperatur ist es
// auch nicht, die ist bei allen drei Anbietern tot. Deshalb ist `steps`
// eine Liste von Beschriftungen: ihr Index ist der Wert, ihr Text steht
// unter der Schiene und wird als aria-valuetext angesagt.
//
// Wie die Stufen sichtbar werden (verbindlich für 13b–15, damit nicht jede
// Ansicht ihre eigene Beschriftung erfindet):
//
//   ├──────●─────────┤
//   förmlich  neutral  locker
//
// Unter der Schiene steht eine Zeile aus drei Feldern: links die erste
// Stufe, rechts die letzte, in der Mitte hervorgehoben die aktuelle. Die
// beiden Enden sagen, wofür die Achse steht; die Mitte sagt, wo man
// gerade ist. Nur die Enden zu zeigen würde die eigentliche Lücke nicht
// schließen — bei fünf Stufen ist an der Griffposition nicht abzulesen, ob
// „eher förmlich" oder „neutral" gewählt ist. Steht der Griff an einem
// Ende, erscheint dessen Name zweimal (klein außen, hervorgehoben in der
// Mitte); das liest sich als Bestätigung und nicht als Fehler.
//
// Bewusst ohne Teilstriche auf der Schiene: sie müssten zugleich auf der
// gefüllten (Tangerine) und auf der leeren Hälfte (--field) erkennbar sein,
// was mit einer Farbe nicht geht, und sie trügen keine Auskunft, die nicht
// schon im Namen der Stufe steht. Dass die Skala stuft, zeigt das Einrasten
// des Griffs.
//
// Die Beschriftungszeile ist aria-hidden: dieselbe Auskunft steht als
// aria-valuetext am Griff, und ohne das Attribut läse die Vorlesesoftware
// sie im Lesemodus ein zweites Mal vor.

export interface SliderProps
  extends Omit<
    ComponentProps<typeof SliderPrimitive.Root>,
    | 'value'
    | 'defaultValue'
    | 'onValueChange'
    | 'onValueCommit'
    | 'min'
    | 'max'
    | 'step'
    | 'orientation'
    | 'aria-label'
    | 'aria-labelledby'
  > {
  /** Beschriftung je Stufe, von links nach rechts. Der Typ verlangt
   *  mindestens zwei: mit einer einzigen Stufe gäbe es nichts zu regeln,
   *  und `max` müsste entweder 0 sein (der Regler ließe sich nicht
   *  bewegen) oder 1 — dann meldete eine Pfeiltaste den Wert 1 nach außen,
   *  zu dem es gar keine Stufe gibt. */
  steps: readonly [string, string, ...string[]]
  /** Index der aktuellen Stufe (gesteuert). */
  value?: number
  /** Index der Anfangsstufe (ungesteuert). */
  defaultValue?: number
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
  /** Gehört an den Griff, nicht an die Schiene — dort sitzt role="slider". */
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function Slider({
  steps,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  className,
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: SliderProps) {
  // Spiegel des ungesteuerten Werts. Radix könnte den Wert selbst halten,
  // aber aria-valuetext und die sichtbare Beschriftung brauchen ihn hier —
  // sonst bliebe beides stehen.
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? 0)
  const max = steps.length - 1
  const current = Math.min(Math.max(value ?? uncontrolled, 0), max)

  function handleChange([next]: number[]) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  return (
    // Die Klasse von außen liegt am äußeren Kasten, nicht an der Schiene:
    // was der Aufrufer setzt (Breite, Rand), soll die Beschriftung
    // mitnehmen. Der Griff hängt an der Schiene und wird darin absolut
    // gesetzt — deshalb bleibt die Schiene eine eigene Zeile, statt die
    // Beschriftung in dieselbe Flexbox zu holen.
    <div className={cn('w-full', className)}>
      <SliderPrimitive.Root
        min={0}
        max={max}
        step={1}
        value={[current]}
        onValueChange={handleChange}
        onValueCommit={([next]) => onValueCommit?.(next)}
        disabled={disabled}
        className={cn(
          'relative flex w-full touch-none items-center select-none',
          'data-[disabled]:opacity-50',
        )}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            // 14 px Schiene mit 3 px weicher Tinte — dieselbe Kontur, die
            // jedes Eingabefeld trägt. Höher gelesen wäre sie ein
            // Fortschrittsbalken, dünner verschwände die Kontur darin.
            'relative h-[14px] w-full grow overflow-hidden rounded-pill',
            'border-[3px] border-[var(--line-soft)] bg-[var(--field)]',
          )}
        >
          <SliderPrimitive.Range className="absolute h-full bg-[var(--accent)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            // Der Griff trägt die volle Tinte, die Schiene die weiche: Was
            // man anfasst, ist kräftiger umrandet als das, worauf es läuft.
            'focus-ring block size-6 rounded-pill border-[3px]',
            'border-[var(--line)] bg-[var(--accent)] transition-colors',
          )}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-valuetext={steps[current]}
        />
      </SliderPrimitive.Root>
      {/* Die Enden sagen, wofür die Achse steht; die Mitte sagt, wo man
          gerade ist. Der Stand steht in Fredoka, weil er erkannt und nicht
          gelesen wird. */}
      <div
        aria-hidden="true"
        className={cn(
          // 1fr auto 1fr statt drei gleicher Spalten: der Stand in der
          // Mitte bekommt, was er braucht (und bleibt trotzdem mittig, weil
          // beide Seiten gleich wachsen), die Enden teilen sich den Rest.
          // Bei langen Stufennamen bricht so eher ein Ende um als der Stand.
          'mt-2 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2',
          disabled && 'opacity-50',
        )}
      >
        <span className="text-[length:var(--text-caption-size)] text-[var(--muted)]">
          {steps[0]}
        </span>
        <span className="text-center font-display text-[length:var(--text-body-sm-size)] font-semibold text-[var(--ink-strong)]">
          {steps[current]}
        </span>
        <span className="text-right text-[length:var(--text-caption-size)] text-[var(--muted)]">
          {steps[max]}
        </span>
      </div>
    </div>
  )
}
