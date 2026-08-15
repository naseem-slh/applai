/**
 * Synthetische Stellenanzeigen-Fixtures für `language.test.ts` und
 * `jobAd.test.ts`. Bewusst frei erfunden — keine echte Firma, keine echte
 * Stellenanzeige (siehe Aufgabenstellung). Keine `.test.ts`-Endung: mehrere
 * Testdateien importieren dieselben Fixtures, eine echte Testdatei mit
 * dieser Endung würde Vitest sonst als (leere) Testdatei einsammeln (siehe
 * `mockFetchResponse.ts` für dasselbe Muster).
 */

/**
 * Deutsche Stellenanzeige mit Firma, Position, Ansprechpartner (mit Titel)
 * und eindeutigen Anforderungen — der "Alles vorhanden"-Regelfall für
 * `jobAd.test.ts`.
 */
export const GERMAN_JOB_AD_FIXTURE = `Stellenanzeige: Senior Frontend-Entwicklerin / Senior Frontend-Entwickler (m/w/d)

Die Musterwerk Solutions GmbH mit Sitz in Leipzig entwickelt seit über
15 Jahren Softwarelösungen für den Mittelstand. Zur Verstärkung unseres
Teams suchen wir zum nächstmöglichen Zeitpunkt eine erfahrene
Frontend-Entwicklerin oder einen erfahrenen Frontend-Entwickler.

Deine Aufgaben:
- Weiterentwicklung unserer webbasierten Plattform mit React und TypeScript
- Enge Zusammenarbeit mit unserem Produktteam in agilen Sprints
- Code-Reviews und Mentoring jüngerer Teammitglieder

Dein Profil:
- Mindestens 4 Jahre Berufserfahrung in der Frontend-Entwicklung
- Sehr gute Kenntnisse in React, TypeScript und modernen Build-Werkzeugen
- Abgeschlossenes Studium der Informatik oder eine vergleichbare Ausbildung
- Verhandlungssichere Deutschkenntnisse, gute Englischkenntnisse
- Teamfähigkeit und eine strukturierte, selbstständige Arbeitsweise

Wir bieten ein kollegiales, unkompliziertes Umfeld, flexible Arbeitszeiten
und die Möglichkeit zum mobilen Arbeiten. Bei uns duzen sich alle, vom
Praktikanten bis zur Geschäftsführung.

Bei Fragen wende dich gerne an unseren Personalleiter, Herrn Dr. Thomas
Weber, unter bewerbung@musterwerk-solutions.example.

Wir freuen uns auf deine Bewerbung!`

/**
 * Deutsche Stellenanzeige, grammatisch eindeutig deutsch, aber gespickt mit
 * englischen Fach-/Lehnwörtern — der in der Aufgabenstellung genannte
 * Härtefall für die Stoppwort-Zählung (siehe `language.ts`). Absichtlich
 * ohne Firma/Ansprechpartner, weil sie in `language.test.ts` ausschließlich
 * für `detectLanguage` gebraucht wird.
 */
export const GERMAN_JOB_AD_ENGLISH_TERMS_FIXTURE = `Wir suchen ab sofort einen Cloud Engineer (m/w/d) für unser Platform Team
in Berlin.

Deine Aufgaben:
- Betrieb und Weiterentwicklung unserer Kubernetes-Cluster im
  Cloud-Native-Umfeld
- Aufbau von CI/CD-Pipelines mit GitHub Actions und Terraform
- Enge Zusammenarbeit mit den Teams für Backend, Frontend und Product
  Management in wöchentlichen Sprints
- Monitoring, Logging und Incident Response für unsere Microservices

Dein Profil:
- Mehrjährige Erfahrung mit Docker, Kubernetes und Infrastructure as Code
- Kenntnisse in Cloud-Plattformen wie AWS, Azure oder Google Cloud Platform
- Vertrautheit mit agilen Methoden wie Scrum oder Kanban
- Gute Deutsch- und Englischkenntnisse

Wir bieten dir ein modernes Mindset, flache Hierarchien und ein
großzügiges Learning-Budget für Konferenzen und Zertifizierungen.`

/**
 * Englische Stellenanzeige mit Firma, Position und Ansprechpartnerin — das
 * englische Gegenstück zu {@link GERMAN_JOB_AD_FIXTURE}.
 */
export const ENGLISH_JOB_AD_FIXTURE = `Job Posting: Senior Backend Engineer

Brightleaf Analytics Inc., based in Austin, Texas, builds data
infrastructure for logistics companies across North America. We are
looking for a Senior Backend Engineer to join our growing platform team.

Responsibilities:
- Design and maintain scalable services in Go and PostgreSQL
- Collaborate closely with our data science team on pipeline architecture
- Participate in on-call rotation and incident response
- Mentor junior engineers through code review and pairing

Requirements:
- 5+ years of professional backend development experience
- Strong knowledge of distributed systems and relational databases
- Bachelor's degree in Computer Science or equivalent practical experience
- Fluent written and spoken English
- Comfortable working in a fast-paced, collaborative environment

We offer a flexible remote-friendly culture, competitive salary, and a
learning budget for conferences and certifications.

Please direct any questions to our recruiting lead, Ms. Sarah Connolly, at
careers@brightleaf-analytics.example.`

/**
 * Stellenanzeige ganz ohne Firmenname, Positionstitel oder
 * Ansprechpartner — deckt den G10-Kernfall ab: alle drei Felder müssen
 * `null` werden, nichts darf geraten sein.
 */
export const ANONYMOUS_JOB_AD_FIXTURE = `Wir sind ein wachsendes Unternehmen aus der Logistikbranche und suchen
Verstärkung im Bereich Buchhaltung.

Aufgaben:
- Vorbereitende Buchhaltung und Rechnungsprüfung
- Unterstützung beim Monatsabschluss
- Kommunikation mit Lieferanten und Dienstleistern

Profil:
- Abgeschlossene kaufmännische Ausbildung
- Erste Erfahrung in der Buchhaltung von Vorteil
- Sicherer Umgang mit gängiger Buchhaltungssoftware

Wir freuen uns auf Ihre Bewerbung per Post an unser Postfach.`
