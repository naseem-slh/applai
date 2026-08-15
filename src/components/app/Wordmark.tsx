import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Der Schriftzug: „Applai" von Hand gezeichnet, das i ein Bleistift mit
 * Augen. Zeigt man darauf, erschrickt er.
 *
 * Das ist eine Spielerei und sonst nichts — sie hält niemanden auf und
 * verdeckt nichts. Sie steht hier, weil die Figur die Anwendung ist: eine
 * Bewerbung zu schreiben macht nervös, und das Werkzeug gibt zu, dass es das
 * auch ist.
 *
 * Drei Eigenheiten, die sich nicht von selbst ergeben:
 *
 * **1. Zwei Ruhefassungen.** Tinte auf hellem, Weiß auf dunklem Grund.
 * Umgeschaltet wird über die `dark:`-Variante aus `design.css`, die
 * Systemwahl *und* ausdrückliche Wahl bedient. Beide `<img>` tragen
 * `alt=""`; den Namen sagt die `sr-only`-Zeile daneben — zweimal „Applai"
 * wäre für Hilfsmittel nur Lärm.
 *
 * **2. Zentriert wird die Tinte, nicht der Rahmen.** Rechts im Bild stehen
 * 11,4 % leer (Platz für die ausschlagenden Arme des Bleistifts), links
 * 0,6 %. Zentriert man den Rahmen, sitzt der Schriftzug sichtbar links der
 * Mitte. Der negative Rand rechnet die Hälfte des Unterschieds heraus.
 *
 * **`max-width: 100%` zerstört das.** Es löst sich gegen die verkleinerte
 * Zelle auf und schrumpft die Marke; Mediengrößen werden deshalb
 * ausschließlich über `--breite` geregelt, nie über eine Höchstbreite.
 *
 * **3. Eine bewegte WebP-Datei lässt sich nicht zurückspulen.** Dieselbe
 * Quelle erneut zuzuweisen setzt den Lauf nicht zurück: Der Browser behält
 * die entschlüsselte Fassung und macht mitten im Lauf weiter. Eine frische
 * Objektadresse (`URL.createObjectURL`) zwingt ihn zu neuem Entschlüsseln,
 * und damit fängt die Bewegung wieder beim ersten Bild an. Geholt wird die
 * Datei trotzdem nur einmal; danach liegt sie als Klumpen bereit.
 *
 * **Im Ruhezustand hat das bewegte Bild keine Quelle.** Wer nie hinzeigt,
 * lädt die rund 875 KB nie. Das ist kein Feinschliff, sondern der Grund,
 * warum die Datei überhaupt vertretbar ist — und bei
 * `prefers-reduced-motion: reduce` wird sie gar nicht erst angefordert.
 *
 * **4. Der Zeiger geht, die Bewegung hört auf** — und blendet dabei ab.
 * Hinein wird nicht geblendet: Das erste Bild der Bewegung ist das Ruhebild,
 * der Wechsel ist ohnehin unsichtbar und soll sofort da sein. Heraus schon,
 * denn dort steht ein beliebiges Bild aus der Mitte des Laufs gegen die
 * Ruhefassung, und ein Schnitt dazwischen ist ein Zucken. Die Ruhefassung
 * kommt sofort zurück und die Bewegung verlöscht über ihr — so ist zu jedem
 * Zeitpunkt etwas Ganzes zu sehen.
 *
 * Auf dem Finger gibt es kein Weggehen; ein Tippen spielt deshalb genau
 * einen Lauf ab und hört von selbst auf.
 *
 * **5. Es reagiert nur die Tinte, nicht der Rahmen.** Rechts im Bild stehen
 * 11,4 % leer (siehe 2.) — bei 380px Marke sind das 43px, in denen nichts
 * zu sehen ist und die trotzdem zum Kasten gehören. Wer dort mit dem Zeiger
 * vorbeifährt, sieht die Marke erschrecken, ohne sie berührt zu haben. Die
 * empfindliche Fläche ist deshalb auf die ruhende Tinte zugeschnitten
 * (gemessen: 0,62 % bis 88,59 % der Breite). Dass die Arme im Lauf bis auf
 * 99,53 % ausschlagen, ändert daran nichts: Dorthin kommen sie erst, wenn
 * schon jemand hinzeigt, und wer ihnen hinterherfährt, zeigt eben weg.
 */

const RUHE_HELL = '/marke/logo-ruhe.webp'
const RUHE_DUNKEL = '/marke/logo-ruhe-hell.webp'
const SCHRECK_HELL = '/marke/logo-schreck.webp'
const SCHRECK_DUNKEL = '/marke/logo-schreck-hell.webp'

/**
 * Ein einzelner durchsichtiger Punkt, 43 Zeichen, kein Netzverkehr.
 *
 * Er ist die Quelle des bewegten Bildes, solange nichts läuft. Ein `<img>`
 * **ohne** Quelle ist nicht dasselbe wie eines mit einer leeren: Nimmt man
 * einem gerade ladenden Bild das `src`, meldet der Browser einen Fehler und
 * zeigt sein Zeichen für ein kaputtes Bild — und genau dieser Fall tritt
 * beim Wegzeigen ein, wenn die 875 KB noch unterwegs sind. Mit einem gültigen
 * Punkt gibt es diesen Zustand nicht.
 *
 * Am Holen ändert das nichts: Eine `data:`-Adresse fragt niemanden.
 */
const LEER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Maße der Bilddateien. Fest am `<img>`, damit die Kopfzeile nicht springt,
 *  bis die Datei eintrifft. */
const BREITE = 640
const HOEHE = 234

/** Ein Zyklus der bewegten Datei, in Millisekunden. Nachgemessen an
 *  `logo-schreck.webp`: 64 Bilder, zusammen 3000 ms, Wiederholung ohne Ende.
 *  Ändert sich die Datei, ändert sich diese Zahl mit. */
const LAUF_DAUER = 3000

/** Wie lange die Bewegung abblendet. Muss zur Klasse am Bild passen — die
 *  Datei wird erst freigegeben, wenn die Blende durch ist; nähme man sie
 *  vorher weg, bliebe von der Blende ein Schnitt. */
const BLENDE_DAUER = 200

/** Ein Wimpernschlag Zugabe. Unsere Uhr und die des Bilddekoders laufen
 *  nicht auf denselben Millisekundenwert. Ein paar Bilder zu spät anzuhalten
 *  sieht niemand — die ersten Bilder des nächsten Zyklus sind das Ruhebild.
 *  Ein paar Bilder zu früh wäre genau der Abbruch, der hier vermieden wird. */
const NACHLAUF_PUFFER = 80

/** Einmal geholt, dann als Klumpen bereit. Absichtlich außerhalb der
 *  Komponente: Die Marke steht auf jeder Seite, und über einen Seitenwechsel
 *  hinweg soll die Datei nicht ein zweites Mal geholt werden. */
const klumpen = new Map<string, Promise<Blob>>()
let zaehler = 0

function alsKlumpen(quelle: string): Promise<Blob> {
  const vorhanden = klumpen.get(quelle)
  if (vorhanden !== undefined) return vorhanden
  const geholt = fetch(quelle).then((antwort) => antwort.blob())
  klumpen.set(quelle, geholt)
  return geholt
}

function frischeAdresse(quelle: string): Promise<string> {
  return alsKlumpen(quelle)
    .then((daten) => URL.createObjectURL(daten))
    .catch(() => {
      // Schlägt das Holen fehl, tut es ein veränderter Adresszusatz: Auch er
      // erzwingt neues Entschlüsseln und damit den Lauf von vorn.
      klumpen.delete(quelle)
      zaehler += 1
      return `${quelle}?n=${zaehler}`
    })
}

function freigeben(adresse: string | null): void {
  if (adresse !== null && adresse.startsWith('blob:')) URL.revokeObjectURL(adresse)
}

/** Hell oder dunkel — dieselbe Antwort für Systemwahl und ausdrückliche
 *  Wahl, weil beide `color-scheme` setzen (siehe design.css). */
function istDunkel(): boolean {
  return getComputedStyle(document.documentElement).colorScheme.trim() === 'dark'
}

function willKeineBewegung(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface WordmarkProps {
  /**
   * Die Breite steuert alles: Der Ausgleich für die leere Fläche rechts
   * rechnet sich daraus. Sie kommt als Klasse (`[--breite:400px]`) und nicht
   * als Stilwert — nur so lässt sie sich in einer Medienabfrage
   * übersteuern; ein Stilwert am Element gewönne gegen jede Klasse. Vorgabe
   * sind 200px, das Maß der Unterseiten.
   */
  className?: string
}

export function Wordmark({ className }: WordmarkProps) {
  const { t } = useTranslation()
  const animRef = useRef<HTMLImageElement>(null)
  const zeigtHin = useRef(false)
  const laufendeAdresse = useRef<string | null>(null)
  const nachlaufUhr = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blendUhr = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Wann das erste Bild stand. `0` heißt: Es ist noch nichts zu sehen. */
  const startZeit = useRef(0)
  /** Ein Tipp hat keinen Zeiger, der wieder weggeht — er hält sich selbst an,
   *  sobald der Lauf angefangen hat. Für die Maus gibt es das nicht: Dort
   *  endet die Bewegung mit dem Zeiger. */
  const nurEinmal = useRef(false)
  const [laeuft, setLaeuft] = useState(false)

  /** Die Datei aus der Hand geben. Erst den Punkt, dann freigeben:
   *  Andersherum zeigte das Bild für einen Wimpernschlag auf eine Adresse,
   *  die es nicht mehr gibt. */
  const ablegen = useCallback(() => {
    if (blendUhr.current !== null) {
      clearTimeout(blendUhr.current)
      blendUhr.current = null
    }
    startZeit.current = 0
    if (animRef.current !== null) animRef.current.src = LEER
    freigeben(laufendeAdresse.current)
    laufendeAdresse.current = null
  }, [])

  const anhalten = useCallback(
    (sofort: boolean) => {
      zeigtHin.current = false
      nurEinmal.current = false
      if (nachlaufUhr.current !== null) {
        clearTimeout(nachlaufUhr.current)
        nachlaufUhr.current = null
      }
      setLaeuft(false)
      if (sofort) {
        ablegen()
        return
      }
      // Die Datei bleibt, solange die Blende läuft — sie ist ja das, was
      // abgeblendet wird.
      if (blendUhr.current !== null) clearTimeout(blendUhr.current)
      blendUhr.current = setTimeout(ablegen, BLENDE_DAUER)
    },
    [ablegen],
  )

  const beruhigen = useCallback(() => anhalten(false), [anhalten])
  const abbrechen = useCallback(() => anhalten(true), [anhalten])

  /** Anhalten, wenn der laufende Zyklus durch ist — nicht jetzt. */
  const amZyklusendeAnhalten = useCallback(() => {
    if (nachlaufUhr.current !== null) clearTimeout(nachlaufUhr.current)
    const gelaufen = Date.now() - startZeit.current
    const rest = LAUF_DAUER - (gelaufen % LAUF_DAUER) + NACHLAUF_PUFFER
    nachlaufUhr.current = setTimeout(beruhigen, rest)
  }, [beruhigen])

  const erschrecken = useCallback(() => {
    if (willKeineBewegung()) return
    // Eine noch laufende Blende ist keine Ruhe: Die Datei liegt noch da,
    // und der Lauf geht weiter. Wer zurückkommt, sieht ihn wieder.
    if (blendUhr.current !== null) {
      clearTimeout(blendUhr.current)
      blendUhr.current = null
    }
    // Ein zweiter Tipp auf einen schon laufenden Lauf beginnt ihn nicht neu
    // — er verlängert ihn nur um den angefangenen Zyklus (siehe unten).
    if (zeigtHin.current) {
      if (nachlaufUhr.current !== null) {
        clearTimeout(nachlaufUhr.current)
        nachlaufUhr.current = null
      }
      nurEinmal.current = false
      return
    }
    zeigtHin.current = true
    const quelle = istDunkel() ? SCHRECK_DUNKEL : SCHRECK_HELL
    void frischeAdresse(quelle).then((adresse) => {
      const bild = animRef.current
      if (!zeigtHin.current || bild === null) {
        freigeben(adresse)
        return
      }
      freigeben(laufendeAdresse.current)
      laufendeAdresse.current = adresse
      bild.src = adresse
      // Erst zeigen, wenn das erste Bild steht — sonst blitzt für einen
      // Rahmen die leere Fläche über der Ruhefassung auf.
      const zeigen = () => {
        if (!zeigtHin.current) return
        startZeit.current = Date.now()
        setLaeuft(true)
        if (nurEinmal.current) amZyklusendeAnhalten()
      }
      if (typeof bild.decode === 'function') void bild.decode().then(zeigen, zeigen)
      else bild.onload = zeigen
    })
  }, [amZyklusendeAnhalten])

  // Nichts läuft weiter, wenn niemand hinsieht. Beim Aushängen dasselbe:
  // Eine Objektadresse, die niemand mehr freigibt, hält die Datei im
  // Speicher fest.
  useEffect(() => {
    const beiWechsel = () => {
      if (document.hidden) abbrechen()
    }
    document.addEventListener('visibilitychange', beiWechsel)
    return () => {
      document.removeEventListener('visibilitychange', beiWechsel)
      abbrechen()
    }
  }, [abbrechen])

  return (
    <div
      data-testid="wordmark"
      className={cn(
        // `leading-[0]` nimmt der Zeile ihren Durchschuss: Der Kasten soll so
        // hoch sein wie das Bild und keinen Pixel höher.
        'relative [--breite:200px] w-[var(--breite)] leading-[0]',
        // Der Ausgleich für die 11,4 % leere Fläche rechts (siehe oben).
        'mr-[calc(var(--breite)*-0.1078)]',
        className,
      )}
    >
      <span className="sr-only">{t('app.name')}</span>
      <img
        src={RUHE_HELL}
        alt=""
        width={BREITE}
        height={HOEHE}
        className={cn('block h-auto w-full dark:hidden', laeuft && 'opacity-0')}
      />
      <img
        src={RUHE_DUNKEL}
        alt=""
        width={BREITE}
        height={HOEHE}
        className={cn('hidden h-auto w-full dark:block', laeuft && 'opacity-0')}
      />
      {/* Im Ruhezustand steht hier ein durchsichtiger Punkt und keine Datei
          — siehe oben.

          **Die Blende geht nur in eine Richtung.** Hinein sofort: Ruhebild
          und erstes Bild der Bewegung sind Punkt für Punkt gleich, der
          Wechsel ist unsichtbar und soll nicht warten. Heraus über
          `BLENDE_DAUER`, weil dort ein beliebiges Bild aus der Mitte des
          Laufs steht. Die Ruhefassung darunter kommt ohne Blende zurück, also
          ist immer etwas Ganzes zu sehen. */}
      <img
        ref={animRef}
        src={LEER}
        alt=""
        width={BREITE}
        height={HOEHE}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 h-auto w-full transition-opacity ease-out',
          laeuft ? 'opacity-100 duration-0' : 'opacity-0 duration-200',
        )}
      />

      {/* Die empfindliche Fläche: die ruhende Tinte, nicht der Kasten (siehe
          5. oben). Sie liegt zuoberst, damit sie den Zeiger bekommt, und ist
          für Hilfsmittel nicht da — sie trägt nichts, was man lesen oder
          bedienen könnte. */}
      <span
        aria-hidden="true"
        data-marke-flaeche=""
        className="absolute inset-y-0 right-[11.41%] left-[0.62%]"
        onPointerEnter={(ereignis) => {
          if (ereignis.pointerType !== 'touch') erschrecken()
        }}
        onPointerLeave={beruhigen}
        onPointerDown={(ereignis) => {
          if (ereignis.pointerType !== 'touch') return
          erschrecken()
          // Läuft schon etwas, endet es am Zyklusschluss; steht noch nichts,
          // merkt sich der Lauf, dass er nur einmal durchgehen soll.
          if (startZeit.current !== 0) amZyklusendeAnhalten()
          else nurEinmal.current = true
        }}
      />
    </div>
  )
}
