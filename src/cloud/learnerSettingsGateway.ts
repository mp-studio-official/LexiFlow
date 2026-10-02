import type {
  LearnerSettings,
  LearnerSettingsRepository,
} from '../application/repositories';

/**
 * Die Lernendeneinstellungen – wieder eine Logik, zwei Anbindungen.
 *
 * Derselbe Aufbau wie bei Kursen, Paketen und Lernständen: Der Gateway ist
 * nah an SQL geschnitten, die Umrechnung steht genau einmal, und zwei
 * Anbindungen erfüllen ihn – PostgREST im Ernstfall (ungeprüft, § 7.1) und
 * direktes SQL im Test gegen echtes PostgreSQL.
 *
 * ## Was dieser Gateway ausdrücklich nicht kann
 *
 * Die Einstellungen einer **anderen** Person lesen oder schreiben. Es gibt
 * keine Methode dafür und keinen Parameter, mit dem man eine Kennung
 * übergeben könnte – auch nicht für eine Lehrkraft der eigenen Kurse. Die
 * Zugriffsregel `learner_settings_own` sagt dasselbe noch einmal.
 */

/* ------------------------------------------------------------ Zeilenform -- */

export interface LearnerSettingsRow {
  user_id: string;
  time_zone: string | null;
  weekly_goal_days: number | null;
  updated_at: string | Date;
}

export interface LearnerSettingsGateway {
  /** Die eigene Zeile – oder nichts, und das ist der Normalfall. */
  selectMySettings(): Promise<LearnerSettingsRow | undefined>;
  /**
   * Die eigene Zeile anlegen oder ändern.
   *
   * Übergeben wird nur, was sich ändern soll. `null` heißt ausdrücklich
   * „löschen" – im Unterschied zu `undefined`, das heißt „nicht anfassen".
   * Ohne diese Unterscheidung könnte man eine Zeitzone nicht mehr loswerden,
   * ohne das Wochenziel mitzunehmen.
   */
  upsertMySettings(aenderung: {
    timeZone?: string | null;
    weeklyGoalDays?: number | null;
  }): Promise<LearnerSettingsRow>;
}

/* ------------------------------------------------------------ Umrechnung -- */

/**
 * Aus der Zeile wird der Vertrag – und `null` wird zu „nicht gesetzt".
 *
 * In SQL heißt „nicht bestätigt" `null`, in TypeScript `undefined`. Beides an
 * derselben Stelle zu haben wäre ein dritter Zustand, den niemand braucht:
 * Eine Einstellung, die `null` ist, und eine, die fehlt, sind dasselbe.
 */
export function alsEinstellungen(zeile: LearnerSettingsRow): LearnerSettings {
  return {
    ...(zeile.time_zone === null ? {} : { timeZone: zeile.time_zone }),
    ...(zeile.weekly_goal_days === null ? {} : { weeklyGoalDays: zeile.weekly_goal_days }),
  };
}

/* ------------------------------------------------------------ Repository -- */

export function createSqlLearnerSettingsRepository(
  gateway: LearnerSettingsGateway,
): LearnerSettingsRepository {
  return {
    async mySettings() {
      const zeile = await gateway.selectMySettings();
      /*
        Keine Zeile ist kein Fehler, sondern der Anfangszustand jeder Person:
        Ziel aus, Zeitzone unbestätigt (E27). Ein `throw` hier hieße, dass
        jede Seite den Normalfall als Ausnahme behandeln müsste.
      */
      return zeile ? alsEinstellungen(zeile) : {};
    },

    async confirmTimeZone(timeZone) {
      /*
        Diese Methode heißt `confirm`, und das ist keine Verzierung.

        Es gibt **keine** Methode, die Einstellungen in einem Rutsch
        hinschreibt. Gäbe es sie, wäre der Weg von „der Browser meint
        Europe/Berlin" zu „die Person hat Europe/Berlin bestätigt" ein
        Funktionsaufruf lang – und an der Aufrufstelle sähe man den
        Unterschied nicht mehr. Hier sieht man ihn.
      */
      return alsEinstellungen(await gateway.upsertMySettings({ timeZone }));
    },

    async forgetTimeZone() {
      return alsEinstellungen(await gateway.upsertMySettings({ timeZone: null }));
    },

    async setWeeklyGoalDays(days) {
      return alsEinstellungen(
        await gateway.upsertMySettings({ weeklyGoalDays: days === undefined ? null : days }),
      );
    },
  };
}
