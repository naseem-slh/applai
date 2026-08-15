/**
 * Synthetische Anschreiben-Fixtures für `styleProfile.test.ts` (Aufgabe 10).
 * Bewusst frei erfunden — keine echte Person, kein echtes Unternehmen (wie
 * `jobAd.fixtures.ts`). Keine `.test.ts`-Endung, damit Vitest die Datei nicht
 * selbst als (leere) Testdatei einsammelt.
 *
 * Jede Fixture enthält absichtlich mindestens eine der in der Aufgabenstellung
 * genannten Satzgrenzen-Fallen (Abkürzung, Datum, Ellipse, Doppelpunkt vor
 * einer Aufzählung) UND eine eindeutige Anredeform — siehe die Kommentare an
 * den einzelnen Konstanten.
 */

/**
 * "Sie"-Anschreiben mit Abkürzung ("Dr.", "z. B."), einem Datum in
 * Tag-Monatsname-Form ("15. März 2024" – die in der Aufgabenstellung
 * genannte Datumsfalle) UND einer bewusst eingebauten Zweideutigkeits-Falle:
 * "Sie berät heute Unternehmen …" bezieht sich auf "Die Musterwerk
 * Consulting GmbH" (also "sie" im Sinne von "sie/sie sie" = die Firma), steht
 * aber großgeschrieben am Satzanfang – reine Großschreibung wegen
 * Satzanfang, KEINE Höflichkeitsanrede. `detectAddress` muss diese eine
 * Fundstelle ignorieren und trotzdem über die übrigen, eindeutigen Treffer
 * ("Ihre Anzeige", "weil Sie großen Wert", "überzeuge ich Sie", "stehe ich
 * Ihnen") auf `'sie'` kommen.
 */
export const SIE_COVER_LETTER_FIXTURE = `Sehr geehrte Frau Dr. Vogt,

mit großer Freude habe ich Ihre Stellenanzeige für die Position als
Projektkoordinatorin gelesen. Die Musterwerk Consulting GmbH wurde 1998
gegründet. Sie berät heute Unternehmen aus ganz Europa in Fragen der
Digitalisierung.

In den letzten fünf Jahren habe ich bei meinem aktuellen Arbeitgeber
zahlreiche Projekte erfolgreich koordiniert, z. B. die Einführung eines
neuen Berichtswesens für drei Abteilungen gleichzeitig. Am 15. März 2024
habe ich zudem ein Zertifikat im agilen Projektmanagement erworben.

Ihre Anzeige spricht mich besonders an, weil Sie großen Wert auf
strukturiertes Arbeiten legen – genau das zeichnet mich aus. Gerne
überzeuge ich Sie in einem persönlichen Gespräch von meiner Motivation.

Für Rückfragen stehe ich Ihnen jederzeit zur Verfügung.

Mit freundlichen Grüßen
Alex Berger`

/**
 * "du"-Anschreiben, ebenfalls mit Abkürzung ("Dr.", "z. B.") und einem Datum
 * in Tag-Monatsname-Form ("3. Mai 2023"). Enthält bewusst KEIN
 * Höflichkeits-"Sie"/"Ihnen"/"Ihre", damit `detectAddress` eindeutig auf
 * `'du'` kommt.
 */
export const DU_COVER_LETTER_FIXTURE = `Hallo liebes Team von StartUp Solutions,

als ich die Stellenanzeige gesehen habe, wusste ich sofort: Das ist genau
mein Ding! Du suchst jemanden, der Lust hat, Verantwortung zu übernehmen
und eigene Ideen einzubringen – das bin ich.

In meinem letzten Job habe ich z. B. den kompletten Support-Prozess neu
aufgebaut und dabei mit Dr. Klein aus der Geschäftsführung eng
zusammengearbeitet. Am 3. Mai 2023 habe ich außerdem eine Weiterbildung im
agilen Arbeiten abgeschlossen.

Wenn du auf der Suche nach jemandem bist, der anpackt statt lange zu
diskutieren, dann lass uns reden. Ich freue mich, dich und dein Team bald
kennenzulernen!

Viele Grüße
Alex Berger`

/**
 * Anschreiben ganz ohne direkte Anrede der Leserin/des Lesers – durchgehend
 * unpersönlich/passivisch formuliert, wie es in eher konservativen
 * Kurzanschreiben vorkommt. Enthält eine Abkürzung ("u. a.") und ein Datum
 * in Tag-Monatsname-Form ("1. Februar 2022"). `detectAddress` muss hier
 * `'none'` liefern.
 */
export const NEUTRAL_COVER_LETTER_FIXTURE = `Mit großem Interesse wurde die ausgeschriebene Position als
Sachbearbeiterin gelesen. Die bisherige berufliche Laufbahn umfasst mehrere
Jahre in der Kundenbetreuung sowie im Berichtswesen, u. a. in einem
mittelständischen Industrieunternehmen. Am 1. Februar 2022 wurde zudem eine
Weiterbildung im Bereich Prozessmanagement abgeschlossen.

Die Motivation für einen Wechsel liegt in dem Wunsch nach neuen fachlichen
Herausforderungen sowie einem größeren Verantwortungsbereich. Referenzen
können bei Bedarf jederzeit vorgelegt werden.

Freundliche Grüße
Alex Berger`

/**
 * Reiner Härtefall-Satzblock für `computeSentenceLength` – keine vollständige
 * Bewerbung, sondern gezielt auf drei echte Satzenden mit drei Fallen
 * dazwischen zugeschnitten: eine Titel-Abkürzung ("Dr."), eine
 * Tag-Monatsname-Datumsangabe ("15. März 2024") und eine mehrteilige
 * Abkürzung ("z. B."). Von Hand ausgezählt (siehe `styleProfile.test.ts`):
 * genau 3 echte Sätze, 28 Wörter insgesamt (11 + 11 + 6) → 9.3 Wörter/Satz.
 * Ein naiver Split auf jeden "."-Treffer würde stattdessen 8 Fragmente
 * liefern und einen sinnlosen Durchschnitt von 28/8 = 3.5 vortäuschen.
 */
export const ABBREVIATION_SENTENCE_FIXTURE =
  'Frau Dr. Meier hat mich am 15. März 2024 zu einem Gespräch eingeladen. ' +
  'Themen waren z. B. meine Erfahrung im Projektmanagement und meine Sprachkenntnisse. ' +
  'Ich freue mich auf die Zusammenarbeit.'
