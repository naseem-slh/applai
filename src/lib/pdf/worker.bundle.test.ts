// @vitest-environment node
//
// Führt einen echten Produktions-Build (Vites Rollup-Bundler, dieselbe
// Maschinerie wie `npm run build`) über `worker.ts` als Eingabe aus und
// prüft das tatsächlich erzeugte Bundle — nicht nur die von Vitest
// transformierte Quelle (worker.test.ts prüft das bereits, aber Vitest
// nutzt Vite im Entwicklungs-/Testmodus, nicht Rollups Produktions-Pfad;
// beide können unabhängig voneinander brechen). Läuft unter dem
// `node`-Environment statt des projektweiten `jsdom`-Standards (siehe
// vitest.config.ts) — ein Bundler-Lauf ist reiner Node-Code, jsdom bringt
// hier nur unnötigen Overhead.
//
// Aktuell importiert noch keine echte Oberfläche `src/lib/pdf/worker.ts`
// (Aufgabe 13 steht dafür noch aus) — `npm run build`s reales App-Bundle
// erreicht die Datei deshalb nicht, und ein Bundler-Fehler über den
// `?url`-Import des Workers bliebe unbemerkt, bis er live in Produktion als
// CSP-Verstoß auffiele. Dieser Test schließt genau diese Lücke, indem er
// `worker.ts` selbst als eigenständigen Rollup-Eingabepunkt bündelt.
import { fileURLToPath } from 'node:url'
import { build, type Rollup } from 'vite'
import { describe, expect, it } from 'vitest'

const WORKER_ENTRY = fileURLToPath(new URL('./worker.ts', import.meta.url))

// Große Datei (pdf.js' voller Worker, ~2 MB unminifiziert) — ein einzelner
// Bundler-Lauf braucht wenige Sekunden. Höher als das globale Test-Timeout,
// damit ein langsamer Rechner den Test nicht fälschlich als Bundler-Fehler
// meldet.
const BUILD_TIMEOUT_MS = 30_000

async function buildWorkerEntry(): Promise<Rollup.RollupOutput['output']> {
  const result = await build({
    // `configFile: false`: Das Projekt-`vite.config.ts` zielt auf die
    // App (Entry `index.html`, React-Plugin) — dieser Probe-Build braucht
    // nur den reinen Rollup-Bundler auf einer einzelnen Datei, keine der
    // App-spezifischen Einstellungen.
    configFile: false,
    logLevel: 'silent',
    build: {
      // Im Speicher statt auf die Platte schreiben: kein Aufräumen eines
      // Temp-Verzeichnisses nötig, und nichts, das versehentlich commitet
      // werden könnte.
      write: false,
      rollupOptions: { input: WORKER_ENTRY },
    },
  })
  // `build()` kann bei mehreren Konfigurationsobjekten ein Array liefern;
  // mit genau einer Konfiguration (wie hier) ist es immer ein einzelnes
  // `RollupOutput`.
  const output = Array.isArray(result) ? result[0] : result
  if (!output || !('output' in output)) {
    throw new Error('Erwartete einen einzelnen Rollup-Build-Output, aber keiner kam zurück.')
  }
  return output.output
}

describe('worker.ts — echtes Produktions-Bundle', () => {
  it(
    'bündelt pdf.worker.mjs als eigenständiges, selbst gehostetes Asset',
    async () => {
      const output = await buildWorkerEntry()
      const workerAsset = output.find((item) => item.type === 'asset' && /pdf\.worker[^/]*\.mjs$/.test(item.fileName))

      expect(workerAsset).toBeDefined()
      // Ein Asset, kein JS-Chunk: `?url` kopiert die Datei byteidentisch,
      // statt sie als Modul zu bündeln — pdf.js lädt sie zur Laufzeit
      // selbst nach (siehe worker.ts).
      expect(workerAsset?.type).toBe('asset')
    },
    BUILD_TIMEOUT_MS,
  )

  it(
    'referenziert den Worker im Bundle nie über eine absolute http(s)-URL (G2, CSP worker-src \'self\')',
    async () => {
      const output = await buildWorkerEntry()
      const workerAsset = output.find((item) => item.type === 'asset' && /pdf\.worker[^/]*\.mjs$/.test(item.fileName))
      if (!workerAsset) {
        throw new Error('Vorbedingung verletzt: kein pdf.worker-Asset im Bundle (siehe voriger Test).')
      }
      // Nur der Dateiname (ohne "assets/"-Ordner): So steht er auch dann im
      // Quelltext, wenn `assetFileNames` oder `base` künftig einen anderen
      // Ordnerpfad ergäben — der Dateiname selbst trägt den Inhalts-Hash und
      // bleibt der eindeutige, unverwechselbare Bezugspunkt.
      const assetBaseName = workerAsset.fileName.split('/').pop()
      expect(assetBaseName).toBeTruthy()

      const chunks = output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk')
      expect(chunks.length).toBeGreaterThan(0)

      // Alle Fundstellen des Asset-Dateinamens in allen Chunks — nicht nur
      // die erste: ein Bundler-Fehler könnte prinzipiell mehrfach zuschlagen
      // (z. B. Legacy-Polyfill-Chunk zusätzlich zum modernen).
      const occurrences: string[] = []
      for (const chunk of chunks) {
        let index = chunk.code.indexOf(assetBaseName!)
        while (index !== -1) {
          // 40 Zeichen Kontext reichen, um "http://" oder "https://" davor
          // zu erfassen, selbst wenn ein Bundler-Fehler eine vollständige
          // fremde Basis-URL voranstellte.
          occurrences.push(chunk.code.slice(Math.max(0, index - 40), index))
          index = chunk.code.indexOf(assetBaseName!, index + 1)
        }
      }

      // Der Bezug muss tatsächlich im Bundle vorkommen — sonst prüft der
      // Test unten nur eine leere Liste und bestünde immer, egal was
      // worker.ts tut.
      expect(occurrences.length).toBeGreaterThan(0)
      for (const context of occurrences) {
        expect(context).not.toMatch(/https?:\/\//)
      }
    },
    BUILD_TIMEOUT_MS,
  )
})
