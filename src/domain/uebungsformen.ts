import { isDue } from './leitner';
import { istSchwierig } from './schwierigeWoerter';
import { activeDirections } from './schema';
import { directionKey } from './ids';
import type { EntryProgress, LearningDirection, VocabEntry } from './schema';

/**
 * Welche Übungswege ein Konto heute wirklich hat.
 *
 * ## Die eine Regel, aus der alles folgt
 *
 * Eine Karte erscheint nur, wenn ihr Weg **jetzt** funktioniert — nicht
 * ausgegraut, nicht mit „bald". Ein ausgegrauter Knopf ist ein Versprechen
 * ohne Termin (Konzept 4.3).
 *
 * Deshalb steht hier keine Liste aller denkbaren Formen, sondern eine
 * Ableitung aus dem, was vorliegt: eigene Lernstände und die Richtungen der
 * zugewiesenen Pakete. Fällt die Voraussetzung weg, fällt die Karte — ohne
 * dass jemand eine zweite Liste nachpflegen muss.
 *
 * ## Was hier ausdrücklich **nicht** entsteht
 *
 * Karteikarten und Lückentexte sind als Aufgabenformen vorhanden, aber das
 * Portal hat heute keinen Einstieg, der eine Form auswählt — es plant eine
 * gemischte Runde. Eine Karte dafür führte ins selbe Gemischte und
 * behauptete, man habe gewählt. Das stellt **5B.15** her, und bis dahin gibt
 * es die Karte nicht.
 *
 * Zeitformen setzen ein Datenmodell voraus, das es nicht gibt. Kleine Spiele
 * sind nicht Teil von 5B. Beide kommen in dieser Datei nicht vor — auch nicht
 * als auskommentierte Absicht.
 *
 * ## Fremde Daten
 *
 * Kommen hier nicht vor. Die Funktionen sehen Einträge und **eigene**
 * Lernstände; es gibt keinen Parameter für eine andere Person.
 */

/**
 * Die Formen, die erreichbar sind.
 *
 * `karten`, `selbsttest`, `frei` und `liste` kamen mit **5B.15** dazu: Die
 * Ansichten gab es längst, nur im Portal führte kein Weg zu ihnen. Sie werden
 * wiederverwendet, nicht nachgebaut.
 */
export const UEBUNGSFORMEN = [
  'faellig',
  'schwierig',
  'en-de',
  'de-en',
  'karten',
  'selbsttest',
  'frei',
  'liste',
] as const;
export type Uebungsform = (typeof UEBUNGSFORMEN)[number];

export interface Formbeschreibung {
  readonly form: Uebungsform;
  readonly titel: string;
  readonly satz: string;
}

export const FORMEN: Readonly<Record<Uebungsform, Formbeschreibung>> = {
  faellig: {
    form: 'faellig',
    titel: 'Fällige Wiederholungen',
    satz: 'Wörter, die heute wieder dran sind. Danach ist Ruhe — nicht mehr.',
  },
  schwierig: {
    form: 'schwierig',
    titel: 'Schwierige Wörter',
    satz: 'Die, bei denen es mehrmals danebenging und die noch nicht sitzen.',
  },
  'en-de': {
    form: 'en-de',
    titel: 'Englisch → Deutsch',
    satz: 'Nur verstehen: Du siehst das englische Wort und nennst die deutsche Bedeutung.',
  },
  'de-en': {
    form: 'de-en',
    titel: 'Deutsch → Englisch',
    satz: 'Nur selbst formulieren: Du siehst das deutsche Wort und schreibst das englische.',
  },
  karten: {
    form: 'karten',
    titel: 'Karteikarten',
    satz: 'Durchblättern, umdrehen, weiter. Ohne Eingabe und ohne Bewertung.',
  },
  selbsttest: {
    form: 'selbsttest',
    titel: 'Selbsttest',
    satz: 'Alle Aufgaben hintereinander, die Auswertung kommt am Ende.',
  },
  frei: {
    form: 'frei',
    titel: 'Frei üben',
    satz: 'Du stellst die Runde selbst zusammen: Richtung, Formen und Länge.',
  },
  liste: {
    form: 'liste',
    titel: 'Vokabelliste',
    satz: 'Alle Wörter des Pakets zum Nachlesen — kein Üben, kein Lernstand.',
  },
};

/** Ein Paket, so weit die Auswahl es kennen muss. */
export interface Paketstand {
  readonly courseId: string;
  readonly packId: string;
  readonly titel: string;
  readonly direction: LearningDirection;
  readonly entries: readonly VocabEntry[];
  /** Nur die eigenen Stände dieses Pakets, nach `directionKey`. */
  readonly staende: ReadonlyMap<string, EntryProgress>;
}

/** Ein Paket mit der Zahl, die zu einer Form gehört. */
export interface Formziel {
  readonly courseId: string;
  readonly packId: string;
  readonly titel: string;
  readonly anzahl: number;
}

export interface Formkarte {
  readonly form: Uebungsform;
  readonly titel: string;
  readonly satz: string;
  readonly ziele: readonly Formziel[];
  readonly gesamt: number;
}

/** Die Stände eines Pakets in seinen aktiven Richtungen. */
function staendeIn(paket: Paketstand, richtung: LearningDirection): EntryProgress[] {
  const gefunden: EntryProgress[] = [];
  for (const eintrag of paket.entries) {
    for (const seite of activeDirections(richtung)) {
      const stand = paket.staende.get(directionKey(eintrag.id, seite));
      if (stand) gefunden.push(stand);
    }
  }
  return gefunden;
}

export function zaehleFaellige(paket: Paketstand, jetzt: Date = new Date()): number {
  return staendeIn(paket, paket.direction).filter((stand) => isDue(stand, jetzt)).length;
}

export function zaehleSchwierige(paket: Paketstand): number {
  return staendeIn(paket, paket.direction).filter(istSchwierig).length;
}

/**
 * Wie viele Wörter eines Pakets in **einer** Richtung überhaupt geübt werden
 * können.
 *
 * Nur Pakete mit `both` bieten die Wahl an — bei einem Paket mit genau einer
 * Richtung wäre „Englisch → Deutsch" keine Auswahl, sondern dieselbe Runde
 * unter anderem Namen (`directionChoicesFor`).
 */
export function zaehleRichtung(paket: Paketstand): number {
  return paket.direction === 'both' ? paket.entries.length : 0;
}

/**
 * Wörter, die eine Ansicht ohne weitere Bedingung zeigen kann.
 *
 * Karteikarten, Selbsttest, freies Üben und die Vokabelliste brauchen nur
 * Wörter — keine Fälligkeit, keinen Lernstand, keine zweite Richtung. Ein
 * leeres Paket gibt trotzdem nichts her, und dann steht die Karte auch nicht
 * da.
 */
export function zaehleWoerter(paket: Paketstand): number {
  return paket.entries.length;
}

/**
 * Die Karten, die heute stehen dürfen.
 *
 * Eine Form ohne ein einziges Ziel mit einer Zahl > 0 erscheint nicht. Das
 * ist dieselbe Regel wie oben, nur zusammengefasst: Es gibt keinen Zustand
 * „Karte da, Weg leer".
 */
export function formkarten(
  pakete: readonly Paketstand[],
  jetzt: Date = new Date(),
): Formkarte[] {
  const zaehler: Readonly<Record<Uebungsform, (paket: Paketstand) => number>> = {
    faellig: (paket) => zaehleFaellige(paket, jetzt),
    schwierig: zaehleSchwierige,
    'en-de': zaehleRichtung,
    'de-en': zaehleRichtung,
    karten: zaehleWoerter,
    selbsttest: zaehleWoerter,
    frei: zaehleWoerter,
    liste: zaehleWoerter,
  };

  const karten: Formkarte[] = [];
  for (const form of UEBUNGSFORMEN) {
    const ziele = pakete
      .map((paket) => ({
        courseId: paket.courseId,
        packId: paket.packId,
        titel: paket.titel,
        anzahl: zaehler[form](paket),
      }))
      .filter((ziel) => ziel.anzahl > 0)
      .sort((a, b) => b.anzahl - a.anzahl || a.titel.localeCompare(b.titel, 'de'));

    if (ziele.length === 0) continue;
    karten.push({
      ...FORMEN[form],
      ziele,
      gesamt: ziele.reduce((summe, ziel) => summe + ziel.anzahl, 0),
    });
  }
  return karten;
}

/** Die Adresse, die eine Karte für ein Paket öffnet. */
/**
 * Die Adresse, die eine Karte für ein Paket öffnet.
 *
 * Vier Formen führen in die Runde (mit verschiedenen Parametern), vier in
 * eine eigene Ansicht. Dass **keine zwei dieselbe** Adresse erzeugen, prüft
 * `uebungsformen.test.ts` — sonst stünden zwei Karten da, die dasselbe tun.
 */
const EIGENE_ANSICHT: Partial<Record<Uebungsform, string>> = {
  karten: 'karten',
  selbsttest: 'selbsttest',
  frei: 'frei',
  liste: 'liste',
};

export function wegZu(form: Uebungsform, ziel: Formziel): string {
  const eigene = EIGENE_ANSICHT[form];
  if (eigene) return `/ueben/${eigene}/${ziel.courseId}/${ziel.packId}`;

  const grund = `/lernen/kurs/${ziel.courseId}/ueben/${ziel.packId}`;
  if (form === 'en-de' || form === 'de-en') return `${grund}?richtung=${form}`;
  return `${grund}?auswahl=${form}`;
}
