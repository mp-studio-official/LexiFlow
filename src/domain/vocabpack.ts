import { z } from 'zod';
import { migrateToCurrent, UnsupportedFormatVersionError } from './migrations';
import {
  VOCABPACK_FORMAT_VERSION,
  VOCABPACK_KIND,
  vocabPackFileSchema,
  type PackMeta,
  type VocabEntry,
  type VocabPack,
  type VocabPackFile,
} from './schema';

export const APP_NAME = 'LexiFlow';
export const APP_VERSION = '0.1.0';

export function toPackFile(pack: VocabPack): VocabPackFile {
  return {
    kind: VOCABPACK_KIND,
    formatVersion: VOCABPACK_FORMAT_VERSION,
    app: { name: APP_NAME, version: APP_VERSION },
    meta: pack.meta,
    entries: pack.entries,
  };
}

/**
 * Zwei Pakete in ihrer Datei-Gestalt vergleichen.
 *
 * Der Umweg über `toPackFile` bringt auch JSONB aus PostgreSQL wieder in
 * dieselbe Schlüsselfolge wie ein lokales Paket. Ein unmittelbares
 * `JSON.stringify` auf dem rohen JSONB wäre von dessen Schlüsselfolge
 * abhängig und könnte gleiche Inhalte fälschlich als verschieden behandeln.
 */
export function paketeIdentisch(links: VocabPack, rechts: VocabPack): boolean {
  function kanonisch(wert: unknown): unknown {
    if (Array.isArray(wert)) return wert.map(kanonisch);
    if (typeof wert !== 'object' || wert === null) return wert;
    return Object.fromEntries(
      Object.entries(wert)
        .filter(([, eintrag]) => eintrag !== undefined)
        .sort(([linksName], [rechtsName]) => linksName.localeCompare(rechtsName))
        .map(([name, eintrag]) => [name, kanonisch(eintrag)]),
    );
  }

  return JSON.stringify(kanonisch(toPackFile(links))) === JSON.stringify(kanonisch(toPackFile(rechts)));
}

/** Serialisiert ein Paket. Lernstände sind bewusst nicht Teil der Datei. */
export function serializePack(pack: VocabPack): string {
  return `${JSON.stringify(toPackFile(pack), null, 2)}\n`;
}

export type ParsePackResult =
  | { ok: true; pack: VocabPackFile }
  | { ok: false; errors: string[] };

export function parsePackFile(text: string): ParsePackResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ['Die Datei ist kein gültiges JSON.'] };
  }

  let migrated: unknown;
  try {
    migrated = migrateToCurrent(raw);
  } catch (error: unknown) {
    if (error instanceof UnsupportedFormatVersionError) return { ok: false, errors: [error.message] };
    return { ok: false, errors: ['Die Datei konnte nicht gelesen werden.'] };
  }

  const parsed = vocabPackFileSchema.safeParse(migrated);
  if (!parsed.success) {
    return { ok: false, errors: describeZodErrors(parsed.error) };
  }
  if (parsed.data.kind !== VOCABPACK_KIND) {
    return { ok: false, errors: ['Die Datei ist kein LexiFlow-Vokabelpaket.'] };
  }
  return { ok: true, pack: parsed.data };
}

export function describeZodErrors(error: z.ZodError): string[] {
  return error.issues.slice(0, 25).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'Datei';
    return `${path}: ${issue.message}`;
  });
}

/** Dateiname im Schema `thema-klasse.vocabpack.json`. */
export function suggestFilename(meta: Pick<PackMeta, 'title' | 'grade'>): string {
  const slug = meta.title
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const base = slug || 'vokabelpaket';
  return `${base}-${meta.grade.toLocaleLowerCase('de-DE')}.vocabpack.json`;
}

/** Zählt Einträge, deren Beispielsätze einen Lückensatz erlauben. */
export function countClozeReady(entries: readonly VocabEntry[]): number {
  return entries.filter((entry) =>
    entry.exampleSentences.some((sentence) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${entry.english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
        'iu',
      ).test(sentence.english),
    ),
  ).length;
}
