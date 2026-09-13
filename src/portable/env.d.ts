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

declare module 'virtual:lexiflow-student-runtime' {
  const html: string;
  export default html;
}
