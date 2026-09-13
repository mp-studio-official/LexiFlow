import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DraftRow,
  PackGateway,
  PackOverviewRow,
  PackRow,
  RevisionRow,
} from './packGateway';

/**
 * Der `PackGateway` über PostgREST – wie sein Gegenstück bei den Kursen
 * **ungeprüft**, und deshalb so dünn wie möglich.
 *
 * Dieselbe Logik läuft im Test gegen echtes PostgreSQL; hier geht sie über
 * HTTP. Ob PostgREST das so überträgt, wie unten angenommen, lässt sich ohne
 * Projekt nicht feststellen (§ 7.1). Die Stellen, an denen es sich
 * unterscheiden könnte, stehen als Kommentar dabei.
 */
export function createSupabasePackGateway(client: SupabaseClient): PackGateway {
  return {
    async selectOverview() {
      /*
        Offene Frage: Der Verbund aus `packs`, `pack_drafts` und der jüngsten
        Revision ist in SQL ein `lateral join`; in PostgREST wird daraus eine
        eingebettete Auswahl über mehrere Zeilen. Die Umrechnung unten macht
        daraus dieselbe flache Zeilenform, die auch der Test sieht.
      */
      const { data, error } = await client
        .from('packs')
        .select('id, title, grade, created_at, updated_at, pack_drafts(pack), pack_revisions(revision, published_at)')
        .order('updated_at', { ascending: false });
      if (error) throw new Error('Die Pakete konnten nicht geladen werden.');

      return (data ?? []).map((zeile) => {
        const eintrag = zeile as unknown as PackRow & {
          pack_drafts: { pack: { entries?: unknown[] } } | { pack: { entries?: unknown[] } }[] | null;
          pack_revisions: { revision: number; published_at: string }[] | null;
        };
        const entwurf = Array.isArray(eintrag.pack_drafts) ? eintrag.pack_drafts[0] : eintrag.pack_drafts;
        const letzte = (eintrag.pack_revisions ?? [])
          .slice()
          .sort((a, b) => b.revision - a.revision)[0];

        return {
          id: eintrag.id,
          title: eintrag.title,
          grade: eintrag.grade,
          created_at: eintrag.created_at,
          updated_at: eintrag.updated_at,
          entry_count: entwurf?.pack?.entries?.length ?? 0,
          published_revision: letzte?.revision ?? null,
          published_at: letzte?.published_at ?? null,
        } satisfies PackOverviewRow;
      });
    },

    async selectDraft(packId) {
      const { data, error } = await client
        .from('pack_drafts')
        .select('*')
        .eq('pack_id', packId)
        .maybeSingle();
      if (error) throw new Error('Der Entwurf konnte nicht geladen werden.');
      return (data as DraftRow | null) ?? undefined;
    },

    async rpcSaveDraft(input) {
      const { data, error } = await client.rpc('save_pack_draft', {
        p_pack_id: input.packId,
        p_title: input.title,
        p_grade: input.grade,
        p_format_version: input.formatVersion,
        p_pack: input.pack,
      });
      if (error || !data) throw new Error('Das Paket wurde nicht gespeichert.');
      return (Array.isArray(data) ? data[0] : data) as PackRow;
    },

    async deletePack(packId) {
      const { error } = await client.from('packs').delete().eq('id', packId);
      if (error) throw new Error('Dieses Paket lässt sich nicht löschen.');
    },

    async rpcPublish(packId) {
      const { data, error } = await client.rpc('publish_pack', { p_pack: packId });
      if (error || !data) throw new Error('Die Veröffentlichung ist nicht zustande gekommen.');
      return (Array.isArray(data) ? data[0] : data) as RevisionRow;
    },

    async rpcWithdraw(packId, revision) {
      const { error } = await client.rpc('withdraw_pack_revision', {
        p_pack: packId,
        p_revision: revision,
      });
      if (error) throw new Error('Diese Fassung lässt sich nicht zurückziehen.');
    },

    async selectRevisions(packId) {
      const { data, error } = await client
        .from('pack_revisions')
        .select('pack_id, revision, format_version, published_by, published_at, withdrawn_at')
        .eq('pack_id', packId)
        .order('revision');
      if (error) throw new Error('Die Fassungen konnten nicht geladen werden.');
      return (data ?? []) as Omit<RevisionRow, 'pack'>[];
    },

    async rpcAssign(courseId, packId, revision, sortOrder) {
      const { error } = await client.rpc('assign_pack_to_course', {
        p_course: courseId,
        p_pack: packId,
        p_revision: revision,
        p_sort_order: sortOrder,
      });
      if (error) throw new Error('Diese Fassung gibt es nicht.');
    },

    async deleteAssignment(courseId, packId) {
      const { error } = await client
        .from('course_packs')
        .delete()
        .eq('course_id', courseId)
        .eq('pack_id', packId);
      if (error) throw new Error('Die Zuweisung lässt sich nicht aufheben.');
    },

    async selectCourseRevisions(courseId) {
      /*
        Offene Frage: Hier hängt eine eingebettete Auswahl an einer
        Verbindungstabelle. In SQL ist es ein `join` mit `where withdrawn_at is
        null`; PostgREST filtert eingebettete Zeilen anders. Zurückgezogene
        Fassungen werden deshalb hier **zusätzlich** herausgenommen – doppelt
        gefiltert ist besser als eine Fassung, die niemand mehr sehen sollte.
      */
      const { data, error } = await client
        .from('course_packs')
        .select('sort_order, pack_revisions(*)')
        .eq('course_id', courseId)
        .order('sort_order');
      if (error) throw new Error('Die Pakete dieses Kurses konnten nicht geladen werden.');

      return (data ?? [])
        .flatMap((zeile) => {
          const eintrag = zeile as unknown as {
            pack_revisions: RevisionRow | RevisionRow[] | null;
          };
          const revision = Array.isArray(eintrag.pack_revisions)
            ? eintrag.pack_revisions[0]
            : eintrag.pack_revisions;
          return revision ? [revision] : [];
        })
        .filter((revision) => revision.withdrawn_at === null);
    },
  };
}
