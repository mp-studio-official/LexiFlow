import { directionKey } from '../../domain/ids';
import { activeDirections } from '../../domain/schema';
import { istSchwierig } from '../../domain/schwierigeWoerter';
import { wegZu } from '../../domain/uebungsformen';
import {
  summiereBeherrschung,
  zaehleBeherrschung,
  type Beherrschungsstand,
} from '../../domain/beherrschung';
import { lerntageDieseWoche, serieAm, wochenaktivitaet } from '../../domain/lernserie';
import type { Serie, Tageszaehlung, Wochentag } from '../../domain/lernserie';
import type { EntryProgress, TaskDirection } from '../../domain/schema';
import type {
  Course,
  CourseEntryProgress,
  Kalenderstand,
  LearnerSettings,
  PackRevision,
} from '../../application/repositories';

/**
 * Was auf „Mein Fortschritt" steht — gerechnet, nicht geladen.
 *
 * ## Warum das neben der Seite liegt
 *
 * Dieselbe Trennung wie bei „Heute": Die Seite besorgt die Daten und
 * zeichnet sie; hier entsteht aus den Daten das Bild. Eine Regel, die nur im
 * gerenderten Baum steht, lässt sich nicht lesen und nur umständlich prüfen.
 *
 * ## Was hier nicht passiert
 *
 * Keine Lernzeit (E25), keine Schätzung, kein Vergleich mit anderen, keine
 * Lehrkraftauswertung. Und keine Uhr: Der heutige Tag kommt aus
 * `Kalenderstand`, also vom Server (E28).
 *
 * ## Eine Abfrage statt einer Kaskade
 *
 * Die Vokabelstände kommen als **eine** Liste (`allMyEntryProgress`) und
 * werden hier nach Kurs und Paket sortiert. Je Paket zu fragen hieße eine
 * Abfrage je Paket — und zwar bei jedem Öffnen.
 */

/** Ein Paket mit dem, was darin beherrscht ist und was offen. */
export interface Paketfortschritt {
  courseId: string;
  packId: string;
  titel: string;
  stand: Beherrschungsstand;
}

/** Ein Kurs mit seinen Paketen. */
export interface Kursfortschritt {
  courseId: string;
  titel: string;
  pakete: Paketfortschritt[];
  stand: Beherrschungsstand;
}

/** Ein schwieriges Wort, benannt und mit einem Weg zum Üben. */
export interface SchwierigesWort {
  /** `${courseId}::${packId}::${entryId}::${direction}` – stabil und eindeutig. */
  schluessel: string;
  wort: string;
  /** Die Richtung, in der es hakt – ein Wort kann in einer haken und in der anderen nicht. */
  richtung: TaskDirection;
  paket: string;
  kurs: string;
  /** Die echte Übungsroute, aus `wegZu` – keine zweite Adressbildung. */
  weg: string;
}

export interface Fortschrittsbild {
  /** Fehlt, solange die Zeitzone unbestätigt ist (E27). */
  serie?: Serie;
  woche: Wochentag[];
  lerntageDerWoche?: number;
  wochenziel?: number;
  timeZone?: string;
  gesamt: Beherrschungsstand;
  kurse: Kursfortschritt[];
  schwierige: SchwierigesWort[];
}

/** Die zugewiesenen Fassungen eines Kurses, so wie die Seite sie hereinreicht. */
export interface Kursmaterial {
  kurs: Course;
  fassungen: readonly PackRevision[];
}

/**
 * Die Lernstände nach Kurs und Paket, zugriffsbereit.
 *
 * Eine Map je Paket, darin der `directionKey` – genau die Form, die
 * `beherrschungVon` erwartet. Einmal gebaut statt bei jeder Vokabel gesucht:
 * Ein `find` über alle Stände je Vokabel wäre quadratisch, und bei fünf
 * Paketen zu vierzig Wörtern merkt man das.
 */
function nachPaket(
  staende: readonly CourseEntryProgress[],
): Map<string, Map<string, EntryProgress>> {
  const gesammelt = new Map<string, Map<string, EntryProgress>>();
  for (const stand of staende) {
    const schluessel = `${stand.courseId}::${stand.packId}`;
    let paket = gesammelt.get(schluessel);
    if (!paket) {
      paket = new Map<string, EntryProgress>();
      gesammelt.set(schluessel, paket);
    }
    paket.set(directionKey(stand.entryId, stand.direction), stand);
  }
  return gesammelt;
}

/**
 * Die schwierigen Wörter – **exakt** nach E24.
 *
 * `istSchwierig` ist dieselbe Funktion, die der Übungsbereich benutzt. Eine
 * zweite Schwelle hier wäre zwei Wahrheiten über dasselbe Wort: Es stünde
 * auf der einen Seite in der Liste und auf der anderen nicht, und niemand
 * könnte sagen, welche recht hat.
 *
 * Ein Wort, das in beiden Richtungen hakt, steht zweimal da — einmal je
 * Richtung. Das ist keine Doppelung, sondern die Wahrheit: „Englisch →
 * Deutsch" und „Deutsch → Englisch" sind verschiedene Aufgaben.
 */
function schwierigeWoerter(material: readonly Kursmaterial[], staende: Map<string, Map<string, EntryProgress>>): SchwierigesWort[] {
  const gefunden: SchwierigesWort[] = [];
  for (const { kurs, fassungen } of material) {
    for (const fassung of fassungen) {
      const paket = staende.get(`${kurs.id}::${fassung.packId}`);
      if (!paket) continue;
      for (const eintrag of fassung.pack.entries) {
        for (const richtung of activeDirections(fassung.pack.meta.direction)) {
          const stand = paket.get(directionKey(eintrag.id, richtung));
          if (!stand || !istSchwierig(stand)) continue;
          gefunden.push({
            schluessel: `${kurs.id}::${fassung.packId}::${eintrag.id}::${richtung}`,
            wort: eintrag.english,
            richtung,
            paket: fassung.pack.meta.title,
            kurs: kurs.title,
            /*
              `wegZu` ist dieselbe Adressbildung, die der Übungsbereich
              benutzt — eine zweite hier wäre ein zweiter Weg zu derselben
              Runde. `titel` und `anzahl` gehören zur Darstellung einer
              Formkarte und spielen für die Adresse keine Rolle; sie stehen
              hier, weil der Vertrag sie verlangt.
            */
            weg: wegZu('schwierig', {
              courseId: kurs.id,
              packId: fassung.packId,
              titel: fassung.pack.meta.title,
              anzahl: 0,
            }),
          });
        }
      }
    }
  }
  return gefunden;
}

/**
 * Alles zusammen.
 *
 * Der Kalenderstand entscheidet über Serie, Woche und Wochenfortschritt:
 * Ohne bestätigte Zeitzone gibt es sie **gar nicht**, nicht als Null (E27).
 * Beherrschte und offene Vokabeln, der Fortschritt je Kurs und die
 * schwierigen Wörter stehen davon unberührt da — sie hängen an keiner
 * Tagesgrenze.
 */
export function fortschrittsbild(input: {
  material: readonly Kursmaterial[];
  staende: readonly CourseEntryProgress[];
  kalender: Kalenderstand;
  lerntage: readonly Tageszaehlung[];
  einstellungen: LearnerSettings;
}): Fortschrittsbild {
  const proPaket = nachPaket(input.staende);

  const kurse: Kursfortschritt[] = input.material.map(({ kurs, fassungen }) => {
    const pakete = fassungen.map((fassung) => ({
      courseId: kurs.id,
      packId: fassung.packId,
      titel: fassung.pack.meta.title,
      stand: zaehleBeherrschung(
        fassung.pack.entries.map((eintrag) => eintrag.id),
        proPaket.get(`${kurs.id}::${fassung.packId}`) ?? new Map(),
        activeDirections(fassung.pack.meta.direction),
      ),
    }));
    return {
      courseId: kurs.id,
      titel: kurs.title,
      pakete,
      stand: summiereBeherrschung(pakete.map((paket) => paket.stand)),
    };
  });

  const bild: Fortschrittsbild = {
    woche: [],
    gesamt: summiereBeherrschung(kurse.map((kurs) => kurs.stand)),
    kurse,
    schwierige: schwierigeWoerter(input.material, proPaket),
    ...(input.einstellungen.weeklyGoalDays === undefined
      ? {}
      : { wochenziel: input.einstellungen.weeklyGoalDays }),
    ...(input.einstellungen.timeZone === undefined
      ? {}
      : { timeZone: input.einstellungen.timeZone }),
  };

  if (!input.kalender.bestaetigt) return bild;

  const woche = wochenaktivitaet(input.lerntage, input.kalender.heute, input.kalender.wochenbeginn);
  return {
    ...bild,
    woche,
    serie: serieAm(input.lerntage, input.kalender.heute, input.kalender.wochenbeginn),
    lerntageDerWoche: lerntageDieseWoche(woche),
  };
}
