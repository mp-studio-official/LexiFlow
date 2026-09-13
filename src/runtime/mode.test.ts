import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_MODES,
  RUNTIME_MODE_LABELS,
  hasTeacherArea,
  isPortableMode,
  mayUseBackend,
  resolveRuntimeMode,
  type RuntimeMode,
} from './mode';

const root = resolve(import.meta.dirname, '../..');

describe('resolveRuntimeMode', () => {
  it('ohne Fahnen ist es das Portal', () => {
    expect(resolveRuntimeMode({ portable: false, learner: false })).toBe('hosted');
  });

  it('die portable Fahne allein ergibt die Lehrkraftdatei', () => {
    expect(resolveRuntimeMode({ portable: true, learner: false })).toBe('portable-teacher');
  });

  it('die Lernfahne allein ergibt die Lerndatei', () => {
    // Genau dieser Fall wird gebaut: `vite.student.config.ts` setzt nur diese
    // eine Fahne (siehe dort).
    expect(resolveRuntimeMode({ portable: false, learner: true })).toBe('portable-learner');
  });

  it('beide Fahnen ergeben die restriktivere Gestalt, nicht die großzügigere', () => {
    /*
      Ein Build, der beide setzt, ist ein Konfigurationsfehler. Die Frage ist
      nicht, ob er vorkommt, sondern was dann herauskommt: eine Lerndatei mit
      Lehrkraftwerkstatt wäre der Schaden, eine Lerndatei ohne sie nur ein
      Ärgernis. Deshalb gewinnt `learner`.
    */
    expect(resolveRuntimeMode({ portable: true, learner: true })).toBe('portable-learner');
  });
});

describe('Aussagen über einen Modus', () => {
  it('beide portablen Gestalten sind portabel, das Portal nicht', () => {
    expect(isPortableMode('portable-teacher')).toBe(true);
    expect(isPortableMode('portable-learner')).toBe(true);
    expect(isPortableMode('hosted')).toBe(false);
  });

  it('nur das Portal darf ein Backend benutzen', () => {
    const erlaubt = RUNTIME_MODES.filter((mode) => mayUseBackend(mode));
    expect(erlaubt).toEqual(['hosted']);
  });

  it('die Lerndatei hat keinen Lehrkraftbereich', () => {
    expect(hasTeacherArea('portable-learner')).toBe(false);
    expect(hasTeacherArea('portable-teacher')).toBe(true);
    expect(hasTeacherArea('hosted')).toBe(true);
  });

  it('jeder Modus hat eine deutsche Beschriftung', () => {
    for (const mode of RUNTIME_MODES) {
      expect(RUNTIME_MODE_LABELS[mode].length).toBeGreaterThan(3);
    }
  });

  it('kein Modus verspricht Backend und Portabilität zugleich', () => {
    for (const mode of RUNTIME_MODES) {
      expect(isPortableMode(mode) && mayUseBackend(mode)).toBe(false);
    }
  });
});

/**
 * Die Fahnen sind nur so viel wert wie die Konfigurationen, die sie setzen.
 *
 * `RUNTIME_MODE` selbst lässt sich im Test nicht sinnvoll prüfen: Unter Vitest
 * ist keine Fahne gesetzt, und ein `define` nachträglich zu verstellen hieße,
 * das Modul neu zu laden und dabei genau die Bauzeit-Ersetzung zu simulieren,
 * die hier gerade den Unterschied macht. Statt das nachzustellen, wird die
 * Quelle geprüft, aus der der Wert im echten Build kommt.
 */
describe('die Vite-Konfigurationen setzen die erwarteten Fahnen', () => {
  function config(name: string): string {
    return readFileSync(resolve(root, name), 'utf8');
  }

  const erwartet: ReadonlyArray<[string, RuntimeMode, { portable: string | null; learner: string | null }]> = [
    ['vite.config.ts', 'hosted', { portable: 'false', learner: 'false' }],
    ['vite.portable.config.ts', 'portable-teacher', { portable: 'true', learner: 'false' }],
    // `null`: Diese Konfiguration setzt `__LEXIFLOW_PORTABLE__` absichtlich
    // nicht – siehe den Kommentar dort und `src/portable/env.d.ts`.
    ['vite.student.config.ts', 'portable-learner', { portable: null, learner: 'true' }],
  ];

  for (const [name, mode, fahnen] of erwartet) {
    it(`${name} ergibt ${mode}`, () => {
      const quelle = config(name);
      const portable = /__LEXIFLOW_PORTABLE__:\s*'(true|false)'/.exec(quelle)?.[1] ?? null;
      const learner = /__LEXIFLOW_LEARNER__:\s*'(true|false)'/.exec(quelle)?.[1] ?? null;

      expect(portable).toBe(fahnen.portable);
      expect(learner).toBe(fahnen.learner);

      expect(
        resolveRuntimeMode({ portable: portable === 'true', learner: learner === 'true' }),
      ).toBe(mode);
    });
  }

  it('jede Konfiguration nennt die Lernfahne oder erklärt ihr Fehlen', () => {
    // Eine neue Konfiguration, die beide Fahnen vergisst, liefe stillschweigend
    // als Portal – mit Anmeldung und Backend in einer Datei, die keines haben
    // darf. Diese Prüfung fängt das beim Hinzufügen ab, nicht beim Ausliefern.
    for (const name of ['vite.config.ts', 'vite.portable.config.ts', 'vite.student.config.ts']) {
      expect(config(name)).toContain('__LEXIFLOW_LEARNER__');
    }
  });
});
