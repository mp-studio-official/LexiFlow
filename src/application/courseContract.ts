import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from './repositories';

/**
 * Ein Vertrag, zwei Erfüllungen – und dieselbe Prüfung für beide.
 *
 * ## Warum das so gebaut ist
 *
 * Die kontrollierte Fälschung (`fakeCloudRepositories.ts`) ist schnell und
 * macht Oberflächentests möglich. Sie ist aber genau das: eine Fälschung. Ein
 * Kursablauf, der **nur** gegen sie geprüft ist, beweist, dass die Oberfläche
 * zu einer Map passt – nicht, dass sie zu einer Datenbank passt.
 *
 * Deshalb steht der Ablauf hier einmal und läuft zweimal:
 *
 * | Erfüllung | Datei | Was damit belegt ist |
 * | --- | --- | --- |
 * | Fälschung | `fakeCloud.contract.test.ts` | dass die Verträge in sich stimmen |
 * | SQL gegen PGlite | `cloud/courseRepositories.pglite.test.ts` | dass Schema, Bedingungen, Transaktionen und Zugriffsregeln dasselbe tun |
 *
 * Weicht eine der beiden ab, fällt es hier auf – und nicht erst dann, wenn
 * jemand die Fälschung gegen die Wirklichkeit tauscht.
 *
 * ## Was auch hier nicht belegt wird
 *
 * Die HTTP-Schicht (PostgREST), echtes Supabase Auth, die Edge-Laufzeit, das
 * Deployment. § 7.1 der Sprintdokumentation führt das vollständig auf.
 */

export interface KursSzenario {
  /** Die Speicher der gerade angemeldeten Person. */
  repositories(): Repositories;
  /** Ab jetzt ist diese Person angemeldet. */
  alsPerson(userId: string): Promise<void>;
  /** Niemand ist angemeldet. */
  abmelden(): Promise<void>;
  personen: {
    lehrerin: string;
    zweiteLehrkraft: string;
    lernende: string;
    zweiteLernende: string;
  };
  /**
   * Eine zweite Lehrkraft in einen Kurs eintragen.
   *
   * Kein Vertragsbestandteil: Der Vertrag hat dafür bewusst keine Methode,
   * weil das Eintragen einer Lehrkraft in einer späteren Phase eine eigene
   * Oberfläche bekommt. Geprüft werden soll hier nur, dass das **Datenmodell**
   * mehrere Lehrkräfte je Kurs hergibt – und dazu genügt der Weg, den beide
   * Erfüllungen ohnehin haben.
   */
  lehrkraftEintragen(courseId: string, userId: string): Promise<void>;
}

/** Was eine Ablehnung des Einlösens sagen darf – überall derselbe Satz. */
export const CODE_ABLEHNUNG = /gilt nicht/;

export function describeCourseContract(
  name: string,
  aufbau: () => Promise<KursSzenario>,
  abbau: () => Promise<void> = async () => undefined,
): void {
  describe(`Kursvertrag: ${name}`, () => {
    let szenario: KursSzenario;

    const repos = () => szenario.repositories();
    const courses = () => repos().courses!;
    const invitations = () => repos().invitations!;

    beforeEach(async () => {
      szenario = await aufbau();
    });

    afterEach(async () => {
      await abbau();
    });

    /** Ein Kurs der ersten Lehrkraft, mit ihr als Mitglied. */
    async function neuerKurs(titel = 'Englisch 7b') {
      await szenario.alsPerson(szenario.personen.lehrerin);
      return courses().createCourse({ title: titel });
    }

    async function neuerCode(courseId: string, optionen: { expiresAt?: string; maxUses?: number } = {}) {
      await szenario.alsPerson(szenario.personen.lehrerin);
      const { code, invite } = await invitations().createInvite(courseId, optionen);
      return { code, invite };
    }

    /**
     * Welche **fremden** Mitglieder jemand sieht.
     *
     * Die beiden Erfüllungen antworten verschieden, und beide zu Recht: Die
     * Fälschung wirft („nur Lehrkräfte dieses Kurses"), die Datenbank gibt
     * still nur die eigene Zeile heraus. Das Zweite ist sogar das bessere –
     * ein „Zugriff verweigert" verriete, dass es da etwas gibt.
     *
     * Der Vertrag prüft deshalb das Ergebnis und nicht die Form der Absage.
     */
    async function fremdeMitglieder(courseId: string, ichSelbst: string) {
      try {
        const alle = await courses().members(courseId);
        return alle.filter((mitglied) => mitglied.userId !== ichSelbst);
      } catch {
        return [];
      }
    }

    async function fehlerVon(versprechen: Promise<unknown>): Promise<string> {
      try {
        await versprechen;
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    /* ------------------------------------------------------- Anlegen ----- */

    describe('einen Kurs anlegen', () => {
      it('macht die Lehrkraft zum Mitglied – sonst sähe sie ihren eigenen Kurs nicht', async () => {
        const kurs = await neuerKurs();
        const mitglieder = await courses().members(kurs.id);
        expect(mitglieder.map((m) => m.userId)).toEqual([szenario.personen.lehrerin]);
        expect(mitglieder[0]!.role).toBe('teacher');
      });

      it('lehnt einen leeren Titel ab', async () => {
        await szenario.alsPerson(szenario.personen.lehrerin);
        expect(await fehlerVon(courses().createCourse({ title: '   ' }))).toMatch(/Titel/);
      });

      it('gelingt einer lernenden Person nicht', async () => {
        await szenario.alsPerson(szenario.personen.lernende);
        expect(await fehlerVon(courses().createCourse({ title: 'Mein Kurs' }))).not.toBe('');
      });
    });

    /* --------------------------------------------------------- Sicht ----- */

    describe('wer welchen Kurs sieht', () => {
      it('eine fremde Lehrkraft sieht ihn nicht', async () => {
        await neuerKurs();
        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);
        expect(await courses().myCourses()).toEqual([]);
      });

      it('eine lernende Person sieht nur Kurse, in denen sie ist', async () => {
        const kurs = await neuerKurs();
        await szenario.alsPerson(szenario.personen.lernende);
        expect(await courses().myCourses()).toEqual([]);

        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);
        expect((await courses().myCourses()).map((k) => k.id)).toEqual([kurs.id]);
      });

      it('eine entfernte Mitgliedschaft verliert den Zugriff', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);
        expect(await courses().myCourses()).toHaveLength(1);

        await szenario.alsPerson(szenario.personen.lehrerin);
        await courses().removeMember(kurs.id, szenario.personen.lernende);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await courses().myCourses()).toEqual([]);
        expect(await courses().getCourse(kurs.id)).toBeUndefined();
      });

      it('die Mitgliederliste bleibt den Lehrkräften des Kurses vorbehalten', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);

        // Die lernende Person erfährt nichts über die anderen im Kurs – auch
        // nicht, wer ihn leitet.
        expect(await fremdeMitglieder(kurs.id, szenario.personen.lernende)).toEqual([]);
      });
    });

    /* ----------------------------------------------------- Einladungen --- */

    describe('Einladungscodes', () => {
      it('geben den Klartext genau einmal heraus und speichern ihn nirgends', async () => {
        const kurs = await neuerKurs();
        const { code, invite } = await neuerCode(kurs.id);

        expect(code).toHaveLength(8);
        expect(JSON.stringify(invite)).not.toContain(code);

        const gelistet = await invitations().listForCourse(kurs.id);
        expect(JSON.stringify(gelistet)).not.toContain(code);
      });

      it('lassen sich zurückziehen', async () => {
        const kurs = await neuerKurs();
        const { code, invite } = await neuerCode(kurs.id);
        await invitations().revokeInvite(invite.id);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await fehlerVon(invitations().redeemCode(code))).toMatch(CODE_ABLEHNUNG);
      });

      it('laufen ab', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id, { expiresAt: '2020-01-01T00:00:00.000Z' });

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await fehlerVon(invitations().redeemCode(code))).toMatch(CODE_ABLEHNUNG);
      });

      it('haben eine Höchstzahl, die auch bei einem Platz gilt', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id, { maxUses: 1 });

        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        expect(await fehlerVon(invitations().redeemCode(code))).toMatch(CODE_ABLEHNUNG);
      });

      it('zählen einen zweiten Klick derselben Person nicht als zweiten Platz', async () => {
        const kurs = await neuerKurs();
        const { code, invite } = await neuerCode(kurs.id, { maxUses: 2 });

        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);
        await invitations().redeemCode(code);

        await szenario.alsPerson(szenario.personen.lehrerin);
        const nachher = (await invitations().listForCourse(kurs.id)).find((e) => e.id === invite.id);
        expect(nachher?.usedCount).toBe(1);
      });

      it('sagen bei jedem Fehlschlag dasselbe', async () => {
        /*
          Unbekannt, zurückgezogen, abgelaufen, voll: vier Gründe, eine
          Meldung. Ein unterscheidbarer Grund verriete beim Durchprobieren,
          welche Codes es gibt.
        */
        const kurs = await neuerKurs();
        const abgelaufen = await neuerCode(kurs.id, { expiresAt: '2020-01-01T00:00:00.000Z' });
        const zurueckgezogen = await neuerCode(kurs.id);
        await invitations().revokeInvite(zurueckgezogen.invite.id);
        const voll = await neuerCode(kurs.id, { maxUses: 1 });

        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(voll.code);

        await szenario.alsPerson(szenario.personen.zweiteLernende);
        const meldungen = [
          await fehlerVon(invitations().redeemCode('ZZZZZZZZ')),
          await fehlerVon(invitations().redeemCode(abgelaufen.code)),
          await fehlerVon(invitations().redeemCode(zurueckgezogen.code)),
          await fehlerVon(invitations().redeemCode(voll.code)),
        ];

        expect(new Set(meldungen).size).toBe(1);
        expect(meldungen[0]).toMatch(CODE_ABLEHNUNG);
      });

      it('sind für Lernende nicht auflistbar', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);

        const gesehen = await invitations()
          .listForCourse(kurs.id)
          .catch(() => []);
        expect(gesehen).toEqual([]);
      });

      it('erteilen niemals Lehrkraftrechte', async () => {
        /*
          Der wichtigste Satz in diesem Vertrag. Ein Code wird an der Tafel
          vorgelesen und weitergegeben; wenn er Rechte verteilte, verteilte
          ihn irgendwann jemand weiter, der das nicht wollte.

          Auch eine Person mit der globalen Rolle „Lehrkraft" tritt über einen
          Code als Lernende bei – und sieht damit weder Mitgliederliste noch
          Einladungen dieses Kurses.
        */
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);

        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);
        await invitations().redeemCode(code);

        expect(await fremdeMitglieder(kurs.id, szenario.personen.zweiteLehrkraft)).toEqual([]);
        expect(await fehlerVon(invitations().createInvite(kurs.id, {}))).not.toBe('');
      });
    });

    /* ------------------------------------------------------ Archivieren -- */

    describe('archivierte Kurse', () => {
      it('bleiben für Mitglieder sichtbar', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);

        await szenario.alsPerson(szenario.personen.lehrerin);
        await courses().setArchived(kurs.id, true);

        await szenario.alsPerson(szenario.personen.lernende);
        const meine = await courses().myCourses();
        expect(meine.map((k) => k.id)).toEqual([kurs.id]);
        expect(meine[0]!.archived).toBe(true);
      });

      it('nehmen niemanden mehr auf', async () => {
        // Archivieren heißt „das Halbjahr ist vorbei". Ein Code aus dem
        // letzten Jahr soll dann nicht mehr hineinführen.
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await courses().setArchived(kurs.id, true);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await fehlerVon(invitations().redeemCode(code))).toMatch(CODE_ABLEHNUNG);
      });

      it('verbrauchen dabei keinen Platz', async () => {
        const kurs = await neuerKurs();
        const { code, invite } = await neuerCode(kurs.id, { maxUses: 2 });
        await courses().setArchived(kurs.id, true);

        await szenario.alsPerson(szenario.personen.lernende);
        await fehlerVon(invitations().redeemCode(code));

        await szenario.alsPerson(szenario.personen.lehrerin);
        const nachher = (await invitations().listForCourse(kurs.id)).find((e) => e.id === invite.id);
        expect(nachher?.usedCount).toBe(0);
      });

      it('lassen sich wieder öffnen', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await courses().setArchived(kurs.id, true);
        await courses().setArchived(kurs.id, false);

        await szenario.alsPerson(szenario.personen.lernende);
        await expect(invitations().redeemCode(code)).resolves.toMatchObject({ id: kurs.id });
      });
    });

    /* -------------------------------------------------- Zwei Lehrkräfte -- */

    describe('mehrere Lehrkräfte in einem Kurs', () => {
      it('sind im Datenmodell vorgesehen', async () => {
        const kurs = await neuerKurs();

        // Die Kursleitung trägt eine zweite Lehrkraft ausdrücklich ein –
        // nicht über einen Code.
        await szenario.lehrkraftEintragen(kurs.id, szenario.personen.zweiteLehrkraft);

        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);
        const mitglieder = await courses().members(kurs.id);
        expect(mitglieder.filter((m) => m.role === 'teacher')).toHaveLength(2);
      });

      it('und die zweite darf dann auch einladen', async () => {
        const kurs = await neuerKurs();
        await szenario.lehrkraftEintragen(kurs.id, szenario.personen.zweiteLehrkraft);

        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);
        const { code } = await invitations().createInvite(kurs.id, {});
        expect(code).toHaveLength(8);
      });
    });

    /* ------------------------------------------------------- Lernstände -- */

    describe('Lernstände bleiben außen vor', () => {
      it('es gibt keinen Weg von einem Kurs zu einem fremden Lernstand', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);
        await szenario.alsPerson(szenario.personen.lernende);
        await invitations().redeemCode(code);

        await szenario.alsPerson(szenario.personen.lehrerin);
        const mitglieder = await courses().members(kurs.id);

        // Weder in der Mitgliederliste …
        for (const mitglied of mitglieder) {
          expect(Object.keys(mitglied).sort()).toEqual([
            'displayName',
            'joinedAt',
            'role',
            'shortCode',
            'userId',
          ]);
        }
        // … noch am Lernstands-Speicher selbst gibt es einen Parameter dafür.
        const progress = repos().progress;
        if (progress) {
          const eigener = await progress.myPackProgress(kurs.id, 'irgendein-paket');
          expect(eigener?.answeredCount ?? 0).toBe(0);
        }
      });
    });

    /* ------------------------------------------------- Ohne Anmeldung --- */

    describe('ohne Anmeldung', () => {
      it('gibt es weder Kurse noch Beitritt', async () => {
        const kurs = await neuerKurs();
        const { code } = await neuerCode(kurs.id);

        await szenario.abmelden();
        expect(await fehlerVon(courses().myCourses())).not.toBe('');
        expect(await fehlerVon(invitations().redeemCode(code))).not.toBe('');
      });
    });
  });
}
