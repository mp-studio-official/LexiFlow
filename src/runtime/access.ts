import { ROLES, type Role } from '../application/repositories';
import { hasTeacherArea, type RuntimeMode } from './mode';

/**
 * Wer darf wohin.
 *
 * ## Warum das eine eigene Datei ist und keine `if`-Kette in den Routen
 *
 * Eine Zugriffsregel, die an fünfzehn Stellen steht, ist fünfzehn Regeln. Die
 * Frage „darf eine lernende Person die Kursverwaltung sehen?“ soll genau eine
 * Antwort haben, und sie soll sich lesen lassen, ohne den Router zu verstehen.
 *
 * ## Was diese Datei **nicht** ist
 *
 * Sie ist keine Sicherheitsgrenze. Alles hier läuft im Browser der Person, die
 * es zu umgehen versucht. Sie hält die Oberfläche ehrlich – niemand landet auf
 * einer Seite, die ihm nichts zeigen kann –, aber die Grenze, auf die es
 * ankommt, zieht die Datenbank mit eigenen Mitteln (Phase 2, RLS). Eine
 * Zusage, die nur im Router steht, ist keine.
 *
 * ## Der Modus kommt vor der Rolle
 *
 * `mayEnter` fragt zuerst den Laufzeitmodus. In einer Lerndatei gibt es den
 * Lehrkraftbereich nicht – nicht für Lernende, nicht für Lehrkräfte, nicht für
 * die Administration. Das ist keine Berechtigungsfrage, sondern eine Frage
 * dessen, was überhaupt im Bündel liegt.
 */

export const AREAS = ['public', 'learner', 'teacher', 'admin'] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Readonly<Record<Area, string>> = {
  public: 'Öffentlich',
  learner: 'Lernbereich',
  teacher: 'Lehrkraftbereich',
  admin: 'Verwaltung',
};

/**
 * Welche Bereiche eine Rolle betreten darf.
 *
 * Lehrkräfte dürfen in den Lernbereich. Das ist Absicht: Wer Material baut,
 * muss sehen können, wie es sich übt – und der Lernstand, der dabei entsteht,
 * ist der eigene und niemandes sonst. Umgekehrt gilt es nicht.
 */
const AREAS_PER_ROLE: Readonly<Record<Role, readonly Area[]>> = {
  admin: ['public', 'learner', 'teacher', 'admin'],
  teacher: ['public', 'learner', 'teacher'],
  student: ['public', 'learner'],
};

/** Wohin jemand nach der Anmeldung kommt. */
export const HOME_PER_ROLE: Readonly<Record<Role, string>> = {
  admin: '/verwaltung',
  teacher: '/start',
  student: '/lernen',
};

/**
 * Darf diese Rolle in diesem Modus in diesen Bereich?
 *
 * `role` ist `undefined`, solange niemand angemeldet ist. Das ist kein
 * Sonderfall, sondern der Normalfall beim ersten Aufruf – und es beantwortet
 * die Frage für `public` mit Ja.
 */
export function mayEnter(input: {
  role: Role | undefined;
  area: Area;
  mode: RuntimeMode;
}): boolean {
  if (input.area === 'teacher' && !hasTeacherArea(input.mode)) return false;
  /*
    Verwaltung und Anmeldung gibt es nur im Portal. In einer portablen Datei
    wäre eine Verwaltungsoberfläche ohne Gegenstück sinnlos – es gibt dort
    keine Konten, die sich verwalten ließen.
  */
  if (input.area === 'admin' && input.mode !== 'hosted') return false;
  if (input.area === 'public') return true;
  /*
    Ohne Anmeldung gibt es außerhalb von `public` nichts. In den portablen
    Gestalten meldet sich niemand an – dort setzt die Anwendung die Rolle
    selbst, siehe `roleForPortableMode`.
  */
  if (!input.role) return false;
  return AREAS_PER_ROLE[input.role].includes(input.area);
}

/**
 * Welche Rolle in einem Modus ohne Konten gilt.
 *
 * Ohne Konten muss die Rolle aus der Gestalt der Auslieferung folgen, sonst
 * stünde jede Ansicht vor der Frage „angemeldet als was?“, die es dort nicht
 * gibt. Die kontofreie PWA zählt dabei wie die Lehrkraftdatei: Sie hat die
 * Werkstatt, und es gibt niemanden, vor dem sie zu schützen wäre – alles
 * liegt im Browser genau der Person, die davorsitzt.
 *
 * Im Portal gibt es keine Antwort ohne Anmeldung – deshalb `undefined`.
 */
export function roleForPortableMode(mode: RuntimeMode): Role | undefined {
  if (mode === 'portable-teacher' || mode === 'web-solo') return 'teacher';
  if (mode === 'portable-learner') return 'student';
  return undefined;
}

/** Alle Bereiche, die jemand hier sehen darf – für die Navigation. */
export function areasFor(role: Role | undefined, mode: RuntimeMode): Area[] {
  return AREAS.filter((area) => mayEnter({ role, area, mode }));
}

/** Ist das eine bekannte Rolle? Für Werte, die aus einer Antwort kommen. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
