import { ENGLISH_STOPWORDS } from './stopwords';

/**
 * Mehrwortbegriffe aus einem englischen Text – **konservativ** gewonnen.
 *
 * Der Anlass ist ein Fachtext: In „psychological casualties of attritional
 * combat“ steckt nicht Vokabel *psychological* und Vokabel *casualties*,
 * sondern ein Begriff. Wer ihn zerlegt, gibt der Lerngruppe zwei Wörter, aus
 * denen sich die Bedeutung nicht zusammensetzen lässt, und verliert genau das,
 * wofür der Text ausgewählt wurde.
 *
 * Bigramme sind allerdings ein Minenfeld: In jedem Satz stehen Wörter
 * nebeneinander, ohne einen Begriff zu bilden. Die Regeln sind deshalb streng,
 * und jede hat einen Grund:
 *
 * 1. **Beide Teile sind Inhaltswörter.** Kein Funktionswort, keine Zahl,
 *    mindestens vier Buchstaben – „of the“ und „was a“ sind keine Vokabeln.
 * 2. **Nur innerhalb eines Satzes und ohne Satzzeichen dazwischen.** Über einen
 *    Punkt oder ein Komma hinweg ist Nachbarschaft ein Zufall des Layouts.
 * 3. **Mindestens zweimal im Text.** Das ist die eigentliche Hürde. Ein Begriff,
 *    um den es einem Text geht, kommt wieder; eine zufällige Nachbarschaft
 *    nicht. Diese Regel wirft mehr weg, als sie behält – und das ist die
 *    Absicht: Ein übersehener Begriff kostet die Lehrkraft einen Handgriff,
 *    ein erfundener kostet Vertrauen.
 * 4. **Kein Bigramm über einem anderen.** Aus drei Wörtern in Folge entstehen
 *    zwei überlappende Paare; genommen wird nur das häufigere.
 * 5. **Kein Wort mit sich selbst.** „gamma gamma“ ist eine Wiederholung, kein
 *    Begriff – und in einer Aufzählung („red, red apples“) sogar häufig.
 *
 * Von Regel 3 gibt es **eine** Ausnahme: ein *schweres* Paar. `manpower
 * shortages` und `tacit admission` sind auch beim ersten Vorkommen erkennbar
 * Fachbegriffe – zwei lange, gewichtige Wörter nebeneinander, von denen keines
 * Alltagswortschatz ist. `young soldier` ist es nicht, `cold winter` auch
 * nicht. Die Schwelle steht unten und ist bewusst hoch: Sie soll das offen
 * Fachliche durchlassen und sonst nichts.
 *
 * Rein und deterministisch: Text hinein, Begriffe heraus. Kein Modell, keine
 * Wortliste, kein Netz.
 */

/** Wie oft ein Paar vorkommen muss, um als Begriff zu gelten. */
export const MIN_COLLOCATION_OCCURRENCES = 2;

/** Wie lang jeder Teil mindestens sein muss. */
export const MIN_PART_LENGTH = 4;

/**
 * Wann ein Paar schon beim ersten Vorkommen als Begriff gilt.
 *
 * Beide Teile müssen mindestens `HEAVY_PART_LENGTH` Zeichen haben und zusammen
 * mindestens `HEAVY_TOTAL_LENGTH`. Länge ist ein grobes Maß und hier das
 * einzige, das ohne Wortartenerkennung zur Verfügung steht – aber es trennt
 * `manpower shortages` (17) verlässlich von `young soldier` (12).
 */
export const HEAVY_PART_LENGTH = 5;
export const HEAVY_TOTAL_LENGTH = 14;

/**
 * Alltagswörter, die ein Paar auch dann nicht schwer machen, wenn sie lang sind.
 *
 * Kurz gehalten wie überall in diesem Projekt: Es geht nur darum, `winter
 * morning` und `letters home` nicht als Fachbegriff auszugeben.
 */
const EVERYDAY_PARTS = new Set([
  'young', 'small', 'large', 'great', 'little', 'every', 'other', 'first',
  'second', 'third', 'later', 'early', 'today', 'night', 'morning', 'evening',
  'winter', 'summer', 'spring', 'autumn', 'letter', 'letters', 'mother',
  'father', 'friend', 'house', 'water', 'people', 'children', 'school',
  'street', 'quiet', 'wooden', 'weeks', 'month', 'years',
]);

/** Ist dieses Paar auch als Einzelfund ein Begriff? */
export function isHeavyPair(left: string, right: string): boolean {
  if (left.length < HEAVY_PART_LENGTH || right.length < HEAVY_PART_LENGTH) return false;
  if (left.length + right.length < HEAVY_TOTAL_LENGTH) return false;
  return !EVERYDAY_PARTS.has(left) && !EVERYDAY_PARTS.has(right);
}

export interface CollocationSource {
  /** Der Satz, exakt aus dem Quelltext. */
  text: string;
  /** Zeichenoffset des ersten Zeichens im Quelltext. */
  start: number;
  index: number;
}

export interface Collocation {
  /** Kleingeschrieben und normalisiert – der Vergleichsschlüssel. */
  normalized: string;
  /** Anzeigeform der ersten Fundstelle, Schreibung wie im Text. */
  display: string;
  occurrences: number;
  firstOccurrence: number;
  sentenceIndex: number;
  sourceSentence: string;
}

interface Part {
  raw: string;
  normalized: string;
  offset: number;
}

/**
 * Zerlegt einen Satz in Läufe benachbarter Inhaltswörter.
 *
 * Ein Lauf endet an jedem Satzzeichen und an jedem Funktionswort. Was übrig
 * bleibt, sind Ketten wie `attritional combat` oder `standardized regulations`
 * – und aus denen entstehen die Paare.
 */
export function contentRuns(sentence: string): Part[][] {
  const runs: Part[][] = [];
  let current: Part[] = [];

  // Alles außer Buchstaben, Bindestrich und Apostroph trennt.
  const pattern = /[\p{L}][\p{L}'’-]*|[^\p{L}\s]+|\s+/gu;
  for (const match of sentence.matchAll(pattern)) {
    const raw = match[0];
    const offset = match.index;

    if (/^\s+$/.test(raw)) continue;
    if (!/^\p{L}/u.test(raw)) {
      // Satzzeichen: Der Lauf endet hier.
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }

    const normalized = raw
      .normalize('NFC')
      .replace(/[’ʼ]/g, "'")
      .toLowerCase();

    const usable =
      normalized.length >= MIN_PART_LENGTH &&
      !ENGLISH_STOPWORDS.has(normalized) &&
      !/\d/.test(normalized);

    if (!usable) {
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    current.push({ raw, normalized, offset });
  }
  if (current.length > 1) runs.push(current);
  return runs;
}

interface PairAccumulator extends Collocation {
  /** Alle Fundstellen – gebraucht, um Überlappungen aufzulösen. */
  positions: number[];
  /** Wurde das Paar je mitten im Satz gesehen? Dann stimmt seine Schreibweise. */
  seenMidSentence: boolean;
}

/**
 * Ein Paar, das nur am Satzanfang stand, in Kleinschreibung zurückholen.
 *
 * `Archival research` beginnt im Text zweimal einen Satz und ist trotzdem kein
 * Eigenname. Wer es so ins Paket übernimmt, lernt eine Vokabel mit falscher
 * Schreibung. Angefasst wird nur der erste Buchstabe des ersten Teils – und
 * auch der nur, wenn der Rest klein ist: `DNA sequencing` bleibt, wie es ist.
 */
export function normalizeSentenceStart(display: string): string {
  const [first = '', ...rest] = display.split(' ');
  const tail = first.slice(1);
  if (!first || tail !== tail.toLowerCase()) return display;
  return [first.charAt(0).toLowerCase() + tail, ...rest].join(' ');
}

/**
 * Sammelt Mehrwortbegriffe über alle Sätze eines Textes.
 *
 * Zurückgegeben wird nur, was die Häufigkeitshürde nimmt und nicht von einem
 * häufigeren, überlappenden Paar verdrängt wird.
 */
export function findCollocations(sentences: readonly CollocationSource[]): Collocation[] {
  const pairs = new Map<string, PairAccumulator>();

  for (const sentence of sentences) {
    for (const run of contentRuns(sentence.text)) {
      for (let index = 0; index + 1 < run.length; index += 1) {
        const left = run[index]!;
        const right = run[index + 1]!;
        // Regel 5: Ein Wort mit sich selbst ist eine Wiederholung.
        if (left.normalized === right.normalized) continue;
        const normalized = `${left.normalized} ${right.normalized}`;
        const existing = pairs.get(normalized);
        const at = sentence.start + left.offset;

        const midSentence = left.offset > 0;

        if (existing) {
          existing.occurrences += 1;
          existing.positions.push(at);
          // Eine Fundstelle mitten im Satz zeigt die echte Schreibweise.
          if (midSentence && !existing.seenMidSentence) {
            existing.display = `${left.raw} ${right.raw}`;
            existing.seenMidSentence = true;
          }
          continue;
        }
        pairs.set(normalized, {
          normalized,
          display: `${left.raw} ${right.raw}`,
          occurrences: 1,
          firstOccurrence: at,
          sentenceIndex: sentence.index,
          sourceSentence: sentence.text,
          positions: [at],
          seenMidSentence: midSentence,
        });
      }
    }
  }

  const frequent = [...pairs.values()].filter((pair) => {
    if (pair.occurrences >= MIN_COLLOCATION_OCCURRENCES) return true;
    // Regel 3, Ausnahme: ein schweres Paar zählt auch einmal.
    const [left = '', right = ''] = pair.normalized.split(' ');
    return isHeavyPair(left, right);
  });

  /*
    Überlappungen auflösen. „standardized regulations“ und „regulations
    governing“ teilen sich ein Wort; beide anzubieten hieße, dasselbe Stück
    Text zweimal zu verkaufen. Es gewinnt das häufigere Paar, bei Gleichstand
    das frühere – deterministisch, nicht zufällig.
  */
  const ordered = [...frequent].sort(
    (left, right) => right.occurrences - left.occurrences || left.firstOccurrence - right.firstOccurrence,
  );
  const takenWords = new Set<string>();
  const chosen: Collocation[] = [];

  for (const pair of ordered) {
    const [first, second] = pair.normalized.split(' ');
    if (!first || !second) continue;
    if (takenWords.has(first) || takenWords.has(second)) continue;
    takenWords.add(first);
    takenWords.add(second);
    const { positions: _positions, seenMidSentence, ...collocation } = pair;
    chosen.push(
      seenMidSentence
        ? collocation
        : { ...collocation, display: normalizeSentenceStart(collocation.display) },
    );
  }

  return chosen.sort((left, right) => left.firstOccurrence - right.firstOccurrence);
}
