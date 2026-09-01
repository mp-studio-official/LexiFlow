/**
 * Typen für den Erzeuger, damit der Vergleichstest ihn ohne `any` einbinden kann.
 *
 * Der Erzeuger selbst bleibt bewusst JavaScript: Er läuft als Build-Skript in
 * einem nackten Node-Prozess, ohne Transpilierung. Diese Datei beschreibt nur,
 * was er nach außen anbietet – sie ist keine zweite Wahrheit, sondern die
 * Vertragsseite, gegen die `dictionary.test.ts` prüft.
 */

export const SHARD_COUNT: number;
export const RUNTIME_FORMAT_VERSION: number;

export function normalizeKey(word: unknown): string;
export function shardOf(key: string, shardCount?: number): number;
export function isProperNoun(entry: { pos?: string } | undefined): boolean;
export function toRuntimeEntry(entry: unknown): unknown;

export function buildShards(
  lines: Iterable<unknown>,
  options?: { shardCount?: number; keepProperNouns?: boolean },
): {
  shards: unknown[];
  stats: Record<string, number>;
};
