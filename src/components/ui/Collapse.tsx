import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ein Bereich, der auf- und **zuklappt** — beides sichtbar, nicht nur das
 * Auffalten.
 *
 * **Warum es das als eigenes Teil gibt.** Ein `{bedingung && …}` klappt nur in
 * eine Richtung weich: Beim Aufgehen steht der Inhalt schon da, und das Raster
 * fährt von `0fr` auf `1fr` an ihm entlang. Beim Zugehen ist der Inhalt im
 * selben Durchlauf verschwunden — das Raster hat nichts mehr, woran es
 * schrumpfen könnte, und die Karte springt. Gemessen auf der Einstiegsseite:
 * zehn Zwischenhöhen beim Füllen, **eine einzige Stufe** beim Leeren.
 *
 * Dieses Teil hält den zuletzt gezeigten Inhalt fest, bis die Bewegung durch
 * ist, und wirft ihn erst dann weg. Nur so hat das Zugehen etwas zu zeigen.
 *
 * **Die beiden Richtungen sind nicht dieselbe Bewegung.** Auf geht es mit der
 * federnden Kurve des Hauses (`ease-bounce`) — etwas kommt hinzu, und in
 * dieser Welt rastet Hinzukommendes ein. Zu geht es kürzer und ohne Feder:
 * Die Kurve schießt über ihr Ziel hinaus, und unter `0fr` gibt es nichts, was
 * ein Raster noch zeigen könnte — der Überschuss wird abgeschnitten und säße
 * am Ende als Stillstand. Was weggeht, soll ohnehin nicht auf sich
 * aufmerksam machen.
 *
 * **Was zugeht, ist nicht mehr da.** `inert` nimmt den Inhalt für die Dauer
 * der Bewegung aus Tastatur und Vorleser heraus. Ohne das führte der Weg mit
 * der Tabulatortaste in einen Bereich, den niemand mehr sieht — und ein
 * `aria-hidden` an derselben Stelle wäre ein Verstoß, sobald der Fokus noch
 * darin steht.
 */

/** Wie lange das Zugehen dauert. Der Wert steht ein zweites Mal als Klasse
 *  (`duration-[220ms]`) und muss ihr gleichen: Diese Uhr wirft den Inhalt
 *  weg, und käme sie zu früh, verschwände er mitten in der Bewegung.
 *
 *  Zwei Zahlen für dieselbe Sache sind hier nicht zu vermeiden — Tailwind
 *  liest Klassennamen aus dem Quelltext und findet nichts, was erst zur
 *  Laufzeit zusammengesetzt wird. Der Test daneben hält beide zusammen. */
export const COLLAPSE_CLOSE_MS = 220

export interface CollapseProps {
  /** Steht der Bereich offen? */
  open: boolean
  children: ReactNode
  /** Kommt an die äußere Hülle. Nützlich für den Abstand, den die Hülle im
   *  geschlossenen Zustand aus dem Aufbau nehmen soll (`data-[open=false]`). */
  className?: string
}

export function Collapse({ open, children, className }: CollapseProps) {
  /** Der zuletzt offene Inhalt. Beim Zugehen ist er das Einzige, was noch
   *  zu zeigen ist; der Aufrufer rendert dann längst nichts mehr. */
  const letzte = useRef<ReactNode>(null)
  if (open) letzte.current = children

  const [nachhall, setNachhall] = useState(false)

  useEffect(() => {
    // Beim Aufgehen gibt es nichts nachzuhalten, und beim ersten Aufbau
    // eines geschlossenen Bereichs gab es nie etwas: Dann darf auch nichts
    // zugehen, sonst liefe beim Laden der Seite eine Bewegung ohne Anlass.
    if (open || letzte.current === null) return
    setNachhall(true)
    const uhr = setTimeout(() => setNachhall(false), COLLAPSE_CLOSE_MS)
    return () => clearTimeout(uhr)
  }, [open])

  return (
    <div
      data-open={open}
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity,margin]',
        open
          ? 'grid-rows-[1fr] opacity-100 ease-bounce duration-300'
          : 'grid-rows-[0fr] opacity-0 ease-out duration-[220ms]',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">
        {open ? children : nachhall ? letzte.current : null}
      </div>
    </div>
  )
}
