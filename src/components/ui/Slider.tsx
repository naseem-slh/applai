import { useState, type ComponentProps } from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Regler — bewusst nur in wenigen, benennbaren Stufen statt stufenlos von
// 0 bis 100. In Aufgabe 14 steuern zwei davon die Formulierung des
// Auftrags an das Modell (förmlich ↔ locker, kurz ↔ ausführlich); ein Wert
// wie „63" wäre dort ohne Bedeutung. Deshalb ist `steps` eine Liste von
// Beschriftungen: ihr Index ist der Wert, ihr Text wird als
// aria-valuetext angesagt, damit die Vorlesesoftware „locker" meldet und
// nicht „4".

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
  /** Beschriftung je Stufe, von links nach rechts. Mindestens zwei. */
  steps: readonly string[]
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
  // aber aria-valuetext braucht ihn hier — sonst bliebe die Ansage stehen.
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? 0)
  const lastIndex = steps.length - 1
  const max = Math.max(lastIndex, 1)
  const current = Math.min(Math.max(value ?? uncontrolled, 0), max)

  function handleChange([next]: number[]) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  return (
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
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'relative h-1.5 w-full grow overflow-hidden rounded-full',
          'border border-[var(--color-control-border)]',
          'bg-[var(--color-surface-alt)]',
        )}
      >
        <SliderPrimitive.Range className="absolute h-full bg-[var(--color-accent)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          'focus-ring block size-5 rounded-full border-2',
          'border-[var(--color-accent)] bg-[var(--color-surface-raised)]',
          'shadow-[var(--shadow-raised)] transition-colors',
        )}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={steps[Math.min(current, Math.max(lastIndex, 0))]}
      />
    </SliderPrimitive.Root>
  )
}
