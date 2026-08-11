# Spezifikation — die 28 Entscheidungen

Diese Tabelle ist die verbindliche Fassung. Quelle:
[`docs/superpowers/plans/2026-08-11-applai-bauabschnitt-1.md`](superpowers/plans/2026-08-11-applai-bauabschnitt-1.md).

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
| PDF-Export | Über den Druckdialog des Browsers, aus der Ansicht, die der Nutzer sieht |
| Kopierfeld | Reintext für Online-Formulare |
| PDF→Word | **Beta**, einspaltig, sichtbar gekennzeichnet mit Prüfhinweis. Originaltreue folgt im zweiten Abschnitt |
| Bewerbungsliste | Firma, Stelle, Datum. Nur im Browser. Hinweis bei doppelter Bewerbung |
| Sicherung | Export und Import der Liste als Datei |
| Entwürfe | Automatischer Zwischenstand, sichtbar angezeigt, gelöscht nach Export oder nach 7 Tagen |
| Löschen | Knopf „Alle Daten löschen" |
| Erweiterbarkeit | Speicherung hinter einer Schnittstelle, damit später ein Server dazukommen kann |

### Nicht im ersten Bauabschnitt

Lebenslauf-Bearbeitung · originalgetreue PDF-Umwandlung · Anschreiben ganz ohne Vorlage erstellen · lokale Modelle (Ollama) · serverseitige Liste · Bewerbungsverwaltung mit Status und Fristen · Link-Abruf von Stellenanzeigen
