// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { coachAuftrag } from './coachauftrag';

const AUFGABE = {
  lernform: 'to tell sb. sth.',
  richtung: 'de-en',
  beispielsatz: 'The man told a story.',
  antwort: 'to say',
  loesung: 'to tell somebody something',
  sprache: 'de',
  niveau: 'A2',
  userId: 'darf-nicht-hinaus',
  lernverlauf: ['ebenfalls verboten'],
};

describe('der serverseitige Lerncoach-Auftrag', () => {
  it('kennt genau die vier festen Handlungen', () => {
    for (const aktion of ['fehler-erklaeren', 'hinweis', 'anderer-satz', 'warum-richtig']) {
      expect(coachAuftrag(`learner-coach/${aktion}`, AUFGABE)?.aktion).toBe(aktion);
    }
    expect(coachAuftrag('learner-coach/freier-chat', AUFGABE)).toBeUndefined();
  });

  it('laesst Personenkennung und Lernverlauf nicht in den Anbieterauftrag', () => {
    const auftrag = coachAuftrag('learner-coach/hinweis', AUFGABE);
    const hinaus = JSON.stringify(auftrag);
    expect(hinaus).not.toContain('userId');
    expect(hinaus).not.toContain('darf-nicht-hinaus');
    expect(hinaus).not.toContain('lernverlauf');
    expect(auftrag?.aufgabe).toMatchObject({ lernform: 'to tell sb. sth.', richtung: 'de-en' });
  });

  it('begrenzt jedes Textfeld und lehnt eine unbrauchbare Aufgabe ab', () => {
    const lang = 'x'.repeat(2_000);
    const auftrag = coachAuftrag('learner-coach/hinweis', { ...AUFGABE, beispielsatz: lang });
    expect(auftrag?.aufgabe.beispielsatz?.length).toBeLessThanOrEqual(600);
    expect(coachAuftrag('learner-coach/hinweis', { richtung: 'de-en' })).toBeUndefined();
  });

  it('fordert als Antwort genau ein Textfeld', () => {
    expect(coachAuftrag('learner-coach/hinweis', AUFGABE)?.schema).toEqual({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    });
  });
});
