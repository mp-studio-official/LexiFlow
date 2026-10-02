import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerSettingsGateway, LearnerSettingsRow } from './learnerSettingsGateway';

/**
 * Der `LearnerSettingsGateway` über PostgREST – wie seine Geschwister
 * **ungeprüft** (§ 7.1) und deshalb so dünn wie möglich.
 *
 * ## Die Auswahl nennt die eigene Kennung nicht
 *
 * Kein `.eq('user_id', …)` beim Lesen. Was sichtbar ist, entscheidet
 * `learner_settings_own`. Ein Filter hier sähe wie zusätzliche Sicherheit
 * aus, verdeckte aber im Test, ob die Regel überhaupt greift.
 *
 * ## Beim Schreiben steht die Kennung doch da
 *
 * Und zwar notwendig: `user_id` ist der Primärschlüssel, eine neue Zeile
 * braucht ihn. Er kommt aus der angemeldeten Sitzung, nicht aus einem
 * Parameter – und `with check (user_id = auth.uid())` lehnt jeden anderen
 * Wert ab, auch wenn hier eines Tages ein falscher stünde.
 */
export function createSupabaseLearnerSettingsGateway(
  client: SupabaseClient,
  currentUserId: () => Promise<string | undefined>,
): LearnerSettingsGateway {
  return {
    async selectMySettings() {
      const { data, error } = await client.from('learner_settings').select('*').maybeSingle();
      if (error) throw new Error('Deine Einstellungen konnten nicht geladen werden.');
      return (data as LearnerSettingsRow | null) ?? undefined;
    },

    async upsertMySettings(aenderung) {
      const userId = await currentUserId();
      if (userId === undefined) throw new Error('Nicht angemeldet.');

      /*
        `undefined` bedeutet „nicht anfassen", und genau so muss es über die
        Leitung gehen: Ein Feld, das im JSON fehlt, lässt `on conflict do
        update set` die Spalte in Ruhe. Stünde dort `null`, wäre „nicht
        anfassen" von „löschen" nicht mehr zu unterscheiden – und wer sein
        Wochenziel ändert, verlöre seine bestätigte Zeitzone.
      */
      const zeile: Record<string, unknown> = { user_id: userId };
      if (aenderung.timeZone !== undefined) zeile.time_zone = aenderung.timeZone;
      if (aenderung.weeklyGoalDays !== undefined) zeile.weekly_goal_days = aenderung.weeklyGoalDays;

      const { data, error } = await client
        .from('learner_settings')
        .upsert(zeile, { onConflict: 'user_id' })
        .select('*')
        .single();
      /*
        Die Datenbank lehnt eine unbekannte Zeitzone mit einer Ausnahme aus
        dem Trigger ab und ein Wochenziel außerhalb 1–7 mit der
        Prüfbedingung. Beides ist hier dasselbe: Der Wert ist nicht
        übernommen worden, und die Person soll das erfahren – nicht eine
        Oberfläche, die einen Wert anzeigt, der nirgends steht.
      */
      if (error || !data) throw new Error('Deine Einstellungen wurden nicht gespeichert.');
      return data as LearnerSettingsRow;
    },
  };
}
