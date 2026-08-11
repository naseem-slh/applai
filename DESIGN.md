---
name: Applai
description: Reine Browser-App, die ein bestehendes Anschreiben an eine Stellenausschreibung anpasst — ruhig, dokumentzentriert, modern statt klinisch
colors:
  surface: "#F7F4EF"
  surface-alt: "#EFEAE2"
  surface-raised: "#FFFFFF"
  border: "#E1DACD"
  ink: "#2E2A24"
  ink-strong: "#17140F"
  muted: "#75695C"
  accent: "#3E6259"
  accent-light: "#5A8377"
  accent-dark: "#2A473F"
  accent-contrast: "#F7F4EF"
  success: "#3D7A4F"
  error: "#B23A2E"
  warning: "#B8752B"
  info: "#3E6259"
typography:
  display:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "clamp(1.75rem, 3vw + 1rem, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  subheading:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "3rem"
---

# Applai — Design-Token

Diese Datei ist die verbindliche Quelle für Farb-, Typografie-, Radius- und
Abstandswerte. Die YAML-Kopfzeile oben ist maschinenlesbar; `src/styles/design.css`
spiegelt dieselben Werte als CSS-Variablen. Ändert sich ein Wert, wird er an
**beiden** Stellen angepasst.

## Leitgedanken

- **Helle Grundfläche in warmem Grauton, nicht `#FFFFFF`.** `surface` (`#F7F4EF`)
  wirkt wie Papier, nicht wie ein leerer Bildschirm — passend zu einer App, die
  sich um ein Dokument dreht. `surface-raised` (reines Weiß) bleibt Karten und
  Popovers vorbehalten, die sich bewusst vom Hintergrund abheben sollen.
- **Eine ruhige Akzentfarbe.** `accent` ist ein gedämpftes Tannengrün
  (`#3E6259`) — es wirkt seriös und zurückhaltend, nicht wie eine
  Marketing-Farbe, und funktioniert sowohl für Bewerbungen als auch für
  Interface-Elemente (Knöpfe, Fokusringe, aktive Zustände).
- **Großzügige Zeilenhöhe für Fließtext.** `body` nutzt `line-height: 1.7` —
  das Anschreiben ist der Kern der Anwendung und muss sich lesen lassen wie
  ein gedrucktes Dokument, nicht wie eine dichte Oberfläche.
- **Radien 4–12 px.** Kleine Elemente (Chips, Eingabefelder) `sm` (4px),
  Karten und Popover `md`–`lg` (8–12px). Keine größeren Radien — die App soll
  ruhig wirken, nicht verspielt.
- **Dunkle Variante** über `prefers-color-scheme: dark` (Systemeinstellung)
  und zusätzlich über `[data-theme="dark"]` bzw. `[data-theme="light"]`
  (bewusste Nutzerwahl in den Einstellungen, überstimmt die Systemeinstellung
  in beide Richtungen). Siehe `src/styles/design.css`.

## Schrift

Selbst gehostet unter `public/fonts/` (G2 — keine Google Fonts, keine
Laufzeit-Ressourcen von fremden Hosts): **Inter Variable**, Lateinisch-Subset
(deckt deutsche Umlaute und ß über den Unicode-Bereich U+0000–00FF ab),
SIL Open Font License 1.1. Eine einzelne Schriftfamilie für Fließtext und
Überschriften hält die App ruhig und reduziert die Zahl der Ladevorgänge.

## Nicht Teil dieser Aufgabe

Komponenten-spezifische Token (Button-Varianten, Karten-Schatten usw.)
entstehen erst mit den Radix/CVA-Primitiven in Aufgabe 13 — hier werden nur
die Grundwerte gelegt, aus denen sie sich ableiten.
