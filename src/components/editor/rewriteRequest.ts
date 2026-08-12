import type { JobAd } from '@/lib/domain/jobAd'
import type { RewriteRequest } from '@/lib/domain/rewrite'
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
  style: StyleProfile
  facts: string
  truthMode: TruthMode
  targetLanguage: 'de' | 'en'
  sliders: RewriteSliders
}

export function buildRewriteRequest({
  selection,
  jobAd,
  style,
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
    style,
    truthMode,
    facts,
    targetLanguage,
    sliders,
  }
}
