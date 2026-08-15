# Applai — Implementierungsplan Bauabschnitt 1

> **Für agentische Umsetzung:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Ziel:** Eine reine Browser-Anwendung, die ein bestehendes Anschreiben anhand einer Stellenausschreibung anpasst — markiert der Nutzer eine Textstelle, liefert die KI drei Formulierungsvarianten im Stil des Originals, ohne Fakten zu erfinden.

**Architektur:** Statische Single-Page-App ohne jeden Server. Word-Dateien werden im Browser entpackt, ihr XML gezielt gepatcht und wieder gepackt — dadurch bleibt das Layout des Originals unangetastet. KI-Aufrufe gehen direkt vom Browser des Nutzers zu seinem eigenen Anbieter. Eine Content-Security-Policy erzwingt browserseitig, dass Daten zu keinem anderen Ziel abfließen können.

**Tech-Stack:** Vite 6 · React 19 · TypeScript 5.7 · Tailwind CSS 4 · Radix UI + CVA · React Router 7 · Zod 4 · i18next · Vitest + Testing Library · Playwright + axe-core · ESLint 9 (flat) · Husky + lint-staged · GitHub Actions · Cloudflare Pages

**Fachbibliotheken:** `fflate` (Word entpacken und packen) · `pdfjs-dist` (PDF-Text) · `idb` (IndexedDB) · WebCrypto (Bordmittel, keine Bibliothek)

### Stack-Entscheidung

Übernommen aus `adg/frontend`, weil dort erprobt und aktuell: Vite + React 19 + TypeScript, Tailwind 4 mit Radix und CVA samt `cn()`, i18next mit `locales/de.json|en.json`, Vitest + Testing Library, Playwright mit `@axe-core/playwright`, ESLint 9 Flat-Config mit `--max-warnings=0`, Husky mit lint-staged, `DESIGN.md` als Token-Datei, CI-Kette Lint → Typecheck → Test → Build.

Bewusst **nicht** übernommen:

| Weggelassen | Grund |
|---|---|
| TanStack Query | Verwaltet Serverdaten. Applai hat keinen Server — es gibt nichts zu verwalten |
| Framer Motion | Vergrößert das Programm spürbar, ohne zur Funktion beizutragen. Nachrüstbar, wenn der Kern steht |
| Next.js | Server-Rendering, Bildoptimierung und Routing-Konventionen laufen bei einer reinen Browser-App ins Leere und erschweren die strenge Sicherheitsrichtlinie |
| Fastify, MongoDB, MySQL, Docker, Caddy, Permission-Matrix, JWT, OpenAPI-Codegen | Sämtlich serverseitig, für Applai gegenstandslos |

**Zod** ist neu gegenüber adgs Verwendungszweck: Dort prüft es Formulareingaben, hier prüft es die JSON-Antworten der Sprachmodelle, bevor sie ins Programm gelangen. Ein Modell liefert gelegentlich unvollständiges oder abgeschnittenes JSON — ohne Prüfung an der Grenze schlägt der Fehler erst tief im Programm auf, wo er schwer zu deuten ist.

---

## Context

Bewerbungen einzeln an jede Stellenausschreibung anzupassen ist die wirksamste, aber lästigste Arbeit im Bewerbungsprozess. Bestehende KI-Generatoren lösen das falsch: Sie schreiben das ganze Dokument neu, in einem erkennbaren Einheitston, und erfinden dabei Qualifikationen. Beides schadet mehr, als es nützt.

Applai dreht den Ansatz um. Es schreibt nichts neu, sondern passt **nur die Stellen an, die der Nutzer selbst markiert** — im Stil, den es aus seinem vorhandenen Anschreiben gelernt hat, und ausschließlich auf Basis belegter Fakten. Was die Stelle verlangt und die Unterlagen nicht hergeben, landet in einer Lückenliste statt im Text.

Die Anwendung entsteht aus 28 durchgesprochenen Entscheidungen (siehe Spezifikation unten). Zwei davon prägen die gesamte Architektur: **kein Server** (Datenschutz, null laufende Kosten) und **eigener API-Schlüssel pro Nutzer** (keine Kostenübernahme durch den Betreiber).

Als Referenz für Werkzeugkette, Testaufbau, i18n-Struktur, Design-Token-Datei und CI dient das Projekt unter `/home/samira/projects/adg` — ein Firmenprojekt, aus dem nur übertragbare Muster übernommen werden, kein Code. Alles Serverseitige dort (Fastify, MongoDB/MySQL, Docker, Caddy, Permission-Matrix, JWT) ist für Applai gegenstandslos.

---

## Global Constraints

Diese Regeln gelten für **jede** Aufgabe im Plan.

| # | Regel |
|---|---|
| G1 | **Kein Server, kein Backend.** Ausschließlich statische Dateien. Jede Idee, die einen Serverdienst braucht, ist damit ausgeschlossen. |
| G2 | **Keine Laufzeit-Ressourcen von fremden Hosts.** Keine CDN-Skripte, keine Google-Fonts, keine Analytics. Schriftarten liegen im Projekt. |
| G3 | **CSP `connect-src` ist auf drei Ziele begrenzt:** `https://generativelanguage.googleapis.com`, `https://api.openai.com`, `https://api.anthropic.com`. Kein freies Anbieter-Eingabefeld. |
| G4 | **Kein API-Schlüssel im Code oder Repository.** Ausschließlich Nutzereingabe zur Laufzeit. Das Repository ist öffentlich. |
| G5 | **Keine Dokumentinhalte in `localStorage` im Klartext.** Entwürfe liegen in IndexedDB und werden nach Export bzw. nach 7 Tagen gelöscht. |
| G6 | **Node ≥ 20**, npm als Paketmanager, `package-lock.json` eingecheckt. |
| G7 | **Lint mit `--max-warnings=0`** als Pre-Commit-Hook und in CI. TypeScript strict. |
| G8 | **Alle Oberflächentexte über i18next**, niemals hartkodiert. Sprachen `de` und `en`, Vorauswahl nach Browsersprache. |
| G9 | **Minimale Abhängigkeiten.** Jede neue Bibliothek braucht eine Begründung im Commit. `npm audit` läuft in CI. |
| G10 | **Die KI darf nie Fakten erfinden**, außer im ausdrücklich gewählten freien Modus — dort mit Markierung, Einzelbestätigung und Exportsperre. |

---

## Spezifikation — die 28 Entscheidungen

Diese Tabelle ist die verbindliche Fassung. Sie wird als `docs/spec.md` ins Repository übernommen (Aufgabe 1).

### Produkt und Auslieferung

| Thema | Entscheidung |
|---|---|
| Nutzerkreis | Der Betreiber und Bekannte. Kein Produkt, keine Konten, kein Login. |
| Form | Statische Web-App, im Browser lauffähig, überall erreichbar |
| Hosting | Cloudflare Pages, kostenloser Tarif. Adresse zunächst `applai.pages.dev` |
| Quellcode | Öffentlich auf GitHub — Nachprüfbarkeit ist das stärkste Datenschutzargument |
| Mobil | Nutzbar, aber ohne Feinmarkierung; dort „Anzeige einfügen, Ergebnis lesen" |
| Oberflächensprache | Deutsch und Englisch umschaltbar, Vorauswahl nach Browsersprache |
| Optik | Ruhig, dokumentzentriert, modern und einladend statt klinisch. Hell als Grundeinstellung, dunkel wählbar |
| Name | **Applai**, gesprochen wie *apply* |

### KI und Sicherheit

| Thema | Entscheidung |
|---|---|
| Anbieter | Gemini (Standard, kostenloser Tarif), OpenAI, Anthropic — fest verdrahtete Auswahl hinter einem gemeinsamen Adapter |
| Schlüssel | Jeder Nutzer trägt seinen eigenen ein, geführt durch eine Anleitung. Bleibt in seinem Browser |
| Schlüsselablage | Verschlüsselt in IndexedDB mit einem nicht auslesbaren WebCrypto-Schlüssel. **Passwortschutz ist Pflicht, sobald ein kostenpflichtiger Schlüssel erkannt wird**, sonst optional. Automatische Sperre nach Untätigkeit |
| Ausleitungssperre | CSP `connect-src` auf die drei Anbieter begrenzt — verhindert Abfluss selbst bei kompromittierter Abhängigkeit |
| Anonymisierung | Name, Anschrift, Geburtsdatum, Telefon, E-Mail werden vor dem Senden durch Platzhalter ersetzt und danach zurückgetauscht. **Standardmäßig an**, abschaltbar |
| Hinweis für Zahlende | Einmaliger Hinweis bei kostenpflichtigem Schlüssel: Ausgabenlimit setzen, eigenen Schlüssel verwenden, Herkunftsbeschränkung aktivieren |
| Erststart-Hinweis | Klartext darüber, dass Inhalte an den gewählten Anbieter gehen und der kostenlose Gemini-Tarif zum Training verwendet wird |

### Eingaben

| Thema | Entscheidung |
|---|---|
| Unterlagen | `.docx` (Hauptweg, Layout bleibt erhalten) oder `.pdf` (Lesen + Beta-Umwandlung) |
| Mindestanforderung | Anschreiben **oder** Lebenslauf muss vorhanden sein |
| Stellenausschreibung | Eingefügter Text oder PDF. **Kein Link-Abruf** — bräuchte einen Vermittler und damit einen Server |
| Anforderungsanalyse | Sichtbarer Zwischenschritt: die aus der Anzeige gezogenen Anforderungen sind einsehbar |
| Unterlagenverwaltung | Kein Profilkonzept. Zuletzt benutzte Dateien werden vorgeschlagen |

### Bearbeitung

| Thema | Entscheidung |
|---|---|
| Reihenfolge | Anschreiben zuerst, Lebenslauf im zweiten Bauabschnitt |
| Auswahl | Freie Textmarkierung per Maus, beliebiger Bereich, auch satzübergreifend. Zusätzlich „ganzes Dokument" |
| Ergebnis | **Drei Varianten** zur Auswahl, übernehmen oder verwerfen |
| Stil | Stilprofil aus dem vorhandenen Anschreiben abgeleitet, einsehbar und korrigierbar. Zusätzlich zwei bis drei Schieberegler (förmlich↔locker, kurz↔ausführlich) |
| Eigene Änderungen | Tippen überall möglich (Text ja, Formatierung nein) |
| Wahrheitsgrenze | **Streng** als Grundregel. **Brücken** zuschaltbar (nur inhaltlich gedeckte Verallgemeinerungen). **Frei** zuschaltbar — mit farbiger Markierung, Einzelbestätigung und Exportsperre |
| Lückenliste | Was die Anzeige verlangt, was gedeckt ist, was fehlt. **Kein Prozentwert** — er wäre erfunden |
| Briefkopf | Empfänger, Datum, Betreff und Anrede werden vorgeschlagen und sind vor Übernahme prüfbar |
| Fremdfirmen-Warnung | Deterministischer Abgleich: taucht im Text ein Firmenname auf, der nicht zur aktuellen Anzeige gehört, wird er markiert |
| Sprache | Zielsprache = Sprache der Anzeige. **Nachfrage nur bei Abweichung.** Übersetzen und Anpassen sind getrennte Schritte. Hinweis auf abweichende Gepflogenheiten (Foto, Geburtsdatum, Anschrift) beim Wechsel ins Englische |

### Ausgabe und Ablage

| Thema | Entscheidung |
|---|---|
| Word-Export | Das Original mit gepatchten Textstellen — Schrift, Ränder, Kopfzeile unverändert |
| PDF-Export | Im Browser aus dem Original neu gesetzt: Schrift, Grade, Ränder, Ausrichtung, Kopf- und Fußzeile samt Bildern. Metrikgleiche Schriften halten den Zeilenumbruch |
| Kopierfeld | Reintext für Online-Formulare |
| PDF→Word | **Beta**, einspaltig, sichtbar gekennzeichnet mit Prüfhinweis. Originaltreue folgt im zweiten Abschnitt |
| Bewerbungsliste | Firma, Stelle, Datum. Nur im Browser. Hinweis bei doppelter Bewerbung |
| Sicherung | Export und Import der Liste als Datei |
| Entwürfe | Automatischer Zwischenstand, sichtbar angezeigt, gelöscht nach Export oder nach 7 Tagen |
| Löschen | Knopf „Alle Daten löschen" |
| Erweiterbarkeit | Speicherung hinter einer Schnittstelle, damit später ein Server dazukommen kann |

### Nicht im ersten Bauabschnitt

Lebenslauf-Bearbeitung · originalgetreue PDF-Umwandlung · Anschreiben ganz ohne Vorlage erstellen · lokale Modelle (Ollama) · serverseitige Liste · Bewerbungsverwaltung mit Status und Fristen · Link-Abruf von Stellenanzeigen

---

## Dateistruktur

```
applai/
├── docs/
│   ├── spec.md                        # Spezifikation (Tabellen oben)
│   └── superpowers/plans/             # dieser Plan
├── public/
│   ├── _headers                       # CSP + Sicherheits-Header (Cloudflare Pages)
│   └── fonts/                         # selbst gehostete Schriften
├── tests/fixtures/                    # Beispiel-.docx und -.pdf für Tests
├── e2e/                               # Playwright
├── .github/workflows/ci.yml           # Lint → Typecheck → Test → Audit → Build
├── DESIGN.md                          # Design-Token (Muster aus adg)
├── CLAUDE.md                          # Projektregeln
└── src/
    ├── main.tsx, App.tsx
    ├── routes/
    │   ├── Start.tsx                  # Dateien + Anzeige einwerfen
    │   ├── Editor.tsx                 # Arbeitsfläche
    │   └── Settings.tsx               # Schlüssel, Sprache, Daten löschen
    ├── components/
    │   ├── ui/                        # Button, Card, Dialog, Popover, Select, Switch (Radix + CVA)
    │   ├── editor/
    │   │   ├── DocumentView.tsx       # Dokumentdarstellung + Inline-Bearbeitung
    │   │   ├── SelectionLayer.tsx     # Mausmarkierung → Zeichenbereich im Modell
    │   │   ├── VariantPopover.tsx     # drei Varianten, übernehmen/verwerfen
    │   │   ├── LetterheadPanel.tsx    # Empfänger, Datum, Betreff, Anrede
    │   │   ├── GapList.tsx            # Lückenliste
    │   │   ├── TruthModeSwitch.tsx    # streng / Brücken / frei
    │   │   └── StyleProfilePanel.tsx  # Stilprofil einsehen und korrigieren
    │   └── onboarding/
    │       ├── KeySetup.tsx           # Schlüsseleingabe + Anleitung je Anbieter
    │       ├── PrivacyNotice.tsx      # Erststart-Hinweis
    │       └── PaidKeyHints.tsx       # Ausgabenlimit, eigener Schlüssel, Herkunftsbeschränkung
    ├── lib/
    │   ├── docx/
    │   │   ├── model.ts               # Typen: DocxDocument, Paragraph, Run
    │   │   ├── parse.ts               # entpacken + XML → Modell
    │   │   ├── replace.ts             # Zeichenbereich ersetzen, Runs splitten
    │   │   └── serialize.ts           # Modell → .docx-Blob
    │   ├── pdf/
    │   │   ├── extract.ts             # pdfjs → Textelemente mit Position
    │   │   └── toDocx.ts              # Beta-Umwandlung, einspaltig
    │   ├── ai/
    │   │   ├── provider.ts            # LlmProvider-Schnittstelle + Registry
    │   │   ├── gemini.ts, openai.ts, anthropic.ts
    │   │   ├── errors.ts              # Kontingent, ungültiger Schlüssel, Netzfehler
    │   │   └── prompts/               # jobAd.ts, styleProfile.ts, rewrite.ts, gaps.ts
    │   ├── privacy/anonymize.ts       # PII ersetzen + zurücktauschen
    │   ├── domain/
    │   │   ├── jobAd.ts               # Anforderungen, Firma, Stelle, Anrede, Sprache
    │   │   ├── styleProfile.ts
    │   │   ├── rewrite.ts             # Varianten erzeugen, Wahrheitsmodi
    │   │   ├── gaps.ts
    │   │   └── letterhead.ts          # Vorschläge + Fremdfirmen-Abgleich
    │   ├── storage/
    │   │   ├── adapter.ts             # StorageAdapter-Schnittstelle
    │   │   ├── indexeddb.ts           # lokale Umsetzung
    │   │   ├── keyVault.ts            # Schlüsselablage + Sperre
    │   │   └── crypto.ts              # WebCrypto: AES-GCM, PBKDF2
    │   ├── i18n/ (i18n.ts, locales/de.json, locales/en.json)
    │   └── utils.ts                   # cn() = clsx + tailwind-merge
    └── styles/design.css              # Design-Token als CSS-Variablen
```

**Grenzen:** `lib/docx`, `lib/pdf`, `lib/ai`, `lib/storage` und `lib/privacy` kennen React nicht und sind ohne Oberfläche testbar. `lib/domain` kennt nur `lib/ai` und die Modelltypen. Die Oberfläche kennt `lib/domain`, aber nie einen Anbieter direkt.

---

## Tasks

### Task 1 — Projektgerüst, Werkzeugkette, CSP

**Dateien:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `.husky/pre-commit`, `lint-staged.config.js`, `.github/workflows/ci.yml`, `public/_headers`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/design.css`, `src/lib/utils.ts`, `src/lib/i18n/*`, `DESIGN.md`, `CLAUDE.md`, `docs/spec.md`, `.gitignore`

**Erzeugt:** `cn()`, i18next-Instanz mit `de`/`en`, Design-Token als CSS-Variablen

- [ ] Repository `applai` im Workspace anlegen, `git init`, Vite-Vorlage `react-ts` aufsetzen
- [ ] Tailwind 4 (`@tailwindcss/postcss`), Radix-Primitive, CVA, `clsx`, `tailwind-merge`, `i18next`, `react-i18next`, `react-router-dom`, `zod` installieren
- [ ] Router mit drei Routen anlegen: `/` (Start), `/editor`, `/settings`
- [ ] `src/lib/utils.ts` mit `cn()` anlegen (Muster: `adg/frontend/src/lib/utils.ts`)
- [ ] `DESIGN.md` mit Farb-, Typografie- und Abstands-Token schreiben. Vorgabe: helle Grundfläche in warmem Grauton (nicht `#FFFFFF`), eine ruhige Akzentfarbe, großzügige Zeilenhöhe für Fließtext, Radien 4–12 px. Token als CSS-Variablen in `design.css` spiegeln, dunkle Variante über `prefers-color-scheme` und `[data-theme]`
- [ ] i18next einrichten, `de.json`/`en.json` mit den ersten Schlüsseln, Vorauswahl aus `navigator.language`
- [ ] ESLint 9 Flat-Config, `--max-warnings=0`; Husky + lint-staged (Muster: `adg/lint-staged.config.js`)
- [ ] Vitest + Testing Library + jsdom; Playwright + `@axe-core/playwright`
- [ ] `public/_headers` schreiben:
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Permissions-Policy: geolocation=(), camera=(), microphone=()
  ```
  Dieselbe Policy zusätzlich als `<meta http-equiv>` in `index.html`, damit sie auch bei lokaler Vorschau greift. HSTS übernommen aus `adg/deploy/caddy/Caddyfile.prod`
- [ ] `.gitignore` mit allen `.env`-Varianten **inklusive `.env.example`** (Muster: `adg/.gitignore`) — bei einem öffentlichen Repository, in dem Nutzer Schlüssel eintragen, nicht verhandelbar
- [ ] CI-Workflow mit eigenem Sicherheits-Job (Muster: `adg/.github/workflows/deploy.yml`): `npm ci` → `lint` → `tsc --noEmit` → `vitest run` → `npm audit --audit-level=high` → `vite build`. **Anders als in adg ohne `|| true`** — bei einer Handvoll Abhängigkeiten ist ein Fund ein echtes Signal und muss blockieren
- [ ] `.github/dependabot.yml` anlegen (npm, wöchentlich) — automatische Aktualisierung ist bei einer App, deren Sicherheitsversprechen an der Vertrauenswürdigkeit der Bibliotheken hängt, der wirksamste Dauerschutz
- [ ] Nach dem ersten Push: GitHubs **Push-Schutz für Geheimnisse** im Repository aktivieren (für öffentliche Repositories kostenlos). Blockiert einen versehentlich eingecheckten Schlüssel, bevor er online ist
- [ ] `docs/spec.md` aus den Tabellen dieses Plans anlegen
- [ ] **Prüfen:** `npm run dev` zeigt eine Seite; `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` laufen grün; im Netzwerk-Tab der Entwicklerwerkzeuge ist der CSP-Header sichtbar
- [ ] Commit: `chore: Projektgerüst mit Werkzeugkette und CSP`

---

### Task 2 — Word-Dokument lesen

**Dateien:** `src/lib/docx/model.ts`, `src/lib/docx/parse.ts`, `tests/fixtures/anschreiben.docx`, `src/lib/docx/parse.test.ts`

**Erzeugt:**
```ts
export interface Run { node: Element; text: string; start: number; end: number }   // start/end = Offsets im Absatztext
export interface Paragraph { index: number; node: Element; text: string; runs: Run[]; start: number; end: number }  // start/end = Offsets im Dokumenttext
export interface DocxDocument { zip: Unzipped; doc: XMLDocument; paragraphs: Paragraph[]; text: string }
export function parseDocx(buffer: ArrayBuffer): Promise<DocxDocument>
```

- [ ] `fflate` installieren (klein, browsertauglich). Entpacken von `word/document.xml`, Parsen mit dem eingebauten `DOMParser`
- [ ] Test zuerst: Fixture einlesen, erwarten dass `paragraphs.length` stimmt, `text` den erwarteten Fließtext enthält, und dass für jeden Absatz `text === runs.map(r => r.text).join('')`
- [ ] Test ausführen, Fehlschlag bestätigen
- [ ] `parseDocx` umsetzen: `w:p` → Absatz, `w:r/w:t` → Run. `w:tab` als `\t`, `w:br` als `\n`. `xml:space="preserve"` beachten
- [ ] Test grün. **Wichtig:** Auch ein Fixture mit fett gesetztem Teilsatz und eines mit Kopf-/Fußzeile prüfen
- [ ] Commit: `feat(docx): Word-Dokumente einlesen und Absatzmodell aufbauen`

---

### Task 3 — Word-Dokument gezielt ändern und speichern

**Dateien:** `src/lib/docx/replace.ts`, `src/lib/docx/serialize.ts`, jeweils `.test.ts`

**Konsumiert:** `DocxDocument`, `Paragraph`, `Run` aus Aufgabe 2
**Erzeugt:**
```ts
export interface Range { from: number; to: number }                    // Offsets im Dokumenttext
export function replaceRange(docx: DocxDocument, range: Range, newText: string): DocxDocument
export function serializeDocx(docx: DocxDocument): Promise<Blob>
```

Dies ist die technisch heikelste Stelle des Projekts. Eine Markierung, die mitten in einem Run beginnt und mehrere Absätze später endet, muss auf die Run-Struktur abgebildet werden, ohne Formatierung zu zerstören.

**Vorgehen:** Run am Anfangs-Offset aufteilen (`w:r` klonen, `w:rPr` mitkopieren, Text aufteilen), Run am End-Offset ebenso. Alle vollständig überdeckten Runs entfernen. Neuen Text in den ersten betroffenen Run schreiben; dieser erbt dessen Formatierung. Bei absatzübergreifender Markierung bleiben die Absatzgrenzen bestehen, der neue Text wird auf sie verteilt (bei weniger Absätzen im Ersatztext werden leergewordene Absätze entfernt).

- [ ] Test zuerst, fünf Fälle: (1) Ersetzung innerhalb eines Runs, (2) Ersetzung mit Beginn mitten in einem fett gesetzten Run — Fettung muss auf dem verbleibenden Teil erhalten bleiben, (3) Ersetzung über zwei Absätze, (4) Ersetzung des gesamten Dokumenttexts, (5) Ersetzung mit leerem Ergebnis
- [ ] Jeweils prüfen: `parseDocx(await serializeDocx(result).arrayBuffer())` liefert den erwarteten Text, und die `w:rPr`-Elemente der unbeteiligten Runs sind unverändert
- [ ] Tests ausführen, Fehlschlag bestätigen
- [ ] `replaceRange` und `serializeDocx` umsetzen (Rückpacken mit `fflate`, alle übrigen Zip-Einträge unverändert übernehmen)
- [ ] Tests grün. Zusätzlich manuell: erzeugte Datei in Word oder LibreOffice öffnen, Layout vergleichen
- [ ] Commit: `feat(docx): Textbereiche ersetzen ohne Formatierungsverlust`

---

### Task 4 — PDF lesen und Beta-Umwandlung nach Word

**Dateien:** `src/lib/pdf/extract.ts`, `src/lib/pdf/toDocx.ts`, `tests/fixtures/lebenslauf.pdf`, jeweils `.test.ts`

**Erzeugt:**
```ts
export interface PdfItem { text: string; x: number; y: number; fontSize: number; fontName: string; bold: boolean }
export interface PdfPage { items: PdfItem[]; width: number; height: number }
export function extractPdf(buffer: ArrayBuffer): Promise<PdfPage[]>
export function pdfToDocx(pages: PdfPage[]): Promise<Blob>     // Beta, einspaltig
export function detectMultiColumn(page: PdfPage): boolean       // steuert den Warnhinweis
```

- [ ] `pdfjs-dist` installieren. **Worker lokal bündeln** (`worker-src 'self' blob:` ist gesetzt; kein CDN, siehe G2)
- [ ] Test zuerst: Fixture einlesen, erwarten dass bekannter Text in der richtigen Reihenfolge erscheint
- [ ] `extractPdf` umsetzen: Elemente nach `y` gruppieren (Toleranz ~2 pt) zu Zeilen, Zeilen nach `x` sortieren, Absätze über Zeilenabstand erkennen
- [ ] `detectMultiColumn`: Häufung von Elementanfängen in zwei getrennten x-Bändern → `true`. Test mit einem einspaltigen und einem zweispaltigen Fixture
- [ ] `pdfToDocx`: Überschrift wenn Schriftgröße deutlich über dem Median oder fett; Stichpunkt bei führendem `•`, `-`, `–`; sonst Fließtext. Erzeugung über `docx` (Bibliothek) oder ein minimales OOXML-Gerüst — Entscheidung im Commit begründen
- [ ] Tests grün
- [ ] Commit: `feat(pdf): Textextraktion und einspaltige Word-Umwandlung (Beta)`

---

### Task 5 — Schlüsselablage und Verschlüsselung

**Dateien:** `src/lib/storage/crypto.ts`, `src/lib/storage/keyVault.ts`, jeweils `.test.ts`

**Erzeugt:**
```ts
export type ProviderId = 'gemini' | 'openai' | 'anthropic'
export function isPaidKey(provider: ProviderId, key: string): boolean   // OpenAI + Anthropic immer true; Gemini nur bei Projekt-/Abrechnungs-Kennung
export interface KeyVault {
  save(provider: ProviderId, apiKey: string, passphrase?: string): Promise<void>
  isLocked(): Promise<boolean>
  unlock(passphrase: string): Promise<void>
  lock(): void
  getKey(): string | null          // nur aus dem Arbeitsspeicher, nie synchron aus dem Speicher
  clear(): Promise<void>
}
export function createKeyVault(idleTimeoutMs?: number): KeyVault    // Standard: 30 Minuten
```

**Zwei Stufen, wie besprochen:**
1. **Ohne Passwort (Standard):** Der Schlüssel wird mit einem AES-GCM-Schlüssel verschlüsselt, den WebCrypto mit `extractable: false` erzeugt. Dieser CryptoKey liegt als Objekt in IndexedDB — JavaScript kann damit entschlüsseln, aber die Rohbytes nie auslesen. In den Entwicklerwerkzeugen steht damit kein lesbarer Schlüssel.
2. **Mit Passwort (Pflicht bei kostenpflichtigem Schlüssel):** PBKDF2 (mindestens 210 000 Runden, SHA-256, zufälliges Salz) → AES-GCM. Entschlüsselter Schlüssel lebt nur im Arbeitsspeicher und wird nach Untätigkeit gelöscht.

- [ ] Test zuerst: (1) speichern und lesen ohne Passwort, (2) mit Passwort — falsches Passwort wirft, (3) `isPaidKey` erkennt `sk-…` und `sk-ant-…` als kostenpflichtig, (4) `save` **wirft**, wenn ein kostenpflichtiger Schlüssel ohne Passwort gespeichert werden soll, (5) nach `lock()` liefert `getKey()` `null`, (6) in IndexedDB steht an keiner Stelle die Schlüssel-Zeichenfolge im Klartext
- [ ] Tests ausführen, Fehlschlag bestätigen
- [ ] Umsetzen. Untätigkeitszähler über `visibilitychange` und Zeitgeber
- [ ] Tests grün
- [ ] Commit: `feat(security): verschlüsselte Schlüsselablage mit Passwortpflicht für bezahlte Schlüssel`

---

### Task 6 — Speicherschnittstelle

**Dateien:** `src/lib/storage/adapter.ts`, `src/lib/storage/indexeddb.ts`, `.test.ts`

**Erzeugt:**
```ts
export interface Application { id: string; company: string; position: string; date: string }
export interface Draft { id: string; docxBase: ArrayBuffer; text: string; savedAt: number }
export type TruthMode = 'strict' | 'bridge' | 'free'    // hier definiert, in Aufgabe 11 wiederverwendet
export interface Settings { provider: ProviderId; uiLanguage: 'de' | 'en'; anonymize: boolean; truthMode: TruthMode; theme: 'light' | 'dark' | 'system' }
export interface StorageAdapter {
  listApplications(): Promise<Application[]>
  addApplication(a: Omit<Application, 'id'>): Promise<Application>
  findDuplicate(company: string, position: string): Promise<Application | null>
  saveDraft(d: Draft): Promise<void>
  loadDraft(id: string): Promise<Draft | null>
  purgeExpiredDrafts(maxAgeMs: number): Promise<number>
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  exportAll(): Promise<Blob>
  importAll(file: File): Promise<void>
  clearAll(): Promise<void>
}
export function createIndexedDbAdapter(): StorageAdapter
```

Die Schnittstelle ist der Punkt, an dem später eine serverseitige Umsetzung eingehängt wird (Entscheidung Frage 14). Kein anderer Programmteil greift direkt auf IndexedDB zu.

- [ ] Test zuerst: alle Methoden gegen `fake-indexeddb`; `findDuplicate` findet gleiche Firma und Stelle unabhängig von Groß-/Kleinschreibung; `purgeExpiredDrafts` löscht nur Entwürfe älter als die Frist; `exportAll`/`importAll` sind verlustfrei
- [ ] Umsetzen (`idb` als dünne Hülle oder rohes IndexedDB — Entscheidung im Commit begründen)
- [ ] Tests grün
- [ ] Commit: `feat(storage): Speicherschnittstelle mit IndexedDB-Umsetzung`

---

### Task 7 — KI-Adapter

**Dateien:** `src/lib/ai/provider.ts`, `gemini.ts`, `openai.ts`, `anthropic.ts`, `errors.ts`, jeweils `.test.ts`

**Konsumiert:** `ProviderId` aus Aufgabe 5
**Erzeugt:**
```ts
export interface LlmRequest { system: string; user: string; temperature?: number; maxTokens?: number; json?: boolean }
export interface LlmProvider { id: ProviderId; label: string; endpoint: string; generate(req: LlmRequest, apiKey: string, signal?: AbortSignal): Promise<string> }
export const PROVIDERS: Record<ProviderId, LlmProvider>
export class LlmError extends Error { kind: 'invalid_key' | 'rate_limit' | 'quota' | 'network' | 'blocked' | 'unknown'; retryAfterMs?: number }
```

- [ ] Tests zuerst gegen abgefangene `fetch`-Aufrufe: jeder Anbieter erzeugt die richtige Anfrage-Struktur; HTTP 401 → `invalid_key`; HTTP 429 → `rate_limit` mit `retryAfterMs` aus dem `Retry-After`-Header; Netzfehler → `network`
- [ ] Umsetzen. Anthropic braucht den Header, der direkten Browserzugriff erlaubt — **beim Bauen prüfen, ob das noch unterstützt wird**; falls nicht, Anbieter ausbauen und in `docs/spec.md` vermerken
- [ ] Ein Wiederholungsversuch mit Wartezeit bei `rate_limit`, danach Fehlermeldung an die Oberfläche. Bei Gemini muss die Meldung ausdrücklich das Tageskontingent des kostenlosen Tarifs nennen — sonst wirkt es wie ein Fehler der App
- [ ] Tests grün
- [ ] Commit: `feat(ai): austauschbarer Anbieter-Adapter für Gemini, OpenAI und Anthropic`

---

### Task 8 — Anonymisierung

**Dateien:** `src/lib/privacy/anonymize.ts`, `.test.ts`

**Erzeugt:**
```ts
export interface PiiMap { [placeholder: string]: string }
export function anonymize(text: string, hints?: { name?: string; email?: string }): { text: string; map: PiiMap }
export function deanonymize(text: string, map: PiiMap): string
```

Ersetzt E-Mail, Telefon, Datum im Format `TT.MM.JJJJ` bzw. `DD/MM/YYYY`, Postleitzahl mit Ort, Straße mit Hausnummer und den erkannten Namen durch `[NAME]`, `[EMAIL]`, `[TEL]`, `[ADRESSE]`, `[GEBURTSDATUM]`. Der Name stammt aus dem Kopfbereich des Dokuments und wird zusätzlich als Ganzwort im gesamten Text ersetzt.

- [ ] Test zuerst: Beispieltext mit allen fünf Arten → alle ersetzt; `deanonymize(anonymize(t).text, map) === t`; mehrfaches Vorkommen desselben Namens erhält denselben Platzhalter; ein Datum, das kein Geburtsdatum ist (etwa „seit 03.2021"), bleibt unangetastet
- [ ] Umsetzen
- [ ] Tests grün
- [ ] Commit: `feat(privacy): Anonymisierung persönlicher Daten vor dem Senden`

---

### Task 9 — Stellenanzeige analysieren

**Dateien:** `src/lib/ai/prompts/jobAd.ts`, `src/lib/domain/jobAd.ts`, `.test.ts`

**Konsumiert:** `LlmProvider` aus Aufgabe 7
**Erzeugt:**
```ts
export interface Requirement { text: string; kind: 'skill' | 'experience' | 'education' | 'language' | 'soft' }
export interface JobAd {
  language: 'de' | 'en'
  company: string | null
  position: string | null
  contactPerson: string | null
  salutation: string | null          // z. B. "Sehr geehrter Herr Dr. Meier"
  requirements: Requirement[]
  tone: string                       // Kurzbeschreibung des Unternehmenstons
}
export function analyzeJobAd(text: string, provider: LlmProvider, apiKey: string): Promise<JobAd>
```

- [ ] **Zod-Schema `JobAdSchema` als Grenze:** Jede Modellantwort wird geparst, bevor sie ins Programm gelangt. Dasselbe Muster gilt für alle weiteren Modellantworten (Stilprofil, Varianten, Lückenliste)
- [ ] Test zuerst gegen eine abgefangene Antwort: gültiges JSON wird zu `JobAd`; fehlerhaftes oder abgeschnittenes JSON wirft eine verständliche Fehlermeldung mit dem Feldnamen; fehlende Felder werden zu `null` statt zu erfundenen Werten
- [ ] Prompt schreiben. Verbindliche Regel im Prompt: Wenn Firma, Stelle oder Ansprechpartner nicht in der Anzeige stehen, ist `null` zurückzugeben — **nichts raten**
- [ ] Spracherkennung deterministisch vorschalten (Stoppwort-Zählung), Ergebnis dem Modell nur zur Bestätigung geben
- [ ] Tests grün
- [ ] Commit: `feat(domain): Anforderungen und Eckdaten aus der Stellenanzeige ziehen`

---

### Task 10 — Stilprofil

**Dateien:** `src/lib/ai/prompts/styleProfile.ts`, `src/lib/domain/styleProfile.ts`, `.test.ts`

**Erzeugt:**
```ts
export interface StyleProfile {
  formality: number        // 0 = locker, 100 = förmlich
  sentenceLength: number   // durchschnittliche Wörter pro Satz, deterministisch berechnet
  address: 'sie' | 'du' | 'none'
  traits: string[]         // z. B. "nennt Ergebnisse mit Zahlen", "kurze Einleitungssätze"
  sample: string           // zwei repräsentative Sätze aus dem Original
}
export function deriveStyleProfile(letterText: string, provider: LlmProvider, apiKey: string): Promise<StyleProfile>
export function styleProfileToPromptFragment(p: StyleProfile): string
```

Das Stilprofil ist der Kern des Produktversprechens: Die KI soll nicht „gut" schreiben, sondern **wie der Nutzer**. `sentenceLength` und `address` werden ohne KI berechnet, damit sie belastbar sind.

- [ ] Test zuerst: `sentenceLength` und `address` aus einem Beispieltext exakt berechnet; `styleProfileToPromptFragment` enthält alle Felder; das Profil ist über die Oberfläche änderbar (reines Datenobjekt)
- [ ] Umsetzen
- [ ] Tests grün
- [ ] Commit: `feat(domain): Stilprofil aus dem bestehenden Anschreiben ableiten`

---

### Task 11 — Umschreiben mit drei Varianten

**Dateien:** `src/lib/ai/prompts/rewrite.ts`, `src/lib/domain/rewrite.ts`, `.test.ts`

**Konsumiert:** `JobAd`, `StyleProfile`, `anonymize`, `LlmProvider`
**Erzeugt:**
```ts
import type { TruthMode } from '../storage/adapter'   // in Aufgabe 6 definiert
export interface RewriteRequest {
  selection: string
  contextBefore: string          // bis zu 600 Zeichen davor — wird mitgelesen, nie verändert
  contextAfter: string
  jobAd: JobAd
  style: StyleProfile
  truthMode: TruthMode
  facts: string                  // Fließtext aus Lebenslauf + Anschreiben als Faktenbasis
  targetLanguage: 'de' | 'en'
  sliders: { formality: number; length: number }
}
export interface Variant { text: string; unbackedClaims: string[] }   // im Modus 'free' gefüllt, sonst leer
export function rewriteSelection(req: RewriteRequest, provider: LlmProvider, apiKey: string): Promise<Variant[]>   // genau 3
```

- [ ] Test zuerst: genau drei Varianten; die Prompts enthalten in `strict` die Anweisung, ausschließlich Belegtes zu verwenden; in `free` liefert das Modell `unbackedClaims`, und Varianten mit nicht leerem `unbackedClaims` sind entsprechend gekennzeichnet; bei abweichender Zielsprache wird zuerst übersetzt und dann angepasst (zwei getrennte Aufrufe)
- [ ] Anonymisierung vor dem Senden anwenden, Rücktausch nach der Antwort — Test dafür
- [ ] Umsetzen. Im Prompt ausdrücklich: Kontext davor und danach sind **nur zum Mitlesen**, es ist ausschließlich die Auswahl zurückzugeben
- [ ] Tests grün
- [ ] Commit: `feat(domain): Auswahl umschreiben mit drei Varianten und Wahrheitsmodi`

---

### Task 12 — Lückenliste und Briefkopf

**Dateien:** `src/lib/domain/gaps.ts`, `src/lib/domain/letterhead.ts`, `src/lib/ai/prompts/gaps.ts`, jeweils `.test.ts`

**Erzeugt:**
```ts
export interface GapEntry { requirement: Requirement; status: 'covered' | 'partial' | 'missing'; evidence: string | null }
export function analyzeGaps(jobAd: JobAd, facts: string, provider: LlmProvider, apiKey: string): Promise<GapEntry[]>

export interface Letterhead { recipient: string; date: string; subject: string; salutation: string }
export function suggestLetterhead(jobAd: JobAd, uiLanguage: 'de' | 'en', today: Date): Letterhead
export function findForeignCompanyNames(text: string, currentCompany: string | null, knownCompanies: string[]): { name: string; index: number }[]
```

`findForeignCompanyNames` arbeitet **ohne KI**: Es gleicht den Text gegen die Firmennamen aus der bisherigen Bewerbungsliste ab und meldet Treffer, die nicht zur aktuellen Anzeige gehören. Das ist die Prüfung, die den klassischen Kopierfehler abfängt.

- [ ] Test zuerst: `analyzeGaps` liefert für jede Anforderung genau einen Eintrag und **keinen Zahlenwert**; `suggestLetterhead` erzeugt bei fehlendem Ansprechpartner „Sehr geehrte Damen und Herren" bzw. „Dear Hiring Team"; `findForeignCompanyNames` findet „Bosch" in einem Text, dessen aktuelle Firma „Siemens" ist, und meldet nichts, wenn nur die aktuelle Firma vorkommt
- [ ] Umsetzen
- [ ] Tests grün
- [ ] Commit: `feat(domain): Lückenliste, Briefkopfvorschlag und Fremdfirmen-Warnung`

---

### Task 13 — Einstiegsseite und Onboarding

**Dateien:** `src/routes/Start.tsx`, `src/routes/Settings.tsx`, `src/components/onboarding/*`, `src/components/ui/*`

**Konsumiert:** `KeyVault`, `StorageAdapter`, `parseDocx`, `extractPdf`, `PROVIDERS`

- [ ] UI-Primitive aus Radix + CVA anlegen: Button, Card, Dialog, Popover, Select, Switch, Slider, Tooltip (Muster: `adg/frontend/src/portal/components/ui/`)
- [ ] `PrivacyNotice`: einmalig beim ersten Start. Inhalt: Inhalte gehen an den gewählten Anbieter; der kostenlose Gemini-Tarif wird zum Training verwendet; es wird ein Zwischenstand im Browser gespeichert; Knopf „Alle Daten löschen" ist jederzeit erreichbar
- [ ] `KeySetup`: Anbieterwahl, Schlüsselfeld, schrittweise Anleitung je Anbieter. Erkennt kostenpflichtige Schlüssel und **verlangt dann ein Passwort**
- [ ] `PaidKeyHints`: drei anklickbare Punkte — Ausgabenlimit setzen, eigenen Schlüssel nur für Applai, Herkunftsbeschränkung (bei Google). **Beim Bauen prüfen**, ob die Herkunftsbeschränkung für den Gemini-Dienst greift; falls nicht, Punkt entfernen statt falsche Sicherheit zu suggerieren
- [ ] `Start.tsx`: Ablegefelder für Anschreiben und Lebenslauf (mindestens eines Pflicht), Textfeld für die Stellenausschreibung, Bewerbungsliste mit Doppelbewerbungs-Hinweis, Vorschlag der zuletzt benutzten Dateien
- [ ] Bei PDF-Eingabe: Beta-Hinweis mit Prüfaufforderung, bei erkannter Mehrspaltigkeit zusätzlich die Warnung
- [ ] `Settings.tsx`: Anbieter, Sprache, Anonymisierung, Wahrheitsmodus, Erscheinungsbild, Liste exportieren/importieren, alles löschen
- [ ] Komponententests mit Testing Library: Datei ohne Gegenstück wird akzeptiert, leere Eingabe blockiert den Weiter-Knopf, kostenpflichtiger Schlüssel ohne Passwort blockiert das Speichern
- [ ] Commit: `feat(ui): Einstiegsseite, Schlüsseleinrichtung und Einstellungen`

---

### Task 14 — Arbeitsfläche mit freier Markierung

**Dateien:** `src/routes/Editor.tsx`, `src/components/editor/*`

**Konsumiert:** alles Vorherige. **Kernstück des Produkts.**

- [ ] `DocumentView`: rendert die Absätze aus `DocxDocument` als lesbaren Fließtext mit den Token aus `design.css`. Inline-Bearbeitung über `contentEditable` **auf Absatzebene**, wobei Formatierungsbefehle (Strg+B und Verwandte) abgefangen und unterdrückt werden — Text ja, Formatierung nein
- [ ] `SelectionLayer`: bildet die Mausmarkierung über `window.getSelection()` auf `Range { from, to }` im Dokumenttext ab. Datenattribute an den Absätzen tragen den Absatz-Offset; daraus wird der globale Offset berechnet. Zusätzlich Knopf „ganzes Dokument"
- [ ] `VariantPopover`: erscheint an der Markierung, zeigt drei Varianten, übernehmen schreibt über `replaceRange`, verwerfen schließt. Ladezustand mit Abbrechen-Möglichkeit (`AbortSignal`)
- [ ] `LetterheadPanel`: die vier Felder oberhalb des Dokuments, vorbefüllt und korrigierbar; Fremdfirmen-Treffer werden im Dokument markiert
- [ ] `GapList` und `StyleProfilePanel` in einer ruhigen Seitenspalte, auf schmalen Bildschirmen als aufklappbarer Bereich. Das Stilprofil zeigt die abgeleiteten Werte, ist korrigierbar und trägt die beiden Schieberegler „förmlich ↔ locker" und „kurz ↔ ausführlich", die in `RewriteRequest.sliders` einfließen
- [ ] **Sprach-Nachfrage:** Weicht `jobAd.language` von der Sprache des Anschreibens ab, erscheint einmalig ein Dialog mit der vorgeschlagenen Zielsprache (die der Anzeige) und einem Umschalter. Bei Wechsel ins Englische zusätzlich der Hinweis auf abweichende Gepflogenheiten — Foto, Geburtsdatum und Anschrift sind dort unüblich. Stimmen die Sprachen überein, erscheint **nichts**
- [ ] `TruthModeSwitch`: bei Wechsel auf `free` ein erklärender Dialog. Erfundene Aussagen werden farbig markiert und einzeln bestätigt; **der Export bleibt gesperrt, solange unbestätigte Aussagen im Text stehen**
- [ ] Undo-Historie über einen Stapel von `DocxDocument`-Zuständen, Strg+Z
- [ ] Automatischer Zwischenstand alle 20 Sekunden über `saveDraft`, mit sichtbarer Anzeige „Zwischenstand gesichert vor …"
- [ ] Auf schmalen Bildschirmen wird die Feinmarkierung ausgeblendet und nur „ganzes Dokument" angeboten
- [ ] Tests: Markierung über zwei Absätze liefert die erwarteten Offsets; Übernahme einer Variante ändert den Dokumenttext; Exportsperre greift bei unbestätigten Aussagen
- [ ] Commit: `feat(editor): Arbeitsfläche mit freier Markierung und Variantenauswahl`

---

### Task 15 — Export

**Dateien:** `src/lib/export/docx.ts`, `src/lib/export/print.css`, `src/components/editor/ExportBar.tsx`, `.test.ts`

- [ ] Word-Export: `serializeDocx` → Download mit sprechendem Dateinamen `Anschreiben_<Firma>_<JJJJ-MM-TT>.docx`
- [x] PDF-Export als eigener Erzeuger (`src/lib/export/pdf/`, nachgereicht): Formatierung aus dem OOXML lesen, mit metrikgleichen Schriften setzen, PDF schreiben. Das Druck-Stylesheet bleibt für Strg+P, ist aber nicht mehr der Exportweg
- [ ] Kopierfeld: Reintext des Dokuments in die Zwischenablage, für Online-Formulare
- [ ] Nach erfolgreichem Export: Bewerbung in die Liste eintragen (`addApplication`) und den Entwurf löschen
- [ ] Tests: Dateiname korrekt gebildet; Exportknöpfe sind gesperrt, solange unbestätigte erfundene Aussagen vorliegen; nach Export ist der Entwurf entfernt und die Bewerbung in der Liste
- [ ] Commit: `feat(export): Word-Download, PDF über Druckdialog und Kopierfeld`

---

### Task 16 — Ende-zu-Ende-Test, Barrierefreiheit, Veröffentlichung

**Dateien:** `e2e/happy-path.spec.ts`, `e2e/a11y.spec.ts`, `README.md`, `docs/datenschutz.md`, `src/routes/Privacy.tsx`

- [ ] Playwright-Durchlauf mit abgefangenen KI-Antworten: Anschreiben hochladen → Anzeige einfügen → Textstelle markieren → Variante übernehmen → exportieren → Bewerbung erscheint in der Liste
- [ ] Zweiter Durchlauf: doppelte Bewerbung erzeugt den Hinweis
- [ ] Barrierefreiheits-Prüfung mit `@axe-core/playwright` auf Einstiegsseite, Arbeitsfläche und Einstellungen — keine schwerwiegenden Verstöße
- [ ] Tastaturbedienung prüfen: Markierung per Umschalt+Pfeiltasten, Variantenauswahl per Tastatur erreichbar
- [ ] Datenschutzerklärung schreiben (Kern: „Diese Seite speichert nichts auf einem Server. Ihre Dokumente werden ausschließlich in Ihrem Browser verarbeitet und nur an den von Ihnen gewählten KI-Anbieter übertragen.") plus Verweise auf die Bestimmungen der drei Anbieter, dazu ein schlichtes Impressum
- [ ] `README.md`: Was die App tut, was sie bewusst nicht tut, wie man einen Schlüssel anlegt, wie man selbst baut
- [ ] Cloudflare Pages einrichten: GitHub-Repository verbinden, Build `npm run build`, Ausgabeverzeichnis `dist`. **Prüfen, dass `public/_headers` in der Antwort ankommt**
- [ ] Commit: `feat: Ende-zu-Ende-Tests, Barrierefreiheit und Veröffentlichung`

---

## Verifikation

**Nach jeder Aufgabe:** `npm run lint && npm run typecheck && npm test`

**Ende-zu-Ende, von Hand mit echtem Schlüssel:**
1. `npm run dev`, kostenlosen Gemini-Schlüssel eintragen — Anleitung muss ohne Vorwissen zum Ziel führen
2. Echtes Anschreiben (.docx) und echten Lebenslauf hochladen, echte Stellenanzeige einfügen
3. Anforderungsliste prüfen: steht dort, was in der Anzeige steht, ohne Erfindungen?
4. Stilprofil prüfen: trifft es den eigenen Ton?
5. Mitten im Satz markieren, umschreiben lassen — drei Varianten, Ton passt, Formatierung des Absatzes unverändert
6. Über zwei Absätze markieren, umschreiben — Absatzstruktur bleibt erhalten
7. Modus `free` einschalten: erfundene Aussagen sind farbig, der Export ist gesperrt bis zur Bestätigung
8. Word exportieren, in Word öffnen: **Schrift, Ränder, Kopfzeile identisch zum Original**
9. PDF exportieren und neben die Word-Datei legen: Schrift, Ränder, Umbrüche, Briefkopf
10. Seite neu laden: Zwischenstand ist wieder da
11. Zweite Bewerbung bei derselben Firma auf dieselbe Stelle: Hinweis erscheint
12. „Alle Daten löschen": IndexedDB ist leer, Schlüssel weg

**Sicherheitsprüfung:**
- Entwicklerwerkzeuge → Anwendung → IndexedDB: **nirgends ein lesbarer API-Schlüssel**
- Netzwerk-Tab während eines Durchlaufs: **ausschließlich Verbindungen zum gewählten Anbieter**
- In der Konsole `fetch('https://example.com')` ausführen: muss von der CSP blockiert werden
- Anonymisierung an: im Anfragetext des Netzwerk-Tabs steht `[NAME]`, nicht der echte Name

**Vor der Veröffentlichung:** `npm audit --audit-level=high` ohne Befund; Repository nach Zeichenfolgen wie `sk-`, `AIza` durchsuchen

---

## Beim Bauen zu prüfen

Vier Annahmen stehen im Plan, die sich seit meinem Wissensstand geändert haben können. Jede hat einen Ausweichweg:

| Annahme | Falls sie nicht hält |
|---|---|
| Anthropic erlaubt direkten Browserzugriff mit dem entsprechenden Header | Anbieter entfernen, in `docs/spec.md` vermerken |
| Gemini und OpenAI erlauben Browser-Aufrufe (CORS) | Ohne Vermittler nicht lösbar — betroffener Anbieter entfällt |
| Google-Schlüssel lassen sich für den Gemini-Dienst auf eine Herkunftsadresse begrenzen | Punkt aus `PaidKeyHints` streichen, statt falsche Sicherheit zu suggerieren |
| Der pdfjs-Worker läuft unter der strengen CSP | `worker-src` gezielt anpassen, niemals `unsafe-eval` ergänzen |

Der Vite-Entwicklungsserver arbeitet mit eingebetteten Skripten. Die strenge CSP gilt deshalb nur für den gebauten Stand; im Entwicklungsmodus wird eine gelockerte Fassung verwendet. **Die Prüfung in der Verifikation muss gegen `npm run build && npm run preview` laufen, nicht gegen `npm run dev`.**

---

## Danach

**Bauabschnitt 2:** Lebenslauf-Bearbeitung (umformulieren, gewichten, optionales Weglassen mit roter Markierung und Bestätigung, ganze Stationen nur von Hand mit Lückenwarnung) und die originalgetreuere PDF-Umwandlung mit Spalten- und Grafikbehandlung.

**Bauabschnitt 3:** Anschreiben ohne Vorlage erstellen (gekennzeichnet als Entwurf ohne Stilvorlage), lokale Modelle, serverseitige Liste — je nachdem, was sich in der Benutzung als nötig erweist.
