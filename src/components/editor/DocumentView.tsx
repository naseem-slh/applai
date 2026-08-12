import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { Paragraph } from '@/lib/docx/model'
import { cn } from '@/lib/utils'
import { paragraphOf } from './documentSelection'
import {
  insertPlainText,
  isBlockedInputType,
  isFormattingShortcut,
  toPlainTextInsertion,
} from './editableInput'

/**
 * Das Anschreiben als lesbarer Fließtext — die Fläche, um die sich die
 * ganze Anwendung dreht.
 *
 * **Ein Bearbeitungsbereich, nicht einer je Absatz.** Die erste Fassung gab
 * jedem Absatz sein eigenes `contentEditable`; das hätte die Absatzfolge
 * unantastbar gemacht, ohne dass irgendetwas abgefangen werden müsste. In
 * Chrome ist es aber unbrauchbar: **Der Browser klemmt jede Markierung auf
 * genau einen Bearbeitungsbereich.** Nachgemessen (Chrome 143, gezogen von
 * Absatz A nach Absatz B): Die Markierung endet am Ende von A, und selbst
 * ein programmatisches `setBaseAndExtent` über beide wird zurechtgestutzt.
 * Damit wäre die erste Produktzusage gebrochen — „freie Textmarkierung per
 * Maus, beliebiger Bereich, auch satzübergreifend" (`docs/spec.md`).
 * Deshalb liegt `contentEditable` an der Fläche, und die Absätze darin sind
 * gewöhnliche `<p>`.
 *
 * **Auf Absatzebene bleibt es trotzdem.** Was der Plan mit „Bearbeitung auf
 * Absatzebene" meint, hält jetzt eine Prüfung statt der Baumstruktur: Jede
 * Eingabe, deren betroffener Bereich mehr als einen Absatz berührt, wird
 * abgelehnt (siehe {@link staysWithinOneParagraph}). Damit lassen sich
 * Absätze weder verschmelzen noch anlegen noch löschen — die Absatzfolge
 * kommt aus der Word-Datei —, während sich über sie hinweg markieren lässt.
 *
 * **Die eine Eingabe, die sich nicht ablehnen lässt.** `beforeinput` mit
 * `insertCompositionText` (Eingabemethoden für Japanisch, Chinesisch,
 * Koreanisch, aber auch die Wortvorschläge einer Bildschirmtastatur) ist in
 * Chrome **nicht abbrechbar**: `preventDefault()` bleibt dort wirkungslos.
 * Die Prüfung greift also zu spät. Deshalb wird eine absatzübergreifende
 * Markierung schon bei `compositionstart` zusammengelegt, bevor der Browser
 * etwas ändert (siehe {@link collapseAcrossParagraphs}).
 *
 * **Wie DOM und Modell zusammenhängen.** Das `DocxDocument` ist die Quelle,
 * der DOM ist seine Ansicht. Bei jeder Eingabe geht der neue Absatztext an
 * den Aufrufer, der daraus über `replaceRange` einen neuen Modellstand
 * macht. Kommt derselbe Text zurück, rührt diese Ansicht den DOM nicht an —
 * deshalb bleibt der Schreibcursor stehen, wo er war. Weichen Modell und
 * DOM voneinander ab, **gewinnt das Modell**: Der Absatz wird neu
 * geschrieben und der Cursor springt an seinen Anfang. Das ist sichtbar
 * unangenehm und genau so gewollt; die Gegenrichtung wäre eine Ansicht, die
 * etwas anderes zeigt als das, was gesichert und exportiert wird.
 *
 * Der Abgleich läuft in einem **`useLayoutEffect`**, nicht in einem
 * gewöhnlichen Effekt. Auch das ist gemessen: Ein passiver Effekt läuft
 * verzögert, und bei schnellem Tippen hatte der Browser das nächste Zeichen
 * schon in den DOM geschrieben, während der Effekt noch den vorletzten
 * Modellstand verglich — er hielt den DOM für abgewichen und setzte den
 * Absatz zurück. Der Cursor sprang dann mitten im Wort an den Absatzanfang.
 *
 * **`white-space: pre-wrap`** ist keine Kosmetik. Tabulator und
 * Zeilenumbruch aus `w:tab`/`w:br` sind im Modell je ein Zeichen; nur wenn
 * sie im DOM auch je ein Zeichen sind, stimmt die Offset-Rechnung in
 * `documentSelection.ts`.
 *
 * Die Namen der beiden Datenattribute stehen als Konstanten in
 * `documentSelection.ts` (dort werden sie gelesen); hier stehen sie
 * ausgeschrieben, weil JSX für ein berechnetes Attribut keinen lesbaren Weg
 * hat. Ein Test hält beide Seiten zusammen.
 */

export interface DocumentViewProps {
  paragraphs: readonly Paragraph[]
  /**
   * Darf in die Fläche geschrieben werden? Die Arbeitsfläche sagt hier
   * immer ja, auf jedem Gerät (siehe `usePrecisePointer`: Die Gerätefrage
   * entscheidet über die Feinmarkierung, nicht über das Tippen). Der
   * Schalter bleibt, weil eine nur lesbare Fläche eine gültige Ansicht des
   * Dokuments ist und die Zusicherungen dafür geprüft sind: kein
   * `role="textbox"`, kein Zuhörer, keine Rechtschreibprüfung.
   */
  editable: boolean
  /**
   * Absätze, die die laufende Markierung an ihrem Platz festhalten würde
   * (Bild, Tabellenzelle, Abschnittswechsel). Sie werden hervorgehoben,
   * damit der Hinweis in der Werkzeugleiste eine Fundstelle im Text hat.
   */
  retainedParagraphs?: readonly number[]
  /**
   * Absätze, in denen eine unbestätigte unbelegte Aussage steht (freier
   * Modus, G10). Sie bekommen eine deutlichere Kontur als die
   * festgehaltenen: Der eine Fall ist ein Hinweis auf eine mögliche
   * Nebenwirkung, der andere hält den Export an.
   *
   * Hervorgehoben wird der **Absatz**, nicht die Aussage selbst. Eine
   * Auszeichnung innerhalb des Absatztexts würde die Offset-Rechnung
   * brechen (siehe `documentSelection.ts`); der Wortlaut steht deshalb
   * daneben in `ClaimGuard`.
   */
  claimParagraphs?: readonly number[]
  /** Der neue Text genau eines Absatzes, sobald der Nutzer ihn geändert hat. */
  onParagraphInput: (index: number, text: string) => void
  /** Kennung der Überschrift, die diese Fläche benennt. */
  labelledBy: string
  /**
   * Die Sprache des Dokuments (`lang`). Sie gehört an den Text, nicht an
   * die Oberfläche: Der Brief kann in einer anderen Sprache stehen als die
   * Anwendung, und davon hängen Rechtschreibprüfung und Aussprache der
   * Vorlesesoftware ab.
   */
  language?: string
  rootRef?: RefObject<HTMLDivElement | null>
  className?: string
}

export function DocumentView({
  paragraphs,
  editable,
  retainedParagraphs = [],
  claimParagraphs = [],
  onParagraphInput,
  labelledBy,
  language,
  rootRef,
  className,
}: DocumentViewProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const retained = new Set(retainedParagraphs)
  const claimed = new Set(claimParagraphs)

  function host(): HTMLDivElement | null {
    return rootRef?.current ?? ownRef.current
  }

  /**
   * Nach einer Eingabe steht der neue Text im DOM. Welcher Absatz betroffen
   * ist, sagt der Vergleich mit dem Modell — verlässlicher als die Stelle
   * des Schreibcursors, den der Browser bei einer Löschung schon
   * weitergerückt haben kann. Es kann höchstens einer sein: Eingaben über
   * mehrere Absätze hinweg sind abgelehnt worden.
   */
  function reportChangedParagraph(): void {
    const element = host()
    if (element === null) return
    for (const paragraph of paragraphs) {
      const node = element.querySelector<HTMLElement>(
        `[data-paragraph-index="${paragraph.index}"]`,
      )
      const text = node?.textContent ?? null
      if (text !== null && text !== paragraph.text) {
        onParagraphInput(paragraph.index, text)
        return
      }
    }
  }

  /**
   * `beforeinput` als echtes DOM-Ereignis, nicht über Reacts synthetisches
   * `onBeforeInput`: Nur das native trägt `inputType` und `getTargetRanges`
   * verlässlich, und nur daran ist „Formatierung" von „Text" und ein
   * absatzübergreifender Eingriff von einem absatzinternen zu unterscheiden.
   *
   * Der Zuhörer sitzt an der **Fläche**, nicht am einzelnen Absatz. Auch das
   * ist gemessen: Chrome verschickt das Ereignis am Bearbeitungsbereich
   * selbst, ein Zuhörer am `<p>` bekam die Eingabetaste nie zu sehen und
   * ließ sie durch — im Browser entstand ein sechster Absatz, den es im
   * Modell nicht gibt.
   */
  useLayoutEffect(() => {
    const element = rootRef?.current ?? ownRef.current
    if (element === null || !editable) return
    const handleBeforeInput = (event: Event) => {
      const input = event as InputEvent
      if (isBlockedInputType(input.inputType) || !staysWithinOneParagraph(element, input)) {
        event.preventDefault()
      }
    }
    const handleCompositionStart = () => collapseAcrossParagraphs(element)
    element.addEventListener('beforeinput', handleBeforeInput)
    element.addEventListener('compositionstart', handleCompositionStart)
    return () => {
      element.removeEventListener('beforeinput', handleBeforeInput)
      element.removeEventListener('compositionstart', handleCompositionStart)
    }
  }, [editable, rootRef])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (isFormattingShortcut(event)) event.preventDefault()
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    const element = host()
    if (element === null) return
    // Über Absatzgrenzen hinweg einzufügen hieße, sie zu verschmelzen.
    if (!staysWithinOneParagraph(element, null)) return
    const text = toPlainTextInsertion(event.clipboardData.getData('text/plain'))
    if (text === '' || !insertPlainText(element, text)) return
    reportChangedParagraph()
  }

  return (
    <div
      ref={rootRef ?? ownRef}
      // React verwaltet die Absätze, der Browser ihren Text. Das ist genau
      // die Aufteilung, vor der die Warnung schützen will, und sie ist hier
      // Absicht: Struktur von React, Zeichen vom Nutzer.
      suppressContentEditableWarning
      contentEditable={editable}
      role={editable ? 'textbox' : undefined}
      aria-multiline={editable ? true : undefined}
      aria-labelledby={editable ? labelledBy : undefined}
      lang={language}
      spellCheck={editable}
      onKeyDown={editable ? handleKeyDown : undefined}
      onInput={editable ? reportChangedParagraph : undefined}
      onPaste={editable ? handlePaste : undefined}
      // Zusätzlich zu `insertFromDrop` (siehe `editableInput.ts`): Nicht
      // jeder Browser meldet ein Ablegen vorher als Eingabeart an.
      onDrop={editable ? (event: DragEvent<HTMLDivElement>) => event.preventDefault() : undefined}
      className={cn('flex flex-col gap-4', editable && 'focus-ring rounded-md', className)}
    >
      {paragraphs.map((paragraph) => (
        <DocumentParagraph
          key={paragraph.index}
          paragraph={paragraph}
          retained={retained.has(paragraph.index)}
          claimed={claimed.has(paragraph.index)}
        />
      ))}
    </div>
  )
}

interface DocumentParagraphProps {
  paragraph: Paragraph
  retained: boolean
  claimed: boolean
}

function DocumentParagraph({ paragraph, retained, claimed }: DocumentParagraphProps) {
  const ref = useRef<HTMLParagraphElement>(null)

  // Bewusst ohne Abhängigkeitsliste: Der Abgleich läuft nach **jedem**
  // Rendern und kostet einen Zeichenkettenvergleich. Mit `[paragraph.text]`
  // bliebe der Fall unbehandelt, in dem der DOM von etwas anderem verändert
  // wurde als von einer Eingabe — und genau dann muss das Modell gewinnen.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    if (element.textContent !== paragraph.text) element.textContent = paragraph.text
  })

  return (
    <p
      ref={ref}
      data-paragraph-index={paragraph.index}
      data-paragraph-start={paragraph.start}
      className={cn(
        // Eine leere Zeile im Brief bleibt eine leere Zeile: ohne
        // Mindesthöhe fiele der Absatz auf null zusammen und wäre weder
        // sichtbar noch anklickbar.
        'min-h-[1.7em] border-l-2 pl-3 whitespace-pre-wrap',
        // Die Kontur liegt immer an, nur farblos: So verschiebt sich beim
        // Hervorheben kein Zeichen. Die unbelegte Aussage gewinnt, wenn
        // beides zusammentrifft — sie hält den Export an, die
        // Verschiebungswarnung nicht.
        claimed
          ? 'border-[var(--color-error)]'
          : retained
            ? 'border-[var(--color-warning)]'
            : 'border-transparent',
      )}
    />
  )
}

/**
 * Betrifft diese Eingabe genau einen Absatz?
 *
 * `beforeinput` sagt über `getTargetRanges()`, welchen Bereich der Browser
 * gleich ändern wird — auch dann, wenn er über den sichtbaren Cursor
 * hinausgeht: Die Rücktaste am Absatzanfang meldet einen Bereich, der beim
 * Ende des vorigen Absatzes beginnt. Genau daran ist das Verschmelzen zu
 * erkennen, bevor es geschieht.
 *
 * Ohne gemeldeten Bereich (manche Browser lassen ihn bei einer reinen
 * Texteingabe weg, jsdom kennt die Methode gar nicht) entscheidet die
 * aktuelle Markierung. `event === null` fragt ausschließlich sie — das
 * braucht das Einfügen aus der Zwischenablage, das seinen Bereich erst
 * anlegt.
 */
function staysWithinOneParagraph(root: HTMLElement, event: InputEvent | null): boolean {
  const ranges =
    event !== null && typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : []

  if (ranges.length > 0) {
    return ranges.every((range) => sameParagraph(range.startContainer, range.endContainer))
  }

  const selection = root.ownerDocument.defaultView?.getSelection() ?? null
  if (selection === null || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  return sameParagraph(range.startContainer, range.endContainer)
}

function sameParagraph(start: Node, end: Node): boolean {
  const paragraph = paragraphOf(start)
  return paragraph !== null && paragraph === paragraphOf(end)
}

/**
 * Legt eine Markierung, die über eine Absatzgrenze reicht, auf ihren Anfang
 * zusammen — die einzige Stelle, an der sich eine Eingabemethode aufhalten
 * lässt.
 *
 * `insertCompositionText` ist in Chrome nicht abbrechbar (siehe oben).
 * Begänne eine IME-Eingabe über einer Markierung, die zwei Absätze
 * überdeckt, verschmölze der Browser sie im DOM, obwohl
 * {@link staysWithinOneParagraph} die Eingabe ablehnt. Sichtbar wäre das als
 * Verdopplung: `reportChangedParagraph` meldet nur den **ersten**
 * abweichenden Absatz, dessen Text dann A und B enthielte, während B im
 * Modell steht und beim nächsten Rendern wieder erschiene.
 *
 * `compositionstart` läuft, bevor der Browser den markierten Text löscht.
 * Danach hat die Eingabe genau einen Absatz vor sich. Der markierte Text
 * bleibt dabei stehen, statt ersetzt zu werden — das ist nicht, was der
 * Nutzer wollte, aber es ist sichtbar und rückgängig zu machen, während
 * zwei verschmolzene Absätze die Zuordnung zwischen Absatz und Offset
 * brechen.
 *
 * Der Anfang ist die Stelle, an der der Nutzer zu schreiben begonnen hat.
 * Liegt er außerhalb jedes Absatzes (jemand hat über den Rand der Fläche
 * hinausgezogen), bleibt das Ende; liegt keiner von beiden in einem Absatz,
 * gibt es keine Absatzgrenze, die verletzt werden könnte.
 */
function collapseAcrossParagraphs(root: HTMLElement): void {
  const selection = root.ownerDocument.defaultView?.getSelection() ?? null
  if (selection === null || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (range.collapsed || sameParagraph(range.startContainer, range.endContainer)) return

  if (paragraphOf(range.startContainer) !== null) selection.collapseToStart()
  else if (paragraphOf(range.endContainer) !== null) selection.collapseToEnd()
}
