/**
 * Der Maßstab der Arbeitsfläche, in Prozent.
 *
 * **Warum es diese Datei gibt.** Der Maßstab ist keine Anzeigefrage, sondern
 * eine Rechnung: Aus ihm folgt die Breite des Blattkastens, und aus der
 * Breite folgt `--pt` — der Umrechnungsfaktor, an dem in `documentStyle.ts`
 * jedes einzelne Maß des Briefes hängt. Die Rechnung steht deshalb hier,
 * ohne React und ohne Oberfläche, und wird für sich geprüft. Dasselbe
 * Muster wie bei `rewriteRequest.ts`, wo die Umrechnung der Stellschrauben
 * ebenfalls neben der Ansicht liegt.
 *
 * **Warum nur herausgezoomt wird (25–100 %).** Bei 100 % füllt das Blatt die
 * Spalte bereits genau aus; darüber hinaus wäre es breiter als sein Behälter
 * und der Bereich müsste zusätzlich waagerecht blättern. Der Anlass war der
 * umgekehrte: Ein Brief steht auf dem Schirm oft zu nah, und der Nutzer will
 * die ganze Seite auf einmal sehen. 100 % ist damit das obere Ende und
 * braucht keine Raste in der Mitte, anders als bei Word.
 *
 * **Kein `transform: scale()`.** Der Maßstab wirkt über die Breite des
 * Kastens, nie über eine Skalierung. Eine Skalierung über `transform`
 * verschöbe Cursorsetzung und Trefferprüfung in der bearbeitbaren Fläche
 * gegen das, was der Nutzer sieht (siehe die Kopfnotiz in
 * `documentStyle.ts`).
 */

/** Kleinster Maßstab: das ganze Blatt und mehr auf einmal. */
export const ZOOM_MIN = 25
/** Größter Maßstab: das Blatt füllt die Spalte aus. */
export const ZOOM_MAX = 100
/** Schrittweite von Regler, Pfeiltasten und den beiden Knöpfen. */
export const ZOOM_STEP = 5
/** Voreinstellung, solange nichts gespeichert ist. */
export const ZOOM_DEFAULT = 100

/**
 * Die Breite des Blattkastens bei 100 %, in Pixeln.
 *
 * Dieselbe Zahl stand vorher als `max-w-[900px]` in `DocumentColumn`. Sie ist
 * ein festes Maß aus der Geometrie der Ansicht und fällt damit nicht unter
 * die Abstandsskala (siehe DESIGN.md, „Abstände").
 */
export const SHEET_MAX_PX = 900

/**
 * Ein gespeicherter oder hereingereichter Wert als brauchbarer Maßstab.
 *
 * Gebraucht beim Lesen der Einstellungen: `Settings.zoom` ist wahlfrei, fehlt
 * also in jedem Datensatz, der vor dieser Aufgabe gespeichert wurde. Auch
 * sonst gilt: Lieber ein lesbares Blatt als ein Wert, der aus einer fremden
 * Quelle stammt und die Fläche unbrauchbar macht.
 */
export function clampZoom(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ZOOM_DEFAULT
  return Math.min(Math.max(Math.round(value), ZOOM_MIN), ZOOM_MAX)
}

/**
 * Einen Schritt kleiner oder größer, auf der Schrittweite eingerastet.
 *
 * Eingerastet wird auf ein Vielfaches von {@link ZOOM_STEP}, damit die beiden
 * Knöpfe auch dann auf runde Werte führen, wenn der Ausgangswert krumm ist —
 * etwa aus einer älteren Sicherung.
 */
export function steppedZoom(value: number, direction: -1 | 1): number {
  const current = clampZoom(value)
  const rounded =
    direction === 1
      ? Math.floor(current / ZOOM_STEP) * ZOOM_STEP
      : Math.ceil(current / ZOOM_STEP) * ZOOM_STEP
  return clampZoom(rounded + direction * ZOOM_STEP)
}

/**
 * Die Maße des Blattkastens bei diesem Maßstab.
 *
 * Zwei Angaben, weil die Spalte zwei Zustände hat: Am breiten Fenster deckelt
 * `maxWidth` auf {@link SHEET_MAX_PX}, am schmalen greift `width` und nimmt
 * den vorhandenen Platz. Beide tragen denselben Faktor, also misst das Blatt
 * in jedem Fall genau `zoom` Prozent dessen, was es ohne Regler messen würde.
 */
export function sheetSize(zoom: number): { width: string; maxWidth: string } {
  const factor = clampZoom(zoom) / 100
  return {
    width: `${factor * 100}%`,
    maxWidth: `${SHEET_MAX_PX * factor}px`,
  }
}
