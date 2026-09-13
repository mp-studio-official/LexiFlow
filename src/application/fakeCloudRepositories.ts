import { newId } from '../domain/ids';
import type { EntryProgress, PackProgress, VocabPack } from '../domain/schema';
import {
  type AccountRepository,
  type AuthRepository,
  type Course,
  type CourseInvite,
  type CourseMember,
  type CourseRepository,
  type InvitationRepository,
  type PackRepository,
  type PackRevision,
  type PackSummary,
  type Profile,
  type ProgressEvent,
  type ProgressRepository,
  type ProfileRepository,
  type PublicationRepository,
  type Repositories,
  type Role,
  type Session,
} from './repositories';

/**
 * Das Portal, solange es kein Portal gibt.
 *
 * ## Wozu das gut ist
 *
 * Phase 1 baut die Oberfläche des Portals: Anmeldung, Kursliste, Beitritt per
 * Code, getrennte Shells. Phase 2 baut die Datenbank. Ohne etwas dazwischen
 * müsste das eine auf das andere warten – und am Ende stünden Ansichten, die
 * noch nie jemand hat laufen sehen.
 *
 * Diese Datei ist dieses Dazwischen: dieselben Verträge, erfüllt aus einer
 * Map. Damit lassen sich die Ansichten bauen **und** prüfen, ohne dass ein
 * einziger Aufruf ins Netz geht.
 *
 * ## Was sie ausdrücklich nicht ist
 *
 * Kein Sicherheitsmodell. Kennwörter werden hier verglichen, nicht geprüft;
 * der Einladungscode wird mit einer trivialen Faltung „gehasht“, die nichts
 * verbirgt. Beides ist in Phase 2 und 4 Sache des Servers, und beides ist hier
 * bewusst so offensichtlich falsch gemacht, dass niemand es für die
 * Produktionsfassung hält.
 *
 * **Alle Konten in dieser Datei sind offensichtliche Testkonten** – die
 * Adressen liegen unter `.invalid`, einer für genau diesen Zweck reservierten
 * Endung, die es im Netz nicht gibt.
 */

interface Konto {
  profile: Profile;
  /** Nur für Lehrkräfte und Verwaltung. */
  email?: string;
  /** Nur für Lernende – nie eine E-Mail-Adresse (ADR-5). */
  learnerId?: string;
  password: string;
  /** Nur für Lernende: der Code, mit dem sie sich selbst wieder hereinholen. */
  recoveryCode?: string;
}

function profil(id: string, displayName: string, shortCode: string, role: Role): Profile {
  return { id, displayName, shortCode, role, createdAt: '2026-09-01T08:00:00.000Z' };
}

/** Die Testkonten. Offensichtlich erfunden, und das soll man sehen. */
export const FAKE_ACCOUNTS: readonly Konto[] = [
  {
    profile: profil('u-lehrerin', 'A. Beispiel', 'LX-4821', 'teacher'),
    email: 'lehrerin@beispiel.invalid',
    password: 'testkennwort',
  },
  {
    profile: profil('u-verwaltung', 'Verwaltung', 'LX-0001', 'admin'),
    email: 'verwaltung@beispiel.invalid',
    password: 'testkennwort',
  },
  {
    profile: profil('u-lernend', 'Fuchs', 'LX-7390', 'student'),
    learnerId: 'fuchs-7390',
    password: 'testkennwort',
    recoveryCode: 'TESTCODE-NUR-ZUM-PROBIEREN',
  },
];

/** Eine Faltung, kein Hash. Der Name sagt es, damit der Aufruf es auch sagt. */
function faltung(text: string): string {
  let wert = 0;
  for (const zeichen of text) wert = (wert * 31 + zeichen.codePointAt(0)!) % 2_147_483_647;
  return `faltung:${wert}`;
}

function kursSchluessel(courseId: string, packId: string): string {
  return `${courseId}::${packId}`;
}

export interface FakeCloudState {
  /** Angeforderte Wiederherstellungen – damit ein Test sie sehen kann. */
  recoveryRequests: string[];
  courses: Course[];
  members: Map<string, CourseMember[]>;
  invites: Map<string, { invite: CourseInvite; codeFaltung: string }>;
  drafts: Map<string, VocabPack>;
  revisions: Map<string, PackRevision[]>;
  assignments: Map<string, { packId: string; revision: number; position: number }[]>;
  packProgress: Map<string, PackProgress>;
  entryProgress: Map<string, EntryProgress[]>;
  seenEvents: Set<string>;
}

function leererStand(): FakeCloudState {
  return {
    recoveryRequests: [],
    courses: [],
    members: new Map(),
    invites: new Map(),
    drafts: new Map(),
    revisions: new Map(),
    assignments: new Map(),
    packProgress: new Map(),
    entryProgress: new Map(),
    seenEvents: new Set(),
  };
}

function nichtAngemeldet(): never {
  throw new Error('Nicht angemeldet.');
}

export interface FakeCloud {
  repositories: Repositories;
  /** Für Tests: der rohe Zustand, ohne Umweg über die Verträge. */
  state: FakeCloudState;
  /** Für Tests und die Entwicklungsansicht: sofort angemeldet sein. */
  signInAs(userId: string): void;
}

export function createFakeCloud(options: { now?: () => string } = {}): FakeCloud {
  const jetzt = options.now ?? (() => new Date().toISOString());
  const state = leererStand();
  let session: Session | undefined;
  const listeners = new Set<(session: Session | undefined) => void>();

  function konto(userId: string): Konto {
    const gefunden = FAKE_ACCOUNTS.find((account) => account.profile.id === userId);
    if (!gefunden) throw new Error(`Unbekanntes Testkonto: ${userId}`);
    return gefunden;
  }

  function ich(): Konto {
    if (!session) nichtAngemeldet();
    return konto(session.userId);
  }

  function melde(): void {
    for (const listener of listeners) listener(session);
  }

  function setze(userId: string): Session {
    session = { userId, role: konto(userId).profile.role };
    melde();
    return session;
  }

  const auth: AuthRepository = {
    async currentSession() {
      return session;
    },
    async signInWithEmail(email, password) {
      const account = FAKE_ACCOUNTS.find((entry) => entry.email === email.trim().toLowerCase());
      /*
        Dieselbe Meldung für „Adresse unbekannt“ und „Kennwort falsch“. Der
        Unterschied verriete, welche Adressen es gibt – und in einer Schule ist
        das eine Personenliste.
      */
      if (!account || account.password !== password) throw new Error('Anmeldung nicht möglich.');
      return setze(account.profile.id);
    },
    async signInWithLearnerId(learnerId, password) {
      const account = FAKE_ACCOUNTS.find((entry) => entry.learnerId === learnerId.trim().toLowerCase());
      if (!account || account.password !== password) throw new Error('Anmeldung nicht möglich.');
      return setze(account.profile.id);
    },
    async signOut() {
      session = undefined;
      melde();
    },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async requestEmailRecovery(email) {
      /*
        Absichtlich ohne jede Rückmeldung darüber, ob es die Adresse gibt.
        Die Fälschung tut dasselbe wie die echte Fassung: Sie merkt sich den
        Versuch, damit ein Test ihn sehen kann, und sagt nichts.
      */
      state.recoveryRequests.push(email.trim().toLowerCase());
    },
    async redeemRecoveryCode({ learnerId, recoveryCode, newPassword }) {
      const account = FAKE_ACCOUNTS.find((entry) => entry.learnerId === learnerId.trim().toLowerCase());
      // Wieder dieselbe Meldung für beide Fehlschläge – siehe die Anmeldung.
      if (!account || account.recoveryCode !== recoveryCode.trim().toUpperCase()) {
        throw new Error('Diese Angaben passen nicht zusammen.');
      }
      account.password = newPassword;
      return setze(account.profile.id);
    },
    async setPassword(newPassword) {
      ich().password = newPassword;
    },
  };

  const profile: ProfileRepository = {
    async myProfile() {
      return session ? konto(session.userId).profile : undefined;
    },
    async updateDisplayName(displayName) {
      const account = ich();
      account.profile.displayName = displayName.trim();
      return account.profile;
    },
  };

  function meinKurs(courseId: string): Course {
    const kurs = state.courses.find((entry) => entry.id === courseId);
    if (!kurs) throw new Error('Kurs nicht gefunden.');
    return kurs;
  }

  const courses: CourseRepository = {
    async myCourses() {
      const mich = ich();
      if (mich.profile.role === 'student') {
        return state.courses.filter((kurs) =>
          (state.members.get(kurs.id) ?? []).some((member) => member.userId === mich.profile.id),
        );
      }
      return [...state.courses];
    },
    async getCourse(courseId) {
      ich();
      return state.courses.find((kurs) => kurs.id === courseId);
    },
    async createCourse(input) {
      const mich = ich();
      const kurs: Course = {
        id: newId(),
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.schoolYear === undefined ? {} : { schoolYear: input.schoolYear }),
        archived: false,
        createdAt: jetzt(),
      };
      state.courses.push(kurs);
      state.members.set(kurs.id, [
        {
          userId: mich.profile.id,
          displayName: mich.profile.displayName,
          shortCode: mich.profile.shortCode,
          role: mich.profile.role,
          joinedAt: kurs.createdAt,
        },
      ]);
      return kurs;
    },
    async updateCourse(courseId, changes) {
      ich();
      const kurs = meinKurs(courseId);
      Object.assign(kurs, changes);
      return kurs;
    },
    async setArchived(courseId, archived) {
      ich();
      const kurs = meinKurs(courseId);
      kurs.archived = archived;
      return kurs;
    },
    async deleteCourse(courseId) {
      ich();
      state.courses = state.courses.filter((kurs) => kurs.id !== courseId);
      state.members.delete(courseId);
      state.assignments.delete(courseId);
    },
    async members(courseId) {
      const mich = ich();
      if (mich.profile.role === 'student') throw new Error('Nur für Lehrkräfte dieses Kurses.');
      return [...(state.members.get(courseId) ?? [])];
    },
    async removeMember(courseId, userId) {
      ich();
      state.members.set(
        courseId,
        (state.members.get(courseId) ?? []).filter((member) => member.userId !== userId),
      );
    },
  };

  const invitations: InvitationRepository = {
    async listForCourse(courseId) {
      ich();
      return [...state.invites.values()]
        .filter((eintrag) => eintrag.invite.courseId === courseId)
        .map((eintrag) => eintrag.invite);
    },
    async createInvite(courseId, options_) {
      ich();
      /*
        Ein Code aus Ziffern und Großbuchstaben ohne die Paare, die sich am
        Whiteboard verwechseln lassen (0/O, 1/I/L). Er wird vorgelesen und
        abgeschrieben; das ist der Anwendungsfall, nicht die Entropie.
      */
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 8; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const invite: CourseInvite = {
        id: newId(),
        courseId,
        label: code.slice(0, 3),
        ...(options_.expiresAt === undefined ? {} : { expiresAt: options_.expiresAt }),
        ...(options_.maxUses === undefined ? {} : { maxUses: options_.maxUses }),
        usedCount: 0,
        revoked: false,
        createdAt: jetzt(),
      };
      state.invites.set(invite.id, { invite, codeFaltung: faltung(code) });
      return { invite, code };
    },
    async revokeInvite(inviteId) {
      ich();
      const eintrag = state.invites.get(inviteId);
      if (!eintrag) throw new Error('Einladung nicht gefunden.');
      eintrag.invite.revoked = true;
      return eintrag.invite;
    },
    async redeemCode(code) {
      const mich = ich();
      const gesucht = faltung(code.trim().toUpperCase());
      const eintrag = [...state.invites.values()].find((kandidat) => kandidat.codeFaltung === gesucht);
      if (!eintrag || eintrag.invite.revoked) throw new Error('Dieser Code gilt nicht.');
      if (eintrag.invite.maxUses !== undefined && eintrag.invite.usedCount >= eintrag.invite.maxUses) {
        throw new Error('Dieser Code ist aufgebraucht.');
      }
      const mitglieder = state.members.get(eintrag.invite.courseId) ?? [];
      if (!mitglieder.some((member) => member.userId === mich.profile.id)) {
        mitglieder.push({
          userId: mich.profile.id,
          displayName: mich.profile.displayName,
          shortCode: mich.profile.shortCode,
          role: mich.profile.role,
          joinedAt: jetzt(),
        });
        state.members.set(eintrag.invite.courseId, mitglieder);
        eintrag.invite.usedCount += 1;
      }
      return meinKurs(eintrag.invite.courseId);
    },
  };

  function zusammenfassung(pack: VocabPack): PackSummary {
    const revisionen = state.revisions.get(pack.meta.id) ?? [];
    const letzte = revisionen.at(-1);
    return {
      id: pack.meta.id,
      title: pack.meta.title,
      grade: pack.meta.grade,
      entryCount: pack.entries.length,
      ...(letzte === undefined ? {} : { publishedRevision: letzte.revision }),
      hasUnpublishedChanges: letzte === undefined || letzte.publishedAt < pack.meta.updatedAt,
      updatedAt: pack.meta.updatedAt,
    };
  }

  const packs: PackRepository = {
    async list() {
      ich();
      return [...state.drafts.values()].map(zusammenfassung);
    },
    async getDraft(packId) {
      ich();
      return state.drafts.get(packId);
    },
    async saveDraft(pack) {
      ich();
      state.drafts.set(pack.meta.id, pack);
      return zusammenfassung(pack);
    },
    async deletePack(packId) {
      ich();
      state.drafts.delete(packId);
      state.revisions.delete(packId);
    },
    async importFromLocal(pack) {
      return this.saveDraft(pack);
    },
  };

  const publication: PublicationRepository = {
    async publish(packId) {
      ich();
      const entwurf = state.drafts.get(packId);
      if (!entwurf) throw new Error('Kein Entwurf zu diesem Paket.');
      const bisher = state.revisions.get(packId) ?? [];
      const revision: PackRevision = {
        packId,
        revision: (bisher.at(-1)?.revision ?? 0) + 1,
        // Eine Kopie: Eine Revision ist unveränderlich, und eine geteilte
        // Referenz wäre es nicht (ADR-4).
        pack: structuredClone(entwurf),
        publishedAt: jetzt(),
      };
      state.revisions.set(packId, [...bisher, revision]);
      return revision;
    },
    async withdraw(packId, revision) {
      ich();
      state.revisions.set(
        packId,
        (state.revisions.get(packId) ?? []).filter((eintrag) => eintrag.revision !== revision),
      );
    },
    async revisions(packId) {
      ich();
      return (state.revisions.get(packId) ?? []).map(({ pack: _pack, ...rest }) => rest);
    },
    async assignToCourse(courseId, packId, revision, position) {
      ich();
      const zuweisungen = (state.assignments.get(courseId) ?? []).filter(
        (eintrag) => eintrag.packId !== packId,
      );
      zuweisungen.push({ packId, revision, position });
      state.assignments.set(courseId, zuweisungen);
    },
    async removeFromCourse(courseId, packId) {
      ich();
      state.assignments.set(
        courseId,
        (state.assignments.get(courseId) ?? []).filter((eintrag) => eintrag.packId !== packId),
      );
    },
    async publishedForCourse(courseId) {
      ich();
      const zuweisungen = [...(state.assignments.get(courseId) ?? [])].sort(
        (a, b) => a.position - b.position,
      );
      const ergebnis: PackRevision[] = [];
      for (const zuweisung of zuweisungen) {
        const revision = (state.revisions.get(zuweisung.packId) ?? []).find(
          (eintrag) => eintrag.revision === zuweisung.revision,
        );
        if (revision) ergebnis.push(revision);
      }
      return ergebnis;
    },
  };

  const progress: ProgressRepository = {
    async myPackProgress(courseId, packId) {
      const mich = ich();
      return state.packProgress.get(`${mich.profile.id}::${kursSchluessel(courseId, packId)}`);
    },
    async myEntryProgress(courseId, packId) {
      const mich = ich();
      return [...(state.entryProgress.get(`${mich.profile.id}::${kursSchluessel(courseId, packId)}`) ?? [])];
    },
    async beginSession(courseId, packId) {
      const mich = ich();
      const schluessel = `${mich.profile.id}::${kursSchluessel(courseId, packId)}`;
      const bisher = state.packProgress.get(schluessel) ?? {
        packId,
        sessionCount: 0,
        answeredCount: 0,
        correctCount: 0,
      };
      state.packProgress.set(schluessel, {
        ...bisher,
        sessionCount: bisher.sessionCount + 1,
        lastPracticedAt: jetzt(),
      });
    },
    async recordEvents(events: readonly ProgressEvent[]) {
      const mich = ich();
      for (const event of events) {
        if (state.seenEvents.has(event.eventId)) continue;
        state.seenEvents.add(event.eventId);
        const schluessel = `${mich.profile.id}::${kursSchluessel(event.courseId, event.packId)}`;
        const bisher = state.packProgress.get(schluessel) ?? {
          packId: event.packId,
          sessionCount: 0,
          answeredCount: 0,
          correctCount: 0,
        };
        state.packProgress.set(schluessel, {
          ...bisher,
          answeredCount: bisher.answeredCount + 1,
          correctCount: bisher.correctCount + (event.outcome === 'correct' ? 1 : 0),
          lastPracticedAt: event.occurredAt,
        });
      }
    },
    async resetMyProgress(courseId, packId) {
      const mich = ich();
      const schluessel = `${mich.profile.id}::${kursSchluessel(courseId, packId)}`;
      state.packProgress.delete(schluessel);
      state.entryProgress.delete(schluessel);
    },
  };

  const account: AccountRepository = {
    async exportMyData() {
      const mich = ich();
      const inhalt = {
        hinweis: 'Testdaten aus der Entwicklungsfassung – kein echter Auszug.',
        profil: mich.profile,
        lernstaende: [...state.packProgress.entries()]
          .filter(([schluessel]) => schluessel.startsWith(`${mich.profile.id}::`))
          .map(([, wert]) => wert),
      };
      return new Blob([JSON.stringify(inhalt, null, 2)], { type: 'application/json' });
    },
    async deleteMyAccount() {
      const mich = ich();
      for (const schluessel of [...state.packProgress.keys()]) {
        if (schluessel.startsWith(`${mich.profile.id}::`)) state.packProgress.delete(schluessel);
      }
      session = undefined;
      melde();
    },
  };

  return {
    /*
      Kein `ai`. Das Gateway kommt in Phase 7, und ein Platzhalter hier hieße,
      dass eine Ansicht heute schon einen Knopf zeigen könnte, hinter dem
      nichts steht.
    */
    repositories: { auth, profile, courses, invitations, packs, publication, progress, account },
    state,
    signInAs(userId) {
      setze(userId);
    },
  };
}
