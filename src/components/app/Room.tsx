import { cn } from '@/lib/utils'

/**
 * Der Raum, in dem jede Ansicht steht: ein liniertes DIN-A4-Blatt.
 *
 * Zwei Lagen. Die eine ist das Papier selbst — Zeilen, roter Rand,
 * Abdunklung zum Rand hin; sie steckt als `room-paper` in `design.css`, weil
 * sie aus drei ineinandergelegten Verläufen besteht und als eine Sache
 * gelesen werden will. Die andere sind die Kritzeleien, wie sie beim Warten
 * am Rand eines Blattes entstehen: Spirale, Schlaufe, Bleistift, Stern,
 * Wolke, Pfeil, Krakelkopf.
 *
 * **Sie bewegen sich nicht.** Ein früherer Entwurf ließ Konfetti über der
 * Fläche schweben; das lag über dem Blatt. Diese hier sind auf das Blatt
 * gezeichnet, und Bleistift wandert nicht.
 *
 * **Von Hand gesetzt, nicht gewürfelt.** Der Rand eines Blattes ist nicht
 * gleichmäßig bekritzelt, aber er sieht in jeder Sitzung gleich aus. Verteilt
 * wird über die ganze Fläche und nicht nur an den Seitenrändern: Über und
 * unter der Karte liegt genauso viel freies Blatt, und ein Blatt, das nur
 * links und rechts bekritzelt ist, sieht gerahmt aus statt benutzt. Was
 * hinter der Karte landet, verdeckt sie einfach.
 *
 * Unter 1024px fallen sie weg: Dort steht die Karte über die ganze Breite und
 * hätte sie ohnehin verdeckt.
 *
 * Der Raum ist Zier. Er trägt `aria-hidden`, nimmt keine Zeigerereignisse an
 * und liegt auf `z-0` — alles Bedienbare steht auf `z-1` darüber.
 */

/** Ein Kritzel: Pfade, Strichstärke und sein Platz auf dem Blatt. Die
 *  leichten Drehungen nehmen den Formen die Werkzeugsauberkeit. */
const DOODLES: readonly {
  viewBox: string
  strokeWidth: number
  place: string
  paths: readonly string[]
}[] = [
  {
    // Spirale
    viewBox: '0 0 60 60',
    strokeWidth: 2.1,
    place: 'top-[6%] left-[13%] w-[74px] rotate-[-6deg]',
    paths: ['M31 30c0-4-5-5-7-1s3 10 10 9 12-10 8-19S24 8 15 15'],
  },
  {
    // Schlaufe
    viewBox: '0 0 60 60',
    strokeWidth: 2,
    place: 'top-[61%] left-[11%] w-[82px] rotate-[-3deg]',
    paths: ['M4 34c6-14 15-15 17-4 1 7-7 9-8 2s8-12 17-6c6 4 8 12 16 7'],
  },
  {
    // Bleistift
    viewBox: '0 0 60 60',
    strokeWidth: 2.1,
    place: 'bottom-[9%] left-[27%] w-[64px] rotate-[8deg]',
    paths: ['M43 10l8 8-27 29-12 4 4-12z', 'M36 17l8 8', 'M16 39l8 8'],
  },
  {
    // Stern
    viewBox: '0 0 60 60',
    strokeWidth: 2.3,
    place: 'top-[5%] right-[29%] w-[56px] rotate-[11deg]',
    paths: [
      'M30 8c0 12 1 30 0 43',
      'M13 18c10 6 25 15 34 21',
      'M47 18c-9 6-24 15-34 21',
    ],
  },
  {
    // Wolke
    viewBox: '0 0 60 60',
    strokeWidth: 2,
    place: 'top-[40%] right-[4%] w-[84px] rotate-[-5deg]',
    paths: ['M14 40c-7 0-8-10-1-11-1-10 13-13 17-5 5-7 17-2 15 7 7 1 6 9-1 9z'],
  },
  {
    // Pfeil
    viewBox: '0 0 60 60',
    strokeWidth: 2.2,
    place: 'bottom-[14%] right-[13%] w-[72px] rotate-[6deg]',
    paths: ['M8 20c11 24 33 24 44 6', 'M52 26l-9 3', 'M52 26l-3 9'],
  },
  {
    // Krakelkopf. Er sitzt in der Ecke und läuft über den Blattrand hinaus:
    // Angeschnitten sieht eine Kritzelei gezeichnet aus, mittig und
    // vollständig sieht sie platziert aus.
    viewBox: '0 0 64 64',
    strokeWidth: 2.1,
    place: 'bottom-[3%] -left-[26px] w-[116px] rotate-[-4deg]',
    paths: [
      'M52 32a7.5 7.5 0 0 1-5 13.4 6.8 6.8 0 0 1-11.5 6.3 7.2 7.2 0 0 1-14.1-2.7 7 7 0 0 1-8.2-10.2 6.6 6.6 0 0 1 .6-13.8 7.4 7.4 0 0 1 8.2-10.3 7 7 0 0 1 14-2.7 7.2 7.2 0 0 1 11.3 7.1A6.9 6.9 0 0 1 52 32z',
      'M25 28v4.5',
      'M39 28v4.5',
      'M24 38c4 6 12 6 16 0',
    ],
  },
]

export function Room() {
  return (
    <div
      aria-hidden="true"
      data-testid="room"
      className="room-paper pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {DOODLES.map((doodle) => (
        <svg
          key={doodle.place}
          viewBox={doodle.viewBox}
          strokeWidth={doodle.strokeWidth}
          fill="none"
          stroke="var(--doodle)"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
          className={cn('absolute hidden lg:block', doodle.place)}
        >
          {doodle.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      ))}
    </div>
  )
}
