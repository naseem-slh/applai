import type { Application } from '@/lib/storage/adapter'
import { findWholeWordOccurrences } from '@/lib/text/wholeWord'

/**
 * Der Doppelbewerbungs-Hinweis auf der Einstiegsseite: Kommt der Name einer
 * bereits eingetragenen Firma im Text der eingefügten Stellenausschreibung
 * vor, wird die betreffende Bewerbung genannt.
 *
 * **Warum nicht `StorageAdapter.findDuplicate`?** Das verlangt Firma *und*
 * Stelle. Beide entstehen erst in der Anzeigen-Analyse (Aufgabe 9, ein
 * Anbieteraufruf) und stehen auf der Einstiegsseite noch nicht fest; sie
 * bekommt nur den rohen Text. Die Oberfläche zwei Felder tippen zu lassen,
 * die die Anwendung gleich darauf selbst ermittelt, wäre Doppelarbeit für
 * den Nutzer. `findDuplicate` bleibt deshalb dem Eintragen nach dem Export
 * vorbehalten (Aufgabe 15), wo Firma und Stelle bekannt sind.
 *
 * Die Prüfung hier ist derselbe deterministische Abgleich wie die
 * Fremdfirmen-Warnung in `domain/letterhead.ts`: Ganzwortsuche über
 * `findWholeWordOccurrences`, ohne Rücksicht auf Groß- und Kleinschreibung.
 * Sie ist bewusst **nur ein Hinweis** — sie kann übersehen (die Anzeige
 * schreibt „Siemens AG", die Liste führt „Siemens Mobility") und sie kann
 * danebenliegen (eine Anzeige, die die frühere Firma des Bewerbers als
 * Wettbewerber nennt). Deshalb blockiert sie nichts.
 */
export function findDuplicateApplications(
  jobAdText: string,
  applications: readonly Application[],
): Application[] {
  const text = jobAdText.trim()
  if (text === '') return []

  return applications.filter(
    (application) => findWholeWordOccurrences(text, application.company, true).length > 0,
  )
}
