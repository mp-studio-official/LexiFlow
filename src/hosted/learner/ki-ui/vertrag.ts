import type { CefrLevel } from '../../../domain/cefr';

/**
 * Der Vertrag der Schüler-KI — und vor allem seine Grenzen.
 *
 * ## Was der Lerncoach erfährt
 *
 * Genau das, was auf der Karte steht, die gerade vor der lernenden Person
 * liegt: die Lernform, die Richtung, ein freigegebener Beispielsatz, die
 * eine Antwort, die gerade getippt wurde, Sprache und Niveau. Mehr nicht.
 *
 * ## Was er ausdrücklich nicht erfährt
 *
 * Keinen Namen, keine Lern-ID, keine Kurskennung, keinen Lernverlauf,
 * keinen Schlüssel, kein Anbieterobjekt. Das steht nicht nur hier als
 * Satz: `Coachaufgabe` hat für nichts davon ein Feld, und eine Wache in
 * `vertrag.test.ts` liest diese Datei und prüft es nach. Was es nicht
 * gibt, kann niemand versehentlich mitschicken.
 *
 * ## Warum kein freies Eingabefeld
 *
 * Ein offenes Chatfeld ist ein offener Kanal: Was eine lernende Person
 * dort hineinschreibt, entscheidet niemand mehr vorher. Vier feste
 * Handlungen sind nachprüfbar — man kann aufschreiben, was jede von ihnen
 * sendet, und es stimmt dann auch.
 */

export const COACH_AKTIONEN = [
  'fehler-erklaeren',
  'hinweis',
  'anderer-satz',
  'warum-richtig',
] as const;
export type Coachaktion = (typeof COACH_AKTIONEN)[number];

export const AKTIONSTEXTE: Readonly<Record<Coachaktion, string>> = {
  'fehler-erklaeren': 'Erkläre meinen Fehler',
  hinweis: 'Gib mir einen Hinweis',
  'anderer-satz': 'Zeige mir einen anderen Beispielsatz',
  'warum-richtig': 'Warum ist diese Antwort richtig?',
};

/** Was der Coach über die Aufgabe erfährt — und sonst nichts. */
export interface Coachaufgabe {
  /** Die Lernform, wie sie auf der Karte steht. */
  readonly lernform: string;
  /** In welche Richtung gefragt wurde. */
  readonly richtung: 'en-de' | 'de-en';
  /** Ein von der Lehrkraft freigegebener Beispielsatz, falls es einen gibt. */
  readonly beispielsatz?: string;
  /** Die eine Antwort, um die es gerade geht. Kein Verlauf. */
  readonly antwort?: string;
  /** Die richtige Lösung — für „warum ist das richtig". */
  readonly loesung?: string;
  readonly sprache: 'de' | 'en';
  readonly niveau: CefrLevel;
}

export type Coachantwort =
  | { readonly art: 'text'; readonly text: string }
  /** Die Antwort kam an, taugte aber nicht — siehe `pruefeAntwort`. */
  | { readonly art: 'verworfen'; readonly grund: string }
  | { readonly art: 'rate-limit'; readonly wiederInSekunden?: number }
  | { readonly art: 'nicht-erreichbar' }
  | { readonly art: 'abgebrochen' };

export interface Coachanbieter {
  /** Der Name, wie er in der Oberfläche steht — „OpenAI API", nicht „ChatGPT". */
  readonly name: string;
  frage(
    aufgabe: Coachaufgabe,
    aktion: Coachaktion,
    signal?: AbortSignal,
  ): Promise<Coachantwort>;
}

/**
 * Taugt diese Antwort für diese Handlung?
 *
 * ## Warum das hier passiert und nicht beim Anbieter
 *
 * Weil der Anbieter die Regel nicht kennt und nicht kennen muss: Ein
 * **Hinweis**, der die Lösung enthält, ist kein Hinweis, sondern die
 * Lösung — ganz gleich, wie freundlich er formuliert ist. Dasselbe gilt
 * für eine leere Antwort und für eine, die nur die Frage wiederholt.
 *
 * Die Prüfung steht auf dieser Seite, damit sie für jeden Anbieter gilt,
 * auch für einen, der später dazukommt.
 */
export function pruefeAntwort(
  text: string,
  aktion: Coachaktion,
  aufgabe: Coachaufgabe,
): Coachantwort {
  const sauber = text.trim();
  if (sauber.length === 0) {
    return { art: 'verworfen', grund: 'Die Antwort war leer.' };
  }
  if (aktion === 'hinweis') {
    const loesung = (aufgabe.richtung === 'de-en' ? aufgabe.lernform : aufgabe.loesung) ?? '';
    if (loesung.length > 0 && sauber.toLowerCase().includes(loesung.toLowerCase())) {
      return {
        art: 'verworfen',
        grund: 'Der Hinweis hätte die Lösung verraten.',
      };
    }
  }
  return { art: 'text', text: sauber };
}

/**
 * Ein Anbieter, der nichts anruft.
 *
 * Für Oberfläche und Prüfstand. Er antwortet aus festen Bausteinen,
 * **deterministisch** — damit eine Prüfung, die ihn benutzt, morgen
 * dasselbe sieht wie heute.
 *
 * Er kann zusätzlich jeden Fehlerfall auf Ansage liefern, weil eine
 * Oberfläche, die „Rate-Limit" nur behauptet, aber nie zeigt, diesen
 * Zustand nicht wirklich hat.
 */
export interface FakeAnbieterEinstellung {
  readonly name?: string;
  /** Was er statt einer Antwort liefern soll. */
  readonly stattdessen?: Exclude<Coachantwort, { art: 'text' }>;
  /** Eine Antwort, die absichtlich zu viel verrät — für die Verwerfungsprobe. */
  readonly verraeterisch?: boolean;
}

export function fakeAnbieter(einstellung: FakeAnbieterEinstellung = {}): Coachanbieter {
  return {
    name: einstellung.name ?? 'Testanbieter (ohne Netz)',
    async frage(aufgabe, aktion, signal) {
      if (signal?.aborted) return { art: 'abgebrochen' };
      if (einstellung.stattdessen) return einstellung.stattdessen;
      if (einstellung.verraeterisch) {
        return pruefeAntwort(`Es ist „${aufgabe.lernform}".`, aktion, aufgabe);
      }
      return pruefeAntwort(antwortText(aufgabe, aktion), aktion, aufgabe);
    },
  };
}

function antwortText(aufgabe: Coachaufgabe, aktion: Coachaktion): string {
  switch (aktion) {
    case 'fehler-erklaeren':
      return aufgabe.antwort
        ? `„${aufgabe.antwort}“ geht in eine andere Richtung als gesucht. Achte auf die Wortart.`
        : 'Zu dieser Aufgabe liegt keine Antwort vor, die sich erklären ließe.';
    case 'hinweis':
      return 'Denk an den Zusammenhang, in dem das Wort im Unterricht vorkam.';
    case 'anderer-satz':
      return aufgabe.beispielsatz
        ? `Ein zweiter Satz im selben Sinn wie: „${aufgabe.beispielsatz}“`
        : 'Zu dieser Vokabel ist kein Beispielsatz freigegeben.';
    case 'warum-richtig':
      return aufgabe.loesung
        ? `„${aufgabe.loesung}“ passt, weil es die Bedeutung in dieser Richtung trifft.`
        : 'Zu dieser Aufgabe ist keine Lösung hinterlegt.';
  }
}
