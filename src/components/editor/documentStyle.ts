import type { CSSProperties } from 'react'

import type {
  CharacterFormat,
  FormattedParagraph,
  PageFormat,
  ParagraphItem,
} from '@/lib/docx/format'
import { translateSymbolText } from '@/lib/docx/symbols'
import { bundledFamily } from '@/lib/fonts/bundled'

/**
 * Übersetzt die ausgelesene Formatierung eines Word-Dokuments in CSS — die
 * Brücke zwischen `lib/docx/format.ts` und der Arbeitsfläche.
 *
 * **Warum es das gibt.** Die Fläche zeigte den Brief lange als Rohtext, und
 * die ganze Formatierung, die `format.ts` ausliest, benutzte allein die
 * PDF-Ausfuhr. Wer eine umformulierte Stelle beurteilen soll, braucht aber
 * den Brief, wie er beim Empfänger ankommt: in seiner Schrift, mit seinen
 * Einzügen, auf seinem Satzspiegel.
 *
 * **Warum alles in `calc(var(--pt) * N)` steht.** Das Blatt ist so breit wie
 * die gemessene Spalte, nicht 21 cm. `--pt` ist der Umrechnungsfaktor, den
 * die Fläche daraus setzt (Pixel je Punkt); jedes Maß hängt daran und
 * skaliert mit. Der naheliegende Weg — feste Punktmaße und
 * `transform: scale()` — wäre falsch: Eine Skalierung über `transform`
 * verschiebt Cursorsetzung und Trefferprüfung in einem `contentEditable`
 * gegen das, was der Nutzer sieht.
 *
 * **Was hier nicht passiert: den Text ändern.** Versalien laufen über
 * `text-transform`, Kapitälchen über `font-variant-caps` — nicht dadurch,
 * dass großgeschriebener Text in den DOM geschrieben wird. Der
 * Zeichenbestand im DOM muss zeichengleich mit `Paragraph.text` bleiben,
 * sonst zeigen die Markierungen des Nutzers hinterher auf andere Stellen.
 * Die eine Ausnahme ist {@link displayText}, und sie ist auf Übersetzungen
 * gleicher Länge beschränkt.
 *
 * **Was bewusst fehlt.** Tabulatoren stehen als `\t` im Text und landen auf
 * den Standardabständen des Browsers, nicht auf Words Tabulatorpositionen
 * (`ParagraphFormat.tabStops`) — im PDF stimmen sie, auf dem Schirm noch
 * nicht. In einem Anschreiben nach DIN 5008 kommt der Fall selten vor, weil
 * die Anschrift in einem Textfeld steht statt hinter Tabulatoren.
 */

/** Anteile, in denen der PDF-Satz rechnet — hier dieselben (`layout.ts`). */
const SCRIPT_SCALE = 0.65
const SUPERSCRIPT_RISE = 0.35
const SUBSCRIPT_RISE = -0.15

/**
 * Die natürliche Zeilenhöhe einer Schrift in Punkt: `ascent - descent +
 * lineGap` aus der `hhea`-Tabelle, auf den Grad gerechnet.
 *
 * Wird hereingereicht statt hier gerechnet, damit dieses Modul ohne
 * Schriftdateien prüfbar bleibt — und damit die Fläche dieselben Metriken
 * benutzt, aus denen der PDF-Satz rechnet.
 */
export type NaturalLineHeight = (format: CharacterFormat) => number

/** Ein Maß in Punkt als CSS-Länge, gemessen am Maßstab der Seite. */
export function scaled(valuePt: number): string {
  // Drei Nachkommastellen: Bei einem Blatt von 595 pt liegt die vierte
  // deutlich unter einem Bildschirmpixel. Ohne das Runden stünde in jedem
  // Attribut das volle Gleitkommaergebnis.
  return `calc(var(--pt) * ${Math.round(valuePt * 1000) / 1000})`
}

/**
 * Was ein Textstück auf dem Bildschirm zeigt.
 *
 * Word schreibt ein Wingdings-Zeichen nicht als Bild, sondern als Zeichen
 * aus dem Privatbereich (`U+F09F`), dessen Bedeutung erst der Schriftname
 * gibt. Die Schrift selbst ist lizenziert und liegt nicht im Projekt; ohne
 * Übersetzung sucht der Browser `U+F09F` in Carlito, findet nichts und zeigt
 * einen leeren Kasten — in der Kontaktzeile eines Anschreibens der
 * sichtbarste Fehler überhaupt.
 *
 * **Die Länge ist die Bedingung.** An den Zeichenzahlen im DOM hängen die
 * Offsets der Markierungen. `translateSymbolText` bildet Zeichen auf Zeichen
 * ab und ist damit längentreu, solange Quelle und Ziel in der
 * Basis-Ebene liegen — für Bildschriften immer. Für den Rest gilt: Eine
 * Übersetzung, die die Zeichenzahl änderte, wird verworfen. Lieber ein
 * leerer Kasten als eine verrutschte Markierung.
 */
export function displayText(text: string, format: CharacterFormat): string {
  const translated = translateSymbolText(format.fontFamily, text)
  return translated.length === text.length ? translated : text
}

export function characterStyle(format: CharacterFormat): CSSProperties {
  const script = format.vertAlign !== 'baseline'
  const decorations = [
    format.underline ? 'underline' : null,
    format.strike ? 'line-through' : null,
  ].filter((entry) => entry !== null)

  return {
    // Der Name aus dem Dokument nennt eine Schrift, die es hier nicht gibt;
    // `bundledFamily` nennt den metrikgleichen Nachbau, der geladen wird.
    // Fettung und Neigung wählen den Schnitt daraus — die Schriften sind
    // unter derselben Familie mit `weight`/`style` angemeldet.
    fontFamily: bundledFamily(format.fontFamily),
    fontSize: scaled(script ? format.sizePt * SCRIPT_SCALE : format.sizePt),
    fontWeight: format.bold ? 700 : 400,
    fontStyle: format.italic ? 'italic' : 'normal',
    ...(decorations.length > 0 ? { textDecorationLine: decorations.join(' ') } : {}),
    ...(format.color === null ? {} : { color: `#${format.color}` }),
    // Über CSS, nicht über den Text — siehe die Kopfnotiz.
    ...(format.caps ? { textTransform: 'uppercase' as const } : {}),
    ...(format.smallCaps ? { fontVariantCaps: 'small-caps' as const } : {}),
    ...(script
      ? {
          verticalAlign: scaled(
            format.sizePt *
              (format.vertAlign === 'superscript' ? SUPERSCRIPT_RISE : SUBSCRIPT_RISE),
          ),
        }
      : {}),
  }
}

/**
 * Die Zeilenhöhe eines Absatzes in Punkt — dieselbe Rechnung wie in
 * `export/pdf/layout.ts`, damit Bildschirm und PDF nicht auseinanderlaufen.
 *
 * **Ein Wert je Absatz, nicht je Zeile.** Word bemisst jede Zeile nach dem,
 * was auf ihr steht; CSS kennt nur eine Zeilenhöhe für den ganzen Absatz.
 * Genommen wird deshalb der größte Grad des Absatzes. In einem Anschreiben,
 * dessen Absätze einheitlich gesetzt sind, ist das dasselbe Ergebnis.
 */
function lineHeightPt(paragraph: FormattedParagraph, natural: NaturalLineHeight): number {
  const formats = paragraph.items.map((item: ParagraphItem) => item.format)
  // Ein Absatz ohne Lauf hat keinen Grad; dann gilt die Absatzmarke — genau
  // dafür trägt `FormattedParagraph` sie.
  const base = Math.max(...(formats.length > 0 ? formats : [paragraph.markFormat]).map(natural))

  const spacing = paragraph.format.lineSpacing
  if (spacing.rule === 'auto') return base * spacing.factor
  if (spacing.rule === 'exact') return spacing.valuePt
  return Math.max(base, spacing.valuePt)
}

export function paragraphStyle(
  paragraph: FormattedParagraph,
  natural: NaturalLineHeight,
): CSSProperties {
  const { format } = paragraph
  const height = lineHeightPt(paragraph, natural)

  return {
    textAlign: format.alignment,
    marginLeft: scaled(format.indentLeftPt),
    marginRight: scaled(format.indentRightPt),
    textIndent: scaled(format.indentFirstLinePt),
    // Polsterung, nicht Rand: CSS-Ränder benachbarter Geschwister fallen
    // zusammen, Words Abstände tun das nicht — und `offsetHeight` schließt
    // Polsterung ein, Ränder nicht, woran die Seitenaufteilung misst.
    paddingTop: scaled(format.spaceBeforePt),
    paddingBottom: scaled(format.spaceAfterPt),
    lineHeight: scaled(height),
    // Ohne Mindesthöhe fiele ein leerer Absatz auf null zusammen und wäre
    // weder sichtbar noch anklickbar.
    minHeight: scaled(height),
  }
}

export function pageStyle(page: PageFormat): CSSProperties {
  return {
    width: scaled(page.widthPt),
    minHeight: scaled(page.heightPt),
    paddingTop: scaled(page.marginTopPt),
    paddingRight: scaled(page.marginRightPt),
    paddingBottom: scaled(page.marginBottomPt),
    paddingLeft: scaled(page.marginLeftPt),
    // Die Ränder liegen **innerhalb** des Blattmaßes.
    boxSizing: 'border-box',
  }
}
