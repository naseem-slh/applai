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
//
// **Weiche Tinte, nicht volle.** Eingabefelder tragen `--line-soft` und
// Knöpfe `--line`. Daran hängt die ganze Hierarchie dieser Welt: Was man
// drückt, ist kräftiger umrandet als das, was man ausfüllt.
const CONTROL_CLASS = [
  'focus-ring w-full rounded-control border-[3px] border-[var(--line-soft)]',
  'bg-[var(--field)] px-4 text-[length:var(--text-body-sm-size)] text-[var(--ink)]',
  'transition-colors placeholder:text-[var(--muted)]',
  // Unter dem Zeiger und im Fokus antwortet die **Kontur**, nicht die
  // Fläche: Ein Feld, das seinen Grund wechselt, sieht aus, als hätte es
  // seinen Inhalt verloren.
  'not-disabled:hover:border-[var(--accent-line)] focus-visible:border-[var(--accent-line)]',
  // Der Zustand hängt nie allein an der Farbe: `aria-invalid` trägt ihn für
  // die Vorlesesoftware, die Meldung unter dem Feld für alle anderen.
  'aria-invalid:border-[var(--error)]',
  'disabled:cursor-not-allowed disabled:bg-[var(--card)] disabled:text-[var(--muted)]',
]

// 12 px senkrecht, 16 px waagerecht — die Maße der Attrappe. Damit ist das
// Feld einen Tick höher als ein Knopf derselben Zeile; das ist gewollt: Es
// nimmt Text auf und ist keine Schaltfläche.
const inputClass = [...CONTROL_CLASS, 'py-3'].join(' ')

// Ein mehrzeiliges Feld fällt aus der Liste der Steuerhöhen (siehe
// DESIGN.md): Es steht nicht in einer Textzeile, sondern trägt einen
// Absatz. Polsterung und Zeilenhöhe folgen deshalb dem Fließtext, nicht dem
// Raster der Knöpfe. Bewusst **nicht** mitwachsend (`field-sizing-content`):
// Eine eingefügte Stellenausschreibung ist mehrere tausend Zeichen lang und
// schöbe die Knöpfe darunter aus dem Bild. Stattdessen eine ruhige
// Grundhöhe, ein eigener Bildlauf und der Ziehgriff für alle, denen das zu
// wenig ist.
const textareaClass = [
  ...CONTROL_CLASS,
  'min-h-[150px] resize-y py-3.5 leading-[1.65]',
].join(' ')

export type InputProps = ComponentProps<'input'>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return <input type={type} className={cn(inputClass, className)} {...props} />
}

export type TextareaProps = ComponentProps<'textarea'>

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(textareaClass, className)} {...props} />
}
