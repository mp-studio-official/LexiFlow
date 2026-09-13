import { describe, expect, it } from 'vitest';
import { FAKE_ACCOUNTS, createFakeCloud } from './fakeCloudRepositories';
import { makePack } from '../test/fixtures';
import { antwortEreignis } from './progressEvents';

/**
 * Die kontrollierte Cloudfassung.
 *
 * Sie ist kein Sicherheitsmodell (siehe den Kopf der Datei), und diese
 * Prüfungen behaupten auch nichts anderes. Sie halten zwei Dinge fest:
 *
 * 1. Die **Form** stimmt – die Verträge lassen sich so erfüllen, wie die
 *    Ansichten sie benutzen. Ein Vertrag, den niemand erfüllt hat, ist eine
 *    Vermutung.
 * 2. Die **Grenzen** sind schon hier gezogen. Nicht, weil sie hier tragen,
 *    sondern damit Phase 2 sie nicht erfindet, sondern nachbaut.
 */

const LEHRERIN = 'u-lehrerin';
const LERNEND = 'u-lernend';

describe('die Testkonten', () => {
  it('sind als solche erkennbar', () => {
    for (const konto of FAKE_ACCOUNTS) {
      if (konto.email) {
        // `.invalid` ist die für genau diesen Zweck reservierte Endung: Eine
        // solche Adresse kann es im Netz nicht geben.
        expect(konto.email.endsWith('.invalid')).toBe(true);
      }
    }
  });

  it('geben Lernenden keine E-Mail-Adresse (ADR-5)', () => {
    const lernende = FAKE_ACCOUNTS.filter((konto) => konto.profile.role === 'student');
    expect(lernende.length).toBeGreaterThan(0);
    for (const konto of lernende) {
      expect(konto.email).toBeUndefined();
      expect(konto.learnerId).toBeDefined();
    }
  });
});

describe('Anmeldung', () => {
  it('unterscheidet nicht zwischen unbekannt und falschem Kennwort', async () => {
    const { repositories } = createFakeCloud();
    const auth = repositories.auth!;

    const unbekannt = await auth.signInWithEmail('gibtsnicht@beispiel.invalid', 'x').catch((e: Error) => e.message);
    const falsch = await auth.signInWithEmail('lehrerin@beispiel.invalid', 'falsch').catch((e: Error) => e.message);

    // Der Unterschied verriete, welche Adressen es gibt – in einer Schule ist
    // das eine Personenliste.
    expect(unbekannt).toBe(falsch);
  });

  it('meldet Änderungen der Sitzung', async () => {
    const cloud = createFakeCloud();
    const gesehen: (string | undefined)[] = [];
    const ab = cloud.repositories.auth!.onSessionChange((session) => gesehen.push(session?.userId));

    cloud.signInAs(LEHRERIN);
    await cloud.repositories.auth!.signOut();
    ab();
    cloud.signInAs(LERNEND);

    expect(gesehen).toEqual([LEHRERIN, undefined]);
  });
});

describe('Kurse und Einladungen', () => {
  it('legt einen Kurs an und macht die Lehrkraft zum Mitglied', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });

    const mitglieder = await cloud.repositories.courses!.members(kurs.id);
    expect(mitglieder.map((m) => m.userId)).toEqual([LEHRERIN]);
  });

  it('gibt den Code genau einmal heraus und speichert ihn nicht im Klartext', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { invite, code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});

    expect(code).toHaveLength(8);
    expect(JSON.stringify(invite)).not.toContain(code);
    const abgelegt = cloud.state.invites.get(invite.id)!;
    expect(abgelegt.codeFaltung).not.toContain(code);
  });

  it('lässt eine lernende Person mit dem Code beitreten', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});

    cloud.signInAs(LERNEND);
    const beigetreten = await cloud.repositories.invitations!.redeemCode(code.toLowerCase());
    expect(beigetreten.id).toBe(kurs.id);
    expect((await cloud.repositories.courses!.myCourses()).map((k) => k.id)).toEqual([kurs.id]);
  });

  it('lehnt einen zurückgezogenen Code ab', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { invite, code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    await cloud.repositories.invitations!.revokeInvite(invite.id);

    cloud.signInAs(LERNEND);
    await expect(cloud.repositories.invitations!.redeemCode(code)).rejects.toThrow(/gilt nicht/);
  });

  it('zeigt einer lernenden Person nur ihre eigenen Kurse', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    await cloud.repositories.courses!.createCourse({ title: 'Fremder Kurs' });

    cloud.signInAs(LERNEND);
    expect(await cloud.repositories.courses!.myCourses()).toEqual([]);
  });

  it('gibt einer lernenden Person die Mitgliederliste nicht heraus', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });

    cloud.signInAs(LERNEND);
    await expect(cloud.repositories.courses!.members(kurs.id)).rejects.toThrow(/Lehrkräfte/);
  });
});

describe('Veröffentlichung', () => {
  it('friert eine Revision ein, die der Entwurf danach nicht mehr ändert', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const pack = makePack();
    await cloud.repositories.packs!.saveDraft(pack);

    const revision = await cloud.repositories.publication!.publish(pack.meta.id);
    await cloud.repositories.packs!.saveDraft({
      ...pack,
      meta: { ...pack.meta, title: 'Ganz anders' },
    });

    // ADR-4: Eine veröffentlichte Revision ist unveränderlich. Eine geteilte
    // Referenz wäre genau das nicht.
    expect(revision.pack.meta.title).toBe(pack.meta.title);
  });

  it('zeigt einem Kurs nur zugewiesene Revisionen', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LEHRERIN);
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const pack = makePack();
    await cloud.repositories.packs!.saveDraft(pack);
    const revision = await cloud.repositories.publication!.publish(pack.meta.id);

    expect(await cloud.repositories.publication!.publishedForCourse(kurs.id)).toEqual([]);

    await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);
    expect(await cloud.repositories.publication!.publishedForCourse(kurs.id)).toHaveLength(1);
  });
});

describe('Lernstand', () => {
  /*
    Der Ablauf selbst steht im Lernstandsvertrag, zweimal abgenommen – einmal
    hier gegen die Fälschung, einmal gegen echtes PostgreSQL. Was hier bleibt,
    ist die Zusage, die keine Zusage über Abläufe ist, sondern über das
    Produkt: Es gibt keinen Weg zu einem fremden Lernstand.
  */
  it('hält die Lernstände zweier Personen auseinander', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs(LERNEND);
    await cloud.repositories.progress!.recordEvents([
      antwortEreignis({
        courseId: 'kurs-1',
        packId: 'pack-1',
        entryId: 'v-1',
        direction: 'en-de',
        outcome: 'correct',
        now: new Date('2026-09-01T10:00:00.000Z'),
      }).event,
    ]);

    cloud.signInAs(LEHRERIN);
    // Es gibt keinen Parameter, mit dem die Lehrkraft den fremden Stand
    // erfragen könnte – ihr eigener ist leer, und das ist alles, was sie sieht.
    expect(await cloud.repositories.progress!.myPackProgress('kurs-1', 'pack-1')).toBeUndefined();
  });
});

describe('ohne Anmeldung', () => {
  it('geht gar nichts', async () => {
    const { repositories } = createFakeCloud();
    await expect(repositories.courses!.myCourses()).rejects.toThrow(/Nicht angemeldet/);
    await expect(repositories.packs!.list()).rejects.toThrow(/Nicht angemeldet/);
    await expect(repositories.progress!.myPackProgress('k', 'p')).rejects.toThrow(/Nicht angemeldet/);
    expect(await repositories.profile!.myProfile()).toBeUndefined();
  });
});
