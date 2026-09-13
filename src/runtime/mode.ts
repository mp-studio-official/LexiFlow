/**
 * In welcher Gestalt läuft diese Anwendung gerade?
 *
 * ## Warum das ein benannter Modus ist und keine Sammlung von Abfragen
 *
 * Dieselbe Quelltextbasis wird auf drei Arten ausgeliefert, und die
 * Unterschiede sind keine Feinheiten: Die eine hat ein Backend, die anderen
 * dürfen keines haben. Wer diese Entscheidung über hundert Dateien verteilt –
 * hier ein `import.meta.env`, dort ein `typeof window` –, kann hinterher nicht
 * mehr beantworten, was in einer ausgelieferten Datei tatsächlich steckt.
 *
 * Mit einem benannten Modus lässt sich die Frage am Bündel prüfen: Wenn der
 * Cloudzweig nur unter `hosted` importiert wird, fehlt er in den anderen
 * beiden – und ein Artefakttest kann das nachweisen, statt es zu behaupten.
 *
 * ## Die drei Modi
 *
 * | Modus | Datei | Backend | Konten |
 * | --- | --- | --- | --- |
 * | `portable-teacher` | `LexiFlow-Lehrkraft.html` | keines | keine |
 * | `portable-learner` | eine Lerndatei | keines | keine |
 * | `hosted` | das Webportal | Supabase | ja |
 *
 * ## Warum das zur Bauzeit entschieden wird
 *
 * `__LEXIFLOW_PORTABLE__` und `__LEXIFLOW_LEARNER__` sind `define`-Werte aus
 * den Vite-Konfigurationen. Der Bündler ersetzt sie durch Literale und wirft
 * die toten Zweige weg. Eine Prüfung zur Laufzeit – etwa auf das
 * Protokoll `file:` – täte das nicht: Der Code beider Zweige läge trotzdem in
 * der Datei, und genau das soll er nicht.
 *
 * Die Lerndatei setzt dabei **nur** `__LEXIFLOW_LEARNER__`. Der Grund steht in
 * `src/portable/env.d.ts`: `__LEXIFLOW_PORTABLE__` heißt „dieser Build trägt
 * die Lernlaufzeit bei sich“, und die Lerndatei ist sie. Deshalb prüft
 * `resolveRuntimeMode` die Lernfahne zuerst.
 */

export const RUNTIME_MODES = ['portable-teacher', 'portable-learner', 'hosted'] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export const RUNTIME_MODE_LABELS: Readonly<Record<RuntimeMode, string>> = {
  'portable-teacher': 'Lehrkraftdatei (ohne Backend)',
  'portable-learner': 'Lerndatei (ohne Backend)',
  hosted: 'Webportal',
};

/**
 * Die Rohwerte aus dem Build – als Parameter, damit sie prüfbar sind.
 *
 * In der Anwendung ruft niemand diese Funktion mit Argumenten auf; sie liest
 * dann die `define`-Werte. Im Test lässt sich jede Kombination durchspielen,
 * ohne den Bündler zu bemühen.
 */
export function resolveRuntimeMode(flags: {
  portable: boolean;
  learner: boolean;
}): RuntimeMode {
  /*
    Die Reihenfolge ist nicht beliebig. Die Lerndatei ist der engste Fall und
    wird zuerst erkannt: Sollte je ein Build beide Fahnen setzen, ist das
    Ergebnis die restriktivere Gestalt und nicht die großzügigere. Ein Fehler
    in der Konfiguration führt damit zu weniger Funktionen, nie zu mehr.
  */
  if (flags.learner) return 'portable-learner';
  if (flags.portable) return 'portable-teacher';
  return 'hosted';
}

/*
  `typeof` und nicht der nackte Bezeichner: Unter Vitest und im Dev-Server
  ist keiner der beiden `define`-Werte gesetzt, und ein nackter Zugriff auf
  eine nicht deklarierte Variable wäre dort ein `ReferenceError` beim ersten
  Import. `typeof` ist der eine Ausdruck in JavaScript, der auf einen
  unbekannten Bezeichner angewendet werden darf.
*/
const PORTABLE_FLAG = typeof __LEXIFLOW_PORTABLE__ === 'boolean' ? __LEXIFLOW_PORTABLE__ : false;
const LEARNER_FLAG = typeof __LEXIFLOW_LEARNER__ === 'boolean' ? __LEXIFLOW_LEARNER__ : false;

/**
 * Der Modus dieses Builds.
 *
 * Eine Konstante und keine Funktion: Sie steht beim Bündeln fest, und ein
 * `const` lässt sich zuverlässiger wegoptimieren als ein Aufruf.
 *
 * Ohne gesetzte Fahnen – Vitest, `vite dev` – ist das Ergebnis `hosted`. Das
 * ist richtig herum: Die Entwicklung am Portal ist der Fall, in dem nichts
 * konfiguriert ist, und die portablen Dateien setzen ihre Fahne beim Bauen
 * ausdrücklich.
 */
export const RUNTIME_MODE: RuntimeMode = resolveRuntimeMode({
  portable: PORTABLE_FLAG,
  learner: LEARNER_FLAG,
});

/** Läuft diese Anwendung ohne Backend? Beide portablen Gestalten tun das. */
export function isPortableMode(mode: RuntimeMode = RUNTIME_MODE): boolean {
  return mode === 'portable-teacher' || mode === 'portable-learner';
}

/**
 * Darf dieser Modus überhaupt eine Verbindung zu Supabase aufbauen?
 *
 * Die Frage wird an genau einer Stelle beantwortet, und `createSupabaseClient`
 * fragt sie, bevor er irgendetwas tut. Ein portables Bündel, das durch einen
 * Importfehler doch den Cloudzweig enthielte, käme damit trotzdem nicht ins
 * Netz – ein zweiter Riegel hinter dem Bündler.
 */
export function mayUseBackend(mode: RuntimeMode = RUNTIME_MODE): boolean {
  return mode === 'hosted';
}

/**
 * Gibt es in diesem Modus einen Lehrkraftbereich?
 *
 * In der Lerndatei nicht – und zwar nicht, weil er versteckt wäre, sondern
 * weil `StudentApp` ihn nicht importiert.
 */
export function hasTeacherArea(mode: RuntimeMode = RUNTIME_MODE): boolean {
  return mode !== 'portable-learner';
}
