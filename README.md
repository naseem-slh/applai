# Applai

Passt ein bestehendes Anschreiben an eine Stellenausschreibung an. Sie
markieren eine Textstelle, die KI liefert drei Formulierungen im Stil Ihres
Originals — und das Layout Ihrer Word-Datei bleibt unangetastet.

Gesprochen wie *apply*.

## Was es tut

- **Ihr Anschreiben bleibt Ihr Anschreiben.** Die `.docx` wird im Browser
  entpackt, ihr XML gezielt an den geänderten Stellen gepatcht und wieder
  gepackt. Schrift, Ränder, Kopfzeile und Unterschrift überstehen das
  unverändert — es wird nichts neu erzeugt.
- **Freie Markierung.** Mit der Maus über beliebige Bereiche, auch über
  Satz- und Absatzgrenzen hinweg. Dazu „ganzes Dokument" und „aktueller
  Absatz".
- **Drei Varianten zur Auswahl**, übernehmen oder verwerfen. Der Ton kommt
  aus einem Stilprofil, das aus Ihrem eigenen Brief abgeleitet wird, plus
  zwei Reglern (förmlich ↔ locker, kurz ↔ ausführlich).
- **Die KI erfindet nichts.** Grundregel ist der strenge Modus: Es wird nur
  formuliert, was Ihre Unterlagen decken. Wer will, schaltet „Brücken" oder
  den freien Modus zu — dort wird jede unbelegte Aussage farbig markiert,
  einzeln bestätigt, und der **Export bleibt gesperrt**, solange eine offen
  ist.
- **Anforderungsliste und Lückenabgleich** aus der Anzeige, ohne
  Prozentwert (der wäre erfunden).
- **Briefkopfvorschlag** und eine Warnung, wenn im Text noch der Name einer
  Firma steht, bei der Sie sich vorher beworben haben.
- **Export** als Word-Datei, als PDF über den Druckdialog, oder als Reintext
  für Online-Formulare.

## Was es bewusst nicht tut

- **Kein Server, kein Konto, keine Anmeldung.** Nur statische Dateien. Ihre
  Unterlagen verlassen Ihren Browser nur in eine Richtung: zu dem
  KI-Anbieter, dessen Schlüssel Sie selbst hinterlegt haben.
- **Kein Anschreiben aus dem Nichts.** Es braucht eine Vorlage — der Sinn
  ist, *Ihren* Ton zu treffen, nicht einen generischen.
- **Kein Abruf von Stellenanzeigen über einen Link.** Das bräuchte einen
  Vermittler und damit einen Server. Text einfügen oder PDF hochladen.
- **Keine Nachverfolgung.** Keine Cookies, keine Analysewerkzeuge, keine
  Schriftarten von fremden Servern.
- **Lebenslauf-Bearbeitung** kommt im zweiten Bauabschnitt.

Die vollständige Liste der Entscheidungen steht in [`docs/spec.md`](docs/spec.md).

## Einen API-Schlüssel anlegen

Sie brauchen einen eigenen Schlüssel bei einem der drei Anbieter. Die
Anwendung führt beim ersten Start Schritt für Schritt hindurch; hier die
Kurzfassung.

**Google Gemini** hat einen kostenlosen Tarif und ist die Vorauswahl:

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) öffnen
   und mit einem Google-Konto anmelden.
2. „Create API key" wählen und den Schlüssel kopieren.
3. In Applai einfügen und bei „Abrechnung" **kostenlos** wählen.

Im kostenlosen Tarif verwendet Google die Inhalte laut eigener Aussage zur
Verbesserung seiner Dienste. Wer das nicht möchte, nimmt einen
kostenpflichtigen Schlüssel oder **OpenAI** bzw. **Anthropic** — bei beiden
ist ein Schlüssel immer kostenpflichtig.

**Bei einem kostenpflichtigen Schlüssel verlangt Applai ein Passwort.** Der
Schlüssel wird damit verschlüsselt abgelegt; ohne das Passwort ist er nicht
mehr zu benutzen und auch nicht zurückzusetzen. Legen Sie außerdem beim
Anbieter ein Ausgabenlimit fest — die Anwendung verweist beim Einrichten auf
die passende Seite.

Der Schlüssel bleibt in Ihrem Browser. Er steht nirgends im Quelltext, und
er wird nirgendwohin übertragen außer an den Anbieter selbst.

## Selbst bauen

Voraussetzung: Node 20 oder neuer, npm.

```bash
npm ci
npm run dev        # Entwicklungsserver
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung und produktiver Build nach `dist/` |
| `npm run preview` | Den gebauten Stand lokal servieren |
| `npm run lint` | ESLint, ohne geduldete Warnungen |
| `npm run typecheck` | TypeScript ohne Ausgabe |
| `npm test` | Vitest, einmaliger Lauf |
| `npm run e2e` | Playwright gegen den gebauten Stand |

**Sicherheitsprüfungen laufen gegen `npm run build && npm run preview`, nicht
gegen `npm run dev`.** Der Entwicklungsserver braucht eingebettete Skripte;
die strenge Content-Security-Policy gilt deshalb nur für den gebauten Stand.
Aus demselben Grund startet auch `npm run e2e` einen Build.

`dist/` lässt sich auf jeden Webserver legen, der statische Dateien
ausliefert. Für die Kopfzeilen aus `public/_headers` (darunter die CSP) siehe
[`docs/veroeffentlichung.md`](docs/veroeffentlichung.md).

## Datenschutz

Kurz: Diese Seite speichert nichts auf einem Server. Die lange Fassung samt
Anleitung zum Nachprüfen steht in
[`docs/datenschutz.md`](docs/datenschutz.md); in der Anwendung selbst unter
„Datenschutz" in der Fußzeile.

## Aufbau

```
src/lib/docx      Word-Dateien lesen, gezielt patchen, wieder packen
src/lib/pdf       PDF lesen, Beta-Umwandlung nach Word
src/lib/ai        Die drei Anbieter hinter einem gemeinsamen Adapter
src/lib/privacy   Ersetzen persönlicher Daten vor jedem Senden
src/lib/domain    Anzeige, Stilprofil, Umformulieren, Lücken, Briefkopf
src/lib/storage   IndexedDB hinter einer Schnittstelle, Schlüsseltresor
src/lib/export    Word-Download, Druck-Stylesheet, Zwischenablage
src/components    Oberfläche
src/routes        Einstiegsseite, Arbeitsfläche, Einstellungen, Datenschutz
```

Die Regeln, an die sich das hält (keine fremden Hosts, kein Schlüssel im
Repository, jeder sichtbare Text übersetzt), stehen in
[`CLAUDE.md`](CLAUDE.md). Tests liegen neben dem Code, den sie prüfen.

## Lizenz

Noch nicht festgelegt.
