import { useEffect } from 'react'

/**
 * Womit ist der Fokus zuletzt bewegt worden — mit dem Zeiger oder mit der
 * Tastatur? Die Antwort steht als `data-eingabe` am Wurzelelement.
 *
 * **Wofür das nötig ist.** `:focus-visible` beantwortet dieselbe Frage
 * überall sonst schon, und der Ring hängt daran (siehe `focus-ring` in
 * `design.css`): Ein angeklickter Knopf bekommt keinen. Bei **Textfeldern**
 * macht der Browser eine Ausnahme, und zwar absichtlich — sie nehmen
 * Tastatureingaben entgegen, also gilt jeder Fokus als „mit der Tastatur
 * benutzbar" und erfüllt `:focus-visible`. Wer in das Anzeigenfeld klickt,
 * bekommt deshalb denselben Ring wie jemand, der hintabt.
 *
 * **Warum der Ring dann nicht einfach weg kann.** Weil das Feld seinen Fokus
 * sonst nur noch über die Farbe seiner Kontur meldet, und die geht von
 * weicher Tinte auf Tangerine — ein Sprung im Farbton, aber nur 2,0:1 in der
 * Helligkeit. Wer Farben schlecht unterscheidet, sähe nichts. Für die
 * Tastatur muss der Ring also bleiben; nur der Klick, der ohnehin weiß, wo er
 * hingefahren ist, braucht ihn nicht.
 *
 * **Warum nur die Tabulatortaste zählt.** Jeder Tastendruck als „Tastatur" zu
 * werten hieße: hineinklicken, lostippen — und mitten im ersten Wort springt
 * der Ring an. Die Eingabeart interessiert nur in dem Augenblick, in dem der
 * Fokus umzieht, und dafür gibt es genau eine Taste. Innerhalb von
 * Auswahllisten und Reglern wandert er auch mit den Pfeiltasten, aber das
 * sind keine Textfelder, und dort ändert diese Auskunft ohnehin nichts.
 *
 * Beide Zuhörer lauschen in der Einfangphase: Sie müssen Bescheid wissen,
 * **bevor** der Fokus umzieht, nicht danach.
 */

export const INPUT_MODALITY_ATTRIBUTE = 'data-eingabe'

export function useInputModality(): void {
  useEffect(() => {
    const wurzel = document.documentElement
    const beiZeiger = () => wurzel.setAttribute(INPUT_MODALITY_ATTRIBUTE, 'zeiger')
    const beiTaste = (ereignis: KeyboardEvent) => {
      if (ereignis.key === 'Tab') wurzel.setAttribute(INPUT_MODALITY_ATTRIBUTE, 'taste')
    }

    document.addEventListener('pointerdown', beiZeiger, true)
    document.addEventListener('keydown', beiTaste, true)
    return () => {
      document.removeEventListener('pointerdown', beiZeiger, true)
      document.removeEventListener('keydown', beiTaste, true)
      // Ohne Auskunft gilt der Ring: Das ist der Zustand, in dem er zu sehen
      // ist, und der gehört bei einem Fokusring an den Anfang.
      wurzel.removeAttribute(INPUT_MODALITY_ATTRIBUTE)
    }
  }, [])
}
