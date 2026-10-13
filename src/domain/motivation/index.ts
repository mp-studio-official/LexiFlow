import type { Beherrschungsstand } from '../beherrschung';
import { LERNTAG_SCHWELLE, type Serie, type Tageszaehlung, istLerntag } from '../lernserie';

/**
 * Motivation ohne Überwachung und ohne Vergleich.
 *
 * ## Die Linie
 *
 * Alles hier ist aus dem **eigenen**, ohnehin zulässigen Lernstand
 * ableitbar. Es entsteht kein neues Datum über eine Person, nichts wird an
 * eine Lehrkraft gemeldet, und nichts vergleicht zwei Lernende
 * miteinander. Das ist keine Vorsichtsmaßnahme, sondern das
 * Produktversprechen in Code: „Lehrkräfte sehen keine individuellen
 * Lernstände" gilt auch für die freundlichen Zahlen.
 *
 * ## Warum hier weder Uhrzeit noch Dauer vorkommt
 *
 * `Grundlage` hat kein Feld für Zeit, Dauer oder Geschwindigkeit. Wer
 * Tempo belohnt, belohnt Raten: Die schnellste Art, eine Vokabelrunde zu
 * beenden, ist, nicht nachzudenken. Was nicht hereinkommt, kann nicht
 * belohnt werden — deshalb kommt es nicht herein.
 *
 * ## Warum Erreichtes erreicht bleibt
 *
 * Eine abgerissene Serie nimmt keine Auszeichnung zurück. Die Serie selbst
 * hat dafür ihre Ruhetage; die Auszeichnungen schauen zusätzlich auf
 * `laengste` statt auf `laenge`. Eine Oberfläche, die einem Kind etwas
 * wieder wegnimmt, weil es eine Woche krank war, ist keine Motivation.
 */

export interface Tagesstand {
  /** Heute beantwortete Aufgaben. */
  readonly geschafft: number;
  /** Ab wann der Tag als Lerntag zählt — dieselbe Schwelle wie die Serie. */
  readonly ziel: number;
  readonly offen: number;
  readonly erfuellt: boolean;
}

/**
 * Das Tagesziel.
 *
 * Kein eigener, frei erfundener Wert: Es ist genau die Schwelle, ab der die
 * Lernserie einen Tag als Lerntag zählt. Zwei verschiedene Zahlen für
 * „heute genug gelernt" wären zwei Wahrheiten, und die Oberfläche müsste
 * erklären, welche gerade gilt.
 */
export function tagesstand(heute: Tageszaehlung | undefined): Tagesstand {
  const geschafft = heute?.taskCount ?? 0;
  return {
    geschafft,
    ziel: LERNTAG_SCHWELLE,
    offen: Math.max(0, LERNTAG_SCHWELLE - geschafft),
    erfuellt: istLerntag(heute),
  };
}

/** Der Satz, der neben dem Tagesziel steht. */
export function tageszielSatz(stand: Tagesstand): string {
  if (stand.erfuellt) return 'Heute geschafft.';
  if (stand.geschafft === 0) return `${stand.ziel} Aufgaben sind ein Lerntag.`;
  return stand.offen === 1
    ? 'Noch 1 Aufgabe bis zum Tagesziel.'
    : `Noch ${stand.offen} Aufgaben bis zum Tagesziel.`;
}

export interface Rundenfortschritt {
  readonly beantwortet: number;
  readonly gesamt: number;
  /** 0 bis 1. Für den Balken, nicht für den Text. */
  readonly anteil: number;
  /** „7 von 20" — die Auskunft, die auch ohne Balken funktioniert. */
  readonly label: string;
  readonly abgeschlossen: boolean;
}

export function rundenfortschritt(beantwortet: number, gesamt: number): Rundenfortschritt {
  const sicher = Math.max(0, Math.min(beantwortet, gesamt));
  return {
    beantwortet: sicher,
    gesamt,
    anteil: gesamt > 0 ? sicher / gesamt : 0,
    label: `${sicher} von ${gesamt}`,
    abgeschlossen: gesamt > 0 && sicher >= gesamt,
  };
}

export type Auszeichnungsschluessel =
  | 'erster-lerntag'
  | 'woche-dabei'
  | 'zehn-beherrscht'
  | 'fuenfzig-beherrscht'
  | 'paket-beherrscht'
  | 'wochenziel';

export interface Auszeichnungsbeschreibung {
  readonly schluessel: Auszeichnungsschluessel;
  readonly titel: string;
  readonly satz: string;
}

/**
 * Die Auszeichnungen — und warum es genau diese sind.
 *
 * Jede steht für eine **Lernhandlung**, die stattgefunden hat: ein Tag, an
 * dem wirklich geübt wurde; eine Woche, in der es weiterging; Wörter, die
 * sitzen; ein Paket, das durch ist; ein Ziel, das die lernende Person sich
 * selbst gesetzt hat. Keine für Tempo, keine für Anwesenheit, keine fürs
 * Aufmachen der Seite.
 */
export const AUSZEICHNUNGEN: readonly Auszeichnungsbeschreibung[] = [
  {
    schluessel: 'erster-lerntag',
    titel: 'Erster Lerntag',
    satz: 'An einem Tag so viel geübt, dass er als Lerntag zählt.',
  },
  {
    schluessel: 'woche-dabei',
    titel: 'Eine Woche dabei',
    satz: 'Sieben Lerntage in Folge — Ruhetage mitgerechnet.',
  },
  {
    schluessel: 'zehn-beherrscht',
    titel: 'Zehn sitzen',
    satz: 'Zehn Wörter sicher gekonnt.',
  },
  {
    schluessel: 'fuenfzig-beherrscht',
    titel: 'Fünfzig sitzen',
    satz: 'Fünfzig Wörter sicher gekonnt.',
  },
  {
    schluessel: 'paket-beherrscht',
    titel: 'Ein Paket durch',
    satz: 'Ein ganzes Lernpaket sitzt.',
  },
  {
    schluessel: 'wochenziel',
    titel: 'Eigenes Wochenziel erreicht',
    satz: 'So viele Lerntage geschafft, wie du dir vorgenommen hast.',
  },
];

export interface Auszeichnung extends Auszeichnungsbeschreibung {
  readonly erreicht: boolean;
  /** Der eigene Stand auf dem Weg dorthin. Niemals ein fremder. */
  readonly stand?: { readonly wert: number; readonly ziel: number };
}

/**
 * Woraus sich Auszeichnungen ergeben.
 *
 * Ausschließlich Werte, die „Heute" und „Mein Fortschritt" ohnehin schon
 * anzeigen. Kein Feld für Zeit, Dauer oder Geschwindigkeit — siehe oben.
 */
export interface Grundlage {
  readonly lerntage: readonly Tageszaehlung[];
  readonly beherrschung: Beherrschungsstand;
  /** Je Paket ein Stand — für „ein ganzes Paket sitzt". */
  readonly paketstaende: readonly Beherrschungsstand[];
  readonly serie?: Serie;
  readonly wochenziel?: number;
  readonly lerntageDerWoche?: number;
}

function mitStand(
  beschreibung: Auszeichnungsbeschreibung,
  wert: number,
  ziel: number,
): Auszeichnung {
  const erreicht = wert >= ziel;
  return erreicht
    ? { ...beschreibung, erreicht }
    : { ...beschreibung, erreicht, stand: { wert, ziel } };
}

export function auszeichnungen(grundlage: Grundlage): Auszeichnung[] {
  const lerntage = grundlage.lerntage.filter((tag) => istLerntag(tag)).length;
  /*
    `laengste` und nicht `laenge`: Wer sieben Tage am Stück gelernt hat, hat
    das getan. Eine Grippewoche macht es nicht ungeschehen.
  */
  const laengsteSerie = grundlage.serie?.laengste ?? 0;
  const volleePakete = grundlage.paketstaende.filter(
    (stand) => stand.gesamt > 0 && stand.offen === 0,
  ).length;

  return AUSZEICHNUNGEN.map((beschreibung) => {
    switch (beschreibung.schluessel) {
      case 'erster-lerntag':
        return mitStand(beschreibung, lerntage, 1);
      case 'woche-dabei':
        return mitStand(beschreibung, laengsteSerie, 7);
      case 'zehn-beherrscht':
        return mitStand(beschreibung, grundlage.beherrschung.beherrscht, 10);
      case 'fuenfzig-beherrscht':
        return mitStand(beschreibung, grundlage.beherrschung.beherrscht, 50);
      case 'paket-beherrscht':
        return mitStand(beschreibung, volleePakete, 1);
      case 'wochenziel':
        /*
          Ohne eigenes Ziel gibt es nichts zu erreichen — und erst recht
          keinen Grund, eines zu erfinden. Das Wochenziel ist freiwillig
          (E26); eine Auszeichnung, die ohne Zutun erscheint, machte es
          stillschweigend zur Pflicht.
        */
        return grundlage.wochenziel === undefined
          ? { ...beschreibung, erreicht: false }
          : mitStand(beschreibung, grundlage.lerntageDerWoche ?? 0, grundlage.wochenziel);
    }
  });
}

/**
 * Was seit dem letzten Blick dazugekommen ist — wofür also gefeiert wird.
 *
 * Nur Zuwachs. Eine Auszeichnung, die in der neuen Liste fehlt, löst nichts
 * aus: Es gibt keine Gegenfeier und keine Mitteilung über einen Verlust.
 */
export function frischErreicht(
  vorher: readonly Auszeichnung[],
  nachher: readonly Auszeichnung[],
): Auszeichnung[] {
  const warErreicht = new Set(
    vorher.filter((eintrag) => eintrag.erreicht).map((eintrag) => eintrag.schluessel),
  );
  return nachher.filter((eintrag) => eintrag.erreicht && !warErreicht.has(eintrag.schluessel));
}
