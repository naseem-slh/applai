import { Slider as SliderPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './zoom'

/**
 * Der Maßstabsregler — die Zoomleiste am unteren Rand der Arbeitsfläche.
 *
 * **Warum nicht der gemeinsame `Slider`.** Das Primitiv in `ui/Slider.tsx`
 * bekommt ausdrücklich keine Zahlenspanne, sondern benannte Stufen, und es
 * bringt seine eigene Beschriftungszeile mit (siehe DESIGN.md, „Der Regler
 * und seine Stufen"). Beides ist hier falsch: Ein Maßstab **ist** eine Zahl —
 * „60 %" sagt genau das, was es sagt, anders als eine Stellschraube zwischen
 * „förmlich" und „locker" —, und die Zahl gehört in dieselbe Zeile wie die
 * Schiene, nicht darunter. Deshalb ein zweites, eigenes Bedienelement auf
 * demselben Radix-Primitiv, festgehalten in DESIGN.md unter „Der
 * Maßstabsregler". Ein drittes gibt es nicht.
 *
 * **Warum in der Spalte und nicht schwebend über dem Blatt.** Schwebend war
 * er eine vierte Ebene, die nichts verdeckte, aber auch nirgends dazugehörte.
 * Unter der Ausgabe steht er bei dem, was mit dem Blatt geschieht.
 *
 * **Warum nur Schiene und Zahl.** Davor standen hier vier Bedienelemente für
 * eine einzige Zahl: ein Minus, eine Schiene, ein Plus und der Stand. Die
 * beiden Knöpfe machten dasselbe wie ein Pfeiltastendruck auf der Schiene und
 * dasselbe wie ein Zug mit dem Finger. Geblieben sind die Schiene und der
 * Stand — und der Stand ist zugleich der Weg zurück auf 100 %.
 *
 * **Warum keine Raste bei 100 %.** Bei Word liegt 100 % mitten in der Spanne
 * und braucht eine Raste, damit man sie trifft. Hier ist 100 % das obere Ende
 * — der Anschlag der Schiene und die Ende-Taste treffen es von selbst.
 */

export interface ZoomControlProps {
  /** Der aktuelle Maßstab in Prozent. */
  zoom: number
  /** Während des Ziehens — die Fläche folgt sofort. */
  onZoomChange: (zoom: number) => void
  /** Beim Loslassen — erst hier wird gespeichert. */
  onZoomCommit: (zoom: number) => void
  className?: string
}

export function ZoomControl({ zoom, onZoomChange, onZoomCommit, className }: ZoomControlProps) {
  const { t } = useTranslation()
  const percent = t('editor.zoom.value', { percent: zoom })

  // Ein Klick ist eine abgeschlossene Geste: Er stellt und sichert in einem.
  function commit(next: number) {
    onZoomChange(next)
    onZoomCommit(next)
  }

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex items-center gap-3 px-3 py-2', className)}
    >
      <SliderPrimitive.Root
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        value={[zoom]}
        onValueChange={([next]) => onZoomChange(next)}
        onValueCommit={([next]) => onZoomCommit(next)}
        className="relative flex flex-1 touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-[14px] w-full grow overflow-hidden rounded-pill border-[3px] border-[var(--line-soft)] bg-[var(--field)]">
          <SliderPrimitive.Range className="absolute h-full bg-[var(--accent)]" />
        </SliderPrimitive.Track>
        {/* Name und Wert gehören an den Griff, nicht an die Schiene: Dort
            sitzt `role="slider"`. */}
        <SliderPrimitive.Thumb
          className="focus-ring block size-6 rounded-pill border-[3px] border-[var(--line)] bg-[var(--accent)]"
          aria-label={t('editor.zoom.label')}
          aria-valuetext={percent}
        />
      </SliderPrimitive.Root>

      {/* Der Stand ist zugleich der Weg zurück: ein Klick stellt 100 % her.
          Deshalb ein Knopf und keine Beschriftung — und deshalb sagt sein
          Name beides, den Stand und was ein Druck bewirkt. */}
      <Button
        variant="ghost"
        size="sm"
        className="tabular-nums"
        aria-label={t('editor.zoom.reset', { percent: zoom })}
        onClick={() => commit(ZOOM_MAX)}
      >
        {percent}
      </Button>
    </Card>
  )
}
