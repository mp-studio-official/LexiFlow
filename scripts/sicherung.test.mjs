// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ablauf = readFileSync(resolve(wurzel, '.github/workflows/pilot-sicherung.yml'), 'utf8');
const zaehler = readFileSync(resolve(wurzel, 'scripts/sicherung/zaehlwerte.sql'), 'utf8');
const pruefdatenbank = readFileSync(
  resolve(wurzel, 'scripts/sicherung/pruefdatenbank.sql'),
  'utf8',
);

describe('Die Pilotsicherung', () => {
  it('läuft täglich und auf Zuruf, aber nie infolge eines Quelltext-Pushs', () => {
    expect(ablauf).toMatch(/schedule:/);
    expect(ablauf).toMatch(/cron:\s*'17 2 \* \* \*'/);
    expect(ablauf).toMatch(/workflow_dispatch:/);
    expect(ablauf).not.toMatch(/^\s+push:/m);
    expect(ablauf).not.toMatch(/^\s+pull_request:/m);
  });

  it('hat nur Leserechte am Projekt', () => {
    expect(ablauf).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(ablauf).not.toMatch(/contents:\s*write/);
  });

  it('bezieht Datenbankadresse und Sicherungskennwort ausschließlich aus Secrets', () => {
    expect(ablauf).toContain('secrets.SUPABASE_DB_URL');
    expect(ablauf).toContain('secrets.LEXIFLOW_BACKUP_PASSPHRASE');
    expect(ablauf).not.toMatch(/postgresql:\/\/postgres\.[a-z0-9]+:/i);
    expect(ablauf).not.toMatch(/sb_secret_|service_role/i);
  });

  it('sichert Rollen, Struktur, Anwendungsdaten und Auth-Identitäten', () => {
    expect(ablauf).toContain('--role-only');
    expect(ablauf).toContain('schema.sql');
    expect(ablauf).toContain('--data-only --use-copy');
    expect(ablauf).toContain('--table=auth.users --table=auth.identities');
  });

  it('verschlüsselt vor dem Hochladen und lädt ausschließlich den Chiffretext hoch', () => {
    expect(ablauf).toContain('--symmetric --cipher-algo AES256');
    expect(ablauf).toMatch(/path:\s*lexiflow-pilot\.tar\.gz\.gpg/);
    const artefakt = ablauf.slice(ablauf.indexOf('uses: actions/upload-artifact@v4'));
    expect(artefakt).not.toMatch(/path:.*(?:data\.sql|schema\.sql|auth-data\.dump|\.tar\.gz\s*$)/m);
  });

  it('bewahrt vierzehn Tage auf', () => {
    expect(ablauf).toMatch(/retention-days:\s*14/);
  });

  it('beweist Entschlüsselung, Wiederherstellung und identische Zählwerte', () => {
    expect(ablauf).toContain('gpg');
    expect(ablauf).toContain('--decrypt');
    expect(ablauf).toContain('sha256sum --check --status');
    expect(ablauf).toContain('postgres:17');
    expect(ablauf).toContain('session_replication_role = replica');
    expect(ablauf).toContain('diff -u /restore/zaehlwerte-vorher.json /tmp/zaehlwerte-nachher.json');
    expect(ablauf.indexOf('/pruefung/pruefdatenbank.sql')).toBeLessThan(
      ablauf.indexOf('/restore/roles.sql'),
    );
  });

  it('zählt jede LexiFlow-Tabelle und die Auth-Konten', () => {
    const tabellen = [
      'auth.users', 'profiles', 'learner_accounts', 'learner_settings',
      'courses', 'course_members', 'course_invites', 'packs', 'pack_drafts',
      'pack_revisions', 'course_packs', 'pack_progress', 'entry_progress',
      'progress_events', 'ai_allowed_hosts', 'ai_connections', 'auth_rate_limit',
    ];
    for (const tabelle of tabellen) expect(zaehler).toContain(`'${tabelle}'`);
  });

  it('bildet jede gemessene Supabase-Systemrolle vor dem Rollenexport nach', async () => {
    const rollen = [
      'anon', 'authenticated', 'authenticator', 'cli_login_postgres',
      'dashboard_user', 'pgbouncer', 'service_role', 'supabase_admin',
      'supabase_auth_admin', 'supabase_etl_admin', 'supabase_privileged_role',
      'supabase_read_only_user', 'supabase_realtime_admin',
      'supabase_replication_admin', 'supabase_storage_admin',
    ];
    for (const rolle of rollen) expect(pruefdatenbank).toContain(`'${rolle}'`);

    const db = await PGlite.create();
    try {
      await db.exec(pruefdatenbank);
      const ergebnis = await db.query(
        `select rolname from pg_roles where rolname = any($1::text[]) order by rolname`,
        [rollen],
      );
      expect(ergebnis.rows.map((zeile) => zeile.rolname)).toEqual([...rollen].sort());
    } finally {
      await db.close();
    }
  });
});
