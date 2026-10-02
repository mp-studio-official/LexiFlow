import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { zeitzonenstand, zeitzonenVorschlag } from '../domain/zeitzone';
import type { Repositories } from './repositories';

/**
 * Der Einstellungsvertrag – wie die anderen zweimal erfüllt.
 *
 * Geprüft wird, was E26 und E27 zusagen:
 *
 * - Eine fehlende Zeile ist der **Normalfall**: Ziel aus, Zeitzone
 *   unbestätigt. Kein Fehler, keine erfundene Voreinstellung.
 * - Eine Zeitzone kommt nur über `confirmTimeZone` hinein. Ein Vorschlag des
 *   Browsers wird nirgends abgelegt, solange niemand bestätigt hat.
 * - Eine bestätigte Zeitzone wird **nie automatisch überschrieben** – auch
 *   dann nicht, wenn das Gerät inzwischen etwas anderes meint.
 * - Das Wochenziel nimmt 1 bis 7 an und sonst nichts; `undefined` schaltet es
 *   ab und ist die Voreinstellung.
 * - Das eine Feld zu ändern lässt das andere in Ruhe.
 * - Zwei Personen sehen einander nicht.
 *
 * ## Was dieser Vertrag nicht prüfen kann
 *
 * Ob eine **Lehrkraft** die Einstellungen ihrer Lernenden sieht. Dafür gibt
 * es hier keinen Aufruf – und genau das ist der Punkt. Die Frage stellt
 * `scripts/db/lernendeneinstellungen.test.mjs` unmittelbar an die Tabelle,
 * unter der Rolle einer Lehrkraft, an den Verträgen vorbei.
 */

export interface EinstellungsSzenario {
  repositories(): Repositories;
  alsPerson(userId: string): Promise<void>;
  personen: {
    lernende: string;
    zweiteLernende: string;
  };
}

export function describeLearnerSettingsContract(
  name: string,
  aufbau: () => Promise<EinstellungsSzenario>,
  abbau: () => Promise<void> = async () => undefined,
): void {
  describe(name, () => {
    let szenario: EinstellungsSzenario;

    beforeEach(async () => {
      szenario = await aufbau();
      await szenario.alsPerson(szenario.personen.lernende);
    });

    afterAll(async () => {
      await abbau();
    });

    const einstellungen = () => szenario.repositories().learnerSettings!;

    it('beginnt ohne Zeile – und das ist kein Fehler', async () => {
      await expect(einstellungen().mySettings()).resolves.toEqual({});
    });

    it('legt keine Voreinstellung für die Zeitzone an', async () => {
      /*
        E27 in einer Prüfung. `Europe/Berlin` wäre für fast alle richtig –
        und man sähe hinterher nicht mehr, ob jemand bestätigt hat oder ob
        nur eine Voreinstellung dastand.
      */
      const gelesen = await einstellungen().mySettings();
      expect(gelesen.timeZone).toBeUndefined();
    });

    it('nimmt eine bestätigte Zeitzone an und gibt sie zurück', async () => {
      await einstellungen().confirmTimeZone('Europe/Berlin');
      await expect(einstellungen().mySettings()).resolves.toEqual({ timeZone: 'Europe/Berlin' });
    });

    it('lehnt eine unbekannte Zeitzone ab und speichert nichts', async () => {
      await expect(einstellungen().confirmTimeZone('Europa/Bielefeld')).rejects.toThrow();
      await expect(einstellungen().mySettings()).resolves.toEqual({});
    });

    it('überschreibt eine bestätigte Zeitzone nicht beim Lesen', async () => {
      /*
        Der Kern von E27, und er lässt sich hier wirklich prüfen: Zwischen
        den beiden Aufrufen liegt ein Gerätevorschlag. Würde ihn irgendetwas
        im Lesepfad ablegen, stünde danach etwas anderes da.
      */
      await einstellungen().confirmTimeZone('Pacific/Auckland');
      const vorschlag = zeitzonenVorschlag();
      expect(vorschlag).not.toBe('Pacific/Auckland');

      const erneut = await einstellungen().mySettings();
      expect(erneut.timeZone).toBe('Pacific/Auckland');
      expect(zeitzonenstand(erneut.timeZone, vorschlag)).toEqual({
        art: 'bestaetigt',
        zone: 'Pacific/Auckland',
      });
    });

    it('legt einen Browservorschlag ohne Bestätigung nirgends ab', async () => {
      /*
        Der Vorschlag wird hier **wirklich geholt** – und danach ist der
        Speicher trotzdem leer. Eine Prüfung, die ihn nicht holt, bewiese
        nur, dass ein ungelesener Wert nicht gespeichert wird.
      */
      const vorschlag = zeitzonenVorschlag();
      expect(typeof vorschlag === 'string' || vorschlag === undefined).toBe(true);

      await expect(einstellungen().mySettings()).resolves.toEqual({});
      expect(zeitzonenstand(undefined, vorschlag).art).toBe('unbestaetigt');
    });

    it('lässt eine bestätigte Zeitzone wieder entfernen', async () => {
      await einstellungen().confirmTimeZone('Europe/Berlin');
      await einstellungen().forgetTimeZone();
      await expect(einstellungen().mySettings()).resolves.toEqual({});
    });

    it('nimmt ein Wochenziel von 1 bis 7 an', async () => {
      for (const tage of [1, 4, 7]) {
        await einstellungen().setWeeklyGoalDays(tage);
        await expect(einstellungen().mySettings()).resolves.toEqual({ weeklyGoalDays: tage });
      }
    });

    it('lehnt 0 und 8 ab und speichert nichts davon', async () => {
      for (const tage of [0, 8, -1]) {
        await expect(einstellungen().setWeeklyGoalDays(tage)).rejects.toThrow();
      }
      await expect(einstellungen().mySettings()).resolves.toEqual({});
    });

    it('schaltet das Wochenziel mit `undefined` ab', async () => {
      await einstellungen().setWeeklyGoalDays(5);
      await einstellungen().setWeeklyGoalDays(undefined);
      await expect(einstellungen().mySettings()).resolves.toEqual({});
    });

    it('lässt beim Ändern des einen Feldes das andere in Ruhe', async () => {
      /*
        Der Fehler, den es hier zu verhindern gilt: Wer sein Wochenziel
        ändert, verliert seine bestätigte Zeitzone – und bekommt beim
        nächsten Öffnen wieder die Frage danach.
      */
      await einstellungen().confirmTimeZone('Europe/Berlin');
      await einstellungen().setWeeklyGoalDays(3);
      await expect(einstellungen().mySettings()).resolves.toEqual({
        timeZone: 'Europe/Berlin',
        weeklyGoalDays: 3,
      });

      /*
        Und in der anderen Reihenfolge – nachgetragen, weil eine Gegenprobe
        grün blieb: Die Prüfung bestätigte zuerst die Zeitzone und setzte
        dann das Ziel. Ein `confirmTimeZone`, das dabei das Ziel löscht,
        fiel dadurch nicht auf, weil zu diesem Zeitpunkt noch keines dastand.
      */
      await einstellungen().forgetTimeZone();
      await einstellungen().setWeeklyGoalDays(2);
      await einstellungen().confirmTimeZone('Europe/Berlin');
      await expect(einstellungen().mySettings()).resolves.toEqual({
        timeZone: 'Europe/Berlin',
        weeklyGoalDays: 2,
      });
      await einstellungen().setWeeklyGoalDays(3);

      await einstellungen().setWeeklyGoalDays(undefined);
      await expect(einstellungen().mySettings()).resolves.toEqual({ timeZone: 'Europe/Berlin' });

      await einstellungen().confirmTimeZone('Europe/Vienna');
      await expect(einstellungen().mySettings()).resolves.toEqual({ timeZone: 'Europe/Vienna' });
    });

    it('zeigt niemandem die Einstellungen einer anderen Person', async () => {
      await einstellungen().confirmTimeZone('Europe/Berlin');
      await einstellungen().setWeeklyGoalDays(6);

      await szenario.alsPerson(szenario.personen.zweiteLernende);
      await expect(einstellungen().mySettings()).resolves.toEqual({});

      await szenario.alsPerson(szenario.personen.lernende);
      await expect(einstellungen().mySettings()).resolves.toEqual({
        timeZone: 'Europe/Berlin',
        weeklyGoalDays: 6,
      });
    });

    it('hat keine Methode, die eine fremde Kennung entgegennimmt', async () => {
      /*
        Am Zuschnitt geprüft, nicht am Verhalten: Jede Methode dieses
        Vertrags nimmt höchstens ihren eigenen Wert entgegen. Käme eines
        Tages `mySettingsOf(userId)` dazu, fiele das hier auf, bevor jemand
        sie aufruft.
      */
      const vertrag = einstellungen();
      expect(Object.keys(vertrag).sort()).toEqual([
        'confirmTimeZone',
        'forgetTimeZone',
        'mySettings',
        'setWeeklyGoalDays',
      ]);
      expect(vertrag.mySettings.length).toBe(0);
      expect(vertrag.confirmTimeZone.length).toBe(1);
      expect(vertrag.setWeeklyGoalDays.length).toBe(1);
    });
  });
}
