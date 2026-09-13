import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConflictRow,
  EntryProgressRow,
  PackProgressRow,
  ProgressGateway,
} from './progressGateway';

/**
 * Der `ProgressGateway` über PostgREST – wie seine Geschwister **ungeprüft**
 * (§ 7.1) und deshalb so dünn wie möglich.
 *
 * ## Die Auswahl nennt die eigene Kennung nicht
 *
 * Kein `.eq('user_id', …)`. Was sichtbar ist, entscheidet die Zugriffsregel
 * `user_id = auth.uid()`. Ein Filter hier sähe wie zusätzliche Sicherheit aus,
 * wäre aber das Gegenteil: Er verdeckte im Test, ob die Regel überhaupt
 * greift – und die Regel ist der einzige Riegel, der auch dann noch hält, wenn
 * jemand die Anfrage selbst stellt.
 */
export function createSupabaseProgressGateway(client: SupabaseClient): ProgressGateway {
  return {
    async selectPackProgress(courseId, packId) {
      const { data, error } = await client
        .from('pack_progress')
        .select('*')
        .eq('course_id', courseId)
        .eq('pack_id', packId)
        .maybeSingle();
      if (error) throw new Error('Dein Lernstand konnte nicht geladen werden.');
      return (data as PackProgressRow | null) ?? undefined;
    },

    async selectEntryProgress(courseId, packId) {
      const { data, error } = await client
        .from('entry_progress')
        .select('*')
        .eq('course_id', courseId)
        .eq('pack_id', packId);
      if (error) throw new Error('Dein Lernstand konnte nicht geladen werden.');
      return (data ?? []) as EntryProgressRow[];
    },

    async rpcBeginSession(courseId, packId) {
      const { error } = await client.rpc('begin_practice_session', {
        p_course: courseId,
        p_pack: packId,
      });
      if (error) throw new Error('Die Übungsrunde wurde nicht gezählt.');
    },

    async rpcRecordEvents(events) {
      /*
        Die Ereignisse gehen als **eine** Liste hinüber, nicht einzeln: Ein
        Aufruf je Antwort hieße, dass eine Runde mit dreißig Vokabeln dreißig
        Umläufe kostet – und dass ein Abbruch in der Mitte eine halb
        übertragene Runde hinterlässt.
      */
      const { data, error } = await client.rpc('record_progress_events', {
        p_events: events,
      });
      if (error) throw new Error('Dein Lernstand wurde nicht gespeichert.');
      /*
        Offene Frage: Eine Funktion mit `returns table` liefert über PostgREST
        eine Liste – eine leere, wenn nichts abgelehnt wurde. Kommt dort etwas
        anderes an, ist eine leere Liste die sichere Auslegung: Sie behauptet
        keinen Konflikt, den es nicht gibt.
      */
      return Array.isArray(data) ? (data as ConflictRow[]) : [];
    },

    async rpcReset(courseId, packId) {
      const { error } = await client.rpc('reset_my_progress', {
        p_course: courseId,
        p_pack: packId,
      });
      if (error) throw new Error('Der Lernstand wurde nicht zurückgesetzt.');
    },
  };
}
