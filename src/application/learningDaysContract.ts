import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { istLerntag, serieAm } from '../domain/lernserie';
import type { Repositories } from './repositories';

/**
 * Der Lerntagsvertrag – wie die anderen zweimal erfüllt.
 *
 * Geprüft wird, was E1, E27 und E28 zusagen:
 *
 * - Ohne bestätigte Zeitzone gibt es **keinen** lokalen Tag und **keine**
 *   Lerntage. Kein Ersatz in UTC, kein Rückfall auf die Geräteuhr.
 * - Mit bestätigter Zeitzone kommt immer eine Antwort – auch ohne jedes
 *   Ereignis.
 * - Derselbe Zeitpunkt fällt je nach Zeitzone auf verschiedene Kalendertage.
 * - Doppelt eingespielte Ereignisse zählen einmal.
 * - Es gibt nur die eigenen Lerntage.
 *
 * ## Warum das gegen beide Fassungen läuft
 *
 * Weil die Seite „Heute" in den Prüfungen gegen die Fälschung gebaut wird.
 * Verhielte sich die Fälschung anders als SQL, prüften die Seitentests einen
 * Kalender, den es im Produkt nicht gibt.
 */

export interface LerntagsSzenario {
  repositories(): Repositories;
  alsPerson(userId: string): Promise<void>;
  personen: { lernende: string; zweiteLernende: string };
  /** Die Zeitzone bestätigen – über den normalen Weg, nicht am Vertrag vorbei. */
  bestaetigeZeitzone(zone: string): Promise<void>;
  /**
   * `anzahl` bewertete Aufgaben zu diesem Zeitpunkt einspielen.
   *
   * `kennung` macht die Ereignisse wiederholbar: Derselbe Wert zweimal
   * eingespielt ist derselbe Satz Ereignisse – genau das, was ein Gerät
   * tut, dessen Antwort unterwegs verlorenging.
   */
  spieleEin(zeitpunkt: string, anzahl: number, kennung: string): Promise<void>;
}

/** In Berlin der 6. Oktober (01:30), in New York noch der 5. (19:30). */
export const ABENDS_UTC = '2026-10-05T23:30:00Z';

export function describeLearningDaysContract(
  name: string,
  aufbau: () => Promise<LerntagsSzenario>,
  abbau: () => Promise<void> = async () => undefined,
): void {
  describe(name, () => {
    let szenario: LerntagsSzenario;

    beforeEach(async () => {
      szenario = await aufbau();
      await szenario.alsPerson(szenario.personen.lernende);
    });

    afterAll(async () => {
      await abbau();
    });

    const lerntage = () => szenario.repositories().learningDays!;

    it('meldet ohne bestätigte Zeitzone einen unbestätigten Kalender', async () => {
      await expect(lerntage().myCalendar()).resolves.toEqual({ bestaetigt: false });
    });

    it('meldet ohne bestätigte Zeitzone keine Lerntage – auch mit Ereignissen', async () => {
      /*
        Der wichtigste Fall. Zwölf Aufgaben sind geübt, und es gibt trotzdem
        keinen Lerntag: Ohne Tagesgrenze lässt sich nicht sagen, an welchem
        Tag sie waren. Eine Zahl in UTC wäre nicht vorsichtig, sondern falsch.
      */
      await szenario.spieleEin(ABENDS_UTC, 12, 'a');
      await expect(lerntage().myLearningDays()).resolves.toEqual([]);
    });

    it('nennt nach der Bestätigung einen heutigen Tag und einen Montag', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      const kalender = await lerntage().myCalendar();
      expect(kalender.bestaetigt).toBe(true);
      if (!kalender.bestaetigt) return;

      expect(kalender.timeZone).toBe('Europe/Berlin');
      expect(kalender.heute).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(kalender.wochenbeginn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Der Wochenbeginn ist ein Montag und liegt höchstens sechs Tage zurück.
      expect(new Date(`${kalender.wochenbeginn}T00:00:00Z`).getUTCDay()).toBe(1);
    });

    it('antwortet auch ohne ein einziges Ereignis', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await expect(lerntage().myLearningDays()).resolves.toEqual([]);
      await expect(lerntage().myCalendar()).resolves.toMatchObject({ bestaetigt: true });
    });

    it('zählt die Aufgaben auf dem lokalen Tag', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await szenario.spieleEin(ABENDS_UTC, 11, 'a');
      const tage = await lerntage().myLearningDays();
      expect(tage).toEqual([{ localDay: '2026-10-06', taskCount: 11 }]);
      expect(istLerntag(tage[0])).toBe(true);
    });

    it('legt denselben Zeitpunkt je nach Zeitzone auf verschiedene Tage', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await szenario.spieleEin(ABENDS_UTC, 10, 'a');
      expect((await lerntage().myLearningDays())[0]?.localDay).toBe('2026-10-06');

      await szenario.bestaetigeZeitzone('America/New_York');
      expect((await lerntage().myLearningDays())[0]?.localDay).toBe('2026-10-05');
    });

    it('zählt ein doppelt eingespieltes Ereignis nur einmal', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await szenario.spieleEin(ABENDS_UTC, 10, 'a');
      await szenario.spieleEin(ABENDS_UTC, 10, 'a');
      expect((await lerntage().myLearningDays())[0]?.taskCount).toBe(10);
    });

    it('macht aus neun Aufgaben keinen Lerntag und aus zehn schon', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await szenario.spieleEin(ABENDS_UTC, 9, 'a');
      const neun = await lerntage().myLearningDays();
      expect(neun[0]?.taskCount).toBe(9);
      expect(serieAm(neun, '2026-10-06', '2026-10-05').laenge).toBe(0);

      await szenario.spieleEin(ABENDS_UTC, 1, 'b');
      const zehn = await lerntage().myLearningDays();
      expect(zehn[0]?.taskCount).toBe(10);
      expect(serieAm(zehn, '2026-10-06', '2026-10-05').laenge).toBe(1);
    });

    it('zeigt niemandem die Lerntage einer anderen Person', async () => {
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await szenario.spieleEin(ABENDS_UTC, 12, 'a');

      await szenario.alsPerson(szenario.personen.zweiteLernende);
      await szenario.bestaetigeZeitzone('Europe/Berlin');
      await expect(lerntage().myLearningDays()).resolves.toEqual([]);

      await szenario.alsPerson(szenario.personen.lernende);
      expect((await lerntage().myLearningDays())[0]?.taskCount).toBe(12);
    });

    it('hat keine Methode, die etwas entgegennimmt', async () => {
      const vertrag = lerntage();
      expect(Object.keys(vertrag).sort()).toEqual(['myCalendar', 'myLearningDays']);
      expect(vertrag.myCalendar.length).toBe(0);
      expect(vertrag.myLearningDays.length).toBe(0);
    });
  });
}
