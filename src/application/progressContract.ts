import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { antwortEreignis } from './progressEvents';
import type { ProgressEvent, Repositories } from './repositories';
import type { AnswerVerdict } from '../domain/answerCheck';
import type { EntryProgress, TaskDirection } from '../domain/schema';

/**
 * Der Lernstandsvertrag – wie Kurs- und Paketvertrag zweimal erfüllt.
 *
 * Geprüft wird, was ADR-1 und die Migration aus Phase 6 zusagen:
 *
 * - Es gibt nur den **eigenen** Lernstand. Keine Methode nimmt eine fremde
 *   Kennung entgegen, und zwei Personen im selben Kurs sehen einander nicht.
 * - Dasselbe Ereignis zweimal zu senden ist dasselbe wie einmal – sonst
 *   zählte ein Wackler im WLAN eine Vokabel doppelt.
 * - Der Leitner-Stand kommt vom Gerät und wird abgelegt, nicht nachgerechnet.
 * - Ein **älteres** Ereignis dreht nichts zurück. Zwei Geräte, die kurz
 *   nacheinander senden, laufen nicht rückwärts.
 * - Zurücksetzen löscht den eigenen Stand – aber nicht den Schutz gegen
 *   Doppelzählung, sonst ließe sich eine alte Runde erneut einreichen.
 *
 * ## Was dieser Vertrag nicht prüfen kann
 *
 * Ob eine Lehrkraft fremde Lernstände sieht. Dafür gibt es hier keinen Aufruf,
 * und genau das ist der Punkt: `scripts/db/rls.test.mjs` fragt die Tabellen
 * deshalb unmittelbar, unter der Rolle einer Lehrkraft, an den Verträgen
 * vorbei.
 */

export interface LernstandSzenario {
  repositories(): Repositories;
  alsPerson(userId: string): Promise<void>;
  personen: {
    lernende: string;
    zweiteLernende: string;
  };
  /** Ein Kurs mit einem zugewiesenen Paket, in dem beide Mitglied sind. */
  kursMitPaket(): Promise<{ courseId: string; packId: string }>;
}

export function describeProgressContract(
  name: string,
  aufbau: () => Promise<LernstandSzenario>,
  abbau: () => Promise<void> = async () => undefined,
): void {
  describe(`Lernstandsvertrag: ${name}`, () => {
    let szenario: LernstandSzenario;
    let kurs = '';
    let paket = '';

    const progress = () => szenario.repositories().progress!;

    beforeEach(async () => {
      szenario = await aufbau();
      const gebaut = await szenario.kursMitPaket();
      kurs = gebaut.courseId;
      paket = gebaut.packId;
      await szenario.alsPerson(szenario.personen.lernende);
    });

    afterEach(async () => {
      await abbau();
    });

    /** Ein Zeitpunkt, der sich je Aufruf um eine Minute weiterschiebt. */
    let minute = 0;
    function zeit(): Date {
      minute += 1;
      return new Date(Date.UTC(2026, 8, 14, 9, minute, 0));
    }

    function ereignis(input: {
      entryId: string;
      outcome: AnswerVerdict;
      direction?: TaskDirection;
      vorher?: EntryProgress;
      now?: Date;
      eventId?: string;
    }): ProgressEvent {
      return antwortEreignis({
        courseId: kurs,
        packId: paket,
        entryId: input.entryId,
        direction: input.direction ?? 'en-de',
        outcome: input.outcome,
        vorher: input.vorher,
        now: input.now ?? zeit(),
        ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
      }).event;
    }

    async function stand(entryId: string, direction: TaskDirection = 'en-de') {
      const alle = await progress().myEntryProgress(kurs, paket);
      return alle.find(
        (eintrag) => eintrag.entryId === entryId && eintrag.direction === direction,
      );
    }

    describe('Zählen', () => {
      it('zählt Antworten und richtige Antworten je Paket', async () => {
        await progress().recordEvents([
          ereignis({ entryId: 'e1', outcome: 'correct' }),
          ereignis({ entryId: 'e2', outcome: 'wrong' }),
          ereignis({ entryId: 'e3', outcome: 'correct' }),
        ]);

        const paketstand = await progress().myPackProgress(kurs, paket);
        expect(paketstand?.answeredCount).toBe(3);
        expect(paketstand?.correctCount).toBe(2);
      });

      it('kennt noch keinen Stand, solange nichts geübt wurde', async () => {
        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
        expect(await progress().myEntryProgress(kurs, paket)).toEqual([]);
      });

      it('zählt begonnene Übungsrunden – und sonst nichts über sie', async () => {
        await progress().beginSession(kurs, paket);
        await progress().beginSession(kurs, paket);

        const paketstand = await progress().myPackProgress(kurs, paket);
        expect(paketstand?.sessionCount).toBe(2);
        expect(paketstand?.answeredCount).toBe(0);
      });

      it('dreht den Zeitpunkt der letzten Übung nicht zurück', async () => {
        const spaet = new Date('2026-09-14T10:00:00.000Z');
        const frueh = new Date('2026-09-14T08:00:00.000Z');

        await progress().recordEvents([ereignis({ entryId: 'e1', outcome: 'correct', now: spaet })]);
        await progress().recordEvents([ereignis({ entryId: 'e2', outcome: 'correct', now: frueh })]);

        const paketstand = await progress().myPackProgress(kurs, paket);
        expect(paketstand?.lastPracticedAt).toBe(spaet.toISOString());
        // Gezählt wurde die späte Antwort trotzdem – nur der Zeitpunkt bleibt.
        expect(paketstand?.answeredCount).toBe(2);
      });
    });

    describe('Idempotenz', () => {
      it('zählt dasselbe Ereignis nur einmal, auch in zwei Aufrufen', async () => {
        const einmal = ereignis({ entryId: 'e1', outcome: 'correct' });

        await progress().recordEvents([einmal]);
        await progress().recordEvents([einmal]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });

      it('zählt dasselbe Ereignis nur einmal, auch im selben Aufruf', async () => {
        const einmal = ereignis({ entryId: 'e1', outcome: 'correct' });

        await progress().recordEvents([einmal, einmal]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });

      it('unterscheidet Ereignisse mit gleichem Inhalt an ihrer Kennung', async () => {
        /*
          Zwei Antworten auf dieselbe Vokabel in derselben Sekunde sind zwei
          Antworten. Nur die Kennung entscheidet – nicht der Inhalt.
        */
        const erste = ereignis({ entryId: 'e1', outcome: 'correct' });
        const zweite = { ...erste, eventId: ereignis({ entryId: 'e1', outcome: 'correct' }).eventId };

        await progress().recordEvents([erste, zweite]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    describe('Der Leitner-Stand vom Gerät', () => {
      it('wird abgelegt, wie er gesendet wurde', async () => {
        const { event, nachher } = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: 'e1',
          direction: 'en-de',
          outcome: 'correct',
          now: zeit(),
        });
        await progress().recordEvents([event]);

        const abgelegt = await stand('e1');
        expect(abgelegt?.box).toBe(nachher.box);
        expect(abgelegt?.correctCount).toBe(nachher.correctCount);
        expect(abgelegt?.streak).toBe(nachher.streak);
        expect(abgelegt?.dueAt).toBe(nachher.dueAt);
        expect(abgelegt?.lastAnsweredAt).toBe(event.occurredAt);
      });

      it('wird je Abfragerichtung getrennt geführt', async () => {
        await progress().recordEvents([
          ereignis({ entryId: 'e1', outcome: 'correct', direction: 'en-de' }),
          ereignis({ entryId: 'e1', outcome: 'wrong', direction: 'de-en' }),
        ]);

        expect((await stand('e1', 'en-de'))?.box).toBe(2);
        expect((await stand('e1', 'de-en'))?.box).toBe(1);
      });

      it('läuft über mehrere Antworten hinweg weiter', async () => {
        const erste = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: 'e1',
          direction: 'en-de',
          outcome: 'correct',
          now: zeit(),
        });
        const zweite = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: 'e1',
          direction: 'en-de',
          outcome: 'correct',
          vorher: erste.nachher,
          now: zeit(),
        });

        await progress().recordEvents([erste.event, zweite.event]);

        const abgelegt = await stand('e1');
        expect(abgelegt?.box).toBe(3);
        expect(abgelegt?.streak).toBe(2);
      });

      it('übernimmt einen älteren Stand nicht über einen neueren', async () => {
        /*
          Der Zwei-Geräte-Fall: Das Tablet war offline und sendet nach, was
          älter ist als das, was das Telefon schon geschickt hat. Der Zähler
          steigt – die Vokabel wurde ja zweimal geübt –, aber das Fach läuft
          nicht rückwärts.
        */
        const spaet = new Date('2026-09-14T10:00:00.000Z');
        const frueh = new Date('2026-09-14T08:00:00.000Z');

        const neuer = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: 'e1',
          direction: 'en-de',
          outcome: 'correct',
          vorher: {
            key: `${paket}::e1::en-de`,
            packId: paket,
            entryId: 'e1',
            direction: 'en-de',
            box: 3,
            correctCount: 3,
            wrongCount: 0,
            streak: 3,
            dueAt: spaet.toISOString(),
          },
          now: spaet,
        });
        const aelter = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: 'e1',
          direction: 'en-de',
          outcome: 'wrong',
          now: frueh,
        });

        await progress().recordEvents([neuer.event]);
        await progress().recordEvents([aelter.event]);

        const abgelegt = await stand('e1');
        expect(abgelegt?.box).toBe(4);
        expect(abgelegt?.lastAnsweredAt).toBe(spaet.toISOString());
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    describe('Wessen Lernstand', () => {
      it('bleibt zwischen zwei Personen im selben Kurs getrennt', async () => {
        await progress().recordEvents([
          ereignis({ entryId: 'e1', outcome: 'correct' }),
          ereignis({ entryId: 'e2', outcome: 'correct' }),
        ]);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
        expect(await progress().myEntryProgress(kurs, paket)).toEqual([]);

        await szenario.alsPerson(szenario.personen.lernende);
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    describe('Zurücksetzen', () => {
      it('löscht den eigenen Stand vollständig', async () => {
        await progress().beginSession(kurs, paket);
        await progress().recordEvents([ereignis({ entryId: 'e1', outcome: 'correct' })]);

        await progress().resetMyProgress(kurs, paket);

        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
        expect(await progress().myEntryProgress(kurs, paket)).toEqual([]);
      });

      it('lässt den Schutz gegen Doppelzählung bestehen', async () => {
        /*
          Sonst ließe sich eine alte Runde nach dem Zurücksetzen erneut
          einreichen – und ein Lernstand entstünde aus einem Wiederholung
          statt aus Üben.
        */
        const einmal = ereignis({ entryId: 'e1', outcome: 'correct' });
        await progress().recordEvents([einmal]);
        await progress().resetMyProgress(kurs, paket);
        await progress().recordEvents([einmal]);

        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
      });

      it('lässt den Stand der anderen Person unberührt', async () => {
        await progress().recordEvents([ereignis({ entryId: 'e1', outcome: 'correct' })]);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        await progress().recordEvents([ereignis({ entryId: 'e1', outcome: 'correct' })]);
        await progress().resetMyProgress(kurs, paket);

        await szenario.alsPerson(szenario.personen.lernende);
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });
    });

    describe('Grenzen', () => {
      it('nimmt nicht beliebig viele Ereignisse auf einmal', async () => {
        const zuviele = Array.from({ length: 201 }, (_, index) =>
          ereignis({ entryId: `e${index}`, outcome: 'correct' }),
        );

        await expect(progress().recordEvents(zuviele)).rejects.toThrow();
      });

      it('nimmt eine leere Liste als das, was sie ist – nichts', async () => {
        await progress().recordEvents([]);
        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
      });
    });
  });
}
