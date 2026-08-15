import { Button } from '@/components/ui/Button'
import { XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

/**
 * Der Zwischenstand aus einer früheren Sitzung — als Angebot, nicht als
 * Aufgabe.
 *
 * **Warum das eine Gestaltungsfrage ist.** Ein gespeicherter Entwurf ist
 * nichts, was der Nutzer sich vorgenommen hat; er ist eine Abkürzung, die die
 * Seite anbietet. Die vorige Fassung stellte ihn als eigene Karte **über** die
 * Ablegekacheln: Überschrift, zwei Zeilen mit Datum, vier Knöpfe, rund 130px,
 * bevor die eigentliche Seite anfing. Damit behandelte sie das Angebot wie den
 * Auftrag.
 *
 * Zwei Fassungen desselben Angebots, geteilt nach Fensterbreite — dieselbe
 * Mechanik wie bei den Figuren:
 *
 * **Der Zettel** (`RecentDraftNote`, ab 1300px) liegt auf dem Blatt neben der
 * Karte, leicht gekippt, in der Sprache der Kritzeleien und der schiefen
 * Kacheln. Er steht **außerhalb** der Karte und schiebt deshalb nichts.
 *
 * **Die Marke** (`RecentDraftChip`, darunter) liegt in der leeren Kachel, die
 * sie füllen würde. Auch sie kostet keine Höhe. Sie ist der Rückfall: Ohne sie
 * wäre der Zwischenstand auf jedem schmalen Fenster schlicht nicht erreichbar.
 *
 * **Die Marke liegt über der Kachel, nicht in ihr.** Die Kachel ist selbst ein
 * Knopf, und ein Knopf in einem Knopf ist kein gültiges Auszeichnungsformat.
 * Sie sitzt deshalb absolut im Halter und wird von `DocumentTile` als
 * `overlay` durchgereicht.
 *
 * **Der volle Satz steht für den Vorleser da.** Sichtbar sind zwei Zeilen
 * (Unterlage, Datum) und zwei Knöpfe; angesagt wird „Anschreiben, gespeichert
 * am 15. August 2026". Eine Zahl ohne ihren Satz wäre als Ansage nicht zu
 * verstehen, und beide Knöpfe hießen sonst zweimal gleich.
 */

/** Ab hier ist links und rechts der Karte Platz für einen Zettel. Gemessen:
 *  780px Karte plus zweimal (216px Zettel + 34px Abstand) plus Rand.
 *
 *  Die Abfrage läuft über `useMediaQuery` und nicht über eine `min-[…]:`-Klasse:
 *  Es gibt zu jedem Zwischenstand **entweder** einen Zettel **oder** eine
 *  Marke, nie beide. Verbärge eine Klasse die eine, stünden trotzdem beide im
 *  Baum und trügen beide denselben Namen. */
export const NOTE_QUERY = '(min-width: 1300px)'

export interface RecentDraftProps {
  /** Sichtbarer Name der Unterlage, etwa „Anschreiben". */
  kind: string
  /** Der Zeitpunkt des Speicherns, bereits lesbar gemacht. */
  date: string
  /** Der ganze Satz, für Vorlesesoftware. */
  label: string
  useLabel: string
  discardLabel: string
  onUse: () => void
  onDiscard: () => void
}

/**
 * Der Zettel auf dem Blatt. Er wird von der Bühne absolut gesetzt; wo er
 * liegt, entscheidet der Aufrufer über `className` — die Unterlage links
 * gehört nach links, die rechte nach rechts.
 */
export function RecentDraftNote({
  kind,
  date,
  label,
  useLabel,
  discardLabel,
  onUse,
  onDiscard,
  className,
}: RecentDraftProps & { className?: string }) {
  return (
    <section
      aria-label={label}
      className={cn(
        'pop absolute z-[2] flex w-[216px] flex-col gap-2 rounded-tile border-[3px]',
        'border-[var(--line)] bg-[var(--card)] p-3.5',
        '[--pop-height:8px] [--pop-shadow:var(--card-shadow)]',
        className,
      )}
    >
      <span className="font-display text-[length:var(--text-body-sm-size)] font-semibold text-[var(--ink-strong)]">
        {kind}
      </span>
      <span className="text-[length:var(--text-label-size)] text-[var(--muted)]">{date}</span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          aria-label={`${useLabel} ${kind}`}
          onClick={onUse}
          className="flex-1 px-3 text-[length:var(--text-label-size)]"
        >
          {useLabel}
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={`${discardLabel} ${kind}`}
          onClick={onDiscard}
          className="size-[26px]"
        >
          <XIcon className="size-3" />
        </Button>
      </div>
    </section>
  )
}

/**
 * Die Marke in der leeren Kachel. Sie trägt nur den Namen der Unterlage —
 * in der Kachel steht er schon als Überschrift, und was hier noch fehlt, ist
 * allein das Datum.
 */
export function RecentDraftChip({
  kind,
  date,
  label,
  useLabel,
  discardLabel,
  onUse,
  onDiscard,
  className,
}: RecentDraftProps & { className?: string }) {
  return (
    <span
      aria-label={label}
      role="group"
      className={cn(
        'pointer-events-auto absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2',
        'max-w-[calc(100%-24px)] items-center gap-1.5',
        className,
      )}
    >
      <Button
        size="sm"
        aria-label={`${useLabel} ${kind}`}
        onClick={onUse}
        className="min-w-0 border-2 px-3 pt-1 pb-[5px] [--pop-height:3px] text-[length:var(--text-label-size)]"
      >
        <span className="truncate">{date}</span>
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={`${discardLabel} ${kind}`}
        onClick={onDiscard}
        className="size-[22px] [--pop-height:2px]"
      >
        <XIcon className="size-2.5" />
      </Button>
    </span>
  )
}
