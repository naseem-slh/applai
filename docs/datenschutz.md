# Datenschutz — die lange Fassung

Die Fassung, die Nutzer sehen, steht in der Anwendung unter
[`/datenschutz`](../src/routes/Privacy.tsx); ihr Text liegt als
Übersetzungsschlüssel unter `privacy.*` in
[`src/lib/i18n/locales/`](../src/lib/i18n/locales/) (G8). Dieses Dokument
erklärt, **woraus** diese Zusagen folgen — es richtet sich an jemanden, der
sie nachprüfen will, und nennt zu jeder die Stelle im Quelltext.

## Der Kernsatz

> Diese Seite speichert nichts auf einem Server. Ihre Dokumente werden
> ausschließlich in Ihrem Browser verarbeitet und nur an den von Ihnen
> gewählten KI-Anbieter übertragen.

Das ist keine Absichtserklärung, sondern eine Eigenschaft der Bauweise. Sie
folgt aus vier Entscheidungen, die im Projekt als Regeln festgeschrieben und
maschinell gehalten sind (siehe [`CLAUDE.md`](../CLAUDE.md)):

| Regel | Was sie zusichert | Wo sie durchgesetzt wird |
|---|---|---|
| **G1** Kein Server, kein Backend | Es gibt keine Stelle, an die Daten fließen könnten | Nur statische Dateien; `dist/` enthält kein serverseitiges Stück |
| **G2** Keine Laufzeit-Ressourcen fremder Hosts | Kein Analysewerkzeug, kein CDN, keine Schrift von außen | Schriftarten unter `public/fonts/`; CSP `default-src 'self'` |
| **G3** `connect-src` auf drei Ziele begrenzt | Selbst eine kompromittierte Abhängigkeit könnte nichts ausleiten | [`public/_headers`](../public/_headers), geprüft in `provider.test.ts` |
| **G4** Kein Schlüssel im Quelltext | Der Schlüssel gehört dem Nutzer | Ausschließlich Eingabe zur Laufzeit; `keyVault.ts` |

## Was der Browser speichert, und wo genau

| Was | Wo | Wie lange | Quelle |
|---|---|---|---|
| API-Schlüssel | IndexedDB `applai-key-vault` | Bis „Alle Daten löschen"; im Arbeitsspeicher gesperrt nach 30 Minuten Untätigkeit | [`keyVault.ts`](../src/lib/storage/keyVault.ts) |
| Zwischenstand des Anschreibens | IndexedDB, Objektspeicher `drafts` | Bis zum Export, spätestens 7 Tage | [`indexeddb.ts`](../src/lib/storage/indexeddb.ts), `purgeExpiredDrafts` |
| Bewerbungsliste (Firma, Stelle, Datum) | IndexedDB, Objektspeicher `applications` | Bis „Alle Daten löschen" | dito |
| Einstellungen | IndexedDB, Objektspeicher `settings` | dito | dito |

**Nichts davon liegt in `localStorage`** — das ist Regel G5, und sie gilt
gerade für Dokumentinhalte.

Der Schlüssel wird mit WebCrypto verschlüsselt abgelegt. Bei einem
kostenpflichtigen Schlüssel ist ein Passwort Pflicht (PBKDF2-HMAC-SHA-256,
600 000 Runden); ohne Passwort ist der Schlüssel an einen nicht auslesbaren
Schlüssel des Browsers gebunden.

## Was an den Anbieter geht — und was nicht

Gesendet wird bei einer Umformulierung:

- die markierte Textstelle,
- bis zu 600 Zeichen Kontext davor und danach,
- der Text der Stellenanzeige,
- eine Faktenbasis aus Lebenslauf und Anschreiben,
- das abgeleitete Stilprofil.

**Vorher ersetzt** werden Name, Anschrift, Geburtsdatum, Telefonnummer und
E-Mail-Adresse durch Platzhalter (`[NAME]`, `[EMAIL]`, …) und in der Antwort
zurückgetauscht — siehe [`src/lib/privacy/`](../src/lib/privacy/). Das ist
standardmäßig eingeschaltet und in den Einstellungen abschaltbar.

**Nicht gesendet** wird irgendetwas an irgendeinen anderen Host. Das lässt
sich nachprüfen: Im Netzwerk-Tab des Browsers steht während eines ganzen
Durchlaufs ausschließlich der gewählte Anbieter, und `fetch('https://example.com')`
in der Konsole wird von der CSP abgewiesen.

## Was beim Ausliefern anfällt

Die Seite liegt bei Cloudflare Pages. Wie bei jeder Web-Anfrage überträgt der
Browser dabei die üblichen Angaben, darunter die IP-Adresse; darüber
entscheidet Cloudflare, nicht diese Anwendung. Es werden keine Cookies
gesetzt und keine Zählpixel geladen — auch nicht von Cloudflare, solange die
dortigen Analysefunktionen nicht eingeschaltet werden. **Sie bleiben
ausgeschaltet** (siehe [`docs/veroeffentlichung.md`](veroeffentlichung.md)).

## Wie man das selbst nachprüft

1. Entwicklerwerkzeuge → Anwendung → IndexedDB: Nirgends steht ein lesbarer
   API-Schlüssel.
2. Netzwerk-Tab während eines Durchlaufs: ausschließlich Verbindungen zum
   gewählten Anbieter.
3. In der Konsole `fetch('https://example.com')`: von der CSP blockiert.
4. Anonymisierung an, Anfragetext im Netzwerk-Tab ansehen: dort steht
   `[NAME]`, nicht der echte Name.

Diese vier Schritte stehen auch in der Verifikationsliste des
Implementierungsplans und sind vor jeder Veröffentlichung durchzugehen.
