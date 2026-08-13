# Applai — Projekt-Richtlinien

## Projekt-Überblick

Applai passt ein bestehendes Anschreiben (`.docx`) anhand einer
Stellenausschreibung an — der Nutzer markiert eine Textstelle, die KI liefert
drei Formulierungsvarianten im Stil des Originals, ohne Fakten zu erfinden.
Reine Browser-App, **kein Server, kein Backend**. Word-Dateien werden im
Browser entpackt, ihr XML gezielt gepatcht und wieder gepackt, damit das
Layout des Originals unangetastet bleibt. KI-Aufrufe gehen direkt vom
Browser des Nutzers zu seinem eigenen Anbieter (Gemini, OpenAI oder
Anthropic).

Vollständige Spezifikation: [`docs/spec.md`](docs/spec.md).
Implementierungsplan: [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Globale Regeln (gelten für jede Aufgabe)

| # | Regel |
|---|---|
| G1 | Kein Server, kein Backend. Ausschließlich statische Dateien. |
| G2 | Keine Laufzeit-Ressourcen von fremden Hosts. Keine CDN-Skripte, keine Google-Fonts, keine Analytics. Schriftarten liegen im Projekt (`public/fonts/`). |
| G3 | CSP `connect-src` ist auf drei Ziele begrenzt: `https://generativelanguage.googleapis.com`, `https://api.openai.com`, `https://api.anthropic.com`. |
| G4 | Kein API-Schlüssel im Code oder Repository. Ausschließlich Nutzereingabe zur Laufzeit. Das Repository ist öffentlich. |
| G5 | Keine Dokumentinhalte in `localStorage` im Klartext. Entwürfe liegen in IndexedDB. |
| G6 | Node ≥ 22.22.2 (Untergrenze von `jsdom`, siehe `.nvmrc`), npm als Paketmanager, `package-lock.json` eingecheckt. |
| G7 | Lint mit `--max-warnings=0` als Pre-Commit-Hook und in CI. TypeScript strict. |
| G8 | Alle Oberflächentexte über i18next, niemals hartkodiert. Sprachen `de` und `en`, Vorauswahl nach Browsersprache. |
| G9 | Minimale Abhängigkeiten. Jede neue Bibliothek braucht eine Begründung im Commit. `npm audit` läuft gatend in CI. |
| G10 | Die KI darf nie Fakten erfinden, außer im ausdrücklich gewählten freien Modus — dort mit Markierung, Einzelbestätigung und Exportsperre. |

## Tech-Stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS 4 (`@tailwindcss/postcss`)
· Radix UI + CVA · React Router 7 · Zod · i18next/react-i18next · Vitest +
Testing Library + jsdom · Playwright + `@axe-core/playwright` · ESLint 9
(Flat-Config) · Husky + lint-staged · GitHub Actions · Cloudflare Pages.

Als Referenz für Werkzeugkette, Testaufbau und CI diente
`/home/samira/projects/adg` (Firmenprojekt) — übernommen wurden nur
übertragbare Muster, kein Code. Alles Serverseitige dort ist für Applai
gegenstandslos.

## Architektur-Grenzen

- `src/lib/docx`, `src/lib/pdf`, `src/lib/export`, `src/lib/ai`,
  `src/lib/storage`, `src/lib/privacy` kennen React nicht und sind ohne
  Oberfläche testbar.
- `src/lib/pdf` liest PDF **ein** (Beta-Umwandlung nach Word),
  `src/lib/export/pdf` schreibt PDF **aus**. Die beiden Richtungen teilen
  keinen Code außer `pdfjs-dist` in den Tests des Schreibers, wo es als
  fremder Leser den Nachweis führt.
- `src/lib/domain` kennt nur `src/lib/ai` und die Modelltypen.
- Die Oberfläche (`src/routes`, `src/components`) kennt `src/lib/domain`,
  aber nie einen KI-Anbieter direkt.
- Kein anderer Programmteil greift direkt auf IndexedDB zu außer
  `src/lib/storage` (Schnittstelle `StorageAdapter`, ab Aufgabe 6).

## Konventionen

- **Sprache:** Code-Kommentare, Commit-Nachrichten, UI-Texte und
  Dokumentation sind deutsch. Bezeichner (Variablen, Funktionen, Typen)
  bleiben englisch.
- **i18n:** Jeder sichtbare Text läuft über `useTranslation()` /
  `src/lib/i18n/locales/{de,en}.json`. Keine hartkodierten Strings in der
  Oberfläche (G8).
- **Tests liegen neben dem Code**, den sie prüfen (z. B.
  `src/lib/i18n/i18n.test.ts`), nicht in einem separaten `tests/`-Verzeichnis.
  `tests/fixtures/` ist ausschließlich für binäre Testdateien (`.docx`,
  `.pdf`) reserviert. Von mehreren Testdateien gemeinsam genutzte Attrappen
  tragen die Endung `*.testutils.ts(x)` und liegen ebenfalls neben dem Code;
  sie gehören wie die Tests zu `tsconfig.test.json`, nicht zum
  Produktionsprojekt.
- **CSP:** `public/_headers` ist die maßgebliche Policy (Cloudflare Pages).
  Der `<meta http-equiv>`-Tag in `index.html` wird nur beim produktiven Build
  eingefügt (siehe `vite.config.ts`), da der Dev-Server Inline-Skripte
  braucht. Sicherheitsprüfungen laufen deshalb immer gegen
  `npm run build && npm run preview`, nie gegen `npm run dev`.
- **Abhängigkeiten:** Vor jeder neuen Bibliothek prüfen, ob sie wirklich
  nötig ist (G9). Begründung gehört in die Commit-Nachricht.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung + Produktions-Build (`dist/`) |
| `npm run preview` | Gebauten Stand lokal servieren |
| `npm run lint` | ESLint, `--max-warnings=0` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest (einmaliger Lauf) |
| `npm run e2e` | Playwright-Ende-zu-Ende-Tests |

**Nach jeder Aufgabe:** `npm run lint && npm run typecheck && npm test`.
