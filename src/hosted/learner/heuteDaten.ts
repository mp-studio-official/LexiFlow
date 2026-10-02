import { serieAm, wochenaktivitaet, lerntageDieseWoche } from '../../domain/lernserie';
import type { Serie, Tageszaehlung, Wochentag } from '../../domain/lernserie';
import type {
  Course,
  DueOverview,
  Kalenderstand,
  LearnerSettings,
} from '../../application/repositories';

/**
 * Was auf „Heute" steht — gerechnet, nicht geladen.
 *
 * ## Warum das neben der Seite liegt und nicht darin
 *
 * Weil es prüfbar sein soll, ohne einen Browser. Die Seite besorgt die Daten
 * und zeichnet sie; hier entsteht aus den Daten das Bild. Beides in einer
 * Komponente hieße, jede Regel über einen gerenderten Baum zu prüfen — und
 * eine Regel, die nur im Baum steht, lässt sich nicht lesen.
 *
 * ## Was hier ausdrücklich nicht passiert
 *
 * Nichts wird geschätzt. Es gibt keine Lernzeit (E25), keine hochgerechnete
 * Zahl, keinen Platzhalterwert. Was nicht in den Daten steht, steht auch
 * hier nicht — und wo eine Zahl fehlt, fehlt sie sichtbar.
 *
 * Und keine Uhr: Der heutige Tag kommt aus `Kalenderstand`, also vom Server
 * (E28). Ein `new Date()` in dieser Datei wäre die Stelle, an der eine
 * Geräteuhr die Tagesgrenze übernähme.
 */

/** Ein Paket, so wie „Heute" es nennt – mit Titel, nicht nur mit Kennung. */
export interface Paketzeile {
  courseId: string;
  packId: string;
  titel: string;
  kurstitel: string;
  dueCount: number;
  entryCount: number;
  lastPracticedAt?: string;
}

/** Höchstens so viele Pakete stehen unter „Zuletzt verwendet". */
export const ZULETZT_HOECHSTENS = 4;

export interface Heutebild {
  /** Das eine Paket, mit dem es weitergeht – oder keines. */
  weiterlernen?: Paketzeile;
  /** Alle Pakete mit offenen Wiederholungen, die größte Zahl zuerst. */
  faellig: Paketzeile[];
  faelligGesamt: number;
  kurse: Course[];
  zuletzt: Paketzeile[];
  /** Die sieben Tage – leer, solange die Zeitzone unbestätigt ist. */
  woche: Wochentag[];
  /** Die Serie – fehlt, solange die Zeitzone unbestätigt ist (E27). */
  serie?: Serie;
  /** Das Wochenziel in Lerntagen, oder nichts (E26). */
  wochenziel?: number;
  /** Wie viele Lerntage die laufende Woche schon hat. Ohne Zeitzone: nichts. */
  lerntageDerWoche?: number;
}

/**
 * Die Pakete, benannt und mit ihrem Kurs verbunden.
 *
 * `myDueOverview` kennt nur Kennungen – Titel stehen in den zugewiesenen
 * Fassungen. Ein Paket ohne Titel wird **weggelassen** und nicht mit seiner
 * Kennung angezeigt: `pack-unit-3-city-life` ist kein Name, den jemand lesen
 * will, und eine Zeile, die so heißt, sieht aus wie ein Fehler.
 */
export function paketzeilen(
  uebersicht: readonly DueOverview[],
  kurse: readonly Course[],
  titel: ReadonlyMap<string, string>,
): Paketzeile[] {
  const kursnamen = new Map(kurse.map((kurs) => [kurs.id, kurs.title]));
  const zeilen: Paketzeile[] = [];
  for (const eintrag of uebersicht) {
    const paketTitel = titel.get(`${eintrag.courseId}::${eintrag.packId}`);
    const kurstitel = kursnamen.get(eintrag.courseId);
    if (paketTitel === undefined || kurstitel === undefined) continue;
    zeilen.push({
      courseId: eintrag.courseId,
      packId: eintrag.packId,
      titel: paketTitel,
      kurstitel,
      dueCount: eintrag.dueCount,
      entryCount: eintrag.entryCount,
      ...(eintrag.lastPracticedAt === undefined
        ? {}
        : { lastPracticedAt: eintrag.lastPracticedAt }),
    });
  }
  return zeilen;
}

/**
 * Womit es weitergeht: das **zuletzt benutzte** Paket (§ 4.1).
 *
 * ## Die Regel, und warum sie so eng ist
 *
 * Maßgeblich ist einzig das jüngste `lastPracticedAt`. Nichts sonst — nicht
 * die Zahl offener Wiederholungen, nicht die Größe des Pakets, nicht die
 * Reihenfolge im Kurs.
 *
 * Bis zum 03.10.2026 stand hier etwas anderes: Pakete mit offenen
 * Wiederholungen zuerst, darunter das mit den meisten. Das klang vernünftig
 * und war falsch. „Weiterlernen" heißt **weiter**, also dort, wo jemand
 * aufgehört hat; ein Paket, das er vor drei Wochen zuletzt offen hatte,
 * verdrängte sonst das von gestern, nur weil dort mehr liegengeblieben ist.
 * Für „da liegt viel offen" gibt es einen eigenen Bereich, und der heißt
 * „Fällige Wiederholungen".
 *
 * Die Zahl fälliger Wörter steht trotzdem **in** der Karte. Sie ist die
 * Auskunft darüber, was einen dort erwartet — sie entscheidet nur nicht,
 * welche Karte es ist.
 *
 * ## Ohne jedes `lastPracticedAt` gibt es nichts
 *
 * Dann hat diese Person noch nie ein Paket in der Hand gehabt, und der
 * Bereich zeigt seinen leeren Anfangszustand. Ein zugewiesenes, nie
 * geöffnetes Paket hier anzubieten hieße „weiter" zu sagen, wo noch nichts
 * angefangen wurde.
 */
export function weiterlernen(zeilen: readonly Paketzeile[]): Paketzeile | undefined {
  const benutzt = zeilen.filter((zeile) => zeile.lastPracticedAt !== undefined);
  if (benutzt.length === 0) return undefined;
  return [...benutzt].sort((a, b) =>
    (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''),
  )[0];
}

/** Die zuletzt benutzten Pakete, höchstens vier (§ 4.1). */
export function zuletztVerwendet(zeilen: readonly Paketzeile[]): Paketzeile[] {
  return [...zeilen]
    .filter((zeile) => zeile.lastPracticedAt !== undefined)
    .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))
    .slice(0, ZULETZT_HOECHSTENS);
}

/**
 * Alles zusammen.
 *
 * Der Kalenderstand entscheidet über drei der sieben Bereiche: Ohne
 * bestätigte Zeitzone gibt es keine Woche, keine Serie und keinen
 * Wochenfortschritt – nicht als Null, sondern **gar nicht** (E27). Die
 * anderen vier stehen davon unberührt da; wer seine Zeitzone nicht bestätigt
 * hat, kann trotzdem üben.
 */
export function heutebild(input: {
  uebersicht: readonly DueOverview[];
  kurse: readonly Course[];
  paketTitel: ReadonlyMap<string, string>;
  kalender: Kalenderstand;
  lerntage: readonly Tageszaehlung[];
  einstellungen: LearnerSettings;
}): Heutebild {
  const zeilen = paketzeilen(input.uebersicht, input.kurse, input.paketTitel);
  const faellig = zeilen
    .filter((zeile) => zeile.dueCount > 0)
    .sort((a, b) => b.dueCount - a.dueCount);

  const naechstes = weiterlernen(zeilen);
  const bild: Heutebild = {
    ...(naechstes === undefined ? {} : { weiterlernen: naechstes }),
    faellig,
    faelligGesamt: faellig.reduce((summe, zeile) => summe + zeile.dueCount, 0),
    kurse: [...input.kurse],
    zuletzt: zuletztVerwendet(zeilen),
    woche: [],
    ...(input.einstellungen.weeklyGoalDays === undefined
      ? {}
      : { wochenziel: input.einstellungen.weeklyGoalDays }),
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

/**
 * Der Wochentag als Buchstabe – Mo bis So.
 *
 * Aus dem Kalendertag gerechnet und nicht aus einer Formatierung: `Intl`
 * bräuchte eine Zeitzone, und die ist hier schon angewandt. Der Tag ist ein
 * Etikett, kein Zeitpunkt mehr.
 */
export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
