import { isRole } from '../runtime/access';
import type {
  Course,
  CourseInvite,
  CourseMember,
  CourseRepository,
  InvitationRepository,
  Role,
} from '../application/repositories';

/**
 * Kurse und Einladungen – die Logik einmal, die Anbindung zweimal.
 *
 * ## Warum eine Zwischenschicht
 *
 * Die Verträge aus `repositories.ts` sprechen die Sprache der Oberfläche
 * (`myCourses`, `createInvite`). Die Datenbank spricht in Zeilen und
 * Funktionsaufrufen. Zwischen beiden liegt eine Umrechnung, und die soll es
 * genau einmal geben – sonst steht sie zweimal da und geht einmal davon
 * schief.
 *
 * Der `CourseGateway` unten ist bewusst **nah an SQL** geschnitten: Jede
 * Methode entspricht einer Anweisung oder einem Funktionsaufruf. Das erlaubt
 * zwei Anbindungen, die sich kaum unterscheiden können:
 *
 * | Anbindung | Wo | Stand |
 * | --- | --- | --- |
 * | PostgREST über Supabase | `supabaseCourseGateway.ts` | **ungeprüft** – kein Projekt, keine HTTP-Schicht |
 * | Direktes SQL gegen PGlite | im Test | geprüft, mit echten Zugriffsregeln |
 *
 * ## Was das beweist – und was nicht
 *
 * Die PGlite-Anbindung führt **dieselben** SQL-Anweisungen und Funktionen aus,
 * die auch im Ernstfall laufen, unter denselben Zugriffsregeln. Damit sind
 * Schema, Bedingungen, Transaktionen und die Regeln geprüft.
 *
 * **Nicht** geprüft ist die Abbildung auf HTTP: ob PostgREST eine Abfrage so
 * überträgt, wie `supabaseCourseGateway.ts` es annimmt. Das bleibt offen, bis
 * es ein Projekt gibt (§ 7.1).
 */

/* ------------------------------------------------------------ Zeilenform -- */

export interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  school_year: string | null;
  archived: boolean;
  created_at: string;
}

export interface MemberRow {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string;
  short_code: string;
}

export interface InviteRow {
  id: string;
  course_id: string;
  label: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  revoked: boolean;
  created_at: string;
}

export interface NeueEinladung {
  invite_id: string;
  code: string;
  label: string;
  expires_at: string | null;
  max_uses: number | null;
}

/* --------------------------------------------------------------- Gateway -- */

export interface CourseGateway {
  selectMyCourses(): Promise<CourseRow[]>;
  selectCourse(courseId: string): Promise<CourseRow | undefined>;
  /** Ruft `create_course` – Kurs und erste Mitgliedschaft in einem Schritt. */
  rpcCreateCourse(input: {
    title: string;
    description: string | null;
    schoolYear: string | null;
  }): Promise<CourseRow>;
  updateCourse(
    courseId: string,
    changes: { title?: string; description?: string | null; school_year?: string | null; archived?: boolean },
  ): Promise<CourseRow | undefined>;
  deleteCourse(courseId: string): Promise<void>;

  selectMembers(courseId: string): Promise<MemberRow[]>;
  insertMember(courseId: string, userId: string, role: Role): Promise<void>;
  deleteMember(courseId: string, userId: string): Promise<void>;

  selectInvites(courseId: string): Promise<InviteRow[]>;
  /** Ruft `create_course_invite` – der Klartext kommt genau einmal zurück. */
  rpcCreateInvite(
    courseId: string,
    expiresAt: string | null,
    maxUses: number | null,
  ): Promise<NeueEinladung>;
  updateInviteRevoked(inviteId: string): Promise<InviteRow | undefined>;
  /** Ruft `redeem_invite`. */
  rpcRedeemInvite(code: string): Promise<CourseRow | undefined>;
}

/* ------------------------------------------------------------ Umrechnung -- */

export function alsKurs(zeile: CourseRow): Course {
  return {
    id: zeile.id,
    title: zeile.title,
    ...(zeile.description === null ? {} : { description: zeile.description }),
    ...(zeile.school_year === null ? {} : { schoolYear: zeile.school_year }),
    archived: zeile.archived,
    createdAt: zeile.created_at,
  };
}

export function alsMitglied(zeile: MemberRow): CourseMember {
  return {
    userId: zeile.user_id,
    displayName: zeile.display_name,
    shortCode: zeile.short_code,
    // Eine unbekannte Rollenangabe zählt als die engste, nie als die weiteste.
    role: isRole(zeile.role) ? (zeile.role as Role) : 'student',
    joinedAt: zeile.joined_at,
  };
}

export function alsEinladung(zeile: InviteRow): CourseInvite {
  return {
    id: zeile.id,
    courseId: zeile.course_id,
    label: zeile.label,
    ...(zeile.expires_at === null ? {} : { expiresAt: zeile.expires_at }),
    ...(zeile.max_uses === null ? {} : { maxUses: zeile.max_uses }),
    usedCount: zeile.used_count,
    revoked: zeile.revoked,
    createdAt: zeile.created_at,
  };
}

/** Eine Meldung für jeden Fehlschlag beim Einlösen – siehe die SQL-Funktion. */
export const CODE_GILT_NICHT = 'Dieser Code gilt nicht.';

/* ---------------------------------------------------------- Repositories -- */

export function createSqlCourseRepositories(gateway: CourseGateway): {
  courses: CourseRepository;
  invitations: InvitationRepository;
} {
  const courses: CourseRepository = {
    async myCourses() {
      return (await gateway.selectMyCourses()).map(alsKurs);
    },

    async getCourse(courseId) {
      const zeile = await gateway.selectCourse(courseId);
      return zeile ? alsKurs(zeile) : undefined;
    },

    async createCourse(input) {
      const titel = (input.title ?? '').trim();
      if (titel.length < 1 || titel.length > 120) {
        // Dieselbe Grenze wie der `check` in der Datenbank. Die dort ist die
        // verbindliche; die hier erspart einen Umlauf und eine englische
        // Fehlermeldung.
        throw new Error('Ein Kurs braucht einen Titel zwischen 1 und 120 Zeichen.');
      }
      return alsKurs(
        await gateway.rpcCreateCourse({
          title: titel,
          description: input.description?.trim() || null,
          schoolYear: input.schoolYear?.trim() || null,
        }),
      );
    },

    async updateCourse(courseId, changes) {
      const zeile = await gateway.updateCourse(courseId, {
        ...(changes.title === undefined ? {} : { title: changes.title.trim() }),
        ...(changes.description === undefined ? {} : { description: changes.description?.trim() || null }),
        ...(changes.schoolYear === undefined ? {} : { school_year: changes.schoolYear?.trim() || null }),
      });
      /*
        Keine Zeile heißt hier **nicht** „gibt es nicht", sondern „nicht für
        dich" – die Zugriffsregel hat sie ausgeblendet. Beides mit demselben
        Satz zu beantworten ist Absicht: Der Unterschied verriete, dass es den
        Kurs gibt.
      */
      if (!zeile) throw new Error('Dieser Kurs lässt sich nicht ändern.');
      return alsKurs(zeile);
    },

    async setArchived(courseId, archived) {
      const zeile = await gateway.updateCourse(courseId, { archived });
      if (!zeile) throw new Error('Dieser Kurs lässt sich nicht ändern.');
      return alsKurs(zeile);
    },

    async deleteCourse(courseId) {
      await gateway.deleteCourse(courseId);
    },

    async members(courseId) {
      return (await gateway.selectMembers(courseId)).map(alsMitglied);
    },

    async removeMember(courseId, userId) {
      await gateway.deleteMember(courseId, userId);
    },
  };

  const invitations: InvitationRepository = {
    async listForCourse(courseId) {
      return (await gateway.selectInvites(courseId)).map(alsEinladung);
    },

    async createInvite(courseId, options) {
      const neu = await gateway.rpcCreateInvite(
        courseId,
        options.expiresAt ?? null,
        options.maxUses ?? null,
      );
      /*
        Die Zeile wird aus dem Rückgabewert zusammengesetzt und nicht noch
        einmal gelesen. Ein zweiter Aufruf wäre ein zweiter Umlauf für nichts –
        und der Klartext, um den es hier geht, steht ohnehin nur in dieser
        einen Antwort.
      */
      return {
        invite: {
          id: neu.invite_id,
          courseId,
          label: neu.label,
          ...(neu.expires_at === null ? {} : { expiresAt: neu.expires_at }),
          ...(neu.max_uses === null ? {} : { maxUses: neu.max_uses }),
          usedCount: 0,
          revoked: false,
          createdAt: new Date().toISOString(),
        },
        code: neu.code,
      };
    },

    async revokeInvite(inviteId) {
      const zeile = await gateway.updateInviteRevoked(inviteId);
      if (!zeile) throw new Error('Diese Einladung lässt sich nicht zurückziehen.');
      return alsEinladung(zeile);
    },

    async redeemCode(code) {
      const zeile = await gateway.rpcRedeemInvite(code);
      if (!zeile) throw new Error(CODE_GILT_NICHT);
      return alsKurs(zeile);
    },
  };

  return { courses, invitations };
}
