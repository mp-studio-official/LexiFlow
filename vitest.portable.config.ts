import { defineConfig } from 'vitest/config';

/**
 * Prüfungen an den **gebauten** portablen Dateien.
 *
 * Sie stehen bewusst außerhalb von `npm run test`: Ohne vorherigen
 * `npm run build:portable` gäbe es nichts zu prüfen, und ein Test, der ohne
 * Build rot ist, erzieht zum Wegschauen. `npm run verify:portable` führt beides
 * in der richtigen Reihenfolge aus.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/portable/*.artifact.test.ts'],
    restoreMocks: true,
  },
});
