import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_MODES,
  RUNTIME_MODE_LABELS,
  hasAccounts,
  hasTeacherArea,
  isPortableMode,
  mayUseBackend,
  resolveRuntimeMode,
  type RuntimeMode,
} from './mode';

const root = resolve(import.meta.dirname, '../..');

const KEINE = { portable: false, learner: false, portal: false };

describe('resolveRuntimeMode', () => {
  it('ohne Fahnen ist es die kontofreie PWA – nicht das Portal', () => {
    /*
      Bis Phase 2 stand hier `hosted`, und das war ein Fehler: Der Standard
      eines Web-Builds wäre damit der einzige Modus mit Backend gewesen. Wer
      eine neue Konfiguration anlegt und die Fahnen vergisst, bekommt jetzt
      weniger, nicht mehr.
    */
    expect(resolveRuntimeMode(KEINE)).toBe('web-solo');
  });

  it('die portable Fahne allein ergibt die Lehrkraftdatei', () => {
    expect(resolveRuntimeMode({ ...KEINE, portable: true })).toBe('portable-teacher');
  });

  it('die Lernfahne allein ergibt die Lerndatei', () => {
    // Genau dieser Fall wird gebaut: `vite.student.config.ts` setzt nur diese
    // eine Fahne (siehe dort).
    expect(resolveRuntimeMode({ ...KEINE, learner: true })).toBe('portable-learner');
  });

  it('die Portalfahne allein ergibt das Portal', () => {
    expect(resolveRuntimeMode({ ...KEINE, portal: true })).toBe('hosted');
  });

  it('mehrere Fahnen ergeben die restriktivere Gestalt, nicht die großzügigere', () => {
    /*
      Ein Build, der mehrere setzt, ist ein Konfigurationsfehler. Die Frage
      ist nicht, ob er vorkommt, sondern was dann herauskommt: eine Lerndatei
      mit Lehrkraftwerkstatt wäre der Schaden, eine Lerndatei ohne sie nur ein
      Ärgernis. Deshalb gewinnt die engere Fahne.
    */
    expect(resolveRuntimeMode({ portable: true, learner: true, portal: false })).toBe('portable-learner');
    expect(resolveRuntimeMode({ portable: false, learner: true, portal: true })).toBe('portable-learner');
    expect(resolveRuntimeMode({ portable: true, learner: false, portal: true })).toBe('portable-teacher');
  });

  it('„hosted“ entsteht nur aus genau einer Fahne', () => {
    // Der einzige Modus mit Backend soll sich nicht aus Versehen ergeben.
    const alleKombinationen = [false, true].flatMap((portable) =>
      [false, true].flatMap((learner) =>
        [false, true].map((portal) => ({ portable, learner, portal })),
      ),
    );
    const ergibtHosted = alleKombinationen.filter(
      (flags) => resolveRuntimeMode(flags) === 'hosted',
    );
    expect(ergibtHosted).toEqual([{ portable: false, learner: false, portal: true }]);
  });
});

describe('Aussagen über einen Modus', () => {
  it('nur die beiden Dateien sind portabel', () => {
    expect(isPortableMode('portable-teacher')).toBe(true);
    expect(isPortableMode('portable-learner')).toBe(true);
    expect(isPortableMode('web-solo')).toBe(false);
    expect(isPortableMode('hosted')).toBe(false);
  });

  it('nur das Portal darf ein Backend benutzen', () => {
    const erlaubt = RUNTIME_MODES.filter((mode) => mayUseBackend(mode));
    expect(erlaubt).toEqual(['hosted']);
  });

  it('die Lerndatei hat keinen Lehrkraftbereich', () => {
    expect(hasTeacherArea('portable-learner')).toBe(false);
    expect(hasTeacherArea('portable-teacher')).toBe(true);
    expect(hasTeacherArea('web-solo')).toBe(true);
    expect(hasTeacherArea('hosted')).toBe(true);
  });

  it('Konten gibt es nur im Portal', () => {
    const mitKonten = RUNTIME_MODES.filter((mode) => hasAccounts(mode));
    expect(mitKonten).toEqual(['hosted']);
  });

  it('die kontofreie PWA darf kein Backend benutzen', () => {
    // Sie liegt neben dem Portal auf demselben Server, aus demselben
    // Quellbaum. Genau deshalb steht diese Zeile hier.
    expect(mayUseBackend('web-solo')).toBe(false);
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

  function fahne(quelle: string, name: string): string | null {
    return new RegExp(`${name}:\\s*'(true|false)'`).exec(quelle)?.[1] ?? null;
  }

  /*
    `null` heißt: Diese Konfiguration setzt die Fahne nicht. Das ist bei
    `__LEXIFLOW_PORTABLE__` in `vite.student.config.ts` Absicht – siehe den
    Kommentar dort und `src/portable/env.d.ts`.
  */
  const erwartet: ReadonlyArray<
    [string, RuntimeMode, { portable: string | null; learner: string | null; portal: string | null }]
  > = [
    ['vite.config.ts', 'web-solo', { portable: 'false', learner: 'false', portal: 'false' }],
    ['vite.portal.config.ts', 'hosted', { portable: 'false', learner: 'false', portal: 'true' }],
    ['vite.portable.config.ts', 'portable-teacher', { portable: 'true', learner: 'false', portal: 'false' }],
    ['vite.student.config.ts', 'portable-learner', { portable: null, learner: 'true', portal: null }],
  ];

  for (const [name, mode, fahnen] of erwartet) {
    it(`${name} ergibt ${mode}`, () => {
      const quelle = config(name);
      const portable = fahne(quelle, '__LEXIFLOW_PORTABLE__');
      const learner = fahne(quelle, '__LEXIFLOW_LEARNER__');
      const portal = fahne(quelle, '__LEXIFLOW_PORTAL__');

      expect(portable).toBe(fahnen.portable);
      expect(learner).toBe(fahnen.learner);
      expect(portal).toBe(fahnen.portal);

      expect(
        resolveRuntimeMode({
          portable: portable === 'true',
          learner: learner === 'true',
          portal: portal === 'true',
        }),
      ).toBe(mode);
    });
  }

  it('genau eine Konfiguration ergibt das Portal', () => {
    // Zwei wären ein Fehler, den man sonst erst am fertigen Deployment merkt.
    const portale = erwartet.filter(([, mode]) => mode === 'hosted');
    expect(portale.map(([name]) => name)).toEqual(['vite.portal.config.ts']);
  });

  it('jede Konfiguration nennt die Lernfahne oder erklärt ihr Fehlen', () => {
    // Eine neue Konfiguration, die alle Fahnen vergisst, liefe als `web-solo`
    // – ohne Backend, also harmlos. Genannt werden sollen sie trotzdem, damit
    // beim Hinzufügen jemand darüber nachdenkt.
    for (const [name] of erwartet) {
      expect(config(name)).toContain('__LEXIFLOW_LEARNER__');
    }
  });
});
