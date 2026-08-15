import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Die eine Fassung, die sich alles teilt, was man drückt.
 *
 * `accent-ink` auf Tangerine erreicht 6,89:1 im Hellen und 7,99:1 im Dunklen
 * (siehe DESIGN.md, Kontrast). Die volle Fläche und nicht die blasse
 * Akzentwäsche: Eine getönte Andeutung sagte weder „hier stehst du gerade"
 * noch sonst etwas.
 */
const PLAIN = [
  'bg-[var(--field)] text-[var(--ink-strong)] border-[var(--line)]',
  'not-disabled:hover:bg-[var(--accent)] not-disabled:hover:text-[var(--accent-ink)]',
  'disabled:bg-[var(--field)]',
]

// Knopf — das einzige Primitiv, das eine Aktion auslöst, und damit die
// Vorlage für alles Weitere: `variant` bestimmt den Ton, `size` die Größe.
//
// **Die Bauform ist immer dieselbe: Pille, 3 px Tinte, harte Kante darunter.**
// Die Kante ist ein Schatten ohne Weichzeichnung (`pop-press` in design.css),
// kein `border-bottom` — nur so folgt sie dem Radius und lässt sich beim
// Drücken auf null fahren, während der Knopf um dieselbe Höhe nach unten
// wandert. Genau daraus entsteht der Druckpunkt; er ist ein Zustand und keine
// Animation.
//
// **Ein Aussehen für alles, was man drückt.** Helle Feldfläche, volle Tinte,
// und unter dem Zeiger wird der Knopf ganz orange. Vormals trugen `primary`,
// `secondary` und `ghost` drei Ruhezustände — der gefüllte Hauptknopf, der
// helle Nebenknopf, der zurückgenommene. Die Rangfolge sagte damit dasselbe
// zweimal: Was die Hauptsache ist, sagt in dieser Oberfläche ohnehin der
// Platz — der Knopf oben in der Karte, der Knopf rechts in der Leiste. Übrig
// bleibt eine Farbe mit einer Bedeutung: „das ist der Knopf, auf dem du
// gerade stehst", und immer nur einer.
//
// Die drei Namen stehen weiter am Aufrufort. Sie sagen, welche Handlung die
// Hauptsache ist — und wenn eine sichtbare Rangfolge zurückkommen soll,
// entsteht sie an dieser einen Stelle wieder. `danger` bleibt rot: Es ist die
// einzige Variante, deren Farbe vor etwas warnt statt etwas anzubieten.
//
// Die Beschriftung steht in Fredoka (`font-display`): Sie wird erkannt, nicht
// gelesen. Siehe DESIGN.md, Abschnitt Schrift.
const buttonVariants = cva(
  [
    'focus-ring pop-press inline-flex shrink-0 items-center justify-center gap-2',
    'rounded-pill border-[3px] font-display font-semibold whitespace-nowrap select-none',
    // Gesperrt: keine Farbe, keine volle Tinte, eine Kante in weicher Tinte.
    // Er sieht aus wie ein Knopf und nicht wie eine Beschriftung — nur eben
    // wie einer, den man gerade nicht drücken kann. Die Füllung nennt jede
    // Variante selbst; sie bleibt die helle Feldfläche, weil der Knopf auch
    // sonst hell ist.
    'disabled:cursor-not-allowed',
    'disabled:border-[var(--line-soft)] disabled:text-[var(--muted)]',
    'disabled:[--pop-color:var(--line-soft)] disabled:[--pop-shadow:0_0_0_transparent]',
  ],
  {
    variants: {
      variant: {
        primary: PLAIN,
        secondary: PLAIN,
        ghost: PLAIN,
        // Löschen und Verwerfen — die eine Variante, die nicht orange wird.
        // Genau im Augenblick des Klickens soll die Farbe warnen und nicht
        // anbieten. Sie trägt die Bedeutung trotzdem nie allein: Der Text des
        // Knopfes benennt die Folge.
        danger: [
          'bg-[var(--error)] text-[var(--error-ink)] border-[var(--line)]',
          '[--pop-color:var(--error-deep)]',
          'not-disabled:hover:bg-[var(--error-deep)]',
          'disabled:bg-[var(--field)]',
        ],
      },
      size: {
        // Die Maße stammen aus den Attrappen und sind polsterbasiert, nicht
        // höhenbasiert: Die untere Polsterung ist überall ein Pixel größer
        // als die obere. Fredoka sitzt optisch hoch in ihrer Zeile, und ohne
        // diesen Ausgleich klebte die Beschriftung an der Unterkante.
        sm: 'px-[13px] pt-[6px] pb-[7px] text-[0.8125rem] [--pop-height:3px]',
        md: 'px-4 pt-[9px] pb-[10px] text-[length:var(--text-body-sm-size)]',
        lg: 'px-[26px] pt-[10px] pb-3 text-[length:var(--text-body-size)] [--pop-height:6px] [--pop-lift:3px]',
        // Nur ein Sinnbild, kein Text. Braucht zwingend ein aria-label vom
        // Aufrufer, damit der Knopf einen Namen hat (G8: übersetzt).
        icon: 'size-[42px] p-0',
        // Der kleine runde Knopf in einer Liste (Schließen, Umsortieren). Er
        // steht dicht an seinem Nachbarn und darf ihn nicht überragen.
        iconSm: 'size-[30px] p-0 [--pop-height:3px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Reicht Klassen und Verhalten an das Kind weiter, statt ein <button> zu
   *  erzeugen — für Links, die wie ein Knopf aussehen sollen. */
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      // Ohne ausdrückliche Angabe schickt ein <button> in einem Formular
      // dieses ab. Bei asChild bleibt das Attribut weg, weil das Kind kein
      // <button> sein muss.
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
