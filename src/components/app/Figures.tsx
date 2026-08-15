import { cn } from '@/lib/utils'

/**
 * Acht Posen derselben Figur. Sie sagen nichts, was die Oberfläche nicht auch
 * sagt — sie sagen es nur einen Wimpernschlag früher und in der Sprache des
 * Hauses. Für den Vorleser sind sie deshalb nicht da (`aria-hidden`).
 *
 * **Gleich groß heißt gleich große Person, nicht gleich großes Bild.** Beim
 * Schirm nimmt die Wolke die halbe Bildhöhe ein, beim Ballon der Ballon ein
 * gutes Drittel. Gleich hohe Bilder ergäben verschieden große Personen. Maß
 * ist die **Kopfbreite**; die Tabelle dazu steht in `.scratch/mock/assets.py`.
 * Auf `/datenschutz` und `/settings` sind alle vier auf 66 px Kopf gerechnet —
 * daher die vier ungleichen Breiten unten, die zusammen gleich große Leute
 * ergeben.
 *
 * **Sie stehen im Raum, nicht an den Karten.** Wer an einer Karte hängt,
 * richtet sich nach ihr aus und liest sich als ihre Beigabe. Die vier
 * Raumfiguren liegen darum in der Hintergrundebene, bei den Kritzeleien, und
 * sind waagerecht an der **Fenstermitte** verankert
 * (`calc(50% + halbe Inhaltsbreite + Abstand)`) — so bleibt der Abstand zur
 * Karte auf jedem Fenster derselbe.
 *
 * Die beiden Spähenden sind die Ausnahme, und zwar mit Grund: Ihre Vorlagen
 * bringen eine eigene Mauer mit (Senkrecht- bzw. Querstrich), die beim
 * Zuschnitt entfernt wurde, damit die Kante der **Karte** beziehungsweise des
 * **Blattes** die Mauer ist. Sie hängen deshalb an dem, um das sie
 * herumschauen, und nicht am Fenster.
 *
 * **Nie auf einer Linie.** Zwei gespiegelte Figuren in gleicher Höhe lesen
 * sich als Ornament. Eine steht hoch und weiter weg, die andere tief und
 * dichter dran, jede anders gekippt. Die Neigungen sind die der Kacheln und
 * Kritzeleien, die der Entwurf ohnehin führt.
 *
 * **Sie verschwinden, wenn kein Platz ist**, statt am Bildrand zu kleben. Die
 * Schwellen sind gemessen, nicht geschätzt — beim Ändern der Größen neu
 * messen.
 */

/** Die Maße der Bilddateien. Fest am `<img>`, damit nichts springt, bis die
 *  Datei eintrifft. */
export const POSEN = {
  warten: { src: '/figuren/warten.webp', width: 406, height: 640 },
  jubeln: { src: '/figuren/jubeln.webp', width: 562, height: 640 },
  spaehen: { src: '/figuren/spaehen.webp', width: 511, height: 640 },
  spaehenOben: { src: '/figuren/spaehen-oben.webp', width: 640, height: 538 },
  schirm: { src: '/figuren/schirm.webp', width: 419, height: 640 },
  inkognito: { src: '/figuren/inkognito.webp', width: 413, height: 640 },
  jonglieren: { src: '/figuren/jonglieren.webp', width: 498, height: 640 },
  luftballon: { src: '/figuren/luftballon.webp', width: 382, height: 640 },
} as const

export type Pose = keyof typeof POSEN

export interface FigureProps {
  pose: Pose
  /** Platzierung und Breite als Klassen. Die Breite läuft über `--breite`,
   *  wo die Ausrichtung sich darauf bezieht (die beiden Spähenden). */
  className?: string
}

/** Eine einzelne Figur. Sie ist Zier: kein Name, keine Zeigerereignisse. */
export function Figure({ pose, className }: FigureProps) {
  const { src, width, height } = POSEN[pose]
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      // Zier, und Zier wartet: Keine Figur steht über dem Falz, und keine
      // trägt eine Aussage, die vor dem Inhalt eintreffen müsste.
      loading="lazy"
      decoding="async"
      data-figure={pose}
      className={cn('pointer-events-none absolute block h-auto', className)}
    />
  )
}

/**
 * Die Ebene, in der die Raumfiguren stehen: deckungsgleich mit dem Blatt,
 * unter allem Bedienbaren, ohne Zeigerereignisse.
 *
 * Sie ist ein eigener Kasten und nicht Teil von `Room`, weil jede Ansicht
 * andere Figuren mitbringt — `Room` malt das Papier und die Kritzeleien, die
 * überall gleich sind.
 */
export function RoomFigures({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      data-testid="room-figures"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {children}
    </div>
  )
}
