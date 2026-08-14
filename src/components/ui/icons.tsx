import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Die Sinnbilder der Oberfläche.
 *
 * **Warum eingebettet und nicht als Abhängigkeit.** Applai braucht eine Handvoll
 * Glyphen. Ein Paket wie `@phosphor-icons/react` brächte über tausend mit,
 * dazu eine Abhängigkeit, die bei jedem `npm audit` mitläuft (G9). Die
 * Pfaddaten unten stammen wörtlich aus Phosphor Icons 2.1.1, Strichstärke
 * „regular", MIT-Lizenz — sie sind übernommen, nicht nachgezeichnet.
 * Nachgezeichnete Sinnbilder sehen nebeneinander nie gleich aus.
 *
 * **Ein Sinnbild ist nie die einzige Auskunft.** Jedes steht neben seiner
 * Beschriftung; wo ausnahmsweise keine danebensteht, trägt der Knopf ein
 * `aria-label`. Deshalb sind die Glyphen selbst durchweg `aria-hidden`.
 *
 * Die Größe kommt über `className` (`size-4`, `size-5`), nicht über ein
 * Attribut: So bleibt sie da, wo auch die übrigen Maße der Oberfläche
 * stehen.
 */

export type IconProps = Omit<ComponentProps<'svg'>, 'children'>

function Icon({ className, ...props }: IconProps & { d: string }) {
  const { d, ...rest } = props
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('size-4 shrink-0', className)}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}

const PATHS = {
  downloadSimple:
    'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
  printer:
    'M214.67,72H200V40a8,8,0,0,0-8-8H64a8,8,0,0,0-8,8V72H41.33C27.36,72,16,82.77,16,96v80a8,8,0,0,0,8,8H56v32a8,8,0,0,0,8,8H192a8,8,0,0,0,8-8V184h32a8,8,0,0,0,8-8V96C240,82.77,228.64,72,214.67,72ZM72,48H184V72H72ZM184,208H72V160H184Zm40-40H200V152a8,8,0,0,0-8-8H64a8,8,0,0,0-8,8v16H32V96c0-4.41,4.19-8,9.33-8H214.67c5.14,0,9.33,3.59,9.33,8Zm-24-52a12,12,0,1,1-12-12A12,12,0,0,1,200,116Z',
  copy: 'M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z',
  caretDown:
    'M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z',
  arrowUp:
    'M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z',
  x: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
  check:
    'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
  minus: 'M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z',
  plus: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z',
} as const

export const DownloadIcon = (props: IconProps) => <Icon d={PATHS.downloadSimple} {...props} />
export const PrinterIcon = (props: IconProps) => <Icon d={PATHS.printer} {...props} />
export const CopyIcon = (props: IconProps) => <Icon d={PATHS.copy} {...props} />
export const CaretDownIcon = (props: IconProps) => <Icon d={PATHS.caretDown} {...props} />
export const ArrowUpIcon = (props: IconProps) => <Icon d={PATHS.arrowUp} {...props} />
export const XIcon = (props: IconProps) => <Icon d={PATHS.x} {...props} />
export const CheckIcon = (props: IconProps) => <Icon d={PATHS.check} {...props} />
export const MinusIcon = (props: IconProps) => <Icon d={PATHS.minus} {...props} />
export const PlusIcon = (props: IconProps) => <Icon d={PATHS.plus} {...props} />
