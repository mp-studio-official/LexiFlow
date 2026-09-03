import { newId } from '../domain/ids';
import { formatAnswers, splitAnswers } from '../domain/normalize';
import { buildLearningForm } from '../domain/learningForm';
import type { GrammaticalNumber, PartOfSpeech } from '../domain/schema';
import { collapseWhitespace } from '../domain/wordMatch';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';

/**
 * Vokabellisten lesen, die schon eine Struktur haben.
 *
 * ## Warum es dieses Modul gibt
 *
 * „Quelle einfügen“ konnte bis Sprint 4B.2 zwei Dinge: eine CSV-Tabelle und
 * `englisch<TAB>deutsch`. Was Lehrkräfte tatsächlich in der Zwischenablage
 * haben, sieht aber so aus:
 *
 * ```
 * • to coin a phrase / term
 * context/example: “…coined the phrase ‘the American Dream’…”
 * translation: einen Begriff, eine Redewendung prägen
 * ```
 *
 * Das ist keine Tabelle und keine Zeile mit Tabulator – und es enthält mehr
 * Information als beides: Wortart, Beispielsatz, Übersetzung, verbundene
 * Formen. Wer das durch den alten Parser schickt, verliert alles außer der
 * ersten Zeile.
 *
 * ## Die Leitplanke
 *
 * **Was nicht sicher zuzuordnen ist, wird sichtbar markiert und nicht
 * geraten.** Jede Zeile, die dieses Modul nicht versteht, landet als
 * `needsReview` in der Vorschau und bekommt dort ein „Bitte prüfen“. Ein
 * stillschweigend falsch zugeordneter Beispielsatz wäre schlimmer als eine
 * sichtbare Lücke: Die Lücke sieht man, den Fehler nicht.
 *
 * Insbesondere erfindet dieses Modul **keine Valenzmuster**. `sb.`, `sth.`
 * und Präpositionen übernimmt es ausschließlich aus dem, was dasteht.
 */

/** Aufzählungszeichen, die einer Vokabel vorangehen dürfen. */
const BULLETS = /^\s*(?:[•·▪◦*–—-]|\d+[.)])\s+/u;

/** Schlüsselwörter, die eine Fortsetzungszeile einleiten. */
const FIELD_KEYS: Readonly<Record<string, 'example' | 'translation' | 'note'>> = {
  'context/example': 'example',
  context: 'example',
  example: 'example',
  beispiel: 'example',
  beispielsatz: 'example',
  translation: 'translation',
  'übersetzung': 'translation',
  uebersetzung: 'translation',
  deutsch: 'translation',
  german: 'translation',
  note: 'note',
  notiz: 'note',
  hinweis: 'note',
};

/** Wortartkürzel, wie sie in Klammern hinter der Vokabel stehen. */
const PART_ABBREVIATIONS: Readonly<Record<string, PartOfSpeech>> = {
  n: 'noun',
  noun: 'noun',
  v: 'verb',
  vb: 'verb',
  verb: 'verb',
  adj: 'adjective',
  adjective: 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  phr: 'phrase',
  phrase: 'phrase',
  prep: 'preposition',
};

const NUMBER_ABBREVIATIONS: Readonly<Record<string, GrammaticalNumber>> = {
  pl: 'plural',
  plural: 'plural',
  sg: 'singular',
  sing: 'singular',
  singular: 'singular',
};

/** Was in einer Klammer hinter der Vokabel stehen kann. */
interface Marker {
  parts: PartOfSpeech[];
  grammaticalNumber?: GrammaticalNumber;
  /** Teile der Klammer, die weder Wortart noch Zahl waren. */
  unknown: string[];
}

function readMarker(inside: string): Marker {
  const parts: PartOfSpeech[] = [];
  const unknown: string[] = [];
  let grammaticalNumber: GrammaticalNumber | undefined;

  for (const raw of inside.split(/[/,]/)) {
    const token = raw.trim().replace(/\.$/, '').toLowerCase();
    if (!token) continue;
    const part = PART_ABBREVIATIONS[token];
    if (part) {
      parts.push(part);
      continue;
    }
    const number = NUMBER_ABBREVIATIONS[token];
    if (number) {
      grammaticalNumber = number;
      continue;
    }
    unknown.push(raw.trim());
  }

  return { parts, ...(grammaticalNumber ? { grammaticalNumber } : {}), unknown };
}

/** Eine Vokabel, so wie sie aus der Liste gelesen wurde. */
export interface StructuredEntry {
  /** Die Lernform. */
  english: string;
  lemma?: string;
  partOfSpeech?: PartOfSpeech;
  grammaticalNumber?: GrammaticalNumber;
  complementPattern?: string;
  german: string[];
  example?: { english: string; german?: string };
  note?: string;
  /** Verbundene Formen teilen sich diesen Schlüssel. */
  groupKey?: string;
  /** Was nicht sicher zugeordnet werden konnte – erscheint als „Bitte prüfen“. */
  needsReview?: string;
}

export interface StructuredParseResult {
  entries: StructuredEntry[];
  /** Zeilen, die zu keiner Vokabel gehörten. Sie gehen nicht verloren. */
  unassigned: string[];
}

/**
 * Sieht dieser Text nach einer strukturierten Liste aus?
 *
 * Gefragt wird nach **Merkmalen**, nicht nach Schönheit: Aufzählungszeichen,
 * `translation:`-Zeilen, Wortartkürzel. Findet sich keines davon, ist der
 * alte Weg (Tabulator, CSV) der richtige, und dieses Modul hält sich heraus.
 */
export function looksStructured(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;

  const bulleted = lines.filter((line) => BULLETS.test(line)).length;
  const keyed = lines.filter((line) => fieldKeyOf(line) !== undefined).length;
  const marked = lines.filter((line) => /\((?:[a-zA-Zä]{1,10}\.?[/,]?){1,3}\)/.test(line)).length;

  return bulleted >= 2 || keyed >= 1 || marked >= 2;
}

/** `translation: …` → `'translation'`; sonst `undefined`. */
function fieldKeyOf(line: string): 'example' | 'translation' | 'note' | undefined {
  const match = /^\s*([A-Za-zÄÖÜäöü/ ]{3,20}):\s*(.*)$/.exec(line);
  const key = match?.[1]?.trim().toLowerCase();
  return key ? FIELD_KEYS[key] : undefined;
}

function fieldValueOf(line: string): string {
  const match = /^\s*[A-Za-zÄÖÜäöü/ ]{3,20}:\s*(.*)$/.exec(line);
  return collapseWhitespace(match?.[1] ?? '');
}

/** Anführungszeichen und Auslassungspunkte um ein Zitat herum abräumen. */
function unquote(value: string): string {
  return collapseWhitespace(
    value
      .replace(/^[“”„"'‘’«»\s.…]+/u, '')
      .replace(/[“”„"'‘’«»\s]+$/u, '')
      .replace(/\s*…\s*$/u, ''),
  );
}

/** Trägt jede Seite eines `/` ihre **eigene** Wortartklammer? */
function splitsIntoLinkedForms(headline: string): string[] | undefined {
  const parts = headline.split(/\s+\/\s+/);
  if (parts.length < 2) return undefined;
  const everyPartMarked = parts.every((part) => /\([^)]*\)\s*$/.test(part.trim()));
  return everyPartMarked ? parts.map((part) => part.trim()) : undefined;
}

/**
 * Liest eine Kopfzeile: Lernform, Wortart, Zahl, Ergänzungsmuster.
 *
 * Der Schrägstrich ist hier die interessante Stelle. Er kann dreierlei heißen:
 *
 * - **verbundene Formen:** `attainability (n.) / attainable (adj.)` – zwei
 *   Vokabeln, die zusammen angezeigt werden dürfen. Erkennbar daran, dass
 *   **jede** Seite ihre eigene Wortartklammer trägt.
 * - **Teil der Vokabel:** `to coin a phrase / term`, `sb./sth.` – eine
 *   Vokabel, der Schrägstrich gehört dazu.
 * - **zwei Wortarten für dasselbe Wort:** `endeavor (n./v.)` – zwei Vokabeln,
 *   die sich die Schreibung teilen.
 *
 * Nur der erste und der dritte Fall werden getrennt. Alles andere bleibt eine
 * Vokabel, weil eine falsch getrennte Wendung eine erfundene Vokabel wäre.
 */
function readHeadline(rawLine: string): StructuredEntry[] {
  const line = collapseWhitespace(rawLine.replace(BULLETS, ''));
  if (!line) return [];

  const linked = splitsIntoLinkedForms(line);
  if (linked) {
    const groupKey = newId();
    return linked.flatMap((part) => readHeadline(part).map((entry) => ({ ...entry, groupKey })));
  }

  const markerMatch = /\(([^)]*)\)\s*$/.exec(line);
  const withoutMarker = collapseWhitespace(line.slice(0, markerMatch?.index ?? line.length));
  const marker = markerMatch?.[1] ? readMarker(markerMatch[1]) : undefined;

  const base = withoutMarker || line;
  const review = marker?.unknown.length
    ? `Der Zusatz „${marker.unknown.join(', ')}“ wurde nicht erkannt.`
    : undefined;

  // `endeavor (n./v.)` – zwei Wortarten, zwei Lernformen, eine Gruppe.
  if (marker && marker.parts.length > 1) {
    const groupKey = newId();
    return marker.parts.map((part) => ({
      ...buildEntry(base, part, marker.grammaticalNumber),
      groupKey,
      ...(review ? { needsReview: review } : {}),
    }));
  }

  return [
    {
      ...buildEntry(
        base,
        marker?.parts[0],
        marker?.grammaticalNumber,
        // Das Kürzel stand geschrieben da – dann bleibt es stehen.
        marker?.parts[0] !== undefined,
      ),
      ...(review ? { needsReview: review } : {}),
    },
  ];
}

/** Trennt eine belegte Ergänzung vom Lemma – ohne je eine zu erfinden. */
function splitComplement(base: string): { lemma: string; complementPattern?: string } {
  const words = base.split(' ');
  const index = words.findIndex((word) => /^(sb\.|sth\.|so\.|sw\.|sb\.\/sth\.|sth\.\/sb\.)$/i.test(word));
  if (index <= 0) return { lemma: base };

  /*
    Eine Präposition unmittelbar vor dem Platzhalter gehört zum Muster:
    `accuse sb. of sth.` → Lemma `accuse`, Muster `sb. of sth.`
  */
  return {
    lemma: words.slice(0, index).join(' '),
    complementPattern: words.slice(index).join(' '),
  };
}

/** Sieht das nach einem Eigennamen aus? Dann kein `to`, keine Kleinschreibung. */
function looksLikeProperNoun(value: string): boolean {
  const words = value.split(' ').filter(Boolean);
  return words.length >= 1 && words.every((word) => /^[A-ZÄÖÜ]/.test(word));
}

function buildEntry(
  base: string,
  partOfSpeech: PartOfSpeech | undefined,
  grammaticalNumber: GrammaticalNumber | undefined,
  /**
   * Stand das Wortartkürzel **geschrieben** in der Quelle?
   *
   * Dann bleibt es stehen. Wer `attainable (adj.)` eintippt oder aus seinem
   * Vokabelheft einfügt, hat die Form so gemeint; sie in `attainable` plus
   * ein Feld „Adjektiv“ zu zerlegen verliert zwar keine Information, ändert
   * aber die Vokabel, die auf der Karte steht – und zwar stillschweigend.
   *
   * Umgekehrt wird nie eines **hinzugefügt**: Aus `erosion` mit erkannter
   * Wortart wird nicht `erosion (n.)`.
   */
  markPartOfSpeech = false,
): StructuredEntry {
  const startsWithTo = /^to\s+\S/i.test(base);
  const proper = looksLikeProperNoun(base);

  /*
    Die Wortart kommt aus der Klammer – oder aus einem `to` am Anfang, das
    nichts anderes sein kann als ein Infinitiv. Sonst bleibt sie leer: Aus
    „enduring“ auf „Adjektiv“ zu schließen wäre geraten (es ist genauso gut
    ein Partizip).
  */
  const part: PartOfSpeech | undefined =
    partOfSpeech ?? (startsWithTo ? 'verb' : proper ? 'noun' : undefined);

  const withoutTo = startsWithTo ? base.slice(3).trim() : base;
  const { lemma, complementPattern } = splitComplement(withoutTo);

  const english =
    part === 'verb'
      ? buildLearningForm({
          lemma,
          partOfSpeech: 'verb',
          ...(complementPattern ? { complementPattern } : {}),
          ...(grammaticalNumber ? { grammaticalNumber } : {}),
        })
      : buildLearningForm({
          lemma: withoutTo,
          ...(part ? { partOfSpeech: part } : {}),
          ...(grammaticalNumber ? { grammaticalNumber } : {}),
          ...(markPartOfSpeech ? { markPartOfSpeech: true } : {}),
        });

  return {
    english,
    lemma,
    ...(part ? { partOfSpeech: part } : {}),
    ...(grammaticalNumber ? { grammaticalNumber } : {}),
    ...(complementPattern ? { complementPattern } : {}),
    german: [],
  };
}

/**
 * Zerlegt einen eingefügten Text in Vokabeln.
 *
 * Ein Block endet an einer Leerzeile oder an der nächsten Kopfzeile. Als
 * Kopfzeile gilt, was **kein** `schlüssel:`-Feld ist – so bleibt ein
 * `translation:` immer bei der Vokabel darüber.
 */
export function parseStructuredList(text: string): StructuredParseResult {
  const entries: StructuredEntry[] = [];
  const unassigned: string[] = [];
  let current: StructuredEntry[] = [];
  /** Die Rohzeile des laufenden Blocks – für den Fall, dass er verworfen wird. */
  let currentLine = '';
  /** Trug die Kopfzeile ein Aufzählungszeichen oder eine Wortartklammer? */
  let currentMarked = false;

  /**
   * Schließt den laufenden Block ab – oder verwirft ihn.
   *
   * Eine Kopfzeile **ohne** Aufzählungszeichen, **ohne** Wortartklammer und
   * **ohne** ein einziges Feld darunter ist in einer gegliederten Liste fast
   * immer keine Vokabel, sondern Kopfzeile, Seitenzahl oder Kolumnentitel –
   * „Unit 7 – Vokabelanhang“, „Seite 143“. Sie als Vokabel mit leerer
   * Übersetzung anzulegen hieße, der Lehrkraft den Müll wieder aufzuhalsen,
   * den die Vorschau ihr gerade abgenommen hat.
   *
   * Verworfen heißt hier **nicht** verschwunden: Die Zeile geht nach
   * `unassigned` und steht danach sichtbar in der Prüfansicht. Vielleicht war
   * es ja doch eine Vokabel.
   */
  const flush = (): void => {
    const leer = current.every(
      (entry) => entry.german.length === 0 && !entry.example && !entry.note,
    );
    if (current.length > 0 && !currentMarked && leer && currentLine) unassigned.push(currentLine);
    else entries.push(...current);
    current = [];
    currentLine = '';
    currentMarked = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    const key = fieldKeyOf(line);
    if (key && current.length > 0) {
      const value = fieldValueOf(line);
      if (!value) continue;
      for (const entry of current) {
        if (key === 'translation') entry.german = splitAnswers(value);
        else if (key === 'example') entry.example = { english: unquote(value) };
        else entry.note = value;
      }
      continue;
    }

    if (key && current.length === 0) {
      // Ein Feld ohne Vokabel darüber: nicht raten, sondern zeigen.
      unassigned.push(line);
      continue;
    }

    /*
      Eine Zeile mit Tabulator ist die alte, weiterhin gültige Schreibweise:
      `englisch<TAB>deutsch`. Sie beendet den laufenden Block.
    */
    const tabbed = line.split('\t').map((part) => part.trim());
    if (tabbed.length >= 2 && tabbed[0] && tabbed[1]) {
      flush();
      const [head] = readHeadline(tabbed[0]);
      if (head) {
        entries.push({ ...head, german: splitAnswers(tabbed[1]) });
      }
      continue;
    }

    flush();
    current = readHeadline(line);
    currentLine = line;
    currentMarked = BULLETS.test(line) || /\([^)]*\)\s*$/.test(line);
    if (current.length === 0) {
      unassigned.push(line);
      currentLine = '';
    }
  }

  flush();
  return { entries, unassigned };
}

/**
 * Aus gelesenen Vokabeln werden Entwurfszeilen.
 *
 * Was ohne Übersetzung dasteht, ist kein Fehler – die Lehrkraft trägt sie im
 * nächsten Schritt ein. Was der Parser **nicht verstanden** hat, bekommt hier
 * seinen sichtbaren Hinweis.
 */
export function structuredToDrafts(result: StructuredParseResult): DraftRow[] {
  const drafts = result.entries.map<DraftRow>((entry) => ({
    ...emptyDraft(),
    english: entry.english,
    german: formatAnswers(entry.german),
    lemma: entry.lemma ?? '',
    complementPattern: entry.complementPattern ?? '',
    grammaticalNumber: entry.grammaticalNumber ?? '',
    lexicalGroupId: entry.groupKey ?? '',
    partOfSpeech: entry.partOfSpeech ?? '',
    sentences: entry.example ? [newSentence(entry.example.english, entry.example.german ?? '')] : [],
    notes: entry.note ?? '',
    sourceType: 'import',
  }));

  /*
    Erst prüfen, dann die Parserhinweise dazu. Andersherum ginge nicht:
    `validateDrafts` baut die Hinweisliste neu auf, und ein „Bitte prüfen“ aus
    dem Einlesen wäre still verschwunden – genau der Fehler, den dieses Modul
    vermeiden soll.
  */
  return validateDrafts(drafts).map((draft, index) => {
    const review = result.entries[index]?.needsReview;
    return review
      ? { ...draft, issues: [...draft.issues, { level: 'warning', field: 'english', message: review }] }
      : draft;
  });
}
