import { suggestCefrLevel, isGrade, type Grade } from './cefr';
import { newId } from './ids';
import { VOCABPACK_FORMAT_VERSION, VOCABPACK_KIND } from './schema';

/**
 * Migrationskette für `.vocabpack.json`.
 *
 * Jede Funktion hebt ein Dokument von Version n auf n+1. Neue Versionen werden
 * hier angehängt; ältere Dateien bleiben dadurch dauerhaft lesbar. Die
 * Funktionen arbeiten bewusst auf `unknown`/`Record` – validiert wird erst
 * danach mit Zod.
 */
type Doc = Record<string, unknown>;

const isRecord = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Version 0 → 1: frühes Format ohne `kind`, mit einzelner `german`-Spalte und
 * ohne GeR-Niveau. Dient zugleich als Beispiel für künftige Migrationen.
 */
function v0ToV1(doc: Doc): Doc {
  const meta = isRecord(doc['meta']) ? doc['meta'] : {};
  const rawGrade = asString(meta['grade'] ?? doc['grade']);
  const grade: Grade = isGrade(rawGrade) ? rawGrade : '5';
  const nowIso = new Date().toISOString();

  const entries = asArray(doc['entries'] ?? doc['vocabulary']).map((raw) => {
    const entry = isRecord(raw) ? raw : {};
    const german = entry['germanAnswers'] ?? entry['german'] ?? entry['de'];
    const germanAnswers = Array.isArray(german)
      ? german.map(asString).filter(Boolean)
      : [asString(german)].filter(Boolean);
    return {
      id: asString(entry['id']) || newId(),
      english: asString(entry['english'] ?? entry['en']),
      germanAnswers,
      acceptedEnglishAnswers: asArray(entry['acceptedEnglishAnswers']).map(asString).filter(Boolean),
      ...(typeof entry['partOfSpeech'] === 'string'
        ? { partOfSpeech: entry['partOfSpeech'] }
        : {}),
      exampleSentences: asArray(entry['exampleSentences'] ?? entry['examples']),
      topicTags: asArray(entry['topicTags'] ?? entry['tags']).map(asString).filter(Boolean),
      ...(typeof entry['notes'] === 'string' ? { notes: entry['notes'] } : {}),
      ...(typeof entry['difficulty'] === 'number' ? { difficulty: entry['difficulty'] } : {}),
      sourceType: asString(entry['sourceType']) || 'import',
    };
  });

  return {
    kind: VOCABPACK_KIND,
    formatVersion: 1,
    meta: {
      id: asString(meta['id']) || newId(),
      title: asString(meta['title'] ?? doc['title']) || 'Unbenanntes Paket',
      topic: asString(meta['topic'] ?? doc['topic']),
      grade,
      cefrLevel: suggestCefrLevel(grade),
      cefrLevelOverridden: false,
      direction: asString(meta['direction']) || 'en-de',
      createdAt: asString(meta['createdAt']) || nowIso,
      updatedAt: nowIso,
    },
    entries,
  };
}

/**
 * Version 1 → 2 (Sprint 4B.2): strukturierte Lernformen.
 *
 * Die neuen Felder – `lemma`, `complementPattern`, `grammaticalNumber`,
 * `lexicalGroupId` – sind **allesamt optional**. Eine Datei der Version 1 ist
 * inhaltlich bereits eine gültige Datei der Version 2; diese Migration hebt
 * deshalb nur die Versionsnummer an und rührt keinen einzigen Wert an.
 *
 * Das ist Absicht. Man könnte hier versucht sein, aus `to apologise` gleich
 * ein Lemma `apologise` abzuleiten oder aus `restraints` einen Plural zu
 * machen. Beides wäre geraten: Ein abgeleitetes Lemma ist eine Vermutung, ein
 * gespeichertes eine Auskunft, und der Unterschied verschwände in dem Moment,
 * in dem die Migration ihn wegschreibt. Wo ein Lemma gebraucht wird, leitet
 * `lemmaOf()` es zur Laufzeit ab – sichtbar als das, was es ist.
 */
function v1ToV2(doc: Doc): Doc {
  return { ...doc, formatVersion: 2 };
}

const MIGRATIONS: Readonly<Record<number, (doc: Doc) => Doc>> = {
  0: v0ToV1,
  1: v1ToV2,
};

export class UnsupportedFormatVersionError extends Error {
  constructor(readonly version: number) {
    super(
      `Diese Datei nutzt Format-Version ${version}. Diese Version von LexiFlow unterstützt bis Version ${VOCABPACK_FORMAT_VERSION}. Bitte die App aktualisieren.`,
    );
    this.name = 'UnsupportedFormatVersionError';
  }
}

export function detectFormatVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const version = value['formatVersion'];
  return typeof version === 'number' && Number.isFinite(version) ? version : 0;
}

/**
 * Hebt ein beliebiges (auch älteres) Paketdokument auf die aktuelle
 * Format-Version an. Neuere Versionen als die bekannte werden abgelehnt,
 * statt Daten stillschweigend zu verlieren.
 */
export function migrateToCurrent(value: unknown): unknown {
  let version = detectFormatVersion(value);
  if (version > VOCABPACK_FORMAT_VERSION) throw new UnsupportedFormatVersionError(version);

  let doc: unknown = value;
  while (version < VOCABPACK_FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new UnsupportedFormatVersionError(version);
    doc = step(isRecord(doc) ? doc : {});
    version = detectFormatVersion(doc);
  }
  return doc;
}
