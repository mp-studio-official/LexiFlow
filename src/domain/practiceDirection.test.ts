import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTION_CHOICE,
  DIRECTION_CHOICE_LABELS,
  directionChoicesFor,
  effectiveDirection,
  isDirectionChoiceAvailable,
  parseDirectionChoice,
} from './practiceDirection';
import { planSession, mulberry32, isDirectionUnlocked } from './exercises';
import { planFreeSession } from './freePractice';
import { makeEntry } from '../test/fixtures';

/**
 * Sprint 3B.1: Die Lernrichtung ist eine Entscheidung der lernenden Person.
 *
 * Der zentrale Test ist der vorletzte: Eine ausdrücklich gewählte Richtung
 * wird geübt, auch wenn die Freischaltbedingung sie im gemischten Modus noch
 * zurückhalten würde.
 */

function entriesNamed(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

describe('Auswahl der Richtung', () => {
  it('bietet nur bei „beide Richtungen“ eine Wahl an', () => {
    expect(directionChoicesFor('both')).toEqual(['mixed', 'en-de', 'de-en']);
    // Ein Paket mit einer Richtung bietet keine Attrappe an.
    expect(directionChoicesFor('en-de')).toEqual([]);
    expect(directionChoicesFor('de-en')).toEqual([]);
  });

  it('nennt „Gemischt“ als Voreinstellung', () => {
    expect(DEFAULT_DIRECTION_CHOICE).toBe('mixed');
    expect(DIRECTION_CHOICE_LABELS.mixed).toBe('Gemischt');
    expect(DIRECTION_CHOICE_LABELS['de-en']).toBe('Deutsch → Englisch');
  });

  it('kennt gültige und ungültige Wahlen', () => {
    expect(isDirectionChoiceAvailable('both', 'de-en')).toBe(true);
    expect(isDirectionChoiceAvailable('en-de', 'de-en')).toBe(false);
  });

  it('führt eine ungültige Wahl still auf die Paketrichtung zurück', () => {
    expect(effectiveDirection('en-de', 'de-en')).toBe('en-de');
    expect(effectiveDirection('de-en', 'mixed')).toBe('de-en');
  });

  it('macht die gewählte Richtung zur wirksamen Richtung', () => {
    expect(effectiveDirection('both', 'mixed')).toBe('both');
    expect(effectiveDirection('both', 'en-de')).toBe('en-de');
    expect(effectiveDirection('both', 'de-en')).toBe('de-en');
  });

  it('liest den URL-Parameter tolerant', () => {
    expect(parseDirectionChoice('de-en')).toBe('de-en');
    expect(parseDirectionChoice('unsinn')).toBe('mixed');
    expect(parseDirectionChoice(null)).toBe('mixed');
  });
});

describe('Wirkung auf die Planung', () => {
  const entries = entriesNamed(4);
  const empty = new Map();

  it('hält im gemischten Modus die Staffelung ein', () => {
    // Ohne Lernstand ist Deutsch → Englisch im empfohlenen Modus noch zu.
    expect(isDirectionUnlocked('e1', empty, 'de-en', 'both')).toBe(false);

    const plan = planSession(entries, empty, effectiveDirection('both', 'mixed'), 20, new Date(), mulberry32(1));
    expect(plan.targets.every((target) => target.direction === 'en-de')).toBe(true);
  });

  it('übt eine ausdrücklich gewählte Richtung ohne Freischaltung', () => {
    const direction = effectiveDirection('both', 'de-en');
    const plan = planSession(entries, empty, direction, 20, new Date(), mulberry32(1));

    expect(plan.targets).toHaveLength(4);
    expect(plan.targets.every((target) => target.direction === 'de-en')).toBe(true);
  });

  it('enthält im gemischten Modus beide Richtungen mit Abstand', () => {
    // Freies Üben kennt die Staffelung nicht und zeigt den Mischbetrieb.
    const plan = planFreeSession(entries, empty, 'both', 20, mulberry32(5));
    const directions = new Set(plan.targets.map((target) => target.direction));

    expect(directions).toEqual(new Set(['en-de', 'de-en']));

    // Dieselbe Vokabel steht nie unmittelbar hintereinander.
    plan.targets.forEach((target, index) => {
      const next = plan.targets[index + 1];
      if (next) expect(next.entry.id).not.toBe(target.entry.id);
    });
  });

  it('bietet freies Üben in beiden Richtungen sofort an', () => {
    const plan = planFreeSession(entries, empty, effectiveDirection('both', 'mixed'), 50, mulberry32(1));
    expect(plan.availableCount).toBe(8);
  });

  it('lässt ein Paket mit einer Richtung unverändert', () => {
    const plan = planSession(entries, empty, effectiveDirection('en-de', 'mixed'), 20, new Date(), mulberry32(1));
    expect(plan.targets.every((target) => target.direction === 'en-de')).toBe(true);
  });
});
