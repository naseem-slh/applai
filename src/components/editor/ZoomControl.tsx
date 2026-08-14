import { Slider as SliderPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MinusIcon, PlusIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, steppedZoom } from './zoom'

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
 * **Warum unten rechts und schwebend.** Dort sitzt der Zoom in Word, in jedem
 * PDF-Betrachter und in jedem Zeichenprogramm. Die Leiste über dem Blatt kam
 * nicht in Frage: Sie ist bereits so breit, dass sie unterhalb von rund
 * 1330 px Fensterbreite umbricht (siehe die Notiz in `DocumentColumn`), und
 * ein weiteres Bedienelement darin hätte den Umbruch auf jedes übliche
 * Notebook vorgezogen.
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
    <Card variant="raised" padding="none" className={cn('flex items-center gap-2 p-2', className)}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('editor.zoom.out')}
        disabled={zoom <= ZOOM_MIN}
        onClick={() => commit(steppedZoom(zoom, -1))}
      >
        <MinusIcon />
      </Button>

      <SliderPrimitive.Root
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        value={[zoom]}
        onValueChange={([next]) => onZoomChange(next)}
        onValueCommit={([next]) => onZoomCommit(next)}
        className="relative flex w-28 touch-none items-center select-none"
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
          aria-label={t('editor.zoom.label')}
          // Der Griff sagt „60 %" an, nicht „60" — die Einheit trägt hier die
          // ganze Bedeutung.
          aria-valuetext={percent}
        />
      </SliderPrimitive.Root>

      <Button
        variant="ghost"
        size="sm"
        aria-label={t('editor.zoom.in')}
        disabled={zoom >= ZOOM_MAX}
        onClick={() => commit(steppedZoom(zoom, 1))}
      >
        <PlusIcon />
      </Button>

      {/* Der Stand ist zugleich der Weg zurück auf 100 %, wie das Prozentfeld
          in Word. Sein zugänglicher Name beginnt mit genau dem sichtbaren
          Text („60 %, auf 100 % zurücksetzen"): WCAG 2.5.3 verlangt, dass der
          Name enthält, was dasteht — sonst spricht eine Sprachsteuerung den
          Knopf nicht an. */}
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
