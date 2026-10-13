import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCOTLAND_WALES } from './scotland-wales.mjs';

/**
 * Die eine Kopie, die es geben darf — und ihre Wache.
 *
 * Der Abnahmetext steht in `src/testdaten/scotlandWales.ts`. Das
 * Messskript ist ein `.mjs` und lädt kein TypeScript, braucht aber
 * **denselben** Text: Eine Messung gegen einen anderen Text misst etwas
 * anderes als die Prüfungen, und niemand merkt es.
 *
 * Diese Prüfung ist der Preis für die Kopie. Ohne sie wäre sie eine
 * zweite Quelle.
 */
describe('der Abnahmetext', () => {
  it('ist im Messskript wörtlich derselbe wie in den Testdaten', () => {
    const quelle = readFileSync(
      resolve(import.meta.dirname, '../src/testdaten/scotlandWales.ts'),
      'utf8',
    );
    const original = quelle.slice(quelle.indexOf('`') + 1, quelle.lastIndexOf('`'));
    expect(SCOTLAND_WALES).toBe(original);
  });

  it('ist der Text, um den es geht', () => {
    expect(SCOTLAND_WALES).toContain('Scotland is in the North of Britain.');
    expect(SCOTLAND_WALES).toContain('They are still popular today.');
  });
});
