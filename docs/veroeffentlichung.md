# Veröffentlichung auf Cloudflare Pages

Diese Schritte kann nur jemand mit Zugang zum Cloudflare- und
GitHub-Konto ausführen. Das Repository bringt alles mit, was dafür nötig
ist; hier steht, was einzustellen ist und **was danach zu prüfen ist**.

## Einrichtung

1. **Repository verbinden** — Cloudflare Dashboard → Workers & Pages →
   Create → Pages → Connect to Git → dieses Repository wählen.
2. **Build-Einstellungen:**

   | Feld | Wert |
   |---|---|
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | (leer) |
   | Node-Version | `NODE_VERSION = 20` als Umgebungsvariable |

3. **Keine Umgebungsvariablen mit Geheimnissen.** Es gibt keine. Jeder
   Nutzer bringt seinen eigenen API-Schlüssel mit (G4), und das Repository
   ist öffentlich.
4. **Web Analytics ausgeschaltet lassen.** Cloudflare bietet an, ein
   Zählskript einzufügen. Das wäre eine Laufzeit-Ressource eines fremden
   Hosts (G2) und stünde im Widerspruch zur Datenschutzerklärung, die
   ausdrücklich sagt, dass keine Zählpixel geladen werden.

## Nach dem ersten Deploy zu prüfen

**1. Kommen die Kopfzeilen an?** `public/_headers` wird von Cloudflare Pages
gelesen und in Antwort-Kopfzeilen übersetzt. Das ist die maßgebliche Fassung
der CSP (G3) — der `<meta>`-Tag im HTML ist nur der Rückfall.

```
curl -sSI https://<adresse>/ | grep -i 'content-security-policy\|strict-transport\|x-content-type\|referrer-policy\|permissions-policy'
```

Erwartet wird eine `content-security-policy` mit genau diesen drei Zielen in
`connect-src`:

```
https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com
```

Kommt keine Kopfzeile an, liegt `_headers` nicht im Ausgabeverzeichnis —
dann prüfen, ob `public/` unverändert nach `dist/` kopiert wird.

**2. Läuft der pdfjs-Worker unter der strengen CSP?** Ein PDF hochladen und
in der Konsole nach einer CSP-Verletzung sehen. Falls doch eine auftritt:
`worker-src` gezielt anpassen, **niemals** `unsafe-eval` ergänzen (siehe die
Annahmenliste im Implementierungsplan).

**3. Die vier Schritte aus [`datenschutz.md`](datenschutz.md)**, Abschnitt
„Wie man das selbst nachprüft" — gegen die veröffentlichte Adresse, nicht
gegen `localhost`.

**4. Ein echter Durchlauf mit einem echten Schlüssel.** Die Verifikationsliste
im Implementierungsplan nennt zwölf Punkte; die beiden, die kein Test
abdecken kann, sind: Word-Datei in Word öffnen (Schrift, Ränder, Kopfzeile
identisch zum Original) und das PDF (steht neben der Word-Datei: Schrift, Ränder, Umbrüche, Briefkopf).

## Vor jeder Veröffentlichung

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
npm audit --audit-level=high
git grep -nE '(sk-[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,})' \
  -- . ':!*.md' ':!*.test.ts' ':!*.test.tsx'
```

Der letzte Befehl sucht nach versehentlich eingecheckten Schlüsseln. Er darf
nichts finden.

Zwei Einschränkungen im Muster, beide mit Grund. **Die Längenangaben:** Ein
kurzes `sk-` trifft sonst jedes „task-7-report" in einem Kommentar. Echte
Schlüssel sind lang (Google 39 Zeichen, OpenAI und Anthropic deutlich über
40). **Die ausgenommenen Testdateien:** Dort stehen absichtlich Zeichenketten
wie `AIzaSy-BEISPIEL-kein-echter-Schluessel`, an denen die Erkennung
kostenpflichtiger Schlüssel geprüft wird.

Ein Suchbefehl, der jedes Mal dieselben zehn harmlosen Fundstellen meldet,
ist ein Suchbefehl, dessen elfte Fundstelle niemand mehr liest. Deshalb muss
dieser hier still bleiben, solange nichts faul ist.
