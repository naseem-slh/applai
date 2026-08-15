/**
 * Test-Hilfsfunktion: baut ein Objekt, das die von `gemini.ts`/`openai.ts`/
 * `anthropic.ts` tatsächlich genutzte Teilmenge von `Response` erfüllt
 * (`ok`, `status`, `headers.get()`, `json()`), ohne von der jeweiligen
 * Testumgebung abzuhängen.
 *
 * Fix-Runde 1, Minor: vorher Zeichen für Zeichen dreifach dupliziert in
 * `anthropic.test.ts`, `gemini.test.ts` und `openai.test.ts` — jetzt eine
 * Stelle. Bewusst **keine** `.test.ts`-Endung: mehrere Testdateien sollen
 * importieren können, eine echte Testdatei mit dieser Endung würde Vitest
 * dagegen als (leere) Testdatei einsammeln. Läuft unter tsconfig.app.json
 * mit, bleibt dort aber folgenlos — kein Produktionscode importiert von
 * hier, die Datei landet nie im ausgelieferten Bundle.
 */
export function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const headerEntries = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerEntries.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Response
}
