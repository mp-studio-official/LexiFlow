import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  CSV_COLUMNS,
  csvFileName,
  packToCsv,
  tableHeader,
  tableRows,
} from './vocabTable';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from './schema';

/**
 * Sprint 4B.3, Block B: das Paket als Tabelle.
 *
 * Die Datei prüft zwei Zusagen, die sich leicht brechen lassen und schwer
 * bemerken: dass die deutschen Bedeutungen **nicht** am Komma zerfallen, und
 * dass die Datei in einem deutschen Excel ohne Vorführeffekt aufgeht.
 */

const ENTRIES = [
  makeEntry({
    id: 'e1',
    english: 'to coin a phrase / term',
    germanAnswers: ['einen Begriff, eine Redewendung prägen'],
    partOfSpeech: 'verb',
    exampleSentences: [{ english: 'Councils coin a phrase for it.', german: 'Räte prägen dafür einen Begriff.' }],
  }),
  makeEntry({
    id: 'e2',
    english: 'restraints (pl.)',
    germanAnswers: ['die Beschränkungen', 'die Auflagen'],
    partOfSpeech: 'noun',
    grammaticalNumber: 'plural',
    exampleSentences: [],
  }),
  makeEntry({
    id: 'e3',
    english: 'attainable (adj.)',
    germanAnswers: ['erreichbar'],
    partOfSpeech: 'adjective',
    exampleSentences: [],
  }),
];

function pack(): VocabPack {
  return {
    meta: makeMeta({ id: 'p1', title: 'Unit 7 – Coastal erosion', topic: 'Küste', grade: '9' }),
    entries: ENTRIES,
  };
}

describe('Die Zeilen', () => {
  it('zeigt die vollständige Lernform, nicht das Lemma', () => {
    const rows = tableRows(ENTRIES);
    expect(rows.map((row) => row.english)).toEqual([
      'to coin a phrase / term',
      'restraints (pl.)',
      'attainable (adj.)',
    ]);
  });

  it('trennt mehrere Bedeutungen mit Semikolon, nicht mit Komma', () => {
    /*
      Die eine Zusage, an der alles hängt. „einen Begriff, eine Redewendung
      prägen“ ist **eine** Bedeutung mit einem Komma darin; „die
      Beschränkungen“ und „die Auflagen“ sind **zwei**. Wer am Komma trennte,
      machte aus der ersten zwei falsche und träfe die zweite trotzdem nicht.
    */
    const rows = tableRows(ENTRIES);
    expect(rows[0]?.german).toBe('einen Begriff, eine Redewendung prägen');
    expect(rows[1]?.german).toBe('die Beschränkungen; die Auflagen');
  });

  it('schreibt die Wortart aus, samt Zahl', () => {
    const rows = tableRows(ENTRIES);
    expect(rows[1]?.partOfSpeech).toBe('Substantiv, Plural');
    expect(rows[2]?.partOfSpeech).toBe('Adjektiv');
  });

  it('behält die Paketreihenfolge, wenn nichts anderes verlangt ist', () => {
    expect(tableRows(ENTRIES).map((row) => row.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('sortiert alphabetisch ohne Rücksicht auf Großschreibung', () => {
    const rows = tableRows(ENTRIES, { order: 'alphabetical' });
    expect(rows.map((row) => row.english)).toEqual([
      'attainable (adj.)',
      'restraints (pl.)',
      'to coin a phrase / term',
    ]);
  });

  it('lässt die übergebene Liste unangetastet', () => {
    // Beim Drucken die Reihenfolge im Speicher umzustellen wäre eine
    // Bearbeitung – und eine, die niemand erwartet.
    const original = [...ENTRIES];
    tableRows(ENTRIES, { order: 'alphabetical' });
    expect(ENTRIES).toEqual(original);
  });
});

describe('Die Kopfzeile', () => {
  it('nennt Umfang, Jahrgang, Niveau und Richtung', () => {
    const header = tableHeader(pack().meta, 3);
    expect(header.title).toBe('Unit 7 – Coastal erosion');
    expect(header.summary).toContain('3 Vokabeln');
    expect(header.summary).toContain('Klasse 9');
    expect(header.summary).toContain('Küste');
    expect(header.count).toBe(3);
  });

  it('zählt eine einzelne Vokabel im Singular', () => {
    expect(tableHeader(pack().meta, 1).summary).toContain('1 Vokabel ');
  });
});

describe('Die Tabellendatei', () => {
  it('beginnt mit dem Byte-Order-Mark', () => {
    /*
      Ohne BOM liest Excel unter Windows eine UTF-8-Datei als Windows-1252:
      Aus „überfüllt“ wird „Ã¼berfÃ¼llt“. Drei Bytes verhindern das, und alle
      anderen Programme überlesen sie.
    */
    expect(packToCsv(pack()).startsWith(CSV_BOM)).toBe(true);
  });

  it('führt die verabredeten Spalten in der verabredeten Reihenfolge', () => {
    const [kopf] = packToCsv(pack()).slice(CSV_BOM.length).split('\r\n');
    expect(kopf).toBe(CSV_COLUMNS.map((name) => `"${name}"`).join(';'));
  });

  it('setzt jedes Feld in Anführungszeichen', () => {
    // Immer, nicht nur bei Bedarf: Semikolon, Komma, Anführungszeichen und
    // Umbrüche kommen in diesen Daten alle vor.
    const zeilen = packToCsv(pack()).slice(CSV_BOM.length).trimEnd().split('\r\n');
    for (const zeile of zeilen) {
      expect(zeile.startsWith('"')).toBe(true);
      expect(zeile.endsWith('"')).toBe(true);
    }
  });

  it('zerstört eine Bedeutung mit Komma nicht', () => {
    const csv = packToCsv(pack());
    expect(csv).toContain('"einen Begriff, eine Redewendung prägen"');
    expect(csv).toContain('"die Beschränkungen; die Auflagen"');
  });

  it('verdoppelt Anführungszeichen im Inhalt', () => {
    const csv = packToCsv({
      meta: pack().meta,
      entries: [
        makeEntry({
          id: 'q',
          english: 'quote',
          germanAnswers: ['das „Zitat"'],
          exampleSentences: [{ english: 'He said "no".' }],
        }),
      ],
    });
    expect(csv).toContain('"He said ""no""."');
  });

  it('trennt Spalten mit Semikolon und Zeilen mit CRLF', () => {
    const csv = packToCsv(pack());
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n')[1]).toContain('";"');
  });

  it('trägt Thema, Jahrgang und Niveau in jede Zeile', () => {
    const zeilen = packToCsv(pack()).slice(CSV_BOM.length).trimEnd().split('\r\n').slice(1);
    for (const zeile of zeilen) {
      expect(zeile).toContain('"Küste"');
      expect(zeile).toContain('"Klasse 9"');
    }
  });

  it('folgt derselben Sortierung wie der Ausdruck', () => {
    const csv = packToCsv(pack(), { order: 'alphabetical' });
    const ersteZeile = csv.slice(CSV_BOM.length).split('\r\n')[1];
    expect(ersteZeile).toContain('attainable (adj.)');
  });
});

describe('Der Dateiname', () => {
  it('sagt, worum es geht, und funktioniert überall', () => {
    expect(csvFileName(makeMeta({ title: 'Unit 3 – City life', grade: '8' }))).toBe(
      'unit-3-city-life-8-vokabelliste.csv',
    );
  });

  it('schreibt Umlaute aus, statt sie wegzuwerfen', () => {
    expect(csvFileName(makeMeta({ title: 'Küste & Straße', grade: '9' }))).toBe(
      'kueste-strasse-9-vokabelliste.csv',
    );
  });

  it('kommt auch mit einem Titel ohne brauchbare Zeichen zurecht', () => {
    expect(csvFileName(makeMeta({ title: '???', grade: 'Q1' }))).toBe(
      'vokabelliste-q1-vokabelliste.csv',
    );
  });
});
