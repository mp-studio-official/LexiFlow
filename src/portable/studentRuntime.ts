/**
 * Woher die Lernlaufzeit kommt – und wann es sie nicht gibt.
 *
 * In der portablen Lehrkraftdatei ist die vollständige Lernlaufzeit als
 * Zeichenkette einkompiliert (virtuelles Modul, siehe `vite.portable.config.ts`).
 * Im normalen Web-/PWA-Build wäre das eine Verdopplung des Bündels für eine
 * Funktion, die dort niemand braucht – dort gibt es sie deshalb nicht, und die
 * Oberfläche sagt das, statt einen Knopf anzubieten, der nichts erzeugt.
 */

/** `true`, wenn dieser Build die Lernlaufzeit mitbringt. */
export const PORTABLE_BUILD: boolean =
  typeof __LEXIFLOW_PORTABLE__ === 'boolean' ? __LEXIFLOW_PORTABLE__ : false;

/**
 * Die Laufzeit als HTML-Zeichenkette – oder `undefined`.
 *
 * Der dynamische Import steht bewusst in einer Funktion: Im Web-Build wird das
 * virtuelle Modul nie angefasst, und der Bundler kann den Zweig entfernen.
 */
export async function loadStudentRuntime(): Promise<string | undefined> {
  if (!PORTABLE_BUILD) return undefined;
  const module = (await import('virtual:lexiflow-student-runtime')) as { default: string };
  return module.default;
}
