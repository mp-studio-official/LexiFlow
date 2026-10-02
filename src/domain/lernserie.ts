/**
 * Lernserie und Wochenaktivität — die Regeln, ohne Speicher und ohne Uhr.
 *
 * ## Was hier entschieden wird
 *
 * **E1:** Ein Lerntag zählt ab zehn bewerteten Aufgaben. Weniger ist kein
 * halber Lerntag, sondern keiner – eine Serie, die bei einer Aufgabe
 * weiterläuft, misst nichts.
 *
 * **E2:** Zwei Ruhetage je Kalenderwoche dürfen eine Serie überbrücken. Ein
 * dritter fehlender Tag in derselben Woche beendet sie. Ruhetage sind **nicht
 * ansammelbar**: Jede Woche hat ihre zwei, und ungenutzte verfallen.
 *
 * **E28:** Welcher Tag ein Tag ist, entscheidet der Server. Dieses Modul
 * bekommt fertige lokale Kalendertage und rechnet nur noch. Es ruft keine
 * Uhr, kein `Date.now()`, kein `new Date()` – die Wache in
 * `keineTestuhr.test.ts` hält das fest.
 *
 * ## Warum das hier steht und nicht in SQL
 *
 * Weil es Produktregeln sind und keine Datenfrage. Die Zehn, die Zwei und
 * „ein dritter beendet sie" sind Entscheidungen aus dem Konzept; sie werden
 * sich ändern, und dann sollen sie sich an **einer** Stelle ändern – mit
 * Prüfungen daneben, nicht in einer Migration, die nie wieder läuft.
 *
 * ## Der Ton
 *
 * Dieses Modul formuliert nichts. Es liefert Zahlen und Wahrheitswerte; wie
 * eine Unterbrechung heißt, entscheidet die Seite. Das ist kein Zufall: Eine
 * Domainfunktion, die „Du hast deine Serie verloren!" zurückgibt, nimmt der
 * Oberfläche die Entscheidung über den Ton ab, die sie treffen muss (Konzept
 * 4.3 – ruhig, nie strafend, keine Herzen, keine Rangliste).
 */

/** Ab so vielen bewerteten Aufgaben zählt ein Tag als Lerntag (E1). */
export const LERNTAG_SCHWELLE = 10;

/** So viele Ruhetage überbrücken je Kalenderwoche eine Serie (E2). */
export const RUHETAGE_JE_WOCHE = 2;

/** Ein lokaler Kalendertag mit der Zahl der an ihm bewerteten Aufgaben. */
export interface Tageszaehlung {
  /** `YYYY-MM-DD` in der bestätigten Zeitzone – vom Server gebildet. */
  readonly localDay: string;
  readonly taskCount: number;
}

/** Ein Tag der laufenden Woche, wie ihn die Seite zeigt. */
export interface Wochentag {
  readonly localDay: string;
  readonly taskCount: number;
  readonly lerntag: boolean;
  /** Liegt dieser Tag noch vor uns? Dann ist er nicht „verpasst". */
  readonly kuenftig: boolean;
  readonly heute: boolean;
}

export interface Serie {
  /** Lerntage in Folge – Ruhetage überbrückt, aber nicht mitgezählt. */
  readonly laenge: number;
  /** Ob heute die Schwelle schon erreicht ist. */
  readonly heuteGeschafft: boolean;
  /** Wie viele Ruhetage die laufende Kalenderwoche schon verbraucht hat. */
  readonly ruhetageVerbraucht: number;
  /** Wie viele in dieser Woche noch bleiben. Nie negativ. */
  readonly ruhetageUebrig: number;
}

/** Ein Tag ist ein Lerntag, wenn an ihm genug Aufgaben bewertet wurden. */
export function istLerntag(zaehlung: Tageszaehlung | undefined): boolean {
  return (zaehlung?.taskCount ?? 0) >= LERNTAG_SCHWELLE;
}

/* ------------------------------------------------------ Kalenderrechnen -- */

/*
  Datumsrechnung auf Zeichenketten, nicht auf `Date`.

  `new Date('2026-10-02')` ist Mitternacht **UTC**; wer davon einen Tag
  abzieht und wieder formatiert, bekommt in der halben Welt den falschen Tag.
  Die lokalen Kalendertage kommen hier bereits fertig an – sie sind Etiketten,
  keine Zeitpunkte, und werden auch so behandelt.
*/

const TAG_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Tage seit dem 01.01.1970, aus einem `YYYY-MM-DD`. */
function alsTagesnummer(tag: string): number {
  const treffer = TAG_MUSTER.exec(tag);
  if (!treffer) throw new Error(`Kein Kalendertag: ${tag}`);
  return Math.floor(
    Date.UTC(Number(treffer[1]), Number(treffer[2]) - 1, Number(treffer[3])) / 86_400_000,
  );
}

/** Der Weg zurück: aus einer Tagesnummer wieder `YYYY-MM-DD`. */
function alsTag(nummer: number): string {
  return new Date(nummer * 86_400_000).toISOString().slice(0, 10);
}

/** Dieser Tag, um `anzahl` Tage verschoben. */
export function tagPlus(tag: string, anzahl: number): string {
  return alsTag(alsTagesnummer(tag) + anzahl);
}

/** Wie viele Tage liegen zwischen beiden – `b` minus `a`. */
export function tageZwischen(a: string, b: string): number {
  return alsTagesnummer(b) - alsTagesnummer(a);
}

/* ------------------------------------------------------------- Die Serie -- */

/**
 * Die Serie, rückwärts vom heutigen lokalen Tag.
 *
 * ## Der Gang
 *
 * Vom heutigen Tag aus Schritt für Schritt rückwärts:
 *
 * - **Lerntag** → die Serie wächst um eins, weiter.
 * - **Kein Lerntag** → ein Ruhetag dieser Kalenderwoche wird verbraucht. Ist
 *   das Wochenkontingent aufgebraucht, endet die Serie **vor** diesem Tag.
 *
 * ## Warum der heutige Tag eine Ausnahme ist
 *
 * Er ist noch nicht vorbei. Zählte er als verbrauchter Ruhetag, wäre die
 * Serie jeden Morgen um einen Ruhetag ärmer – und an manchen Tagen vor dem
 * Frühstück beendet. Heute wird deshalb übersprungen, wenn die Schwelle noch
 * nicht erreicht ist, und der Gang beginnt bei gestern.
 *
 * ## Warum die Länge Lerntage zählt und nicht Kalendertage
 *
 * Weil „sieben Tage" sonst hieße: fünf gelernt, zwei nicht. Die Zahl soll
 * halten, was sie sagt.
 *
 * @param tage Alle lokalen Tage mit Zählung – Reihenfolge egal, Lücken normal.
 * @param heute Der heutige lokale Kalendertag, vom Server (`my_local_today`).
 * @param wochenbeginn Der Montag der laufenden Woche, ebenfalls vom Server.
 */
export function serieAm(
  tage: readonly Tageszaehlung[],
  heute: string,
  wochenbeginn: string,
): Serie {
  const nachTag = new Map<string, Tageszaehlung>();
  for (const zaehlung of tage) nachTag.set(zaehlung.localDay, zaehlung);

  const heuteGeschafft = istLerntag(nachTag.get(heute));

  /*
    Ruhetage werden je Kalenderwoche gezählt, und die Woche eines Tages
    ergibt sich aus seinem Abstand zum bekannten Wochenbeginn. Sieben Tage
    zurück ist die Woche davor – das braucht keinen Kalender und keine
    Bibliothek, nur eine Division.
  */
  const verbraucht = new Map<number, number>();
  function wocheVon(tag: string): number {
    return Math.floor(tageZwischen(wochenbeginn, tag) / 7);
  }
  function ruhetagMoeglich(tag: string): boolean {
    const woche = wocheVon(tag);
    const bisher = verbraucht.get(woche) ?? 0;
    if (bisher >= RUHETAGE_JE_WOCHE) return false;
    verbraucht.set(woche, bisher + 1);
    return true;
  }

  // Heute zählt nur, wenn es geschafft ist – aber es kostet nie einen Ruhetag.
  let laenge = heuteGeschafft ? 1 : 0;
  let tag = tagPlus(heute, -1);

  /*
    Die Schranke ist das Fenster, das `my_learning_days` liefert. Sie steht
    hier als Zahl und nicht als `while (true)`: Eine Schleife, die auf ihre
    Abbruchbedingung in den Daten vertraut, läuft eines Tages nicht ab.
  */
  for (let schritt = 0; schritt < 400; schritt += 1) {
    if (istLerntag(nachTag.get(tag))) {
      laenge += 1;
    } else if (!ruhetagMoeglich(tag)) {
      break;
    }
    tag = tagPlus(tag, -1);
  }

  const dieseWoche = verbraucht.get(0) ?? 0;
  return {
    laenge,
    heuteGeschafft,
    ruhetageVerbraucht: dieseWoche,
    ruhetageUebrig: Math.max(0, RUHETAGE_JE_WOCHE - dieseWoche),
  };
}

/* ------------------------------------------------------- Die Wochenansicht */

/**
 * Die sieben Tage der laufenden Kalenderwoche, Montag bis Sonntag.
 *
 * Immer sieben – auch wenn nichts geübt wurde und auch für die Tage, die noch
 * kommen. Eine Woche mit drei Kästchen sähe aus, als fehlte etwas.
 *
 * Künftige Tage sind als solche gekennzeichnet, damit die Seite sie nicht wie
 * verpasste zeichnet. Der Donnerstag ist am Dienstag nicht ausgelassen.
 */
export function wochenaktivitaet(
  tage: readonly Tageszaehlung[],
  heute: string,
  wochenbeginn: string,
): Wochentag[] {
  const nachTag = new Map<string, Tageszaehlung>();
  for (const zaehlung of tage) nachTag.set(zaehlung.localDay, zaehlung);

  return Array.from({ length: 7 }, (_, versatz) => {
    const localDay = tagPlus(wochenbeginn, versatz);
    const zaehlung = nachTag.get(localDay);
    return {
      localDay,
      taskCount: zaehlung?.taskCount ?? 0,
      lerntag: istLerntag(zaehlung),
      kuenftig: tageZwischen(heute, localDay) > 0,
      heute: localDay === heute,
    };
  });
}

/**
 * Wie viele Lerntage die laufende Woche schon hat – für das Wochenziel (E26).
 *
 * Zählt nur die vergangenen und den heutigen Tag. Ein Ziel, das die künftigen
 * Tage mitzählte, wäre am Montag schon erfüllt.
 */
export function lerntageDieseWoche(wochentage: readonly Wochentag[]): number {
  return wochentage.filter((tag) => !tag.kuenftig && tag.lerntag).length;
}
