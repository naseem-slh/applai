import type { ModelChoice } from './provider'

/**
 * Welche Modelle der Auswahl gezeigt werden.
 *
 * **Warum das nötig ist.** `GET /v1beta/models` liefert alles, was der
 * Schlüssel aufrufen darf — darunter Einbettungsmodelle, Sprachausgabe,
 * Bilderzeugung und Video. Applai kann mit nichts davon etwas anfangen: Es
 * schreibt Text. Eine Liste mit vierzig Einträgen, von denen fünf taugen,
 * ist keine Auswahl, sondern eine Zumutung.
 *
 * **Warum es eine Heuristik über Namen ist und nichts Besseres.** AI Studio
 * führt die brauchbaren unter „Text-out models". Die API kennt diese
 * Kategorie nicht: Das Modell-Objekt trägt Name, Beschreibung,
 * Token-Grenzen und unterstützte Methoden, aber kein Feld für Art oder
 * Tarif (nachgesehen in der Modellreferenz). `generateContent` allein
 * genügt nicht, weil Sprachausgabe- und Bildmodelle dieselbe Methode
 * benutzen. Es bleibt der Name.
 *
 * **Erlaubt statt verboten.** Die erste Fassung zählte auf, was
 * *herausfällt* — und ließ damit alles durch, was anders heißt, als jemand
 * vorhergesehen hat: offene Modelle, Lehrmodelle, Robotik, jedes künftige
 * Sondermodell. Gezeigt wird deshalb nur, was zur Gemini-Textfamilie
 * gehört. Das ist die engere und die ehrlichere Regel: Sie irrt sichtbar
 * (ein Modell fehlt, „alle anzeigen" holt es) statt unsichtbar (ein
 * unbrauchbares Modell steht in der Liste und antwortet später mit einem
 * Fehler).
 *
 * **Deshalb ist die Filterung immer abschaltbar.** Eine Heuristik über
 * fremde Namensgebung wird eines Tages danebenliegen — spätestens, wenn ein
 * Modell auftaucht, das niemand vorhergesehen hat. Sie darf dann nicht das
 * Modell verstecken, das der Nutzer gerade braucht. Die Oberfläche bietet
 * „alle anzeigen"; hier steht nur, was der Vorschlag ist.
 */

/**
 * Namensbestandteile von Modellen, die etwas anderes als Text ausgeben.
 * Bewusst als Wortbestandteile geprüft, nicht als ganze Namen: Die Anbieter
 * hängen Zusätze wie `-preview-06-2025` an.
 */
const NON_TEXT_MARKERS = [
  'embedding',
  'embed',
  'aqa',
  'imagen',
  'image',
  'veo',
  'video',
  'tts',
  'audio',
  'live',
  // Auch innerhalb der Gemini-Familie gibt es Modelle, die etwas anderes tun
  // als Text zu schreiben.
  'robotics',
  'computer-use',
]

/**
 * Die Familie, die AI Studio unter „Text-out models" führt. Andere
 * Modellreihen — Gemma, LearnLM, Robotik — sind dort eigene Abschnitte und
 * gehören nicht in diese Auswahl.
 */
const TEXT_FAMILY_PREFIX = 'gemini-'

/** Gibt dieses Modell Text aus? */
export function isTextOutputModel(id: string): boolean {
  const name = id.toLowerCase()
  if (!name.startsWith(TEXT_FAMILY_PREFIX)) return false
  return !NON_TEXT_MARKERS.some((marker) => name.includes(marker))
}

/**
 * Ein Pro-Modell? Geprüft als eigenes Namensglied, damit ein künftiges
 * `gemini-prometheus` nicht fälschlich darunter fällt.
 */
export function isProModel(id: string): boolean {
  return /(^|[-_.])pro([-_.]|$)/i.test(id)
}

export interface ModelFilter {
  /**
   * Auch Pro-Modelle zeigen. Beim kostenlosen Tarif nicht: Sie sind dort
   * regelmäßig gar nicht enthalten, und ein Modell anzubieten, das
   * zuverlässig 429 antwortet, ist schlechter als es wegzulassen.
   */
  includePro: boolean
}

export function filterModels(choices: readonly ModelChoice[], filter: ModelFilter): ModelChoice[] {
  return choices.filter(
    (choice) =>
      isTextOutputModel(choice.id) && (filter.includePro || !isProModel(choice.id)),
  )
}
