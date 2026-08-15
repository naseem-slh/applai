import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/app/Wordmark'
import { Button } from '@/components/ui/Button'
import { ArrowUpIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

/**
 * Die Kopfzeile der beiden Unterseiten: Zurück-Knopf links, Marke in der
 * Mitte.
 *
 * **Dreispaltig (`1fr auto 1fr`), nicht als Flexzeile.** Die Marke soll in
 * der Mitte der *Seite* stehen, nicht in der Mitte des Restes neben dem
 * Knopf. Beide Kinder bekommen ihre Spalte **und ihre Zeile** ausdrücklich
 * genannt: Ohne `row-start-1` setzt die Platzierung eines der beiden eine
 * Zeile tiefer, sobald das andere Spalte 2 belegt.
 *
 * **Unter 560px gibt die Kopfzeile die Mitte auf.** Dort frisst die
 * Beschriftung des Knopfes die Seitenspalte auf (er braucht rund 120px, die
 * Spalte hätte 96) und schiebt die Marke aus der Mitte. Die Mitte ist da
 * nicht zu halten, ohne dem Knopf sein Wort zu nehmen — also steht eines
 * links und eines rechts, wie in jeder schmalen Kopfzeile. Die Marke gibt
 * dann auch ihren optischen Ausgleich auf (`mr-0`): Rechtsbündig schöbe er
 * sie über den Rand hinaus.
 *
 * Der Knopf steht **im Markup zuerst**. Die Attrappe hat es andersherum und
 * musste die Laufrichtung der schmalen Fassung umkehren, damit er trotzdem
 * links bleibt. So herum stimmen Lesereihenfolge, Tabulatorweg und Bild
 * ohne Kunstgriff überein.
 *
 * **Die Marke führt zurück zum Vorbereiten**, wie auf der Arbeitsfläche.
 * Wohin die Marke einer Seite führt, ist keine Frage, die man sich stellt —
 * man klickt sie und erwartet den Anfang. Auf der Einstiegsseite selbst
 * bleibt sie deshalb ein Bild: Ein Verweis, der dorthin führt, wo man schon
 * steht, ist ein Versprechen ohne Folge.
 *
 * Zwei Wege zum selben Ziel neben dem Zurück-Knopf sind kein Widerspruch:
 * Der eine ist beschriftet und für den, der ihn sucht, der andere ist die
 * Gewohnheit.
 */

export interface PageHeaderProps {
  /** Ziel des Zurück-Knopfes. */
  backTo: string
  /** Beschriftung des Zurück-Knopfes — übersetzt vom Aufrufer (G8). */
  backLabel: string
  className?: string
}

export function PageHeader({ backTo, backLabel, className }: PageHeaderProps) {
  const { t } = useTranslation()
  return (
    <header
      className={cn(
        'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4',
        'max-[560px]:flex max-[560px]:justify-between',
        className,
      )}
    >
      <Button asChild variant="secondary" className="col-start-1 row-start-1 justify-self-start">
        <Link to={backTo}>
          <ArrowUpIcon className="-rotate-90" />
          {backLabel}
        </Link>
      </Button>
      {/* 200px statt der 400px auf der Einstiegsseite: Die ist der Eingang
          und darf auftreten, hier ist die Kopfzeile Wegweiser.

          Die Platzierung im Raster sitzt am Verweis und nicht an der Marke:
          Rasterkind ist jetzt er. Die Maße der Marke bleiben bei ihr, damit
          der Ausgleich für die leere Fläche rechts weiter greift. */}
      <Link
        to="/"
        aria-label={t('nav.home')}
        className="focus-ring col-start-2 row-start-1 rounded-control"
      >
        <Wordmark className="max-[560px]:mr-0 max-[560px]:[--breite:150px]" />
      </Link>
    </header>
  )
}
