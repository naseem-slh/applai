import { useCallback, useMemo, useRef, useState } from 'react'
import type { DocxDocument } from '@/lib/docx/model'
import {
  isExportBlocked,
  locateClaims,
  normalizeClaim,
  type LocatedClaim,
  type UnbackedClaim,
} from './unbackedClaims'

/**
 * Der Zustand der unbelegten Aussagen des freien Modus — die Einzel-
 * bestätigung und die Exportsperre aus G10.
 *
 * Die Rechenarbeit steht in `unbackedClaims.ts` und kennt kein React; hier
 * steht nur, was sich merkt und was daraus abgeleitet wird.
 *
 * **Was gemerkt wird, ist der Wortlaut samt Bestätigung — nicht die
 * Fundstelle.** Wo die Aussage steht, wird bei jedem Dokumentstand neu
 * nachgeschlagen (Begründung im Kopf von `unbackedClaims.ts`).
 *
 * **Nichts wird vergessen, auch nicht das Verschwundene.** Eine Aussage, die
 * gerade nicht im Dokument steht, bleibt in der Liste, sie wird nur nicht
 * mehr gefunden. Das ist der Unterschied zwischen einer Sperre, die
 * Rückgängig übersteht, und einer, die es nicht tut: Wer eine Übernahme mit
 * Strg+Z zurücknimmt und danach erneut ausführt, hätte sonst einen
 * erfundenen Satz im Brief, den niemand mehr markiert. Die Liste wächst
 * dabei nur um die Aussagen, die das Modell überhaupt gemeldet hat — im
 * freien Modus einige wenige je Umformulierung.
 *
 * **Eine bereits bestätigte Aussage bleibt bestätigt**, auch wenn eine
 * spätere Variante denselben Satz erneut liefert. Bestätigt wird die
 * Aussage („ja, das stimmt so"), nicht die Textstelle; sie ein zweites Mal
 * einzuholen wäre eine Rückfrage ohne neue Information.
 */

export interface UnbackedClaimsHandle {
  /** Die Aussagen, die im aktuellen Dokumentstand tatsächlich stehen. */
  located: LocatedClaim[]
  /** Davon die unbestätigten — sie sperren den Export. */
  pending: LocatedClaim[]
  /** Absätze, in denen unbestätigte Aussagen stehen (für die Hervorhebung). */
  pendingParagraphs: number[]
  /** Die Sperre selbst: `true`, solange eine unbestätigte Aussage dasteht. */
  exportBlocked: boolean
  /** Meldet die Aussagen einer übernommenen Variante an. */
  add: (texts: readonly string[]) => void
  confirm: (id: string) => void
}

export function useUnbackedClaims(document: DocxDocument | null): UnbackedClaimsHandle {
  const [claims, setClaims] = useState<UnbackedClaim[]>([])
  // Fortlaufend statt zufällig: Die Kennung muss nur innerhalb dieser
  // Sitzung eindeutig sein, und ein Zähler ist im Test nachvollziehbar.
  const nextId = useRef(0)

  const add = useCallback((texts: readonly string[]) => {
    if (texts.length === 0) return
    setClaims((current) => {
      const known = new Set(current.map((claim) => normalizeClaim(claim.text)))
      const added: UnbackedClaim[] = []
      for (const text of texts) {
        const normalized = normalizeClaim(text)
        // Leere Aussagen kann es nach der Zod-Grenze aus Aufgabe 11 nicht
        // geben (`z.string().min(1)`); eine, die nur aus Leerraum besteht,
        // wäre nie auffindbar und damit eine Sperre ohne Fundstelle.
        if (normalized === '' || known.has(normalized)) continue
        known.add(normalized)
        added.push({ id: `claim-${nextId.current++}`, text, confirmed: false })
      }
      return added.length === 0 ? current : [...current, ...added]
    })
  }, [])

  const confirm = useCallback((id: string) => {
    setClaims((current) =>
      current.map((claim) => (claim.id === id ? { ...claim, confirmed: true } : claim)),
    )
  }, [])

  return useMemo(() => {
    const located = locateClaims(document, claims)
    const pending = located.filter((claim) => !claim.confirmed)
    return {
      located,
      pending,
      pendingParagraphs: [...new Set(pending.flatMap((claim) => claim.paragraphs))].sort(
        (a, b) => a - b,
      ),
      exportBlocked: isExportBlocked(located),
      add,
      confirm,
    }
  }, [document, claims, add, confirm])
}
