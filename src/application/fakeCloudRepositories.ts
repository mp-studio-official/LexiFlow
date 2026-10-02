import { newId } from '../domain/ids';
import { CODE_GILT_NICHT } from '../cloud/courseGateway';
import { alsLernstand } from './progressEvents';
import type { EntryProgress, PackProgress, VocabPack } from '../domain/schema';
import {
  type AccountRepository,
  type AiConnectionSummary,
  type AiGateway,
  type AuthRepository,
  type Course,
  type CourseInvite,
  type CourseMember,
  type CourseRepository,
  type DueOverview,
  type InvitationRepository,
  type LearnerSettings,
  type LearnerSettingsRepository,
  type PackRepository,
  type PackRevision,
  type PackSummary,
  type Profile,
  type ProgressConflict,
  type ProgressEvent,
  type ProgressOverviewRepository,
  type ProgressRepository,
  type ProfileRepository,
  type PublicationRepository,
  type Repositories,
  type Role,
  type Session,
} from './repositories';
import { paketeIdentisch } from '../domain/vocabpack';
import { istWochenziel } from '../domain/zeitzone';

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
  {
    // Eine zweite lernende Person – ohne sie ließe sich „der letzte freie
    // Platz" nicht durchspielen.
    profile: profil('u-lernend-2', 'Dachs', 'LX-8104', 'student'),
    learnerId: 'dachs-8104',
    password: 'testkennwort',
    recoveryCode: 'ZWEITER-TESTCODE-ZUM-PROBIEREN',
  },
];

/** Eine Faltung, kein Hash. Der Name sagt es, damit der Aufruf es auch sagt. */
function faltung(text: string): string {
  let wert = 0;
  for (const zeichen of text) wert = (wert * 31 + zeichen.codePointAt(0)!) % 2_147_483_647;
  return `faltung:${wert}`;
}

/** Ein Entwurf samt Eigentum und Zeitpunkt – das, was die Liste braucht. */
export interface FakeEntwurf {
  pack: VocabPack;
  ownerId: string;
  updatedAt: string;
}

/** Eine eingefrorene Fassung. `withdrawnAt` heißt: aus den Kursen genommen. */
export interface FakeRevision {
  revision: number;
  pack: VocabPack;
  publishedAt: string;
  withdrawnAt?: string;
}

function kursSchluessel(courseId: string, packId: string): string {
  return `${courseId}::${packId}`;
}

/** Dieselbe Obergrenze wie in `record_progress_events` – siehe Migration 6. */
const MAX_EREIGNISSE = 200;

/** Die längste Leitner-Frist (Fach 5) plus ein Tag Zugabe – wie in SQL. */
const MAX_FAELLIGKEIT_TAGE = 22;

/**
 * Dieselbe Eingangsprüfung wie `app_check_progress_events`.
 *
 * Sie steht hier noch einmal, weil der Vertrag beides prüft und beide
 * Erfüllungen sich gleich verhalten müssen. Was sie **nicht** prüft, ist die
 * Zugehörigkeit zu Kurs und Fassung: Dafür bräuchte die Fälschung ein Abbild
 * der Zuweisungen, und eine nachgebaute Zugriffsprüfung prüfte am Ende sich
 * selbst. Diese Zusage nimmt der Vertrag deshalb nur gegen PostgreSQL ab.
 */
function pruefeEreignisse(events: readonly ProgressEvent[]): void {
  const grenze = Date.now() + MAX_FAELLIGKEIT_TAGE * 24 * 60 * 60 * 1000;
  for (const event of events) {
    const stand = event.entryState;
    if (event.direction !== 'en-de' && event.direction !== 'de-en') {
      throw new Error('Unbekannte Abfragerichtung.');
    }
    if (stand.box < 1 || stand.box > 5) throw new Error('Fach außerhalb 1 bis 5.');
    if (stand.correctCount < 0 || stand.wrongCount < 0 || stand.streak < 0) {
      throw new Error('Ein Zähler ist negativ.');
    }
    if (event.baseRev < 0) throw new Error('Unbekannte Fassung.');
    if (Date.parse(stand.dueAt) > grenze) {
      throw new Error('Fälligkeit außerhalb der zulässigen Fächer.');
    }
  }
}

export interface FakeCloudState {
  /** Angeforderte Wiederherstellungen – damit ein Test sie sehen kann. */
  recoveryRequests: string[];
  /** Wer bestätigt hat, seinen Wiederherstellungscode zu haben. */
  bestaetigteCodes: Set<string>;
  courses: Course[];
  members: Map<string, CourseMember[]>;
  invites: Map<string, { invite: CourseInvite; codeFaltung: string; erzeugtVon: string }>;
  drafts: Map<string, FakeEntwurf>;
  revisions: Map<string, FakeRevision[]>;
  assignments: Map<string, { packId: string; revision: number; position: number }[]>;
  packProgress: Map<string, PackProgress>;
  entryProgress: Map<string, EntryProgress[]>;
  seenEvents: Set<string>;
  /**
   * Die Lernendeneinstellungen je Person – und **nur** für die, die etwas
   * gesetzt haben.
   *
   * Kein Eintrag beim Anlegen eines Kontos, so wie es in der Datenbank keine
   * Zeile gibt. Ein vorsorglich angelegter leerer Eintrag machte den
   * Normalfall „noch nichts bestätigt" untestbar.
   */
  learnerSettings: Map<string, LearnerSettings>;
  /** KI-Verbindungen – der Schlüssel liegt hier **im Klartext**, siehe unten. */
  aiConnections: Map<string, AiConnectionSummary & { ownerId: string; secret: string }>;
  /** Von einer Verwaltung freigegebene KI-Hosts. */
  aiAllowedHosts: string[];
  /**
   * Welches Ereignis welchen Lernstand zuletzt erzeugt hat.
   *
   * Das Gegenstück zu `entry_progress.last_event_id`. Ohne diese Zuordnung
   * wäre ein zweites Mal gesendetes Ereignis nicht von einem echten Konflikt
   * zu unterscheiden – und würde entweder doppelt angewandt oder fälschlich
   * abgelehnt.
   */
  lastEventIds: Map<string, string>;
}

function leererStand(): FakeCloudState {
  return {
    recoveryRequests: [],
    bestaetigteCodes: new Set(),
    courses: [],
    members: new Map(),
    invites: new Map(),
    drafts: new Map(),
    revisions: new Map(),
    assignments: new Map(),
    packProgress: new Map(),
    entryProgress: new Map(),
    seenEvents: new Set(),
    learnerSettings: new Map(),
    lastEventIds: new Map(),
    aiConnections: new Map(),
    aiAllowedHosts: [],
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
  /**
   * Eine zweite Lehrkraft eintragen – am Vertrag vorbei.
   *
   * Der Vertrag hat dafür keine Methode, weil die Oberfläche dazu erst in
   * einer späteren Phase entsteht. Dass das Datenmodell mehrere Lehrkräfte je
   * Kurs hergibt, soll trotzdem schon geprüft sein.
   */
  addTeacher(courseId: string, userId: string): void;
}

export function createFakeCloud(options: { now?: () => string } = {}): FakeCloud {
  /*
    Eine Uhr, die nie stehenbleibt.

    `new Date().toISOString()` hat Millisekunden. Zwei Schritte in derselben
    Millisekunde – veröffentlichen und gleich wieder speichern – bekämen
    denselben Zeitpunkt, und „der Entwurf ist neuer als die Veröffentlichung"
    wäre dann falsch. In der Datenbank stellt sich die Frage nicht: `now()`
    hat Mikrosekunden und ist je Transaktion verschieden.

    Aufgefallen an einem Oberflächentest, der genau diesen Zustand anzeigen
    wollte und nichts fand.
  */
  const roheUhr = options.now ?? (() => new Date().toISOString());
  let letzter = '';
  const jetzt = () => {
    const gelesen = roheUhr();
    letzter = gelesen > letzter ? gelesen : new Date(Date.parse(letzter) + 1).toISOString();
    return letzter;
  };
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
    async registerWithInviteCode({ inviteCode, displayName, password }) {
      const name = displayName.trim();
      if (name.length < 1 || password.length < 8) {
        throw new Error('Diese Angaben passen nicht zusammen.');
      }

      const gesucht = faltung(inviteCode.trim().toUpperCase());
      const eintrag = [...state.invites.values()].find((kandidat) => kandidat.codeFaltung === gesucht);
      const kurs = eintrag ? state.courses.find((k) => k.id === eintrag.invite.courseId) : undefined;
      const gilt =
        eintrag !== undefined &&
        kurs !== undefined &&
        !eintrag.invite.revoked &&
        !kurs.archived &&
        (eintrag.invite.expiresAt === undefined || eintrag.invite.expiresAt > jetzt()) &&
        (eintrag.invite.maxUses === undefined || eintrag.invite.usedCount < eintrag.invite.maxUses);
      // Wieder eine Meldung für jeden Fehlschlag.
      if (!gilt || !eintrag || !kurs) throw new Error(CODE_GILT_NICHT);

      eintrag.invite.usedCount += 1;

      const nummer = FAKE_ACCOUNTS.length + 1;
      const learnerId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${1000 + nummer}`;
      const recoveryCode = `TEST-CODE-${String(nummer).padStart(4, '0')}`;
      const neuesKonto: Konto = {
        profile: profil(`u-neu-${nummer}`, name, `LX-${String(9000 + nummer)}`, 'student'),
        learnerId,
        password,
        recoveryCode,
      };
      (FAKE_ACCOUNTS as Konto[]).push(neuesKonto);

      state.members.set(kurs.id, [
        ...(state.members.get(kurs.id) ?? []),
        {
          userId: neuesKonto.profile.id,
          displayName: name,
          shortCode: neuesKonto.profile.shortCode,
          role: 'student',
          joinedAt: jetzt(),
        },
      ]);

      return { session: setze(neuesKonto.profile.id), learnerId, recoveryCode };
    },
    async confirmRecoveryCode(code) {
      const mich = ich();
      const passt = mich.recoveryCode === code.trim().toUpperCase();
      if (passt) state.bestaetigteCodes.add(mich.profile.id);
      return passt;
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

  function kursOder(courseId: string, meldung: string): Course {
    const kurs = state.courses.find((eintrag) => eintrag.id === courseId);
    if (!kurs) throw new Error(meldung);
    return kurs;
  }

  function mitglieder(courseId: string): CourseMember[] {
    return state.members.get(courseId) ?? [];
  }

  /** Bin ich in diesem Kurs Lehrkraft? Die Rolle **im Kurs**, nicht global. */
  function istLehrkraftVon(courseId: string): boolean {
    const mich = ich();
    return mitglieder(courseId).some(
      (mitglied) => mitglied.userId === mich.profile.id && mitglied.role !== 'student',
    );
  }

  function istMitglied(courseId: string): boolean {
    const mich = ich();
    return mitglieder(courseId).some((mitglied) => mitglied.userId === mich.profile.id);
  }

  function nurLehrkraftDesKurses(courseId: string): void {
    if (!istLehrkraftVon(courseId)) throw new Error('Nur Lehrkräfte dieses Kurses.');
  }

  const courses: CourseRepository = {
    async myCourses() {
      /*
        Auch Lehrkräfte sehen nur Kurse, in denen sie Mitglied sind. Die erste
        Fassung gab ihnen **alle** zurück – bequem, solange es einen Kurs gibt,
        und falsch, sobald es zwei Schulen sind.
      */
      ich();
      return state.courses.filter((kurs) => istMitglied(kurs.id));
    },

    async getCourse(courseId) {
      ich();
      return istMitglied(courseId)
        ? state.courses.find((kurs) => kurs.id === courseId)
        : undefined;
    },

    async createCourse(input) {
      const mich = ich();
      if (mich.profile.role === 'student') throw new Error('Kurse legen Lehrkräfte an.');

      const titel = (input.title ?? '').trim();
      if (titel.length < 1 || titel.length > 120) {
        throw new Error('Ein Kurs braucht einen Titel zwischen 1 und 120 Zeichen.');
      }

      const kurs: Course = {
        id: newId(),
        title: titel,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.schoolYear === undefined ? {} : { schoolYear: input.schoolYear }),
        archived: false,
        createdAt: jetzt(),
      };
      state.courses.push(kurs);
      // Kurs und erste Mitgliedschaft gehören zusammen – ein Kurs ohne
      // Lehrkraft wäre für niemanden sichtbar und von niemandem löschbar.
      state.members.set(kurs.id, [
        {
          userId: mich.profile.id,
          displayName: mich.profile.displayName,
          shortCode: mich.profile.shortCode,
          role: 'teacher',
          joinedAt: kurs.createdAt,
        },
      ]);
      return kurs;
    },

    async updateCourse(courseId, changes) {
      ich();
      nurLehrkraftDesKurses(courseId);
      const kurs = kursOder(courseId, 'Dieser Kurs lässt sich nicht ändern.');
      /*
        Archiviert heißt abgeschlossen (ADR-12): Das Lernen geht weiter, die
        Arbeit am Kurs nicht. Dasselbe sagt in der Datenbank der Trigger
        `courses_archived_closed` – hier steht es noch einmal, damit beide
        Erfüllungen des Vertrags sich gleich verhalten.
      */
      if (kurs.archived) {
        throw new Error('Dieser Kurs ist archiviert. Zum Ändern zuerst wieder öffnen.');
      }
      Object.assign(kurs, changes);
      return kurs;
    },

    async setArchived(courseId, archived) {
      ich();
      nurLehrkraftDesKurses(courseId);
      const kurs = kursOder(courseId, 'Dieser Kurs lässt sich nicht ändern.');
      kurs.archived = archived;
      return kurs;
    },

    async deleteCourse(courseId) {
      ich();
      nurLehrkraftDesKurses(courseId);
      state.courses = state.courses.filter((kurs) => kurs.id !== courseId);
      state.members.delete(courseId);
      state.assignments.delete(courseId);
    },

    async members(courseId) {
      ich();
      // Die Rolle **im Kurs** entscheidet, nicht die globale: Eine Lehrkraft,
      // die über einen Code beigetreten ist, ist hier lernend.
      nurLehrkraftDesKurses(courseId);
      return [...mitglieder(courseId)];
    },

    async removeMember(courseId, userId) {
      const mich = ich();
      if (userId !== mich.profile.id) nurLehrkraftDesKurses(courseId);
      state.members.set(
        courseId,
        mitglieder(courseId).filter((mitglied) => mitglied.userId !== userId),
      );
    },
  };

  const invitations: InvitationRepository = {
    async listForCourse(courseId) {
      ich();
      nurLehrkraftDesKurses(courseId);
      return [...state.invites.values()]
        .filter((eintrag) => eintrag.invite.courseId === courseId)
        .map((eintrag) => eintrag.invite);
    },

    async createInvite(courseId, options_) {
      const mich = ich();
      nurLehrkraftDesKurses(courseId);
      if (options_.maxUses !== undefined && options_.maxUses < 1) {
        throw new Error('Eine Einladung mit null Plätzen ergibt keinen Sinn.');
      }
      /*
        Ein Code aus Ziffern und Großbuchstaben ohne die Paare, die sich am
        Whiteboard verwechseln lassen (0/O, 1/I/L). Er wird vorgelesen und
        abgeschrieben; das ist der Anwendungsfall, nicht die Entropie.

        Hier reicht `Math.random`, weil diese Fassung nie jemanden schützt –
        in der Datenbank kommt der Zufall aus `gen_random_uuid()`.
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
      state.invites.set(invite.id, { invite, codeFaltung: faltung(code), erzeugtVon: mich.profile.id });
      return { invite, code };
    },

    async revokeInvite(inviteId) {
      ich();
      const eintrag = state.invites.get(inviteId);
      if (!eintrag) throw new Error('Diese Einladung lässt sich nicht zurückziehen.');
      nurLehrkraftDesKurses(eintrag.invite.courseId);
      eintrag.invite.revoked = true;
      return eintrag.invite;
    },

    async redeemCode(code) {
      const mich = ich();
      const gesucht = faltung(code.trim().toUpperCase());
      const eintrag = [...state.invites.values()].find((kandidat) => kandidat.codeFaltung === gesucht);

      // Wer schon Mitglied ist, verbraucht keinen Platz.
      if (eintrag && mitglieder(eintrag.invite.courseId).some((m) => m.userId === mich.profile.id)) {
        return kursOder(eintrag.invite.courseId, CODE_GILT_NICHT);
      }

      /*
        Eine Bedingung, eine Meldung. Unbekannt, zurückgezogen, abgelaufen,
        voll, archivierter Kurs – von außen nicht unterscheidbar.
      */
      const kurs = eintrag ? state.courses.find((k) => k.id === eintrag.invite.courseId) : undefined;
      const gilt =
        eintrag !== undefined &&
        kurs !== undefined &&
        !eintrag.invite.revoked &&
        !kurs.archived &&
        (eintrag.invite.expiresAt === undefined || eintrag.invite.expiresAt > jetzt()) &&
        (eintrag.invite.maxUses === undefined || eintrag.invite.usedCount < eintrag.invite.maxUses);

      if (!gilt || !eintrag || !kurs) throw new Error(CODE_GILT_NICHT);

      eintrag.invite.usedCount += 1;
      /*
        **Immer** als lernende Person. Ein Code wird vorgelesen und
        weitergegeben; verteilte er Lehrkraftrechte, verteilte sie irgendwann
        jemand mit, der das nicht wollte.
      */
      state.members.set(kurs.id, [
        ...mitglieder(kurs.id),
        {
          userId: mich.profile.id,
          displayName: mich.profile.displayName,
          shortCode: mich.profile.shortCode,
          role: 'student',
          joinedAt: jetzt(),
        },
      ]);
      return kurs;
    },
  };

  /* ------------------------------------------------------------ Pakete -- */

  function meinEntwurf(packId: string): FakeEntwurf | undefined {
    const mich = ich();
    const eintrag = state.drafts.get(packId);
    return eintrag && eintrag.ownerId === mich.profile.id ? eintrag : undefined;
  }

  function nurEigenesPaket(packId: string): FakeEntwurf {
    const eintrag = meinEntwurf(packId);
    if (!eintrag) throw new Error('Dieses Paket gehört jemand anderem.');
    return eintrag;
  }

  function revisionen(packId: string): FakeRevision[] {
    return state.revisions.get(packId) ?? [];
  }

  function zusammenfassung(eintrag: FakeEntwurf): PackSummary {
    const letzte = revisionen(eintrag.pack.meta.id).at(-1);
    return {
      id: eintrag.pack.meta.id,
      title: eintrag.pack.meta.title,
      grade: eintrag.pack.meta.grade,
      entryCount: eintrag.pack.entries.length,
      ...(letzte === undefined ? {} : { publishedRevision: letzte.revision }),
      // Wie in der Datenbank: Der Entwurf ist jünger als die letzte
      // Veröffentlichung.
      hasUnpublishedChanges: letzte === undefined || letzte.publishedAt < eintrag.updatedAt,
      updatedAt: eintrag.updatedAt,
    };
  }

  const packs: PackRepository = {
    async list() {
      const mich = ich();
      return [...state.drafts.values()]
        .filter((eintrag) => eintrag.ownerId === mich.profile.id)
        .map(zusammenfassung);
    },

    async getDraft(packId) {
      return meinEntwurf(packId)?.pack;
    },

    async saveDraft(pack) {
      const mich = ich();
      if (mich.profile.role === 'student') throw new Error('Material legen Lehrkräfte an.');

      const vorhanden = state.drafts.get(pack.meta.id);
      if (vorhanden && vorhanden.ownerId !== mich.profile.id) {
        throw new Error('Dieses Paket gehört jemand anderem.');
      }
      /*
        Der Zeitpunkt kommt von hier und nicht aus `pack.meta.updatedAt`: Eine
        Fälschung, die den Zeitstempel der Eingabe übernimmt, könnte
        „unveröffentlichte Änderungen" nie zuverlässig melden – und genau das
        ist der Unterschied, den die Liste anzeigt.
      */
      const eintrag: FakeEntwurf = {
        pack: structuredClone(pack),
        ownerId: mich.profile.id,
        updatedAt: jetzt(),
      };
      state.drafts.set(pack.meta.id, eintrag);
      return zusammenfassung(eintrag);
    },

    async deletePack(packId) {
      nurEigenesPaket(packId);
      state.drafts.delete(packId);
      state.revisions.delete(packId);
      for (const [courseId, zuweisungen] of state.assignments) {
        state.assignments.set(
          courseId,
          zuweisungen.filter((zuweisung) => zuweisung.packId !== packId),
        );
      }
    },

    async importFromLocal(pack) {
      // Gleiche Kennung und gleicher Inhalt: weder Duplikat noch neuer Zeitpunkt.
      const vorhanden = meinEntwurf(pack.meta.id);
      if (vorhanden && paketeIdentisch(vorhanden.pack, pack)) {
        return zusammenfassung(vorhanden);
      }
      // Dieselbe Kennung, also derselbe Eintrag: wiederholbar (ADR-4).
      return this.saveDraft(pack);
    },
  };

  const publication: PublicationRepository = {
    async publish(packId) {
      const entwurf = nurEigenesPaket(packId);
      const bisher = revisionen(packId);
      const revision: FakeRevision = {
        revision: (bisher.at(-1)?.revision ?? 0) + 1,
        // Eine Kopie: Eine veröffentlichte Fassung ist unveränderlich, und
        // eine geteilte Referenz wäre es nicht (ADR-4).
        pack: structuredClone(entwurf.pack),
        publishedAt: jetzt(),
      };
      state.revisions.set(packId, [...bisher, revision]);
      return { packId, revision: revision.revision, pack: revision.pack, publishedAt: revision.publishedAt };
    },

    async withdraw(packId, revision) {
      nurEigenesPaket(packId);
      for (const eintrag of revisionen(packId)) {
        if (eintrag.revision === revision) eintrag.withdrawnAt = jetzt();
      }
      // Zurückziehen heißt: aus den Kursen verschwinden.
      for (const [courseId, zuweisungen] of state.assignments) {
        state.assignments.set(
          courseId,
          zuweisungen.filter(
            (zuweisung) => !(zuweisung.packId === packId && zuweisung.revision === revision),
          ),
        );
      }
    },

    async revisions(packId) {
      nurEigenesPaket(packId);
      return revisionen(packId).map((eintrag) => ({
        packId,
        revision: eintrag.revision,
        publishedAt: eintrag.publishedAt,
      }));
    },

    async assignToCourse(courseId, packId, revision, position) {
      ich();
      nurLehrkraftDesKurses(courseId);
      const kurs = kursOder(courseId, 'Diesen Kurs gibt es nicht.');
      if (kurs.archived) throw new Error('Ein archivierter Kurs bekommt kein neues Material.');

      const gefunden = revisionen(packId).find(
        (eintrag) => eintrag.revision === revision && eintrag.withdrawnAt === undefined,
      );
      if (!gefunden || !meinEntwurf(packId)) throw new Error('Diese Fassung gibt es nicht.');

      const zuweisungen = (state.assignments.get(courseId) ?? []).filter(
        (eintrag) => eintrag.packId !== packId,
      );
      zuweisungen.push({ packId, revision, position });
      state.assignments.set(courseId, zuweisungen);
    },

    async removeFromCourse(courseId, packId) {
      ich();
      nurLehrkraftDesKurses(courseId);
      state.assignments.set(
        courseId,
        (state.assignments.get(courseId) ?? []).filter((eintrag) => eintrag.packId !== packId),
      );
    },

    async publishedForCourse(courseId) {
      ich();
      if (!istMitglied(courseId)) return [];
      const zuweisungen = [...(state.assignments.get(courseId) ?? [])].sort(
        (a, b) => a.position - b.position,
      );
      const ergebnis: PackRevision[] = [];
      for (const zuweisung of zuweisungen) {
        const gefunden = revisionen(zuweisung.packId).find(
          (eintrag) => eintrag.revision === zuweisung.revision && eintrag.withdrawnAt === undefined,
        );
        if (gefunden) {
          ergebnis.push({
            packId: zuweisung.packId,
            revision: gefunden.revision,
            pack: gefunden.pack,
            publishedAt: gefunden.publishedAt,
          });
        }
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
      if (events.length > MAX_EREIGNISSE) throw new Error('Zu viele Ereignisse auf einmal.');
      pruefeEreignisse(events);

      const konflikte: ProgressConflict[] = [];

      for (const event of events) {
        const schluessel = `${mich.profile.id}::${kursSchluessel(event.courseId, event.packId)}`;

        /*
          Der Riegel gegen Doppelzählung – dasselbe, was in SQL
          `on conflict do nothing` tut. Er gilt für die **Zähler**; der
          Lernstand wird trotzdem versucht, denn ein Ereignis kann gezählt und
          sein Stand wegen eines Konflikts offen sein.
        */
        if (!state.seenEvents.has(event.eventId)) {
          state.seenEvents.add(event.eventId);
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
            // Die Uhr der Fälschung, nicht die des Ereignisses: `occurredAt`
            // kommt vom Gerät und entscheidet hier über nichts.
            lastPracticedAt: jetzt(),
          });
        }

        const stand = alsLernstand(event);
        const staende = state.entryProgress.get(schluessel) ?? [];
        const vorhanden = staende.findIndex((eintrag) => eintrag.key === stand.key);
        const alt = vorhanden === -1 ? undefined : staende[vorhanden]!;

        // Schon angewandt. Eine Wiederholung ist kein Konflikt.
        const merkmal = `${schluessel}::${stand.key}`;
        if (alt !== undefined && state.lastEventIds.get(merkmal) === event.eventId) continue;

        /*
          Die Fassung entscheidet – und sonst nichts. Weder die Fachnummer
          (ein Rückfall von Fach 5 auf Fach 1 ist ein richtiges Ergebnis) noch
          ein Zeitstempel vom Gerät.
        */
        const aktuell = alt?.rev ?? 0;
        if (aktuell !== event.baseRev) {
          konflikte.push({
            eventId: event.eventId,
            entryId: event.entryId,
            direction: event.direction,
            currentRev: aktuell,
          });
          continue;
        }

        const uebernommen: EntryProgress = { ...stand, lastAnsweredAt: jetzt(), rev: aktuell + 1 };
        state.lastEventIds.set(merkmal, event.eventId);
        if (vorhanden === -1) {
          state.entryProgress.set(schluessel, [...staende, uebernommen]);
        } else {
          const kopie = [...staende];
          kopie[vorhanden] = uebernommen;
          state.entryProgress.set(schluessel, kopie);
        }
      }

      return konflikte;
    },
    async resetMyProgress(courseId, packId) {
      const mich = ich();
      const schluessel = `${mich.profile.id}::${kursSchluessel(courseId, packId)}`;
      state.packProgress.delete(schluessel);
      state.entryProgress.delete(schluessel);
    },
  };

  /**
   * Der KI-Zugang, gefälscht.
   *
   * **Hier liegt der Schlüssel im Klartext**, und das ist Absicht: In dieser
   * Datei soll nichts so aussehen, als wäre es das Sicherheitsmodell. Das
   * echte steht in `supabase/functions/ai-gateway/tresor.ts` (AES-GCM,
   * Bindung, Schlüsselfassungen) und ist dort mit 29 Prüfungen abgenommen.
   *
   * Es geht **kein** Aufruf ins Netz. `testConnection` und `invoke` antworten
   * aus dem Nichts, denn eine Testfassung, die einen echten Anbieter
   * ansprechen könnte, wäre eine Testfassung mit echtem Schlüssel.
   */
  const ai: AiGateway = {
    async listConnections() {
      const mich = ich();
      return [...state.aiConnections.values()]
        .filter((eintrag) => eintrag.ownerId === mich.profile.id)
        .map(({ ownerId: _o, secret: _s, ...rest }) => rest);
    },

    async saveConnection(input) {
      const mich = ich();
      if (mich.profile.role === 'student') throw new Error('Dieser Bereich ist Lehrkräften vorbehalten.');

      const id = input.id ?? newId();
      const maske =
        input.secret.trim().length <= 4
          ? '••••'
          : `${'•'.repeat(Math.min(8, input.secret.trim().length - 4))}${input.secret.trim().slice(-4)}`;

      const zusammenfassung: AiConnectionSummary = {
        id,
        label: input.label,
        adapter: input.adapter,
        model: input.model,
        maskedSecret: input.adapter === 'browsermodell' ? '' : maske,
        capabilities: [],
        active: true,
      };
      state.aiConnections.set(id, {
        ...zusammenfassung,
        ownerId: mich.profile.id,
        secret: input.secret,
      });
      return zusammenfassung;
    },

    async deleteConnection(id) {
      const mich = ich();
      const eintrag = state.aiConnections.get(id);
      if (eintrag && eintrag.ownerId === mich.profile.id) state.aiConnections.delete(id);
    },

    async testConnection(id) {
      const mich = ich();
      const eintrag = state.aiConnections.get(id);
      if (!eintrag || eintrag.ownerId !== mich.profile.id) {
        return { ok: false, message: 'Diese Verbindung gibt es nicht.' };
      }
      return {
        ok: false,
        message:
          'In dieser Testfassung wird kein Anbieter angerufen. Die Verbindung lässt sich hier nicht prüfen.',
      };
    },

    async invoke() {
      ich();
      throw new Error('In dieser Testfassung wird kein Anbieter angerufen.');
    },
  };

  /*
    Die Fälschung der Zeitzonenprüfung.

    `Intl.supportedValuesOf('timeZone')` gibt es seit 2022 überall, wo dieses
    Portal läuft – aber nicht in jeder Testumgebung, und eine abgeschriebene
    Liste veraltete still. Deshalb der Umweg über den Formatierer: Eine
    unbekannte Zeitzone lässt ihn werfen, eine bekannte nicht. Dieselbe
    Auskunft wie `pg_timezone_names`, aus derselben Quelle wie das
    Betriebssystem.
  */
  function zeitzoneIstBekannt(zone: string): boolean {
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }

  const learnerSettings: LearnerSettingsRepository = {
    async mySettings() {
      const mich = ich();
      // Kein Eintrag ist der Normalfall – und ein leeres Objekt die Antwort.
      return { ...(state.learnerSettings.get(mich.profile.id) ?? {}) };
    },

    async confirmTimeZone(timeZone) {
      const mich = ich();
      if (!zeitzoneIstBekannt(timeZone)) {
        throw new Error(`Unbekannte Zeitzone: ${timeZone}`);
      }
      const bisher = state.learnerSettings.get(mich.profile.id) ?? {};
      const neu: LearnerSettings = { ...bisher, timeZone };
      state.learnerSettings.set(mich.profile.id, neu);
      return { ...neu };
    },

    async forgetTimeZone() {
      const mich = ich();
      const { timeZone: _weg, ...rest } = state.learnerSettings.get(mich.profile.id) ?? {};
      state.learnerSettings.set(mich.profile.id, rest);
      return { ...rest };
    },

    async setWeeklyGoalDays(days) {
      const mich = ich();
      if (!istWochenziel(days)) {
        throw new Error('Das Wochenziel liegt außerhalb von 1 bis 7.');
      }
      const { weeklyGoalDays: _weg, ...rest } = state.learnerSettings.get(mich.profile.id) ?? {};
      const neu: LearnerSettings = days === undefined ? rest : { ...rest, weeklyGoalDays: days };
      state.learnerSettings.set(mich.profile.id, neu);
      return { ...neu };
    },
  };

  const progressOverview: ProgressOverviewRepository = {
    async myDueOverview(now) {
      const mich = ich();
      const grenze = Date.parse(now ?? jetzt());
      const zeilen = new Map<string, DueOverview>();

      /*
        Dieselbe Verbundlogik wie `my_due_overview`: Ein Paket zählt, sobald
        es in **einer** der beiden Sammlungen vorkommt. Wer nur über
        `entryProgress` ginge, verlöre ein Paket, das begonnen und dessen
        Runde abgebrochen wurde; wer nur über `packProgress` ginge, verlöre
        einen Lernstand aus einer portablen Datei, die hochgeladen wurde.
      */
      function zeile(schluessel: string): DueOverview {
        /*
          `split` mit Grenze 2: Eine Paketkennung kommt vom Client und darf
          alles Mögliche enthalten. Ohne die Grenze verlöre ein Paket, in
          dessen Kennung `::` vorkommt, seinen Namensrest – lautlos.
        */
        const trenner = schluessel.indexOf('::');
        const courseId = schluessel.slice(0, trenner);
        const packId = schluessel.slice(trenner + 2);
        const vorhanden = zeilen.get(schluessel);
        if (vorhanden) return vorhanden;
        const frisch: DueOverview = { courseId, packId, dueCount: 0, entryCount: 0 };
        zeilen.set(schluessel, frisch);
        return frisch;
      }

      const meins = `${mich.profile.id}::`;
      for (const [schluessel, staende] of state.entryProgress) {
        if (!schluessel.startsWith(meins)) continue;
        const eintrag = zeile(schluessel.slice(meins.length));
        eintrag.entryCount += staende.length;
        eintrag.dueCount += staende.filter((stand) => Date.parse(stand.dueAt) <= grenze).length;
      }
      for (const [schluessel, stand] of state.packProgress) {
        if (!schluessel.startsWith(meins)) continue;
        const eintrag = zeile(schluessel.slice(meins.length));
        if (stand.lastPracticedAt !== undefined) eintrag.lastPracticedAt = stand.lastPracticedAt;
      }

      return [...zeilen.values()].sort((a, b) => a.packId.localeCompare(b.packId));
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
    repositories: {
      auth,
      profile,
      courses,
      invitations,
      packs,
      publication,
      progress,
      progressOverview,
      learnerSettings,
      account,
      ai,
    },
    state,
    signInAs(userId) {
      setze(userId);
    },
    addTeacher(courseId, userId) {
      const profil = konto(userId).profile;
      const bisher = state.members.get(courseId) ?? [];
      if (bisher.some((mitglied) => mitglied.userId === userId)) return;
      state.members.set(courseId, [
        ...bisher,
        {
          userId,
          displayName: profil.displayName,
          shortCode: profil.shortCode,
          role: 'teacher',
          joinedAt: jetzt(),
        },
      ]);
    },
  };
}
