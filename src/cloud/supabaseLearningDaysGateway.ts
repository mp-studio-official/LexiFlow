import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LearningDayRow,
  LearningDaysGateway,
  LocalTodayRow,
} from './learningDaysGateway';

/**
 * Der `LearningDaysGateway` über PostgREST – wie seine Geschwister
 * **ungeprüft** (§ 7.1) und deshalb so dünn wie möglich.
 *
 * Beide Aufrufe gehen **ohne Argumente** hinüber. Die Funktionen haben keine
 * Parameter; dieser Adapter hat deshalb keine Stelle, an der eine Geräteuhr
 * oder ein Gerätedatum hineingeriete (E28). `src/application/keineTestuhr.test.ts`
 * sieht genau hier nach.
 */
export function createSupabaseLearningDaysGateway(client: SupabaseClient): LearningDaysGateway {
  return {
    async rpcLocalToday() {
      const { data, error } = await client.rpc('my_local_today');
      if (error) throw new Error('Dein Kalender konnte nicht geladen werden.');
      /*
        Die Funktion gibt immer genau eine Zeile zurück; PostgREST macht
        daraus eine Liste. Käme dort etwas anderes an, ist „keine bestätigte
        Zeitzone" die sichere Auslegung: Sie behauptet keinen Tag, den
        niemand bestätigt hat.
      */
      const zeile = Array.isArray(data) ? (data[0] as LocalTodayRow | undefined) : undefined;
      return zeile ?? { time_zone: null, local_day: null, week_start: null };
    },

    async rpcLearningDays() {
      const { data, error } = await client.rpc('my_learning_days');
      if (error) throw new Error('Deine Lerntage konnten nicht geladen werden.');
      return Array.isArray(data) ? (data as LearningDayRow[]) : [];
    },
  };
}
