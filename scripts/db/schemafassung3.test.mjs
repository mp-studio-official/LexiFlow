// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { alsPerson, legePersonAn, neueDatenbank, testId } from './harness.mjs';

/**
 * Die Datenbankgrenze für Schemafassung 3 (5B.8) — belegt, nicht vermutet.
 *
 * ## Warum diese Prüfungen überhaupt existieren
 *
 * Der Umsetzungsplan behauptete eine Weile, 5B.8 sei an der
 * Migrationshistorie blockiert gewesen. Das war falsch: Was 5B.8 bringt, ist
 * eine **Dokumentmigration** für `.vocabpack.json`, keine Datenbankmigration.
 *
 * Statt das zu behaupten, wird es hier gezeigt. Die drei Zusagen, an denen
 * alles hängt:
 *
 * 1. `format_version` nimmt jede positive Zahl an — es gibt keine Liste
 *    bekannter Fassungen in der Datenbank.
 * 2. `pack` ist `jsonb` und kennt keine Feldliste; die neuen Grammatikfelder
 *    gehen durch, ohne dass irgendwo etwas davon wüsste.
 * 3. `publish_pack` übernimmt die gespeicherte Versionsnummer **unverändert**
 *    in die Fassung.
 *
 * Fällt eine davon, braucht 5B.8 doch eine additive Migration — und diese
 * Datei sagt dann, welche.
 */

const LEHRERIN = testId(1);

/** Ein Eintrag der Fassung 3, mit allem, was neu ist. */
const TOLD = {
  id: 'v-told',
  english: 'to tell sb. sth.',
  germanAnswers: ['jemandem etwas erzählen'],
  acceptedEnglishAnswers: [],
  partOfSpeech: 'verb',
  occurrence: 'told',
  grammarNote: 'Past Simple von to tell sb. sth.',
  sourceSentence: 'The man told a story.',
  inflection: {
    kind: 'verb',
    base: 'tell',
    pastSimple: 'told',
    pastParticiple: 'told',
    irregular: true,
  },
  exampleSentences: [],
  topicTags: [],
  sourceType: 'import',
};

const PAKET = {
  kind: 'lexiflow.vocabpack',
  formatVersion: 3,
  meta: {
    id: 'pack-told',
    title: 'Unit 3 – City life',
    topic: '',
    grade: '7',
    cefrLevel: 'A2',
    cefrLevelOverridden: false,
    direction: 'both',
    createdAt: '2026-10-04T09:00:00.000Z',
    updatedAt: '2026-10-04T09:00:00.000Z',
  },
  entries: [TOLD],
};

let db;

beforeEach(async () => {
  db = await neueDatenbank();
  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await alsPerson(db, LEHRERIN);
});

afterEach(async () => {
  await db?.close();
});

describe('Die Spalten nehmen Fassung 3 an', () => {
  it('begrenzen `format_version` nur auf „positiv"', async () => {
    const bedingungen = await db.query(`
      select c.relname as tabelle, pg_get_constraintdef(con.oid) as bedingung
        from pg_constraint con join pg_class c on c.oid = con.conrelid
       where c.relname in ('pack_drafts', 'pack_revisions')
         and con.contype = 'c'
         and pg_get_constraintdef(con.oid) like '%format_version%'
       order by c.relname`);
    expect(bedingungen.rows).toHaveLength(2);
    for (const zeile of bedingungen.rows) {
      /*
        `> 0` und sonst nichts. Stünde dort eine Aufzählung erlaubter
        Fassungen, bräuchte jede neue Fassung eine Migration — und genau
        das ist die Frage, die hier beantwortet wird.
      */
      expect(zeile.bedingung, zeile.tabelle).toMatch(/format_version\s*>\s*0/);
      expect(zeile.bedingung, zeile.tabelle).not.toMatch(/\bin\s*\(/i);
    }
  });

  it('führen `pack` als jsonb ohne Feldliste', async () => {
    const spalten = await db.query(`
      select table_name, data_type
        from information_schema.columns
       where table_schema = 'public' and column_name = 'pack'
       order by table_name`);
    expect(spalten.rows).toEqual([
      { table_name: 'pack_drafts', data_type: 'jsonb' },
      { table_name: 'pack_revisions', data_type: 'jsonb' },
    ]);
  });
});

describe('Ein Paket der Fassung 3 geht durch den ganzen Weg', () => {
  it('wird als Entwurf gespeichert und unverändert zurückgelesen', async () => {
    await db.query('select save_pack_draft($1, $2, $3, $4, $5)', [
      'pack-told',
      'Unit 3 – City life',
      '7',
      3,
      JSON.stringify(PAKET),
    ]);

    const entwurf = await db.query('select format_version, pack from pack_drafts');
    expect(entwurf.rows[0].format_version).toBe(3);

    /*
      Die Grammatikfelder, Feld für Feld. `jsonb` sortiert Schlüssel um und
      lässt Werte unberührt — geprüft wird deshalb der Inhalt, nicht die
      Zeichenfolge.
    */
    const eintrag = entwurf.rows[0].pack.entries[0];
    expect(eintrag.occurrence).toBe('told');
    expect(eintrag.grammarNote).toBe('Past Simple von to tell sb. sth.');
    expect(eintrag.sourceSentence).toBe('The man told a story.');
    expect(eintrag.inflection).toEqual({
      kind: 'verb',
      base: 'tell',
      pastSimple: 'told',
      pastParticiple: 'told',
      irregular: true,
    });
    expect(eintrag.english).toBe('to tell sb. sth.');
    expect(eintrag.germanAnswers).toEqual(['jemandem etwas erzählen']);
  });

  it('behält die Fassungsnummer beim Veröffentlichen', async () => {
    await db.query('select save_pack_draft($1, $2, $3, $4, $5)', [
      'pack-told',
      'Unit 3 – City life',
      '7',
      3,
      JSON.stringify(PAKET),
    ]);
    await db.query('select publish_pack($1)', ['pack-told']);

    const fassung = await db.query('select revision, format_version, pack from pack_revisions');
    expect(fassung.rows).toHaveLength(1);
    expect(fassung.rows[0].revision).toBe(1);
    // `publish_pack` kopiert `d.format_version` – keine Umrechnung, kein Deckel.
    expect(fassung.rows[0].format_version).toBe(3);
    expect(fassung.rows[0].pack.entries[0].inflection.pastSimple).toBe('told');
  });

  it('nimmt auch eine Fassung an, die es noch gar nicht gibt', async () => {
    /*
      Der eigentliche Nachweis: Die Datenbank hat keine Meinung zu
      Fassungsnummern. Damit braucht auch Fassung 4 keine Migration — was
      sie braucht, ist ein Schritt in `src/domain/migrations.ts`.
    */
    await db.query('select save_pack_draft($1, $2, $3, $4, $5)', [
      'pack-told',
      'Unit 3 – City life',
      '7',
      99,
      JSON.stringify({ ...PAKET, formatVersion: 99 }),
    ]);
    const entwurf = await db.query('select format_version from pack_drafts');
    expect(entwurf.rows[0].format_version).toBe(99);
  });

  it('lehnt eine Fassung 0 weiterhin ab', async () => {
    // Die eine Grenze, die es gibt – und sie trifft Fassung 3 nicht.
    let fehler;
    try {
      await db.query('select save_pack_draft($1, $2, $3, $4, $5)', [
        'pack-told',
        'Unit 3 – City life',
        '7',
        0,
        JSON.stringify({ ...PAKET, formatVersion: 0 }),
      ]);
    } catch (error) {
      fehler = error instanceof Error ? error.message : String(error);
    }
    expect(fehler).toMatch(/format_version/);
  });
});
