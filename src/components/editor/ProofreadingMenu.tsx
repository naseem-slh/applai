import { useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/Popover'
import { rangeToDomRange } from './documentSelection'
import { visibleText, type ProofreadingFinding } from './proofreading'

/**
 * Der Vorschlag zu einem Befund — ein Klick auf die Wellenlinie.
 *
 * **Warum links und nicht rechts.** Gebaut war zuerst das Kontextmenü, wie in
 * Word. Es funktioniert, aber es nimmt dem Browser die Stelle weg, an der
 * *seine* Rechtschreibvorschläge stehen — und die berichtigen die echten
 * Tippfehler, die diese Prüfung ausdrücklich nicht sucht. Eine Seite kann
 * diese Vorschläge weder auslesen noch nachbauen. Der Linksklick kostet
 * nichts davon: Das Kontextmenü bleibt vollständig dem Browser.
 *
 * **Der Klick bleibt ein gewöhnlicher Klick.** Kein `preventDefault`: Der
 * Schreibcursor landet, wo geklickt wurde, und der Fokus bleibt in der
 * Fläche (`onOpenAutoFocus` wird unterbunden, sonst zöge Radix ihn in die
 * Überlagerung und Weitertippen ginge ins Leere). Wer die Stelle lieber von
 * Hand berichtigt, wird durch nichts aufgehalten.
 *
 * **Getroffen wird nach Fläche, nicht nach Zeichenposition.** Naheliegend
 * wäre `caretPositionFromPoint`. Das ist von Browser zu Browser verschieden
 * (WebKit kennt nur `caretRangeFromPoint`) und geht an der Frage vorbei: Der
 * Nutzer klickt auf das, was er sieht, und das ist die Wellenlinie. Also
 * werden die Rechtecke der Befunde geprüft — dieselbe Fläche, die auch gemalt
 * wird. Ein Befund von einem Zeichen ist so genauso zuverlässig zu treffen
 * wie ein langer.
 *
 * Der Anker liegt **neben** der bearbeitbaren Fläche, nie darin: Nicht
 * bearbeitbare Inseln in einem `contentEditable` bringen den Schreibcursor
 * durcheinander (siehe `DocumentFloats`). `PopoverContent` portaliert ohnehin
 * an den Seitenkörper.
 */

export interface ProofreadingMenuProps {
  findings: readonly ProofreadingFinding[]
  /** Die Fläche, die die Absätze trägt — für die Umrechnung Bereich → Rechteck. */
  rootRef: RefObject<HTMLElement | null>
  onApply: (finding: ProofreadingFinding) => void
  /** Die Dokumentfläche. Sie liegt in diesem Behälter, damit er den Klick sieht. */
  children: ReactNode
}

/** Der angeklickte Befund samt seiner Lage im Behälter. */
interface OpenMenu {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export function ProofreadingMenu({ findings, rootRef, onApply, children }: ProofreadingMenuProps) {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<OpenMenu | null>(null)

  /**
   * Der Befund zum offenen Menü — frisch aus der laufenden Liste geholt,
   * nicht aus dem Zustand.
   *
   * Damit schließt sich das Menü von selbst, sobald es den Befund nicht mehr
   * gibt: nach dem Übernehmen, nach dem Weitertippen, nach Rückgängig. Ein
   * eigener Zuhörer für Tastendrücke wäre eine zweite Wahrheit neben dieser.
   * Die Kennung trägt den Anfangsversatz, verschiebt sich der Text, ist es
   * ein anderer Befund.
   */
  const finding = menu === null ? null : (findings.find((entry) => entry.id === menu.id) ?? null)

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const root = rootRef.current
    if (root === null) return

    const hit = findAt(root, findings, event.clientX, event.clientY)
    if (hit === null) {
      setMenu(null)
      return
    }

    // Kein `preventDefault`: Der Klick soll den Schreibcursor setzen wie
    // jeder andere Klick im Brief.
    const container = event.currentTarget.getBoundingClientRect()
    setMenu({
      id: hit.finding.id,
      left: hit.rect.left - container.left,
      top: hit.rect.top - container.top,
      width: hit.rect.width,
      height: hit.rect.height,
    })
  }

  return (
    <Popover open={finding !== null} onOpenChange={(next) => !next && setMenu(null)}>
      <div className="relative" onClick={handleClick}>
        {children}
        {menu !== null && (
          <PopoverAnchor asChild>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{ left: menu.left, top: menu.top, width: menu.width, height: menu.height }}
            />
          </PopoverAnchor>
        )}
      </div>

      {/* `PopoverContent` ist ein `role="dialog"`; ohne Namen bliebe es für
          eine Vorlesesoftware ein „Dialog" ohne Angabe, worum es geht
          (axe-Regel `aria-dialog-name`). Die Regel selbst steht gleich als
          erster Inhalt darin. */}
      {finding !== null && (
        <PopoverContent
          align="start"
          side="bottom"
          aria-label={t('editor.proofreading.heading')}
          // Ohne das zieht Radix den Fokus aus der Dokumentfläche, und der
          // nächste Tastendruck des Nutzers landet nirgends.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-auto max-w-72 p-2"
        >
          <p className="px-2 pb-2 text-[length:var(--text-body-sm-size)] text-[var(--color-muted)]">
            {t(`editor.proofreading.rules.${finding.rule}`)}
          </p>
          {/* Der Vorschlag ist der Knopf: ein Menü mit genau einem Eintrag.
              Was dasteht und was daraus wird, steht beides darin — der
              Wortlaut allein („seit") sagte nicht, was ersetzt wird. */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start font-medium"
            // Dasselbe `keepSelection` wie in `SelectionLayer` und
            // `VariantPopover`: Ohne das nimmt der Knopf den Fokus, und nach
            // dem Übernehmen stünde der Schreibcursor nicht mehr im Brief.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onApply(finding)
              setMenu(null)
            }}
          >
            {t('editor.proofreading.replace', {
              found: visibleText(finding.found),
              suggestion: visibleText(finding.suggestion),
            })}
          </Button>
        </PopoverContent>
      )}
    </Popover>
  )
}

/**
 * Der Befund, dessen gemalte Fläche den Punkt enthält.
 *
 * `getClientRects` statt `getBoundingClientRect`: Ein Bereich über einen
 * Zeilenumbruch hinweg hat zwei Rechtecke, und das umschließende Rechteck
 * beider deckte die halbe Zeile dazwischen mit ab.
 */
function findAt(
  root: HTMLElement,
  findings: readonly ProofreadingFinding[],
  x: number,
  y: number,
): { finding: ProofreadingFinding; rect: DOMRect } | null {
  for (const finding of findings) {
    const range = rangeToDomRange(root, finding.range)
    if (range === null) continue
    for (const rect of range.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { finding, rect }
      }
    }
  }
  return null
}
