import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { DocumentFormat, FormattedParagraph, PageFormat } from '@/lib/docx/format'
import type { ParagraphAnchor } from '@/lib/docx/floatPosition'
import type { Paragraph } from '@/lib/docx/model'
import { cn } from '@/lib/utils'
import { DocumentFloats } from './DocumentFloats'
import { useDocumentFonts } from './documentFonts'
import {
  caretOffsetWithin,
  displayedText,
  pieceSignature,
  placeCaretWithin,
  runPieces,
  sourceText,
  writePieces,
} from './documentRuns'
import { PARAGRAPH_INDEX_ATTRIBUTE, paragraphOf } from './documentSelection'
import { pageStyle, paragraphStyle, type NaturalLineHeight } from './documentStyle'
import { splitIntoPages } from './pagination'
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
 * **Seiten, aber eine Schreibfläche.** Der Brief wird auf A4-Seiten
 * verteilt, und läuft er über, steht die nächste darunter. Die Seiten sind
 * jedoch nur Kästen **innerhalb** dieses einen `contentEditable` — jede
 * Seite als eigener Bearbeitungsbereich würde dieselbe Markierungsklemme
 * auslösen, die oben beschrieben ist, nur eine Ebene höher.
 *
 * Getrennt wird ausschließlich **zwischen** Absätzen. Ein Absatz, der über
 * zwei Seitenkästen verteilt wäre, wären zwei Elemente, und die
 * Offset-Rechnung bräche. Ein Absatz, der allein höher ist als eine Seite,
 * bekommt deshalb eine Seite, die mitwächst.
 *
 * Die Aufteilung entsteht aus **gemessenen** Höhen, nicht aus geschätzten
 * Zeilen: Schriftgröße, Fensterbreite und Zeilenumbruch kennt nur der
 * Browser. Gemessen wird im fertigen Seitenlayout, weil der Seitenrand die
 * Textbreite ändert und damit die Höhen; der Lauf setzt sich, sobald sich
 * die Aufteilung nicht mehr ändert.
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
  /**
   * Absätze, in denen der Name einer fremden Firma steht (Aufgabe 12,
   * deterministisch, ohne KI). Dieselbe Kontur wie bei einer unbestätigten
   * Aussage: Beides ist ein Fehler im Brief, den der Nutzer sehen und
   * beheben soll, und beides zeigt aus demselben Grund auf den Absatz statt
   * auf die Fundstelle darin (siehe `foreignCompanies.ts`).
   */
  foreignParagraphs?: readonly number[]
  /**
   * Absätze, in denen der Briefkopf selbsttätig übernommen wurde. Eigene
   * Farbe, nicht die der Beanstandung: Hier ist nichts falsch, hier hat die
   * Anwendung nur etwas getan, und der Nutzer soll sehen, was. Der Bericht
   * mit Alt und Neu steht daneben in `LetterheadPanel`.
   */
  letterheadParagraphs?: readonly number[]
  /**
   * Die ausgelesene Formatierung des Dokuments — Schrift, Grade, Einzüge,
   * Zeilenabstände, Seitenmaße.
   *
   * Fehlt sie, zeigt die Fläche den Brief als Rohtext auf einem A4-Blatt,
   * so wie vor der originalgetreuen Darstellung. Das ist kein Rückschritt,
   * sondern die Sicherung: Ein Dokument, dessen Formatierung sich nicht
   * lesen lässt, bleibt lesbar und bearbeitbar, statt gar nicht zu
   * erscheinen.
   */
  format?: DocumentFormat | null
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
  foreignParagraphs = [],
  letterheadParagraphs = [],
  format = null,
  onParagraphInput,
  labelledBy,
  language,
  rootRef,
  className,
}: DocumentViewProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const retained = new Set(retainedParagraphs)
  const flagged = new Set([...claimParagraphs, ...foreignParagraphs])
  const applied = new Set(letterheadParagraphs)
  const natural = useDocumentFonts(format)
  // Die Formatierung kennt ihre Absätze über den Index des Fließtextmodells;
  // Absätze aus Kopfzeilen und Textfeldern tragen `null` und gehören nicht
  // hierher (siehe `format.ts`).
  const formatted = useMemo(() => {
    const byIndex = new Map<number, FormattedParagraph>()
    for (const paragraph of format?.paragraphs ?? []) {
      if (paragraph.index !== null) byIndex.set(paragraph.index, paragraph)
    }
    return byIndex
  }, [format])

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
      // `sourceText` und nicht `textContent`: Ein übersetztes Bildzeichen
      // zeigt `•`, im Dokument steht aber `U+F09F`. Der Bildschirmtext
      // zurückgemeldet, machte schon eine Änderung irgendwo in derselben
      // Zeile aus dem Wingdings-Zeichen dauerhaft einen Aufzählungspunkt.
      const text = node === null ? null : sourceText(node)
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

  const root = rootRef ?? ownRef
  const page = format?.page ?? null
  const { pages, geometry } = usePagination(root, paragraphs, page)
  const anchors = useParagraphAnchors(root, geometry.pxPerPt, pages, paragraphs)

  const surface = (
    <div
      ref={root}
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
      // `--pt` ist der Maßstab des Blattes: wie viele Pixel ein Punkt hier
      // misst. Jedes Maß der Darstellung hängt daran (siehe
      // `documentStyle.ts`), damit der Brief mit der Spaltenbreite skaliert,
      // ohne dass ein `transform` Cursorsetzung und Trefferprüfung gegen das
      // verschiebt, was der Nutzer sieht.
      style={{ '--pt': `${geometry.pxPerPt}px` } as CSSProperties}
      className={cn('flex flex-col', editable && 'focus-ring rounded-md', className)}
    >
      {pages.map((indices, pageIndex) => (
        <div
          key={pageIndex}
          data-page={pageIndex + 1}
          // Blattmaß und Ränder kommen aus dem Dokument (`w:sectPr`), nicht
          // aus einem festen A4-Verhältnis mit 9,5 % Rand. Ein Anschreiben
          // nach DIN 5008 hat links einen anderen Rand als rechts; mit
          // gleichen Rändern stünde jeder Absatz um Millimeter falsch.
          //
          // Ohne ausgelesene Formatierung bleibt es beim alten Weg: Höhe aus
          // der gemessenen Breite im A4-Verhältnis. Das ist gemessen und
          // nicht geschätzt — `100cqw` löste sich seinerzeit gegen das
          // Fenster auf statt gegen die Seite, und der Umbruch trennte in
          // einen Kasten, der doppelt so viel fasste.
          //
          // Kein `gap` zwischen den Seiten, sondern `mb`: Flex-Abstände
          // zwischen Kindern eines `contentEditable` sind heikel, weil der
          // Browser dort seinen Schreibcursor hineinsetzen können muss.
          //
          // Beim Drucken fällt all das weg (siehe `lib/export/print.css`).
          style={
            page === null
              ? geometry.pageHeight > 0
                ? { minHeight: geometry.pageHeight }
                : undefined
              : pageStyle(page)
          }
          className={cn(
            'flex w-full flex-col',
            // Der Abstand zwischen Absätzen steckt in ihrer Polsterung,
            // sobald die Formatierung bekannt ist — Word setzt ihn je Absatz
            // und nicht gleichmäßig.
            page === null && 'gap-4 p-[9.5%]',
            'rounded-lg bg-[var(--color-surface-raised)] shadow-[var(--shadow-raised)]',
            'mb-5 last:mb-0',
          )}
        >
          {indices.map((index) => {
            const paragraph = paragraphs[index]
            if (paragraph === undefined) return null
            return (
              <DocumentParagraph
                key={paragraph.index}
                paragraph={paragraph}
                formatted={formatted.get(paragraph.index) ?? null}
                natural={natural}
                retained={retained.has(paragraph.index)}
                flagged={flagged.has(paragraph.index)}
                applied={applied.has(paragraph.index)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )

  if (format === null) return surface

  // Die schwebende Ebene liegt **neben** dem Bearbeitungsbereich, nicht
  // darin: Nicht bearbeitbare Inseln in einem `contentEditable` bringen den
  // Schreibcursor durcheinander (siehe `DocumentFloats`).
  return (
    <div className="relative">
      {surface}
      <DocumentFloats
        format={format}
        pageCount={pages.length}
        pxPerPt={geometry.pxPerPt}
        pageGap={PAGE_GAP}
        anchors={anchors}
        natural={natural}
      />
    </div>
  )
}

/** Der Abstand zwischen zwei Blättern (`mb-5`), in Pixeln. */
const PAGE_GAP = 20

/**
 * Wo jeder Absatz zu stehen kam — Seite und Oberkante, in Punkt.
 *
 * Ein schwebendes Objekt hängt in Word regelmäßig an einem Absatz: die
 * Unterschrift an der Grußformel. Auf welcher Seite und in welcher Höhe der
 * landet, steht erst nach dem Umbruch fest, also erst nach dem Messen.
 *
 * Gemessen wird an der **fertigen** Aufteilung, deshalb hängt der Lauf an
 * `pages`: Solange die Seiten sich noch setzen, stünde jeder Absatz gleich
 * wieder woanders. Ersetzt wird die Zuordnung nur, wenn sie sich wirklich
 * geändert hat — sonst liefe der Effekt endlos.
 */
function useParagraphAnchors(
  root: RefObject<HTMLDivElement | null>,
  pxPerPt: number,
  pages: number[][],
  paragraphs: readonly Paragraph[],
): ReadonlyMap<number, ParagraphAnchor> {
  const [anchors, setAnchors] = useState<ReadonlyMap<number, ParagraphAnchor>>(() => new Map())

  useLayoutEffect(() => {
    const element = root.current
    if (element === null || pxPerPt <= 0) return

    const next = new Map<number, ParagraphAnchor>()
    element.querySelectorAll<HTMLElement>('[data-page]').forEach((box, pageIndex) => {
      const pageTop = box.getBoundingClientRect().top
      box.querySelectorAll<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`).forEach((paragraph) => {
        const index = Number(paragraph.getAttribute(PARAGRAPH_INDEX_ATTRIBUTE))
        if (!Number.isInteger(index)) return
        const topPt = (paragraph.getBoundingClientRect().top - pageTop) / pxPerPt
        next.set(index, { pageIndex, topPt })
      })
    })

    setAnchors((current) => (sameAnchors(current, next) ? current : next))
  }, [root, pxPerPt, pages, paragraphs])

  return anchors
}

function sameAnchors(
  a: ReadonlyMap<number, ParagraphAnchor>,
  b: ReadonlyMap<number, ParagraphAnchor>,
): boolean {
  if (a.size !== b.size) return false
  for (const [index, anchor] of a) {
    const other = b.get(index)
    if (other === undefined) return false
    if (other.pageIndex !== anchor.pageIndex || other.topPt !== anchor.topPt) return false
  }
  return true
}

/**
 * Die Absätze auf Seiten verteilt, gemessen am fertigen Layout.
 *
 * Der Lauf ist bewusst zweistufig: Zuerst steht alles auf einer Seite, dann
 * wird gemessen und aufgeteilt, dann im Seitenlayout **erneut** gemessen —
 * der Seitenrand ändert die Textbreite und damit die Höhen. Er setzt sich,
 * sobald sich die Aufteilung nicht mehr ändert; verglichen wird deshalb vor
 * jedem Setzen, sonst liefe der Effekt endlos.
 *
 * Ohne `ResizeObserver` (jsdom, siehe `setupTests.ts`) bleibt es bei einer
 * Seite. Das ist kein Mangel: Die Aufteilung ist Darstellung, und alles,
 * was daran hängt, ist ohne sie genauso richtig.
 */
function usePagination(
  root: RefObject<HTMLDivElement | null>,
  paragraphs: readonly Paragraph[],
  page: PageFormat | null,
): { pages: number[][]; geometry: PageGeometry } {
  const [pages, setPages] = useState<number[][]>(() => [paragraphs.map((_, index) => index)])
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = root.current
    if (element === null || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])

  const geometry = pageGeometry(width, page)

  useLayoutEffect(() => {
    const element = root.current
    if (element === null) return

    const boxes = Array.from(element.querySelectorAll<HTMLElement>(`[${PARAGRAPH_INDEX_ATTRIBUTE}]`))
    const heights = boxes.map((box) => box.offsetHeight)

    const next = splitIntoPages(heights, geometry.textHeight, geometry.gap)
    setPages((current) => (samePages(current, next) ? current : next))
  }, [root, paragraphs, geometry.textHeight, geometry.gap])

  return { pages, geometry }
}

interface PageGeometry {
  /** Pixel je Punkt — der Maßstab, an dem alle Maße der Seite hängen. */
  pxPerPt: number
  /** Außenmaß der Seite in Pixeln. */
  pageHeight: number
  /** Was davon für Text bleibt, also ohne die Ränder. */
  textHeight: number
  /** Abstand zwischen zwei Absätzen, den die Aufteilung mitrechnen muss. */
  gap: number
}

/**
 * Wie groß das Blatt auf dem Schirm ist.
 *
 * Es ist immer so breit wie die gemessene Spalte; alles andere folgt daraus.
 * Mit ausgelesener Formatierung kommen Seitenverhältnis und Ränder aus dem
 * Dokument, und der Abstand zwischen zwei Absätzen ist **null** — er steckt
 * dann in der Polsterung jedes Absatzes, weil Word ihn je Absatz setzt und
 * nicht gleichmäßig.
 *
 * Ohne Formatierung bleibt es beim alten Weg: A4-Verhältnis auf die gemessene
 * Breite, beidseits 9,5 % Rand (2 cm auf 21 cm), fester Abstand von 16 px.
 * Außenmaß und Texthöhe kommen dabei aus **derselben** Zahl — die einzige
 * Bauart, in der Kasten und Umbruch nicht auseinanderlaufen können.
 */
function pageGeometry(width: number, page: PageFormat | null): PageGeometry {
  if (page === null) {
    const pageHeight = width * (297 / 210)
    return {
      pxPerPt: width / A4_WIDTH_PT,
      pageHeight,
      textHeight: pageHeight - 2 * (0.095 * width),
      gap: PARAGRAPH_GAP,
    }
  }

  const pxPerPt = width / page.widthPt
  return {
    pxPerPt,
    pageHeight: page.heightPt * pxPerPt,
    textHeight: (page.heightPt - page.marginTopPt - page.marginBottomPt) * pxPerPt,
    gap: 0,
  }
}

/** DIN A4 in Punkt — nur für die Fläche ohne ausgelesene Formatierung. */
const A4_WIDTH_PT = 595.28

/** Der Abstand zwischen zwei Absätzen (`gap-4`), in die Höhe eingerechnet. */
const PARAGRAPH_GAP = 16

function samePages(a: number[][], b: number[][]): boolean {
  return a.length === b.length && a.every((page, index) => sameNumbers(page, b[index] ?? []))
}

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

interface DocumentParagraphProps {
  paragraph: Paragraph
  /** Die Formatierung dieses Absatzes, oder `null` für die Rohtextfläche. */
  formatted: FormattedParagraph | null
  natural: NaturalLineHeight
  retained: boolean
  /** Eine unbestätigte unbelegte Aussage oder ein fremder Firmenname. */
  flagged: boolean
  /** Hier wurde der Briefkopf selbsttätig übernommen. */
  applied: boolean
}

function DocumentParagraph({
  paragraph,
  formatted,
  natural,
  retained,
  flagged,
  applied,
}: DocumentParagraphProps) {
  const ref = useRef<HTMLParagraphElement>(null)

  /**
   * Der Abgleich zwischen Modell und DOM — **das Modell gewinnt**.
   *
   * Bewusst ohne Abhängigkeitsliste: Er läuft nach **jedem** Rendern und
   * kostet zwei Zeichenkettenvergleiche. Mit `[paragraph.text]` bliebe der
   * Fall unbehandelt, in dem der DOM von etwas anderem verändert wurde als
   * von einer Eingabe — und genau dann muss das Modell gewinnen.
   *
   * Verglichen wird **zweierlei**, seit die Läufe Formatierung tragen:
   *
   * - der **Text**. Weicht er ab, wird neu gebaut und der Cursor springt an
   *   den Absatzanfang. Sichtbar unangenehm und genau so gewollt — die
   *   Gegenrichtung wäre eine Ansicht, die etwas anderes zeigt als das, was
   *   gesichert und ausgegeben wird.
   * - der **Aufbau der Läufe**. Er kann sich ändern, während der Text
   *   derselbe bleibt: Eine Umformulierung teilt Läufe. Dann wird ebenfalls
   *   neu gebaut, der Cursor aber wieder an seine Stelle gesetzt — ein
   *   Sprung wäre hier durch nichts zu rechtfertigen.
   *
   * Gewöhnliches Tippen löst **keines** von beidem aus: Der Text im DOM ist
   * nach dem Umlauf über das Modell derselbe, und die Kennung des Aufbaus
   * trägt keine Längen (siehe `documentRuns.ts`). Der Cursor bleibt stehen,
   * wo er war.
   */
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return

    if (formatted === null) {
      if (element.textContent !== paragraph.text) element.textContent = paragraph.text
      return
    }

    const pieces = runPieces(formatted)
    const shown = displayedText(pieces)
    const signature = pieceSignature(pieces)
    if (element.textContent === shown && element.dataset.runs === signature) return

    const caret = element.textContent === shown ? caretOffsetWithin(element) : null
    writePieces(element, pieces)
    element.dataset.runs = signature
    if (caret !== null) placeCaretWithin(element, caret)
  })

  return (
    <p
      ref={ref}
      data-paragraph-index={paragraph.index}
      data-paragraph-start={paragraph.start}
      style={formatted === null ? undefined : paragraphStyle(formatted, natural)}
      className={cn(
        // Eine leere Zeile im Brief bleibt eine leere Zeile: ohne
        // Mindesthöhe fiele der Absatz auf null zusammen und wäre weder
        // sichtbar noch anklickbar.
        'whitespace-pre-wrap',
        // Die Kontur der Markierung liegt **neben** dem Absatz, nicht an ihm:
        // als abgesetztes Pseudoelement statt als Rand mit Innenabstand. Ein
        // Rand nähme Breite und verschöbe jede Zeile um 14 px gegen den
        // Einzug, den das Dokument vorgibt — bei einem Anschreiben, dessen
        // Anschriftenfeld auf den Millimeter sitzt, sofort sichtbar. Ein
        // Pseudoelement steht in keinem Knoten und rührt damit auch die
        // Offsets nicht an.
        'relative before:absolute before:inset-y-0 before:-left-3 before:w-0.5 before:content-[""]',
        // Ohne ausgelesene Formatierung gibt es kein Maß aus dem Dokument,
        // an dem sich die Höhe einer Leerzeile bemessen ließe.
        formatted === null && 'min-h-[1.7em]',
        // Die Kontur liegt immer an, nur farblos: So verschiebt sich beim
        // Hervorheben kein Zeichen. Der beanstandete Absatz gewinnt, wenn
        // beides zusammentrifft — er hält den Export an oder nennt einen
        // falschen Firmennamen, die Verschiebungswarnung dagegen beschreibt
        // nur eine Nebenwirkung.
        // Der Briefkopf steht hinten an: Ein falscher Firmenname hält den
        // Export auf, „hier wurde etwas geändert" ist ein Hinweis.
        flagged
          ? 'before:bg-[var(--color-error)]'
          : retained
            ? 'before:bg-[var(--color-warning)]'
            : applied
              ? 'before:bg-[var(--color-info)]'
              : 'before:bg-transparent',
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
