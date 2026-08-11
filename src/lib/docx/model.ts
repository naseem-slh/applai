import type { Unzipped } from 'fflate'

/**
 * Ein einzelner `w:r`-Lauf innerhalb eines Absatzes.
 *
 * `start`/`end` sind Zeichen-Offsets innerhalb des Absatztexts
 * (`Paragraph.text`), nicht innerhalb des gesamten Dokumenttexts. `end` ist
 * exklusiv, d. h. `text === paragraphText.slice(start, end)`.
 *
 * `node` ist die referenzierte `<w:r>`-Element-Referenz aus dem geparsten
 * `XMLDocument` — Aufgabe 3 patcht darüber gezielt das Original-XML, ohne
 * das Dokument neu zu erzeugen.
 */
export interface Run {
  node: Element
  text: string
  start: number
  end: number
}

/**
 * Ein einzelner `w:p`-Absatz aus `word/document.xml`.
 *
 * `start`/`end` sind Zeichen-Offsets innerhalb des gesamten Dokumenttexts
 * (`DocxDocument.text`), exklusiv am Ende. Absätze werden in `DocxDocument.text`
 * mit `\n` verbunden; dieses Trennzeichen liegt zwischen den Absätzen und
 * gehört zu keinem der beiden angrenzenden Absatzbereiche — Aufgabe 3 muss
 * das beim Umrechnen von Dokument- auf Absatz-Offsets berücksichtigen.
 */
export interface Paragraph {
  index: number
  node: Element
  text: string
  runs: Run[]
  start: number
  end: number
}

/**
 * Ergebnis des Einlesens einer `.docx`-Datei.
 *
 * `zip` enthält das vollständige, unveränderte Archiv (alle Einträge, nicht
 * nur `word/document.xml`) — Aufgabe 3 muss beim erneuten Packen jeden
 * Original-Eintrag byteidentisch übernehmen, außer den gezielt gepatchten
 * Textknoten.
 */
export interface DocxDocument {
  zip: Unzipped
  doc: XMLDocument
  paragraphs: Paragraph[]
  text: string
}
