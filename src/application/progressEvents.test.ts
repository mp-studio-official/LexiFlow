import { describe, expect, it } from 'vitest';
import { alsEntryState, alsLernstand, antwortEreignis } from './progressEvents';
import { applyAnswer, createEntryProgress } from '../domain/leitner';
import { progressKey } from '../domain/ids';

/**
 * Die eine Stelle, an der ein Lernstandsereignis entsteht.
 *
 * Geprüft wird hier nicht das Leitner-Rechnen – das steht seit Sprint 1 in
 * `src/domain/leitner.test.ts`. Geprüft wird, dass **dieselbe** Rechnung
 * benutzt wird und nichts unterwegs verlorengeht. Genau daran hinge sonst
 * die zweite Wahrheit, die § 5.5.1 verhindern soll.
 */

const JETZT = new Date('2026-09-14T09:00:00.000Z');

function eingabe() {
  return {
    courseId: 'kurs-1',
    packId: 'pack-1',
    entryId: 'v-1',
    direction: 'en-de' as const,
    outcome: 'correct' as const,
    now: JETZT,
  };
}

describe('antwortEreignis', () => {
  it('rechnet mit derselben Funktion wie alles andere', async () => {
    const { nachher } = antwortEreignis(eingabe());
    const erwartet = applyAnswer(createEntryProgress('pack-1', 'v-1', 'en-de', JETZT), 'correct', JETZT);

    expect(nachher).toEqual(erwartet);
  });

  it('trägt den gerechneten Stand vollständig ins Ereignis', async () => {
    const { event, nachher } = antwortEreignis(eingabe());

    expect(event.entryState).toEqual(alsEntryState(nachher));
    expect(event.occurredAt).toBe(JETZT.toISOString());
    expect(event.outcome).toBe('correct');
  });

  it('baut auf einem vorhandenen Stand auf, statt von vorn zu beginnen', async () => {
    const erste = antwortEreignis(eingabe());
    const zweite = antwortEreignis({ ...eingabe(), vorher: erste.nachher });

    expect(erste.event.entryState.box).toBe(2);
    expect(zweite.event.entryState.box).toBe(3);
    expect(zweite.event.entryState.streak).toBe(2);
  });

  it('vergibt jedem Ereignis eine eigene Kennung', async () => {
    const a = antwortEreignis(eingabe()).event;
    const b = antwortEreignis(eingabe()).event;

    expect(a.eventId).not.toBe(b.eventId);
    // Der Rest ist gleich – nur die Kennung unterscheidet zwei Antworten.
    expect({ ...a, eventId: '' }).toEqual({ ...b, eventId: '' });
  });
});

describe('alsLernstand', () => {
  it('macht aus einem Ereignis wieder einen vollständigen Lernstand', async () => {
    const { event, nachher } = antwortEreignis(eingabe());

    expect(alsLernstand(event)).toEqual(nachher);
  });

  it('setzt den Schlüssel aus Paket, Vokabel und Richtung zusammen', async () => {
    const { event } = antwortEreignis(eingabe());

    expect(alsLernstand(event).key).toBe(progressKey('pack-1', 'v-1', 'en-de'));
  });

  it('nimmt den Antwortzeitpunkt als Zeitpunkt der Antwort', async () => {
    /*
      Ein zweiter Zeitstempel im Ereignis wäre ein zweiter Wert, der von
      `occurredAt` abweichen kann – und niemand wüsste, welcher gilt.
    */
    const { event } = antwortEreignis(eingabe());

    expect(alsLernstand(event).lastAnsweredAt).toBe(event.occurredAt);
  });
});
