import { useEffect, useState } from 'react'

/**
 * Gilt diese Medienabfrage gerade?
 *
 * **Wann eine Abfrage nach JavaScript gehört und wann in eine Klasse.** Eine
 * `md:`-Klasse blendet aus, was trotzdem im Aufbau stehen bleibt — für Zier
 * und für Umbrüche ist das richtig und billiger. Hierher gehört eine Abfrage
 * erst, wenn an ihr hängt, **welches** Element es überhaupt gibt: Zwei
 * Fassungen desselben Angebots, von denen die Klasse die eine verbirgt,
 * stehen beide im Baum und tragen beide denselben Namen. Für Vorlesesoftware
 * ist das in Ordnung (`display: none` nimmt sie aus dem Baum), für jede
 * Abfrage danach nicht.
 *
 * Kennt der Browser `matchMedia` nicht (jsdom im Test), gilt die Abfrage als
 * erfüllt — das ist der Zustand, in dem alles sichtbar ist.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesNow(query))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const handle = (event: MediaQueryListEvent) => setMatches(event.matches)
    media.addEventListener('change', handle)
    return () => media.removeEventListener('change', handle)
  }, [query])

  return matches
}

function matchesNow(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(query).matches
}
