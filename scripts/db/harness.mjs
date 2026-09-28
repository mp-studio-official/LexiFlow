// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * Ein echtes Postgres für die Prüfung der Zugriffsregeln.
 *
 * ## Warum hier und nicht in `src/`
 *
 * Was in `src/` liegt, wird ausgeliefert. Diese Datei wird es nicht: Sie
 * startet eine PostgreSQL-Instanz als WebAssembly im Node-Prozess, braucht
 * `environment: node` statt jsdom und hat mit der Anwendung im Browser nichts
 * zu tun. Die SQL-Dateien in `supabase/migrations/` sind das Ergebnis; das
 * hier ist das Werkzeug, mit dem geprüft wird, ob sie halten, was sie sagen.
 *
 * ## Was hier echt ist und was nachgebildet (ADR-6)
 *
 * **Echt:** PostgreSQL 17.5. Dieselbe Planung, dieselbe Auswertung von
 * Policies, dieselben Rollen, dieselben Trigger. Wenn eine Regel hier greift,
 * greift sie dort.
 *
 * **Nachgebildet:** alles, was Supabase um Postgres herum mitbringt – die
 * Rollen `anon`, `authenticated`, `service_role`, das Schema `auth` samt
 * `auth.users` und `auth.uid()`. Diese Vorlage unten ist kein Teil der
 * Migrationen, weil sie im echten Projekt bereits existiert.
 *
 * **Gar nicht geprüft:** GoTrue (die tatsächliche Anmeldung), PostgREST (die
 * HTTP-Schicht), die Edge-Function-Laufzeit. Die Regeln sind geprüft, die
 * Plattform darunter ist nachgebaut. Dieser Satz gehört in jeden Bericht.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const migrationsordner = resolve(hier, '../../supabase/migrations');

/**
 * Was Supabase mitbringt, bevor die erste eigene Migration läuft.
 *
 * `auth.uid()` ist bis auf den Namen der Einstellung dieselbe Funktion wie
 * dort: Sie liest den Anspruch `sub` aus den JWT-Claims der Sitzung. Genau
 * deshalb funktioniert der Rollenwechsel unten – er setzt dieselbe Einstellung,
 * die eine echte PostgREST-Verbindung setzen würde.
 */
const SUPABASE_VORLAGE = `
  create schema if not exists auth;

  create table auth.users (
    id uuid primary key,
    -- Nur der Vollständigkeit halber; LexiFlow schreibt hier nichts hinein.
    email text
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
  $$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  as $$
    select coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', 'anon');
  $$;

  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;

  /*
    Und jetzt der Teil, der hier lange gefehlt hat.

    Im echten Stagingprojekt waren beim Anlegen der Tabellen breite
    Vorgaberechte wirksam: Alles, was die Rolle "postgres" im Schema "public"
    anlegt, bekam volle Tabellenrechte für "anon", "authenticated" und
    "service_role". Migrationen laufen als "postgres". Jede Tabelle, die eine
    Migration anlegt, war damit in dem Moment ihrer Entstehung bereits
    freigegeben – bevor irgendein "grant" in einer Migration steht.

    Das ist keine Kleinigkeit für die Prüfungen, sondern ihr Ausgangspunkt:
    Ohne diese vier Zeilen prüft der Harness eine Datenbank, in der die
    Migrationen Rechte **aufbauen**. Im echten Projekt bauen sie Rechte
    **ab** – und wo eine Migration nur hinzufügt, bleibt der Ausgangszustand
    stehen. Genau daran ist Migration 9 vorbeigelaufen.

    Warum sie wirksam waren, ist offen und für diese Nachbildung auch nicht
    nötig: Gemessen ist, DASS sie es waren. Ob eine Projekteinstellung nicht
    gespeichert wurde, anders gesetzt war oder die Plattform sich anders
    verhielt, entscheidet diese Datei nicht.

    Für die Prüfungen zählt allein: Ein Projekt kann so aussehen. Wer eine
    Datenbank nachbildet, in der es nicht so aussehen KANN, prüft den
    freundlichsten Fall und nennt ihn den einzigen.

    Bewusst **nicht** nachgebildet: Vorgaberechte auf Funktionen. Die
    Kontrollabfrage im echten Projekt hat für Browserrollen null ausführbare
    Server-RPCs gezeigt. Etwas nachzubilden, was dort messbar nicht existiert,
    hieße die Prüfungen gegen eine erfundene Plattform laufen zu lassen.
  */
  grant usage on schema public to anon, authenticated, service_role;

  /*
    Beide Geltungsbereiche, absichtlich.

    "alter default privileges" kennt eine Vorgabe MIT Schemabezug und eine
    OHNE. Das sind zwei getrennte Eintraege in pg_default_acl, und ein
    "revoke" trifft nur den Bereich, den es nennt.

    Welche Form das Stagingprojekt hat, ist nicht bekannt — die
    Kontrollabfrage auf pg_default_acl gibt den Geltungsbereich mit aus,
    aber sie wurde erst nachtraeglich eingefuehrt. Der Harness setzt deshalb
    BEIDE: Was hier gruen wird, haelt in jedem der beiden Faelle.

    Das ist eine Entscheidung ueber die Pruefumgebung, keine Behauptung
    ueber Supabase. Die ungünstigere Annahme ist hier die billigere.
  */
  alter default privileges for role postgres in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres
    grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres
    grant all on sequences to anon, authenticated, service_role;
`;

/** Die Migrationen in der Reihenfolge, in der sie auch Supabase anwendet. */
export function migrationsdateien() {
  return readdirSync(migrationsordner)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export function migrationstext() {
  return migrationsdateien()
    .map((name) => readFileSync(resolve(migrationsordner, name), 'utf8'))
    .join('\n');
}

/**
 * Eine frische Datenbank mit allen Migrationen.
 *
 * Jeder Test bekommt seine eigene: Zugriffsregeln zu prüfen heißt, ständig die
 * Rolle zu wechseln, und ein vergessenes `reset role` im einen Test färbte
 * sonst den nächsten. Eine Instanz im Arbeitsspeicher kostet dafür wenig.
 */
export async function neueDatenbank() {
  const db = await PGlite.create();
  await db.exec(SUPABASE_VORLAGE);
  for (const name of migrationsdateien()) {
    await db.exec(readFileSync(resolve(migrationsordner, name), 'utf8'));
  }
  return db;
}

/**
 * Als diese Person weiterarbeiten – so, wie eine angemeldete Verbindung es tut.
 *
 * Erst `reset role`, dann die Ansprüche setzen, dann die Rolle: In umgekehrter
 * Reihenfolge stünde die Einstellung noch auf der vorigen Person, während die
 * Rolle schon gewechselt hätte.
 */
export async function alsPerson(db, userId) {
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';`);
  await db.exec('set role authenticated;');
}

/** Ohne Anmeldung – die Rolle, mit der ein Browser vor dem Login spricht. */
export async function alsUnangemeldet(db) {
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claims = '';`);
  await db.exec('set role anon;');
}

/**
 * Zurück in die Rolle, die alles darf – zum Einrichten von Testdaten.
 *
 * Kein Teil des Produkts: Der Browser bekommt diese Rechte nie. Das ist der
 * **Besitzer** der Objekte, also die Rolle, unter der die Migrationen laufen.
 *
 * ## Wofür sie ausdrücklich nicht taugt
 *
 * Bis September 2026 stand hier, diese Rolle entspreche dem, „was eine
 * Migration oder eine Edge Function mit Service Role tut". Der erste Teil
 * stimmt, der zweite nicht – und der Unterschied hat eine echte Lücke
 * durchgelassen.
 *
 * Der Besitzer hat auf seinen eigenen Objekten **implizit jedes Recht**. Ein
 * `grant` an ihn ändert nichts, ein fehlendes `grant` fällt ihm nicht auf.
 * Eine Edge Function ist dagegen `service_role`: eine ganz gewöhnliche Rolle,
 * die nur darf, was ihr jemand gegeben hat. Wer den Dienst als Besitzer
 * nachstellt, prüft jede Zugriffsregel – und keine einzige Rechtevergabe.
 *
 * Für den Dienst gibt es deshalb `alsDienst`. Diese hier bleibt, wofür sie
 * gedacht war: Testdaten hinstellen, bevor die eigentliche Prüfung anfängt.
 */
export async function alsEinrichtung(db) {
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claims = '';`);
}

/**
 * Als Serverfunktion weiterarbeiten – die Rolle hinter dem Secret Key.
 *
 * PostgREST setzt für einen Client mit Secret Key die Rolle `service_role`.
 * Sie umgeht die Zugriffsregeln (`bypassrls`), aber **nicht** die
 * Rechtevergabe: Ohne `grant` gibt es „permission denied", und zwar bevor
 * eine Regel überhaupt befragt wird.
 *
 * Die Ansprüche werden geleert, und das ist keine Nachlässigkeit, sondern der
 * Punkt: Unter `service_role` ist `auth.uid()` leer. Jede Funktion, die sich
 * auf die angemeldete Person verlässt, kann hier nicht laufen – was genau der
 * Grund ist, warum die Serverfunktionen ihre Personenkennung als Parameter
 * übergeben, statt sie zu erfragen.
 */
export async function alsDienst(db) {
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claims = '';`);
  await db.exec('set role service_role;');
}

let zaehler = 0;

/** Eine stabile, offensichtlich erfundene Kennung. */
export function testId(nummer) {
  const n = String(nummer ?? (zaehler += 1)).padStart(4, '0');
  return `00000000-0000-4000-8000-00000000${n}`;
}

/**
 * Legt ein Konto samt Profil an – mit Einrichtungsrechten.
 *
 * In der fertigen Anwendung entsteht das Profil beim ersten Anmelden (Phase 3).
 * Für die Prüfung der Regeln ist das ein Nebenschauplatz; wichtig ist, dass
 * die Zeilen existieren, wenn die Regeln befragt werden.
 */
export async function legePersonAn(db, { id, name, kurz, rolle }) {
  await alsEinrichtung(db);
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query(
    'insert into profiles (id, display_name, short_code, role) values ($1, $2, $3, $4)',
    [id, name, kurz, rolle],
  );
  return id;
}

/**
 * Führt etwas aus und gibt den Fehler zurück, statt ihn zu werfen.
 *
 * Eine Zugriffsregel scheitert auf zwei Arten, und der Unterschied ist
 * bedeutsam: Beim Lesen kommen einfach **keine Zeilen** – kein Fehler, keine
 * Auskunft darüber, dass es etwas gäbe. Beim Schreiben gibt es einen Fehler,
 * weil sonst stillschweigend nichts passierte.
 */
export async function fehlerVon(versprechen) {
  try {
    await versprechen;
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
