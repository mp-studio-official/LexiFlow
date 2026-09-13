/**
 * Typen für die PGlite-Prüfumgebung.
 *
 * Die Umgebung selbst ist JavaScript (`harness.mjs`), weil sie zu den
 * Werkzeugen gehört und nicht zur Anwendung. Von TypeScript aus benutzt wird
 * sie trotzdem – `src/cloud/courseRepositories.pglite.test.ts` lässt den
 * Kursvertrag dagegen laufen. Diese Datei ist die Brücke dazwischen.
 */

/** Der Ausschnitt aus PGlite, den die Prüfungen benutzen. */
export interface TestDatenbank {
  query<T = Record<string, unknown>>(
    sql: string,
    werte?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

export function migrationsdateien(): string[];
export function migrationstext(): string;
export function neueDatenbank(): Promise<TestDatenbank>;
export function alsPerson(db: TestDatenbank, userId: string): Promise<void>;
export function alsUnangemeldet(db: TestDatenbank): Promise<void>;
export function alsEinrichtung(db: TestDatenbank): Promise<void>;
export function testId(nummer?: number): string;
export function legePersonAn(
  db: TestDatenbank,
  person: { id: string; name: string; kurz: string; rolle: 'admin' | 'teacher' | 'student' },
): Promise<string>;
export function fehlerVon(versprechen: Promise<unknown>): Promise<string | undefined>;
