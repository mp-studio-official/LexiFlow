import type { TaskDirection } from './schema';

/**
 * Stabile IDs ohne externe Abhängigkeit.
 * `crypto.randomUUID` ist in allen Zielbrowsern verfügbar; der Fallback
 * existiert nur für ältere Testumgebungen ohne sicheren Kontext.
 */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  /* c8 ignore next */
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Zusammengesetzter Schlüssel für den Lernstand einer Vokabel in einem Paket
 * **und einer Abfragerichtung**. Ohne die Richtung würden rezeptives und
 * produktives Üben denselben Datensatz überschreiben.
 */
export function progressKey(packId: string, entryId: string, direction: TaskDirection): string {
  return `${packId}::${entryId}::${direction}`;
}

/** Schlüssel innerhalb eines Pakets: Eintrag + Richtung. */
export function directionKey(entryId: string, direction: TaskDirection): string {
  return `${entryId}::${direction}`;
}
