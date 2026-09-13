import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { antwortEreignis, erneutRechnen } from './progressEvents';
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
 * - Wer bei zwei Geräten gewinnt, entscheidet die **Fassung** – nicht die
 *   Fachnummer (ein Rückfall von Fach 5 auf Fach 1 muss durchkommen) und nicht
 *   die Uhr des Geräts (Geräteuhren sind nicht überprüfbar).
 * - Ein veralteter Schreibvorgang wird gemeldet, nicht stillschweigend
 *   verworfen: Das Gerät lädt neu, rechnet erneut und sendet dasselbe Ereignis.
 * - Der Server nimmt nur Werte an, die diese Anwendung kennt.
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
  /**
   * Ein Kurs mit einem zugewiesenen Paket, in dem beide Mitglied sind.
   *
   * `entryIds` sind die Vokabeln **aus der zugewiesenen Fassung**. Sie stehen
   * hier, weil der Server prüft, ob eine Vokabel überhaupt dazugehört –
   * erfundene Kennungen im Vertrag prüften sonst nur noch diese Prüfung.
   */
  kursMitPaket(): Promise<{ courseId: string; packId: string; entryIds: string[] }>;
  /** Den Kurs archivieren – für die Zusage aus ADR-12. */
  archiviereKurs(): Promise<void>;
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
    let vokabeln: string[] = [];

    /** Die n-te Vokabel der zugewiesenen Fassung – keine erfundene Kennung. */
    const v = (nummer: number) => vokabeln[nummer % vokabeln.length]!;

    const progress = () => szenario.repositories().progress!;

    beforeEach(async () => {
      szenario = await aufbau();
      const gebaut = await szenario.kursMitPaket();
      kurs = gebaut.courseId;
      paket = gebaut.packId;
      vokabeln = gebaut.entryIds;
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
          ereignis({ entryId: v(0), outcome: 'correct' }),
          ereignis({ entryId: v(1), outcome: 'wrong' }),
          ereignis({ entryId: v(2), outcome: 'correct' }),
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

      it('nimmt den Zeitpunkt der letzten Übung nicht vom Gerät', async () => {
        /*
          Ein Gerät mit einer Uhr, die zehn Jahre vorgeht, darf nicht „zuletzt
          geübt: 2036" hinterlassen. Der Zeitpunkt kommt vom Server, und die
          zweite Übung liegt nicht vor der ersten.
        */
        const vorgestellt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

        await progress().recordEvents([
          ereignis({ entryId: v(0), outcome: 'correct', now: vorgestellt }),
        ]);
        const erster = (await progress().myPackProgress(kurs, paket))!.lastPracticedAt!;
        expect(Date.parse(erster)).toBeLessThan(Date.parse(vorgestellt.toISOString()));

        await progress().recordEvents([ereignis({ entryId: v(1), outcome: 'correct' })]);
        const zweiter = (await progress().myPackProgress(kurs, paket))!.lastPracticedAt!;

        expect(Date.parse(zweiter)).toBeGreaterThanOrEqual(Date.parse(erster));
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    describe('Idempotenz', () => {
      it('zählt dasselbe Ereignis nur einmal, auch in zwei Aufrufen', async () => {
        const einmal = ereignis({ entryId: v(0), outcome: 'correct' });

        await progress().recordEvents([einmal]);
        await progress().recordEvents([einmal]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });

      it('zählt dasselbe Ereignis nur einmal, auch im selben Aufruf', async () => {
        const einmal = ereignis({ entryId: v(0), outcome: 'correct' });

        await progress().recordEvents([einmal, einmal]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });

      it('unterscheidet Ereignisse mit gleichem Inhalt an ihrer Kennung', async () => {
        /*
          Zwei Antworten auf dieselbe Vokabel in derselben Sekunde sind zwei
          Antworten. Nur die Kennung entscheidet – nicht der Inhalt.
        */
        const erste = ereignis({ entryId: v(0), outcome: 'correct' });
        const zweite = { ...erste, eventId: ereignis({ entryId: v(0), outcome: 'correct' }).eventId };

        await progress().recordEvents([erste, zweite]);

        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    /**
     * Der Kern der Mehrgeräte-Zusage – Marcs sieben Punkte.
     *
     * Die Reihenfolge ist nicht beliebig: Zuerst muss feststehen, dass ein
     * **fachlicher** Rückfall durchkommt. Ein Riegel, der Fach 5 gegen Fach 1
     * verteidigt, wäre schlimmer als gar keiner – die Vokabel bliebe oben und
     * käme nie wieder dran, obwohl die Person sie nicht konnte.
     */
    describe('Wer gewinnt, wenn zwei Geräte schreiben', () => {
      /** Ein Stand, wie er nach längerem Üben dasteht: Fach 5, Fassung 4. */
      function fachFuenf(rev: number): EntryProgress {
        return {
          key: `${paket}::${v(0)}::en-de`,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          box: 5,
          correctCount: 4,
          wrongCount: 0,
          streak: 4,
          dueAt: new Date(Date.UTC(2026, 8, 20)).toISOString(),
          rev,
        };
      }

      /** Den Stand auf Fach 5 / Fassung 1 bringen – über den Vertrag. */
      async function aufFachFuenf(): Promise<EntryProgress> {
        const gesetzt = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          vorher: { ...fachFuenf(0), box: 4, streak: 3, correctCount: 3 },
          now: zeit(),
        });
        expect(await progress().recordEvents([gesetzt.event])).toEqual([]);
        return gesetzt.nachher;
      }

      it('nimmt einen fachlichen Rückfall von Fach 5 auf Fach 1 an', async () => {
        /*
          Punkt 1. Das neuere Ergebnis ist schlechter – und genau deshalb
          richtig: Die Person konnte die Vokabel gerade nicht.
        */
        const oben = await aufFachFuenf();
        expect((await stand(v(0)))?.box).toBe(5);

        const rueckfall = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'wrong',
          vorher: oben,
          now: zeit(),
        });
        expect(await progress().recordEvents([rueckfall.event])).toEqual([]);

        const jetzt = await stand(v(0));
        expect(jetzt?.box).toBe(1);
        expect(jetzt?.streak).toBe(0);
      });

      it('weist einen veralteten, scheinbar besseren Stand ab', async () => {
        /*
          Punkt 2. Gerät A hat gerade eine falsche Antwort geschrieben; Gerät B
          meldet sich mit Fach 5 aus der Zeit davor. „Besser" ist hier kein
          Argument – der Schreibvorgang ist veraltet.
        */
        const oben = await aufFachFuenf();
        const geraetA = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'wrong',
          vorher: oben,
          now: zeit(),
        });
        await progress().recordEvents([geraetA.event]);

        // Gerät B ging von derselben Fassung aus wie Gerät A – und kommt zu spät.
        const geraetB = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          vorher: oben,
          now: zeit(),
        });
        const konflikte = await progress().recordEvents([geraetB.event]);

        expect(konflikte).toHaveLength(1);
        expect(konflikte[0]!.eventId).toBe(geraetB.event.eventId);
        expect(konflikte[0]!.entryId).toBe(v(0));
        expect((await stand(v(0)))?.box).toBe(1);
      });

      it('weist einen veralteten, scheinbar schlechteren Stand ebenso ab', async () => {
        // Punkt 3. Dieselbe Lage, nur andersherum – dieselbe Antwort.
        const oben = await aufFachFuenf();
        const geraetA = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          vorher: oben,
          now: zeit(),
        });
        await progress().recordEvents([geraetA.event]);

        const geraetB = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'wrong',
          vorher: oben,
          now: zeit(),
        });
        const konflikte = await progress().recordEvents([geraetB.event]);

        expect(konflikte).toHaveLength(1);
        // Der Stand von Gerät A steht noch, unverändert.
        expect((await stand(v(0)))?.box).toBe(5);
      });

      it('entscheidet nach der Fassung und nicht nach der Uhr des Geräts', async () => {
        /*
          Punkt 4. Gerät B hat eine weit vorgestellte Uhr und sendet **nach**
          Gerät A. Mit einem Zeitstempelvergleich gewänne es; mit der Fassung
          verliert es, denn es ging von einem überholten Stand aus.
        */
        const oben = await aufFachFuenf();
        const geraetA = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'wrong',
          vorher: oben,
          now: new Date(),
        });
        await progress().recordEvents([geraetA.event]);

        const geraetB = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          vorher: oben,
          /*
            Eine Uhr, die zwei Stunden vorgeht – und damit **nach** Gerät A
            liegt. Weiter vorstellen geht nicht: Eine grob falsche Uhr
            erzeugt eine Fälligkeit außerhalb der zulässigen Fächer und wird
            schon an der Eingangsprüfung abgewiesen (siehe unten). Hier soll
            eine Uhr geprüft werden, die plausibel aussieht und trotzdem
            nicht entscheidet.
          */
          now: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
        const konflikte = await progress().recordEvents([geraetB.event]);

        expect(konflikte).toHaveLength(1);
        expect((await stand(v(0)))?.box).toBe(1);
      });

      it('macht aus zwei Geräten mit derselben Ausgangsfassung einen erkennbaren Konflikt', async () => {
        // Punkt 5 – samt der Fassung, die der Server jetzt hat.
        const oben = await aufFachFuenf();
        const a = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'correct', vorher: oben, now: zeit(),
        });
        const b = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'wrong', vorher: oben, now: zeit(),
        });

        expect(await progress().recordEvents([a.event])).toEqual([]);
        const konflikte = await progress().recordEvents([b.event]);

        expect(konflikte).toEqual([
          {
            eventId: b.event.eventId,
            entryId: v(0),
            direction: 'en-de',
            currentRev: (await stand(v(0)))!.rev,
          },
        ]);
        expect(b.event.baseRev).toBeLessThan(konflikte[0]!.currentRev);
      });

      it('nimmt dieselbe Bewertung an, sobald sie auf dem frischen Stand gerechnet ist', async () => {
        /*
          Punkt 6 – die Auflösung. Das Gerät lädt neu, rechnet mit derselben
          Domainfunktion noch einmal und sendet **dasselbe** Ereignis.
        */
        const oben = await aufFachFuenf();
        const a = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'correct', vorher: oben, now: zeit(),
        });
        const b = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'wrong', vorher: oben, now: zeit(),
        });
        await progress().recordEvents([a.event]);
        expect(await progress().recordEvents([b.event])).toHaveLength(1);

        const frisch = await stand(v(0));
        const zweiterVersuch = erneutRechnen(b.event, frisch);

        expect(await progress().recordEvents([zweiterVersuch])).toEqual([]);
        const endstand = await stand(v(0));
        // Die falsche Antwort ist angekommen – auf dem Stand von Gerät A.
        expect(endstand?.box).toBe(1);
        expect(endstand?.rev).toBe(frisch!.rev! + 1);
      });

      it('verbraucht die Ereigniskennung nicht, wenn der Schreibvorgang abgelehnt wird', async () => {
        /*
          Die Zusage, nach der Marc ausdrücklich gefragt hat, in einem Stück.

          Ein `baseRev`-Konflikt lehnt den **Lernstand** ab. Er darf dabei die
          `eventId` nicht so verbrauchen, dass der Wiederholungsversuch ins
          Leere läuft – sonst wäre die Auflösung aus § 5.5.3 eine Anleitung
          ohne Wirkung: Das Gerät lüde neu, rechnete neu, sendete – und nichts
          geschähe.

          Geprüft werden beide Hälften: Der zweite Versuch **wirkt**, und er
          wirkt **genau einmal**.
        */
        const oben = await aufFachFuenf();
        const vorZaehler = (await progress().myPackProgress(kurs, paket))!.answeredCount;
        const revVorher = (await stand(v(0)))!.rev!;

        // Gerät A ist schneller.
        const a = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'correct', vorher: oben, now: zeit(),
        });
        await progress().recordEvents([a.event]);

        // Gerät B ging vom überholten Stand aus und wird abgelehnt.
        const b = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'wrong', vorher: oben, now: zeit(),
        });
        const konflikte = await progress().recordEvents([b.event]);
        expect(konflikte).toHaveLength(1);

        const nachKonflikt = await stand(v(0));
        // Der Lernstand ist der von Gerät A geblieben.
        expect(nachKonflikt!.box).toBe(a.nachher.box);
        expect(nachKonflikt!.rev).toBe(revVorher + 1);
        // Gezählt wurde die Antwort von B trotzdem – geübt hat die Person ja.
        expect((await progress().myPackProgress(kurs, paket))!.answeredCount).toBe(vorZaehler + 2);

        // Neu laden, neu rechnen, **dieselbe** eventId senden.
        const zweiterVersuch = erneutRechnen(b.event, nachKonflikt);
        expect(zweiterVersuch.eventId).toBe(b.event.eventId);
        expect(await progress().recordEvents([zweiterVersuch])).toEqual([]);

        // Erste Hälfte: Er hat gewirkt.
        const nachAufloesung = await stand(v(0));
        expect(nachAufloesung!.box).toBe(1);
        expect(nachAufloesung!.rev).toBe(nachKonflikt!.rev! + 1);

        // Zweite Hälfte: genau einmal. Der Zähler ist nicht weitergelaufen.
        expect((await progress().myPackProgress(kurs, paket))!.answeredCount).toBe(vorZaehler + 2);

        // Und ein dritter Versuch mit derselben Kennung ändert nichts mehr –
        // weder am Stand noch an der Fassung, und er ist kein Konflikt.
        expect(await progress().recordEvents([zweiterVersuch])).toEqual([]);
        const endstand = await stand(v(0));
        expect(endstand!.rev).toBe(nachAufloesung!.rev);
        expect((await progress().myPackProgress(kurs, paket))!.answeredCount).toBe(vorZaehler + 2);
      });

      it('zählt dabei nichts doppelt', async () => {
        /*
          Punkt 7. Das Ereignis geht dreimal über die Leitung: einmal
          abgelehnt, einmal neu gerechnet, einmal als bloße Wiederholung.
          Gezählt wird es genau einmal, und die Wiederholung ist kein
          Konflikt.
        */
        const oben = await aufFachFuenf();
        const vorZaehler = (await progress().myPackProgress(kurs, paket))!.answeredCount;

        const a = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'correct', vorher: oben, now: zeit(),
        });
        const b = antwortEreignis({
          courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
          outcome: 'wrong', vorher: oben, now: zeit(),
        });
        await progress().recordEvents([a.event]);
        await progress().recordEvents([b.event]);

        const zweiterVersuch = erneutRechnen(b.event, await stand(v(0)));
        await progress().recordEvents([zweiterVersuch]);
        // Und noch einmal – die reine Wiederholung.
        expect(await progress().recordEvents([zweiterVersuch])).toEqual([]);

        const nachher = await progress().myPackProgress(kurs, paket);
        expect(nachher!.answeredCount).toBe(vorZaehler + 2);
      });

      it('lässt eine Kette von Antworten in einer Runde unangetastet durch', async () => {
        /*
          Der Alltagsfall neben den Konfliktfällen: Ein Gerät beantwortet
          dieselbe Vokabel dreimal hintereinander. Jede Antwort baut auf der
          vorigen Fassung auf; keine davon ist ein Konflikt.
        */
        let vorher: EntryProgress | undefined;
        const ereignisse: ProgressEvent[] = [];
        for (let i = 0; i < 3; i += 1) {
          const schritt = antwortEreignis({
            courseId: kurs, packId: paket, entryId: v(0), direction: 'en-de',
            outcome: 'correct', vorher, now: zeit(),
          });
          ereignisse.push(schritt.event);
          vorher = schritt.nachher;
        }

        expect(await progress().recordEvents(ereignisse)).toEqual([]);
        const endstand = await stand(v(0));
        expect(endstand?.box).toBe(4);
        expect(endstand?.rev).toBe(3);
      });
    });

    describe('Was der Server nicht annimmt', () => {
      function mitStand(aenderung: Partial<ProgressEvent['entryState']>, rest: Partial<ProgressEvent> = {}) {
        const gebaut = ereignis({ entryId: v(0), outcome: 'correct' });
        return { ...gebaut, ...rest, entryState: { ...gebaut.entryState, ...aenderung } };
      }

      it('kein Fach außerhalb von 1 bis 5', async () => {
        await expect(progress().recordEvents([mitStand({ box: 9 })])).rejects.toThrow();
        await expect(progress().recordEvents([mitStand({ box: 0 })])).rejects.toThrow();
      });

      it('keine unbekannte Abfragerichtung', async () => {
        const falsch = { ...ereignis({ entryId: v(0), outcome: 'correct' }), direction: 'kl-ng' };
        await expect(
          progress().recordEvents([falsch as unknown as ProgressEvent]),
        ).rejects.toThrow();
      });

      it('keine negativen Zähler', async () => {
        await expect(progress().recordEvents([mitStand({ correctCount: -1 })])).rejects.toThrow();
        await expect(progress().recordEvents([mitStand({ wrongCount: -3 })])).rejects.toThrow();
        await expect(progress().recordEvents([mitStand({ streak: -1 })])).rejects.toThrow();
      });

      it('keine negative Fassung', async () => {
        await expect(progress().recordEvents([mitStand({}, { baseRev: -1 })])).rejects.toThrow();
      });

      it('keine Fälligkeit jenseits des längsten Fachs', async () => {
        /*
          Der Weg, eine Vokabel für immer loszuwerden: sie auf das Jahr 2099
          legen. Das längste Leitner-Fach sind 21 Tage.
        */
        await expect(
          progress().recordEvents([mitStand({ dueAt: '2099-01-01T00:00:00.000Z' })]),
        ).rejects.toThrow();
      });

      it('keine Runde von einer grob falsch gestellten Uhr', async () => {
        /*
          Die andere Hälfte derselben Zusage: Eine Uhr, die Jahre vorgeht,
          rechnet eine Fälligkeit aus, die es in keinem Fach gibt. Sie gewinnt
          also nicht nur nicht – sie kommt gar nicht erst an.
        */
        const weitVoraus = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          now: new Date('2099-01-01T00:00:00.000Z'),
        }).event;

        await expect(progress().recordEvents([weitVoraus])).rejects.toThrow();
      });

      it('aber eine Fälligkeit in der Vergangenheit sehr wohl', async () => {
        // Sie heißt schlicht „jetzt dran" und schadet niemandem.
        const konflikte = await progress().recordEvents([
          mitStand({ dueAt: '2020-01-01T00:00:00.000Z' }),
        ]);
        expect(konflikte).toEqual([]);
      });

      it('lehnt die ganze Liste ab, wenn ein Ereignis darin nicht taugt', async () => {
        /*
          Alles oder nichts. Eine halb übernommene Runde wäre schlimmer als
          eine abgelehnte: Niemand wüsste hinterher, welche Hälfte drin ist.
        */
        const gut = ereignis({ entryId: v(1), outcome: 'correct' });
        await expect(
          progress().recordEvents([gut, mitStand({ box: 9 })]),
        ).rejects.toThrow();
        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
      });
    });

    describe('Der Leitner-Stand vom Gerät', () => {
      it('wird abgelegt, wie er gesendet wurde', async () => {
        const { event, nachher } = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          now: zeit(),
        });
        await progress().recordEvents([event]);

        const abgelegt = await stand(v(0));
        expect(abgelegt?.box).toBe(nachher.box);
        expect(abgelegt?.correctCount).toBe(nachher.correctCount);
        expect(abgelegt?.streak).toBe(nachher.streak);
        expect(abgelegt?.dueAt).toBe(nachher.dueAt);
        // Nicht `event.occurredAt`: Der Zeitpunkt kommt vom Server.
        expect(abgelegt?.lastAnsweredAt).toBeDefined();
        expect(abgelegt?.rev).toBe(1);
      });

      it('wird je Abfragerichtung getrennt geführt', async () => {
        await progress().recordEvents([
          ereignis({ entryId: v(0), outcome: 'correct', direction: 'en-de' }),
          ereignis({ entryId: v(0), outcome: 'wrong', direction: 'de-en' }),
        ]);

        expect((await stand(v(0), 'en-de'))?.box).toBe(2);
        expect((await stand(v(0), 'de-en'))?.box).toBe(1);
      });

      it('läuft über mehrere Antworten hinweg weiter', async () => {
        const erste = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          now: zeit(),
        });
        const zweite = antwortEreignis({
          courseId: kurs,
          packId: paket,
          entryId: v(0),
          direction: 'en-de',
          outcome: 'correct',
          vorher: erste.nachher,
          now: zeit(),
        });

        await progress().recordEvents([erste.event, zweite.event]);

        const abgelegt = await stand(v(0));
        expect(abgelegt?.box).toBe(3);
        expect(abgelegt?.streak).toBe(2);
      });

    });

    describe('Wessen Lernstand', () => {
      it('bleibt zwischen zwei Personen im selben Kurs getrennt', async () => {
        await progress().recordEvents([
          ereignis({ entryId: v(0), outcome: 'correct' }),
          ereignis({ entryId: v(1), outcome: 'correct' }),
        ]);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
        expect(await progress().myEntryProgress(kurs, paket)).toEqual([]);

        await szenario.alsPerson(szenario.personen.lernende);
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(2);
      });
    });

    describe('Der abgeschlossene Kurs', () => {
      it('nimmt weiter Lernstand an – archiviert heißt nicht ausgesperrt', async () => {
        /*
          ADR-12, an der Stelle, an der es zählt. Ein Kurs wird am Ende des
          Halbjahrs archiviert; die Vokabeln bleiben da, und wer im Sommer
          weiterübt, soll seinen Lernstand behalten.

          Die Alternative wäre, einer lernenden Person den Lernstand
          wegzunehmen, während auf ihrer Kursseite „Du kannst weiter üben"
          steht. Zugriff entziehen ist eine andere Handlung – die
          Mitgliedschaft entfernen.
        */
        await szenario.archiviereKurs();
        await szenario.alsPerson(szenario.personen.lernende);

        expect(await progress().recordEvents([ereignis({ entryId: v(0), outcome: 'correct' })])).toEqual([]);
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
        expect(await stand(v(0))).toBeDefined();
      });

      it('zählt auch weiter Übungsrunden', async () => {
        await szenario.archiviereKurs();
        await szenario.alsPerson(szenario.personen.lernende);

        await progress().beginSession(kurs, paket);
        expect((await progress().myPackProgress(kurs, paket))?.sessionCount).toBe(1);
      });
    });

    describe('Zurücksetzen', () => {
      it('löscht den eigenen Stand vollständig', async () => {
        await progress().beginSession(kurs, paket);
        await progress().recordEvents([ereignis({ entryId: v(0), outcome: 'correct' })]);

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
        const einmal = ereignis({ entryId: v(0), outcome: 'correct' });
        await progress().recordEvents([einmal]);
        await progress().resetMyProgress(kurs, paket);
        await progress().recordEvents([einmal]);

        expect(await progress().myPackProgress(kurs, paket)).toBeUndefined();
      });

      it('lässt den Stand der anderen Person unberührt', async () => {
        await progress().recordEvents([ereignis({ entryId: v(0), outcome: 'correct' })]);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        await progress().recordEvents([ereignis({ entryId: v(0), outcome: 'correct' })]);
        await progress().resetMyProgress(kurs, paket);

        await szenario.alsPerson(szenario.personen.lernende);
        expect((await progress().myPackProgress(kurs, paket))?.answeredCount).toBe(1);
      });
    });

    describe('Grenzen', () => {
      it('nimmt nicht beliebig viele Ereignisse auf einmal', async () => {
        const zuviele = Array.from({ length: 201 }, (_ignoriert, index) =>
          ereignis({ entryId: v(index), outcome: 'correct' }),
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
