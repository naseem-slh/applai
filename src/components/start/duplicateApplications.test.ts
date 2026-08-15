import { describe, expect, it } from 'vitest'
import type { Application } from '@/lib/storage/adapter'
import { findDuplicateApplications } from './duplicateApplications'

function application(company: string, position = 'Entwicklerin'): Application {
  return { id: `${company}-${position}`, company, position, date: '2026-07-01' }
}

describe('findDuplicateApplications', () => {
  it('findet eine Bewerbung, deren Firma in der Anzeige vorkommt', () => {
    const applications = [application('Nordwerk Systeme'), application('Talvi Robotik')]

    const found = findDuplicateApplications(
      'Die Nordwerk Systeme GmbH sucht zum nächstmöglichen Zeitpunkt Verstärkung.',
      applications,
    )

    expect(found.map((entry) => entry.company)).toEqual(['Nordwerk Systeme'])
  })

  it('achtet nicht auf Groß- und Kleinschreibung', () => {
    const found = findDuplicateApplications('bewirb dich bei nordwerk systeme', [
      application('Nordwerk Systeme'),
    ])

    expect(found).toHaveLength(1)
  })

  it('trifft nur ganze Wörter', () => {
    // Sonst meldete eine Bewerbung bei „Ada" jede Anzeige, in der das Wort
    // „Adaption" vorkommt.
    const found = findDuplicateApplications('Wir suchen Erfahrung in der Adaption von Systemen.', [
      application('Ada'),
    ])

    expect(found).toEqual([])
  })

  it('liefert bei leerem Anzeigentext nichts', () => {
    expect(findDuplicateApplications('   ', [application('Nordwerk Systeme')])).toEqual([])
  })

  it('meldet jede betroffene Bewerbung, nicht nur die erste', () => {
    const found = findDuplicateApplications('Nordwerk Systeme und Talvi Robotik kooperieren.', [
      application('Nordwerk Systeme', 'Entwicklerin'),
      application('Nordwerk Systeme', 'Teamleitung'),
      application('Talvi Robotik'),
    ])

    expect(found).toHaveLength(3)
  })

  it('lässt Sonderzeichen im Firmennamen unbeschadet', () => {
    // Ohne Maskierung läse ein regulärer Ausdruck das „+" als Quantifizierer.
    const found = findDuplicateApplications('Bewerbung bei Küppers + Partner erwünscht.', [
      application('Küppers + Partner'),
    ])

    expect(found).toHaveLength(1)
  })
})
