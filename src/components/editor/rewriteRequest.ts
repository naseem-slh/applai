import type { JobAd } from '@/lib/domain/jobAd'
import type { RewriteDocument, RewriteRequest } from '@/lib/domain/rewrite'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import type { TruthMode } from '@/lib/storage/adapter'
import type { EditorSelection } from './documentSelection'

/**
 * Der Auftrag an Aufgabe 11, zusammengesetzt aus dem, was die Arbeitsfläche
 * weiß.
 *
 * Eigene Datei und ohne React, weil hier drei Entscheidungen stecken, die
 * einzeln nachprüfbar sein sollen — in einer Komponente wären sie nur über
 * eine gerenderte Ansicht erreichbar.
 *
 * **1. Der Kontext kommt aus der Markierung, nicht von hier.**
 * `EditorSelection` trägt `contextBefore` und `contextAfter` bereits auf
 * `CONTEXT_MAX_CHARS` gekappt (Weitergabe aus 14a). Wer ihn hier neu
 * aus dem Dokument schnitte, umginge die Kappung: In den Prompt ginge dann
 * bei einer Markierung am Briefende der ganze Brief davor.
 *
 * **2. Die Faktenbasis ist das Hochgeladene, nicht der Arbeitsstand.**
 * `facts` ist die Grundlage, gegen die das Modell prüft, ob eine Aussage
 * belegt ist (G10). Nähme man den laufenden Dokumenttext, würde eine gerade
 * erst übernommene Formulierung beim nächsten Umschreiben als Beleg für sich
 * selbst gelten — im freien Modus wäre die erfundene Aussage danach eine
 * gedeckte. Genommen wird deshalb der Lebenslauf und das Anschreiben **wie
 * hochgeladen**.
 *
 * **3. Die Regler starten auf dem gemessenen Stand.** `formality` ersetzt im
 * Prompt die abgeleitete Förmlichkeit (siehe `RewriteRequest.sliders`);
 * damit „unverändert" überhaupt ausdrückbar ist, muss der Anfangswert der
 * gemessene sein. `length` beginnt bei 50, also „etwa gleich lang".
 */

/** Die Reglerstellungen. Aufgabe 14c hängt hier die beiden Schieberegler ein. */
export interface RewriteSliders {
  formality: number
  length: number
}

/** Der Anfangsstand der Regler zu einem frisch abgeleiteten Stilprofil. */
export function defaultSliders(style: StyleProfile): RewriteSliders {
  return { formality: style.formality, length: 50 }
}

/**
 * Der Anfangsstand der Regler beim **Lebenslauf**.
 *
 * `formality` steht auf der Mitte und bleibt dort: Der Lebenslauf hat keinen
 * Förmlichkeitsregler (`docs/spec.md`, „Stil"), und
 * `cvStyleProfileToPromptFragment` liest das Feld gar nicht. Es steht hier
 * nur, weil `RewriteSliders` von beiden Dokumenten geteilt wird — ein
 * eigener Typ für einen einzigen ungenutzten Wert wäre mehr Aufwand als
 * Klarheit.
 */
export const CV_DEFAULT_SLIDERS: RewriteSliders = { formality: 50, length: 50 }

/**
 * Wie viele Stufen die beiden Regler haben.
 *
 * `RewriteRequest.sliders` sind Zahlen von 0 bis 100, das Primitiv kennt
 * dagegen **benannte Stufen** (DESIGN.md: „Der `Slider` bekommt keine
 * Zahlenspanne, sondern eine Liste benannter Stufen … ein Wert wie ‚63' wäre
 * dort ohne Bedeutung"). Fünf Stufen sind die Übersetzung dazwischen: zwei
 * Enden, eine Mitte und je ein Zwischenschritt — genug, um „eher förmlich"
 * von „förmlich" zu unterscheiden, und wenig genug, dass jede Stufe einen
 * Namen tragen kann.
 *
 * Der gemessene Wert des Stilprofils liegt selten genau auf einer Stufe; er
 * wird für die Anzeige auf die nächste gerundet ({@link sliderStep}). Der
 * **gemessene** Wert bleibt davon unberührt: `defaultSliders` setzt ihn
 * ungerundet, und erst wenn der Nutzer den Regler anfasst, tritt ein
 * gerundeter Stufenwert an seine Stelle.
 */
export const SLIDER_STEP_COUNT = 5

/** Reglerwert (0–100) → Stufe des Primitivs. */
export function sliderStep(value: number): number {
  if (!Number.isFinite(value)) return Math.floor(SLIDER_STEP_COUNT / 2)
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round((clamped / 100) * (SLIDER_STEP_COUNT - 1))
}

/** Stufe des Primitivs → Reglerwert (0–100). */
export function stepToSlider(step: number): number {
  const clamped = Math.min(SLIDER_STEP_COUNT - 1, Math.max(0, Math.round(step)))
  return Math.round((clamped / (SLIDER_STEP_COUNT - 1)) * 100)
}

/**
 * Die Faktenbasis: Lebenslauf und Anschreiben als ein Fließtext.
 *
 * Fehlt eines von beiden, bleibt es weg — die Einstiegsseite verlangt nur
 * eines der beiden Dokumente (`docs/spec.md`). Ein leerer Abschnitt mit
 * Überschrift wäre für das Modell ein Hinweis auf etwas, das es nicht gibt.
 */
export function factsFrom(sources: { cv: string | null; letter: string | null }): string {
  return [sources.cv, sources.letter]
    .filter((text): text is string => text !== null && text.trim() !== '')
    .join('\n\n')
}

export interface RewriteRequestInput {
  selection: EditorSelection
  jobAd: JobAd
  /** Welches Dokument samt seinem Stilprofil — siehe `RewriteDocument`. */
  document: RewriteDocument
  facts: string
  truthMode: TruthMode
  targetLanguage: 'de' | 'en'
  sliders: RewriteSliders
}

export function buildRewriteRequest({
  selection,
  jobAd,
  document,
  facts,
  truthMode,
  targetLanguage,
  sliders,
}: RewriteRequestInput): RewriteRequest {
  return {
    selection: selection.text,
    contextBefore: selection.contextBefore,
    contextAfter: selection.contextAfter,
    jobAd,
    document,
    truthMode,
    facts,
    targetLanguage,
    sliders,
  }
}
