import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../application/repositories';
import {
  AREAS,
  AREA_LABELS,
  HOME_PER_ROLE,
  areasFor,
  isRole,
  mayEnter,
  roleForPortableMode,
} from './access';
import { RUNTIME_MODES, type RuntimeMode } from './mode';

function darf(role: Role | undefined, area: (typeof AREAS)[number], mode: RuntimeMode): boolean {
  return mayEnter({ role, area, mode });
}

describe('der Lehrkraftbereich', () => {
  it('existiert in der Lerndatei für niemanden', () => {
    // Auch nicht für eine Lehrkraft, die dieselbe Datei öffnet: Der Code liegt
    // dort nicht im Bündel. Eine Rollenprüfung, die hier „ja“ sagte, führte auf
    // eine leere Seite.
    for (const role of [...ROLES, undefined]) {
      expect(darf(role, 'teacher', 'portable-learner')).toBe(false);
    }
  });

  it('steht in der Lehrkraftdatei offen', () => {
    expect(darf('teacher', 'teacher', 'portable-teacher')).toBe(true);
  });

  it('bleibt im Portal Lehrkräften und der Verwaltung vorbehalten', () => {
    expect(darf('teacher', 'teacher', 'hosted')).toBe(true);
    expect(darf('admin', 'teacher', 'hosted')).toBe(true);
    expect(darf('student', 'teacher', 'hosted')).toBe(false);
    expect(darf(undefined, 'teacher', 'hosted')).toBe(false);
  });
});

describe('der Lernbereich', () => {
  it('steht allen angemeldeten Rollen offen', () => {
    // Wer Material baut, muss es üben können – der Lernstand dabei ist der
    // eigene.
    for (const role of ROLES) {
      expect(darf(role, 'learner', 'hosted')).toBe(true);
    }
  });

  it('bleibt ohne Anmeldung im Portal verschlossen', () => {
    expect(darf(undefined, 'learner', 'hosted')).toBe(false);
  });
});

describe('die Verwaltung', () => {
  it('gibt es nur im Portal und nur für die Administration', () => {
    expect(darf('admin', 'admin', 'hosted')).toBe(true);
    expect(darf('teacher', 'admin', 'hosted')).toBe(false);
    expect(darf('admin', 'admin', 'portable-teacher')).toBe(false);
    expect(darf('admin', 'admin', 'portable-learner')).toBe(false);
  });
});

describe('öffentliche Seiten', () => {
  it('sind in jedem Modus und ohne Anmeldung erreichbar', () => {
    for (const mode of RUNTIME_MODES) {
      expect(darf(undefined, 'public', mode)).toBe(true);
    }
  });
});

describe('roleForPortableMode', () => {
  it('setzt die Rolle aus der Gestalt der Datei', () => {
    expect(roleForPortableMode('portable-teacher')).toBe('teacher');
    expect(roleForPortableMode('portable-learner')).toBe('student');
  });

  it('lässt sie im Portal offen – dort entscheidet die Anmeldung', () => {
    expect(roleForPortableMode('hosted')).toBeUndefined();
  });

  it('gibt in der Lerndatei nie eine Rolle mit Lehrkraftbereich', () => {
    const role = roleForPortableMode('portable-learner');
    expect(darf(role, 'teacher', 'portable-learner')).toBe(false);
  });
});

describe('areasFor', () => {
  it('nennt in der Lerndatei nur Öffentliches und den Lernbereich', () => {
    expect(areasFor('student', 'portable-learner')).toEqual(['public', 'learner']);
  });

  it('nennt in der Lehrkraftdatei zusätzlich den Lehrkraftbereich', () => {
    expect(areasFor('teacher', 'portable-teacher')).toEqual(['public', 'learner', 'teacher']);
  });

  it('enthält nie einen Bereich, den mayEnter verweigert', () => {
    for (const mode of RUNTIME_MODES) {
      for (const role of [...ROLES, undefined]) {
        for (const area of areasFor(role, mode)) {
          expect(darf(role, area, mode)).toBe(true);
        }
      }
    }
  });
});

describe('Vollständigkeit', () => {
  it('jeder Bereich hat eine deutsche Beschriftung', () => {
    for (const area of AREAS) expect(AREA_LABELS[area].length).toBeGreaterThan(3);
  });

  it('jede Rolle hat einen Startort, und der liegt in einem erlaubten Bereich', () => {
    for (const role of ROLES) {
      expect(HOME_PER_ROLE[role].startsWith('/')).toBe(true);
    }
    // Der Startort einer lernenden Person darf nicht in den Lehrkraftbereich
    // führen – das wäre eine Anmeldung, die sofort in einer Sperre endet.
    expect(HOME_PER_ROLE.student).not.toContain('kurse');
    expect(HOME_PER_ROLE.student).not.toContain('verwaltung');
  });

  it('isRole nimmt genau die bekannten Rollen', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    for (const wert of ['lehrer', 'Teacher', '', null, undefined, 7, {}]) {
      expect(isRole(wert)).toBe(false);
    }
  });
});
