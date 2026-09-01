/**
 * Das Laufzeitformat – dieselben Regeln wie im Erzeuger, hier für den Browser.
 *
 * `scripts/dictionary/buildRuntime.mjs` legt die Fächer an, dieses Modul findet
 * sie wieder. Beide müssen sich über Schlüsselnormalisierung, Streuung und
 * Fachanzahl einig sein – wären sie es nicht, fände die Suche schlicht nichts.
 * `runtimeFormat.test.ts` vergleicht deshalb beide Umsetzungen gegeneinander,
 * statt sich darauf zu verlassen, dass zwei Dateien zufällig gleich bleiben.
 */

/** Fachanzahl. Muss mit `SHARD_COUNT` im Erzeuger übereinstimmen. */
export const SHARD_COUNT = 64;

/** Version des Formats, das dieses Modul lesen kann. */
export const RUNTIME_FORMAT_VERSION = 1;

/**
 * Der Suchschlüssel: Kleinschreibung, Unicode-Normalform, gerade Apostrophe,
 * einfache Leerzeichen.
 */
export function normalizeKey(word: string): string {
  return String(word ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a über die UTF-16-Einheiten des Schlüssels. */
export function shardOf(key: string, shardCount: number = SHARD_COUNT): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shardCount;
}

/* -------------------------------------------------------------------------
   Die knappen Formen im Datensatz. Kurze Feldnamen sind hier kein Selbstzweck:
   Bei 152 000 Übersetzungen kostet jedes ausgeschriebene Feld spürbar Platz in
   einer Datei, die eine Lehrkraft per Mail weitergibt.
   ------------------------------------------------------------------------- */

/** `d` deutsch, `x` Genus, `r` Register, `q` Klammerzusatz, `m` mehrteilig. */
export interface PackedSuggestion {
  d: string;
  x?: 'm' | 'f' | 'n';
  r?: string[];
  q?: string;
  m?: 1;
}

/** `s` Bedeutungsüberschrift, `v` Verweisquelle, `g` Übersetzungen. */
export interface PackedSense {
  s: string;
  v?: string;
  g: PackedSuggestion[];
}

/** `w` Stichwort, `p` Wortart, `n` Bedeutungen, `m` mehrteilig. */
export interface PackedEntry {
  w: string;
  p: string;
  n: PackedSense[];
  m?: 1;
}

/** `l` Grundform, `p` Wortart, `t` Formmerkmale. */
export interface PackedForm {
  l: string;
  p: string;
  t?: string[];
}

export interface PackedShard {
  e: Record<string, PackedEntry[]>;
  f: Record<string, PackedForm[]>;
}
