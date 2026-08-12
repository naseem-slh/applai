import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Eingabefeld und mehrzeiliges Feld — das neunte und zehnte Primitiv.
//
// Bis Aufgabe 13b lag die Gestalt als Klassenkonstante in `KeySetup.tsx`,
// mit der ausdrücklichen Regel in DESIGN.md: „Sobald eine zweite Ansicht
// ein Textfeld braucht, wird daraus ein Primitiv." Mit der Einstiegsseite
// (Stellenausschreibung, Name) und den Einstellungen sind es drei
// Ansichten, also steht es jetzt hier.
//
// Die Gestalt ist unverändert die des Auswahlauslösers (siehe Select.tsx):
// dieselbe Höhe, dieselbe Kontur, derselbe Radius. Ein Feld und eine
// Auswahlliste nebeneinander sollen als dieselbe Bauform zu erkennen sein.
const CONTROL_CLASS = [
  'focus-ring w-full rounded-md border border-[var(--color-control-border)]',
  'bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-ink)]',
  'transition-colors hover:border-[var(--color-accent)]',
  // Der Zustand hängt nie allein an der Farbe: `aria-invalid` trägt ihn für
  // die Vorlesesoftware, die Meldung unter dem Feld für alle anderen.
  'aria-invalid:border-[var(--color-error)]',
  'disabled:pointer-events-none disabled:opacity-50',
]

const inputClass = [...CONTROL_CLASS, 'h-10'].join(' ')

// Ein mehrzeiliges Feld fällt aus der Liste der Steuerhöhen (siehe
// DESIGN.md): Es steht nicht in einer Textzeile, sondern trägt einen
// Absatz. `py-2` und die Zeilenhöhe folgen deshalb dem Fließtext, nicht dem
// Raster der Knöpfe. Bewusst **nicht** mitwachsend (`field-sizing-content`):
// Eine eingefügte Stellenausschreibung ist mehrere tausend Zeichen lang und
// schöbe die Knöpfe darunter aus dem Bild. Stattdessen eine ruhige
// Grundhöhe, ein eigener Bildlauf und der Ziehgriff für alle, denen das zu
// wenig ist.
const textareaClass = [
  ...CONTROL_CLASS,
  'min-h-32 resize-y py-2 leading-[var(--text-body-sm-leading)]',
].join(' ')

export type InputProps = ComponentProps<'input'>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return <input type={type} className={cn(inputClass, className)} {...props} />
}

export type TextareaProps = ComponentProps<'textarea'>

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(textareaClass, className)} {...props} />
}
