import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseGateway, CourseRow, InviteRow, MemberRow, NeueEinladung } from './courseGateway';
import type { Role } from '../application/repositories';

/**
 * Der `CourseGateway` über PostgREST.
 *
 * ## Stand: ungeprüft, und das bleibt vorerst so
 *
 * Diese Datei ist die einzige Stelle im Kurszweig, die **nicht** geprüft ist.
 * Dieselbe Logik läuft im Test gegen echtes PostgreSQL (PGlite) – aber über
 * direktes SQL. Hier geht sie über HTTP, und ob PostgREST eine Abfrage so
 * überträgt, wie unten angenommen, lässt sich ohne Projekt nicht feststellen.
 *
 * Deshalb ist sie so dünn wie möglich gehalten: eine Methode, ein Aufruf,
 * keine Entscheidung. Was hier an Logik stünde, wäre Logik, die kein Test je
 * sieht.
 *
 * Die vier Stellen, an denen sie sich von der SQL-Fassung unterscheiden
 * könnte, stehen als Kommentar dabei – das ist die Liste, die man beim ersten
 * echten Durchlauf abarbeitet.
 */

function einzeln<T>(daten: unknown): T | undefined {
  return (daten as T | null) ?? undefined;
}

export function createSupabaseCourseGateway(client: SupabaseClient): CourseGateway {
  return {
    async selectMyCourses() {
      /*
        Ohne `where`: Die Zugriffsregel entscheidet, was sichtbar ist. Genau
        so läuft es auch im Test.
      */
      const { data, error } = await client.from('courses').select('*').order('created_at');
      if (error) throw new Error('Die Kurse konnten nicht geladen werden.');
      return (data ?? []) as CourseRow[];
    },

    async selectCourse(courseId) {
      const { data, error } = await client.from('courses').select('*').eq('id', courseId).maybeSingle();
      if (error) throw new Error('Der Kurs konnte nicht geladen werden.');
      return einzeln<CourseRow>(data);
    },

    async rpcCreateCourse(input) {
      const { data, error } = await client.rpc('create_course', {
        p_title: input.title,
        p_description: input.description,
        p_school_year: input.schoolYear,
      });
      if (error || !data) throw new Error('Der Kurs wurde nicht angelegt.');
      // Offene Frage Nr. 1: Eine Funktion mit zusammengesetztem Rückgabetyp
      // liefert über PostgREST ein Objekt, über SQL eine Zeile. Hier wird das
      // Objekt erwartet.
      return data as CourseRow;
    },

    async updateCourse(courseId, changes) {
      const { data, error } = await client
        .from('courses')
        .update(changes)
        .eq('id', courseId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error('Dieser Kurs lässt sich nicht ändern.');
      return einzeln<CourseRow>(data);
    },

    async deleteCourse(courseId) {
      const { error } = await client.from('courses').delete().eq('id', courseId);
      if (error) throw new Error('Dieser Kurs lässt sich nicht löschen.');
    },

    async selectMembers(courseId) {
      /*
        Offene Frage Nr. 2: Der Verbund heißt in PostgREST anders als in SQL –
        eingebettete Auswahl statt `join`. Das Ergebnis wird hier flach
        gemacht, damit beide Anbindungen dieselbe Zeilenform liefern.
      */
      const { data, error } = await client
        .from('course_members')
        .select('user_id, role, joined_at, profiles(display_name, short_code)')
        .eq('course_id', courseId)
        .order('joined_at');
      if (error) throw new Error('Die Mitglieder konnten nicht geladen werden.');

      return (data ?? []).map((zeile) => {
        const eintrag = zeile as unknown as {
          user_id: string;
          role: string;
          joined_at: string;
          /*
            Offene Frage Nr. 2a: PostgREST liefert eine eingebettete Auswahl je
            nach Beziehung als Objekt **oder** als Array mit einem Eintrag.
            Beides wird hier entgegengenommen – der Unterschied fiele sonst
            erst im Betrieb auf, und dann als leerer Name in einer
            Mitgliederliste.
          */
          profiles: { display_name: string; short_code: string } | { display_name: string; short_code: string }[] | null;
        };
        const profil = Array.isArray(eintrag.profiles) ? eintrag.profiles[0] : eintrag.profiles;
        return {
          user_id: eintrag.user_id,
          role: eintrag.role,
          joined_at: eintrag.joined_at,
          display_name: profil?.display_name ?? '',
          short_code: profil?.short_code ?? '',
        } satisfies MemberRow;
      });
    },

    async insertMember(courseId: string, userId: string, role: Role) {
      const { error } = await client
        .from('course_members')
        .insert({ course_id: courseId, user_id: userId, role });
      if (error) throw new Error('Diese Person konnte nicht eingetragen werden.');
    },

    async deleteMember(courseId, userId) {
      const { error } = await client
        .from('course_members')
        .delete()
        .eq('course_id', courseId)
        .eq('user_id', userId);
      if (error) throw new Error('Diese Person konnte nicht entfernt werden.');
    },

    async selectInvites(courseId) {
      const { data, error } = await client
        .from('course_invites')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at');
      if (error) throw new Error('Die Einladungen konnten nicht geladen werden.');
      return (data ?? []) as InviteRow[];
    },

    async rpcCreateInvite(courseId, expiresAt, maxUses) {
      const { data, error } = await client.rpc('create_course_invite', {
        p_course: courseId,
        p_expires_at: expiresAt,
        p_max_uses: maxUses,
      });
      /*
        Offene Frage Nr. 3: `returns table(...)` liefert über PostgREST ein
        Array mit einer Zeile, über SQL eine Zeile. Hier wird beides
        entgegengenommen, weil der Unterschied sonst erst im Betrieb auffiele.
      */
      const zeile = Array.isArray(data) ? data[0] : data;
      if (error || !zeile) throw new Error('Die Einladung wurde nicht angelegt.');
      return zeile as NeueEinladung;
    },

    async updateInviteRevoked(inviteId) {
      const { data, error } = await client
        .from('course_invites')
        .update({ revoked: true })
        .eq('id', inviteId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error('Diese Einladung lässt sich nicht zurückziehen.');
      return einzeln<InviteRow>(data);
    },

    async rpcRedeemInvite(code) {
      const { data, error } = await client.rpc('redeem_invite', { p_code: code });
      /*
        Offene Frage Nr. 4: Eine `raise exception` in der Funktion kommt hier
        als `error` an. Der Text wird **nicht** durchgereicht – die
        Repository-Schicht setzt den einen Satz, den es geben darf.
      */
      if (error || !data) return undefined;
      return (Array.isArray(data) ? data[0] : data) as CourseRow;
    },
  };
}
