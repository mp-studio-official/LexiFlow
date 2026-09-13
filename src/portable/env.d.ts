/** Zur Bauzeit gesetzte Kennzeichnung der portablen Lehrkraftdatei. */
declare const __LEXIFLOW_PORTABLE__: boolean;

/**
 * Zur Bauzeit gesetzte Kennzeichnung der Lernlaufzeit.
 *
 * Absichtlich eine **zweite** Fahne und kein Wert `'teacher' | 'learner'`:
 * `__LEXIFLOW_PORTABLE__` bedeutet seit Sprint 3 „dieser Build trägt die
 * Lernlaufzeit als Zeichenkette bei sich“, und das ist in der Lerndatei
 * gerade **nicht** der Fall – sie *ist* die Laufzeit. Die beiden Fragen
 * zusammenzulegen hieße, entweder die eine Bedeutung zu verbiegen oder in
 * `vite.student.config.ts` ein virtuelles Modul aufzulösen, das dort nicht
 * existiert. Zwei Fahnen, zwei Bedeutungen; `src/runtime/mode.ts` setzt sie
 * an genau einer Stelle zu einem Modus zusammen.
 */
declare const __LEXIFLOW_LEARNER__: boolean;

/**
 * Zur Bauzeit gesetzte Kennzeichnung des Portals.
 *
 * Seit Phase 3 gibt es zwei Web-Builds aus demselben Quellbaum: die
 * kontofreie PWA unter `/LexiFlow/` und das Portal unter `/LexiFlow/portal/`.
 * `define` gilt je Build und nicht je Einstiegspunkt – deshalb hat das Portal
 * eine eigene Vite-Konfiguration, und deshalb muss es sich ausdrücklich zu
 * erkennen geben. Ohne diese Fahne ist der Web-Build `web-solo`, also ohne
 * Backend. Der Standard liegt damit auf der sicheren Seite.
 */
declare const __LEXIFLOW_PORTAL__: boolean;

/**
 * Trägt dieser Build die kontrollierte Fälschung überhaupt mit?
 *
 * Der Befund aus Phase 8: Eine Laufzeitabfrage (`VITE_LEXIFLOW_FAKE_CLOUD`)
 * entscheidet, ob die Fälschung **benutzt** wird – sie entscheidet nicht, ob
 * sie **ausgeliefert** wird. Ein gewöhnlicher Import brachte damit die
 * erfundenen Konten samt `testkennwort` in jede Auslieferung.
 *
 * Diese Fahne ist die strukturelle Antwort, und es ist dieselbe wie bei
 * ADR-10: Was `false` ist, faltet der Bundler weg, und dann gibt es den Zweig
 * nicht mehr. Die Zusage hängt an einem Import und nicht an einer Bedingung.
 *
 * Fehlt sie (in Prüfungen), gilt `true` – dort soll die Fälschung erreichbar
 * sein, und dort wird nichts ausgeliefert.
 */
declare const __LEXIFLOW_FAKE_CLOUD__: boolean;

declare module 'virtual:lexiflow-student-runtime' {
  const html: string;
  export default html;
}
