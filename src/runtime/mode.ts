/**
 * In welcher Gestalt läuft diese Anwendung gerade?
 *
 * ## Warum das ein benannter Modus ist und keine Sammlung von Abfragen
 *
 * Dieselbe Quelltextbasis wird auf vier Arten ausgeliefert, und die
 * Unterschiede sind keine Feinheiten: Eine hat ein Backend, die anderen drei
 * dürfen keines haben. Wer diese Entscheidung über hundert Dateien verteilt –
 * hier ein `import.meta.env`, dort ein `typeof window` –, kann hinterher nicht
 * mehr beantworten, was in einer ausgelieferten Datei tatsächlich steckt.
 *
 * Mit einem benannten Modus lässt sich die Frage am Bündel prüfen: Wenn der
 * Cloudzweig nur unter `hosted` importiert wird, fehlt er in den anderen
 * dreien – und ein Test am Importgraph kann das nachweisen, statt es zu
 * behaupten (`portableIsolation.test.ts`).
 *
 * ## Die vier Modi
 *
 * | Modus | Auslieferung | Backend | Konten |
 * | --- | --- | --- | --- |
 * | `portable-teacher` | `LexiFlow-Lehrkraft.html` | keines | keine |
 * | `portable-learner` | eine Lerndatei | keines | keine |
 * | `web-solo` | die PWA unter `/LexiFlow/` | keines | keine |
 * | `hosted` | das Portal unter `/LexiFlow/portal/` | Supabase | ja |
 *
 * `web-solo` kam in Phase 3 dazu, und sein Fehlen vorher war ein Fehler:
 * Solange es nur einen Web-Build gab, galt „kein Flag gesetzt“ als `hosted` –
 * und damit hätte die kontofreie PWA ein Backend benutzen dürfen. Jetzt ist
 * der Standard ohne Flag der **engste** Web-Fall, und das Portal muss sich
 * ausdrücklich als solches zu erkennen geben.
 *
 * ## Warum das zur Bauzeit entschieden wird
 *
 * `__LEXIFLOW_PORTABLE__`, `__LEXIFLOW_LEARNER__` und `__LEXIFLOW_PORTAL__`
 * sind `define`-Werte aus den Vite-Konfigurationen. Der Bündler ersetzt sie
 * durch Literale und wirft die toten Zweige weg. Eine Prüfung zur Laufzeit –
 * etwa auf das Protokoll `file:` oder auf den Pfad `/portal/` – täte das
 * nicht: Der Code aller Zweige läge trotzdem in der Datei, und genau das soll
 * er nicht.
 *
 * Je Gestalt eine eigene Vite-Konfiguration; anders ginge es auch nicht, denn
 * `define` gilt für einen ganzen Build und nicht je Einstiegspunkt.
 *
 * Die Lerndatei setzt dabei **nur** `__LEXIFLOW_LEARNER__`. Der Grund steht in
 * `src/portable/env.d.ts`: `__LEXIFLOW_PORTABLE__` heißt „dieser Build trägt
 * die Lernlaufzeit bei sich“, und die Lerndatei ist sie. Deshalb prüft
 * `resolveRuntimeMode` die Lernfahne zuerst.
 */

export const RUNTIME_MODES = ['portable-teacher', 'portable-learner', 'web-solo', 'hosted'] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export const RUNTIME_MODE_LABELS: Readonly<Record<RuntimeMode, string>> = {
  'portable-teacher': 'Lehrkraftdatei (ohne Backend)',
  'portable-learner': 'Lerndatei (ohne Backend)',
  'web-solo': 'LexiFlow ohne Konto',
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
  portal: boolean;
}): RuntimeMode {
  /*
    Die Reihenfolge ist nicht beliebig, sondern vom engsten zum weitesten
    Fall. Sollte je ein Build zwei Fahnen setzen, ist das Ergebnis die
    restriktivere Gestalt und nicht die großzügigere: Ein Konfigurationsfehler
    führt damit zu weniger Möglichkeiten, nie zu mehr. Insbesondere kann
    `hosted` – der einzige Modus mit Backend – nur herauskommen, wenn genau
    seine Fahne gesetzt ist und keine der anderen.
  */
  if (flags.learner) return 'portable-learner';
  if (flags.portable) return 'portable-teacher';
  if (flags.portal) return 'hosted';
  return 'web-solo';
}

/*
  `typeof` und nicht der nackte Bezeichner: Unter Vitest und im Dev-Server ist
  keiner der `define`-Werte gesetzt, und ein nackter Zugriff auf eine nicht
  deklarierte Variable wäre dort ein `ReferenceError` beim ersten Import.
  `typeof` ist der eine Ausdruck in JavaScript, der auf einen unbekannten
  Bezeichner angewendet werden darf.
*/
const PORTABLE_FLAG = typeof __LEXIFLOW_PORTABLE__ === 'boolean' ? __LEXIFLOW_PORTABLE__ : false;
const LEARNER_FLAG = typeof __LEXIFLOW_LEARNER__ === 'boolean' ? __LEXIFLOW_LEARNER__ : false;
const PORTAL_FLAG = typeof __LEXIFLOW_PORTAL__ === 'boolean' ? __LEXIFLOW_PORTAL__ : false;

/**
 * Der Modus dieses Builds.
 *
 * Eine Konstante und keine Funktion: Sie steht beim Bündeln fest, und ein
 * `const` lässt sich zuverlässiger wegoptimieren als ein Aufruf.
 *
 * Ohne gesetzte Fahnen – Vitest, `vite dev` – ist das Ergebnis `web-solo`.
 * Das ist die sichere Seite: kein Backend, bis eine Konfiguration
 * ausdrücklich etwas anderes sagt.
 */
export const RUNTIME_MODE: RuntimeMode = resolveRuntimeMode({
  portable: PORTABLE_FLAG,
  learner: LEARNER_FLAG,
  portal: PORTAL_FLAG,
});

/** Läuft diese Anwendung als einzelne Datei, ohne Server dahinter? */
export function isPortableMode(mode: RuntimeMode = RUNTIME_MODE): boolean {
  return mode === 'portable-teacher' || mode === 'portable-learner';
}

/**
 * Darf dieser Modus überhaupt eine Verbindung zu Supabase aufbauen?
 *
 * Die Frage wird an genau einer Stelle beantwortet, und `createSupabaseClient`
 * fragt sie, bevor er irgendetwas tut. Ein Bündel, das durch einen
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

/**
 * Gibt es in diesem Modus Konten?
 *
 * Gleichbedeutend mit `mayUseBackend`, aber die Frage ist eine andere, und
 * Aufrufstellen sollen sagen, was sie meinen. Sollten die beiden je
 * auseinanderfallen, fällt es hier auf und nicht in fünfzehn `if`.
 */
export function hasAccounts(mode: RuntimeMode = RUNTIME_MODE): boolean {
  return mode === 'hosted';
}
