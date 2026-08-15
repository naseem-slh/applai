/**
 * Zentrale pdf.js-Anbindung. Einzige Stelle im Projekt, die weiß, welchen
 * pdf.js-Build es gibt und wie der Worker eingerichtet wird — `extract.ts`
 * importiert ausschließlich von hier und kennt diese Details nicht.
 *
 * **Warum der `legacy`-Build und nicht der Standard-Build:**
 * Der Standard-Build (`pdfjs-dist/build/pdf.mjs`) referenziert beim Laden
 * sofort `DOMMatrix`, das jsdom (Vitest-Testumgebung) nicht bereitstellt —
 * ein bloßer Import des Moduls wirft dann schon eine ReferenceError, bevor
 * überhaupt ein Test läuft. Der `legacy`-Build ist genau für Umgebungen ohne
 * vollständige Browser-API gedacht (das gibt pdf.js selbst als Warnung aus,
 * wenn man den Standard-Build unter Node startet) und funktioniert
 * unverändert auch im echten Browser — er bringt lediglich zusätzliche
 * Polyfills mit, die dort schlicht ungenutzt bleiben. Ein einziger Build für
 * Produktion und Tests bedeutet außerdem: `GlobalWorkerOptions` ist
 * garantiert dieselbe Klasse (dasselbe Modul, ein Objekt), egal ob
 * Produktionscode oder Test sie anfasst.
 *
 * **Wie der Worker aufgelöst wird:**
 * `?url` ist ein Vite-Importsuffix: Vite bündelt die referenzierte Datei als
 * eigenständiges Asset und liefert an dieser Stelle nur ihre (relative,
 * selbst gehostete) URL — nie eine fremde CDN-Adresse (G2). Damit landet
 * `pdf.worker.mjs` automatisch im Produktions-Build unter `dist/assets/` und
 * wird von `worker-src 'self' blob:'` gedeckt (siehe `public/_headers`).
 *
 * **Warum die Zuweisung unter Vitest übersprungen wird:**
 * pdf.js selbst erkennt eine Node-Umgebung (an `process`, das jsdom nicht
 * entfernt) und schaltet den echten Worker automatisch ab: Es lädt
 * `pdf.worker.mjs` dann per relativem Import direkt neben sich selbst im
 * Hauptthread nach (ein funktionierender, in pdf.js eingebauter Rückfall).
 * Würden wir `workerSrc` hier dennoch auf die von Vite aufgelöste Browser-
 * URL setzen, bräche genau dieser Rückfall: Ein dynamischer Import dieser
 * URL ist unter Node kein gültiger Modulbezeichner mehr (geprüft — siehe
 * Aufgabe-4-Bericht). Deshalb bleibt die Zuweisung auf den echten Browser
 * beschränkt: `extractPdf` funktioniert dadurch unverändert unter Vitest,
 * ohne dass Testcode diesen Unterschied kennen müsste.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

// `process` ist im Produktionscode (tsconfig.app.json) bewusst nicht typisiert
// (G1-Absicherung, siehe tsconfig.app.json) — der Zugriff läuft deshalb über
// `globalThis` mit einem lokalen, minimalen Indextyp statt über `@types/node`.
const isRealBrowser = typeof (globalThis as { process?: unknown }).process === 'undefined'

if (isRealBrowser) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
}

export { pdfjsLib, workerSrc }
