import {
  GRAMMATICAL_NUMBER_LABELS,
  PART_OF_SPEECH_LABELS,
  type GrammaticalNumber,
  type PartOfSpeech,
  type VocabEntry,
} from './schema';
import { collapseWhitespace } from './wordMatch';

/**
 * Wie eine englische Vokabel **lernbar** aussieht.
 *
 * ## Warum das mehr als ein String ist
 *
 * Ein Vokabelheft schreibt nicht `accuse`, sondern `to accuse sb. of sth.` –
 * weil die Rektion zur Vokabel gehört. Wer nur `accuse` lernt, weiß hinterher
 * nicht, ob es `accuse sb. for sth.` heißt.
 *
 * Bis Sprint 4B.2 hätte man das als dekorativen String speichern können. Das
 * geht schief, sobald jemand danach sucht, eine Dublette erkennen oder das
 * Wort nachschlagen will: `to accuse sb. of sth.` steht in keinem Wörterbuch.
 * Deshalb liegen die Teile getrennt:
 *
 * | Feld | Beispiel | Wozu |
 * | --- | --- | --- |
 * | `english` | `to accuse sb. of sth.` | die Lernform – Karte, Abfrage, Paket |
 * | `lemma` | `accuse` | Nachschlagen, Suche, Dublettenprüfung |
 * | `partOfSpeech` | `verb` | Anzeige, Gruppierung, Wortartprüfung |
 * | `complementPattern` | `sb. of sth.` | die belegte Rektion |
 * | `grammaticalNumber` | `plural` | `restraints (pl.)` |
 * | `acceptedEnglishAnswers` | `accuse` | was beim Abfragen zählt |
 *
 * ## Die Grenze, die dieses Modul zieht
 *
 * Es **baut** Lernformen aus Teilen und **liest** sie wieder auseinander. Es
 * erfindet nichts. `sb.`, `sth.` und Präpositionen kommen ausschließlich aus
 * einem übergebenen Muster – aus Quelle, Wörterbuch oder eindeutigem Kontext.
 * Es gibt hier bewusst keine Tabelle „welches Verb hat welche Rektion“: Die
 * wäre nach zwanzig Einträgen unvollständig und nach fünfzig falsch.
 */

/** Die Platzhalter, die in Lernformen vorkommen dürfen. */
export const VALENCY_PLACEHOLDERS = ['sb.', 'sth.', 'so.', 'sw.'] as const;

/** Marker für die grammatische Zahl, so wie sie in der Lernform steht. */
const NUMBER_MARKERS: Readonly<Record<GrammaticalNumber, string>> = {
  singular: '(sg.)',
  plural: '(pl.)',
};

/** Die Wortarten, die als Infinitiv gelernt werden – nur sie bekommen `to`. */
const INFINITIVE_PARTS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['verb']);

export interface LearningFormParts {
  /** Das kanonische Lemma, ohne `to` und ohne Ergänzungen. */
  lemma: string;
  partOfSpeech?: PartOfSpeech | undefined;
  /** Nur setzen, wenn belegt. */
  complementPattern?: string | undefined;
  grammaticalNumber?: GrammaticalNumber | undefined;
  /**
   * `false` unterdrückt das `to` – für ein Verb, das **nicht** als Infinitiv
   * gelernt wird (eine Partizipialform etwa, oder eine feste Wendung, die
   * schon mit einem anderen Wort beginnt).
   */
  infinitive?: boolean | undefined;
  /**
   * Das Wortartkürzel mitschreiben: `attainable (adj.)`, `attainability (n.)`.
   *
   * Bei Verben ist das `to` schon die Markierung, deshalb steht dort nie ein
   * `(v.)`. Und wo eine Zahl markiert ist, gewinnt sie: `restraints (pl.)`,
   * nicht `restraints (n., pl.)` – zwei Klammern hintereinander liest niemand,
   * und der Plural sagt das Substantiv ohnehin mit.
   */
  markPartOfSpeech?: boolean | undefined;
}

/** Steht am Anfang bereits ein `to`? Dann kommt kein zweites davor. */
function startsWithTo(value: string): boolean {
  return /^to\s+\S/i.test(value.trim());
}

/**
 * Baut die anzuzeigende Lernform aus ihren Teilen.
 *
 * - Verben bekommen `to`, sofern sie als Infinitiv gelernt werden und noch
 *   keines tragen. Ein Phrasal Verb bleibt vollständig: aus `single out` wird
 *   `to single out`, nicht `to single`.
 * - Das Ergänzungsmuster wird angehängt, **wenn** eines übergeben wurde.
 * - Die grammatische Zahl erscheint als `(pl.)` bzw. `(sg.)` am Ende.
 */
export function buildLearningForm(parts: LearningFormParts): string {
  const lemma = collapseWhitespace(parts.lemma);
  if (!lemma) return '';

  const isVerb = parts.partOfSpeech !== undefined && INFINITIVE_PARTS.has(parts.partOfSpeech);
  const wantsTo = isVerb && parts.infinitive !== false && !startsWithTo(lemma);
  const head = wantsTo ? `to ${lemma}` : lemma;

  const complement = collapseWhitespace(parts.complementPattern ?? '');
  const withComplement = complement ? `${head} ${complement}` : head;

  const marker = parts.grammaticalNumber
    ? NUMBER_MARKERS[parts.grammaticalNumber]
    : parts.markPartOfSpeech && parts.partOfSpeech && !isVerb
      ? shortPartLabel(parts.partOfSpeech)
        ? `(${shortPartLabel(parts.partOfSpeech)})`
        : ''
      : '';
  return marker ? `${withComplement} ${marker}` : withComplement;
}

/**
 * Das kanonische Lemma zu einer Lernform – ohne `to`, ohne Ergänzungen, ohne
 * Zahlmarker und ohne Wortartkürzel.
 *
 * Bewusst konservativ: Entfernt werden nur Dinge, die diese Datei selbst
 * anhängt, sowie die bekannten Platzhalter. Ein Wort mitten in der Wendung
 * bleibt stehen – `to coin a phrase` ergibt `coin a phrase`, nicht `coin`,
 * weil niemand hier entscheiden kann, wo die Vokabel aufhört.
 */
export function lemmaFromLearningForm(form: string): string {
  let text = collapseWhitespace(form);
  if (!text) return '';

  // Klammerzusätze am Ende: (pl.), (sg.), (n.), (v.), (adj.) …
  text = collapseWhitespace(text.replace(/\((?:[^()]{0,12})\)\s*$/g, ' '));

  // Führendes „to “ – aber nur, wenn danach noch etwas steht.
  if (startsWithTo(text)) text = text.slice(3).trim();

  // Bekannte Platzhalter und die Präpositionen, die sie einleiten.
  const words = text.split(' ');
  const cut = words.findIndex((word) =>
    (VALENCY_PLACEHOLDERS as readonly string[]).includes(word.toLowerCase()),
  );
  if (cut > 0) {
    // Eine Präposition unmittelbar davor gehört zum Muster, nicht zum Lemma.
    text = words.slice(0, cut).join(' ');
  }

  return collapseWhitespace(text);
}

/** Das gespeicherte Lemma – oder, falls keines da ist, das abgeleitete. */
export function lemmaOf(entry: Pick<VocabEntry, 'english' | 'lemma'>): string {
  const stored = collapseWhitespace(entry.lemma ?? '');
  return stored || lemmaFromLearningForm(entry.english);
}

/**
 * Alle Platzhalter, ausgeschrieben und abgekürzt, als Erkennungsmuster.
 *
 * `sb./sth.` ist **ein** Token, kein Schrägstrich zwischen zwei Wörtern – wer
 * hier nur `sb.` und `sth.` einzeln sucht, findet die häufigste Form gar
 * nicht. Genau daran ist die erste Fassung gescheitert.
 */
const PLACEHOLDER_WORDS = [
  'sb.',
  'sth.',
  'so.',
  'sw.',
  'somebody',
  'something',
  'someone',
];

/** Ist dieses Wort ein Platzhalter – auch als Schrägstrich-Kombination? */
function isPlaceholder(word: string): boolean {
  const bare = word.toLowerCase().replace(/[,;:]+$/, '');
  if (!bare) return false;
  // `sb./sth.`, `somebody/something`, `sb.` – jeder Teil muss Platzhalter sein.
  return bare
    .split('/')
    .filter((part) => part.length > 0)
    .every((part) => PLACEHOLDER_WORDS.includes(part));
}

/** `sb.` ⇄ `somebody`, `sth.` ⇄ `something` – dieselbe Vokabel, andere Schule. */
const SPELLED_OUT: Readonly<Record<string, string>> = {
  'sb.': 'somebody',
  'sth.': 'something',
  'so.': 'someone',
};

function spellOut(word: string): string {
  return word
    .split('/')
    .map((part) => SPELLED_OUT[part.toLowerCase()] ?? part)
    .join('/');
}

/** Höchstzahl erzeugter Varianten – gegen kombinatorisches Wuchern. */
const MAX_VARIANTS = 32;

/**
 * Schrägstrich-Alternativen ausschreiben: `a phrase / term` → zwei Fassungen.
 *
 * Der Schrägstrich verbindet Wortformen, er trennt keine Antworten (siehe
 * `splitAnswers`). Für die Prüfung heißt das aber: Beide Lesarten sind
 * richtig. Wer `to coin a phrase` schreibt, hat `to coin a phrase / term`
 * gekonnt.
 *
 * Erweitert wird **nur**, was schon dasteht – das ist Lesen, kein Erfinden.
 */
function expandSlashes(words: readonly string[]): string[][] {
  let variants: string[][] = [[]];

  for (const word of words) {
    /*
      Die ungeteilte Fassung bleibt **die erste Wahl**, nicht bloß eine unter
      mehreren. `sb./sth.` ist die geschriebene Form; würde sie beim Aufteilen
      verlorengehen, wäre ausgerechnet die Lernform selbst keine gültige
      Antwort mehr.
    */
    const parts = word.includes('/')
      ? [word, ...word.split('/').filter(Boolean)]
      : [word];

    const next: string[][] = [];
    for (const variant of variants) {
      for (const part of parts) {
        if (next.length >= MAX_VARIANTS) break;
        next.push([...variant, part]);
      }
    }
    variants = next.length > 0 ? next : variants;
  }

  return variants;
}

/**
 * `a phrase / term` → `a phrase/term`.
 *
 * Mit Leerzeichen geschrieben wäre der Schrägstrich ein eigenes Wort, und die
 * Alternativen stünden links und rechts davon statt in **einem** Token. Das
 * Zusammenziehen macht daraus den Normalfall, den `expandSlashes` kennt – und
 * ändert an der Bedeutung nichts, weil ein Schrägstrich Wortformen verbindet.
 */
function tightenSlashes(value: string): string {
  return value.replace(/\s*\/\s*/g, '/');
}

/**
 * Antworten, die neben der Lernform selbst gelten sollen.
 *
 * ## Was wegfallen darf – und was nicht
 *
 * Wer `to depend on sb./sth.` lernt, hat die Vokabel gekonnt, wenn er
 * `to depend on` schreibt: `sb./sth.` ist eine Schreibkonvention des
 * Vokabelhefts, keine Vokabel. Wer dagegen nur `depend` schreibt, hat sie
 * **nicht** gekonnt – das `on` gehört zum Wort, und wer es nicht mitlernt,
 * schreibt später `depend of`. Genau diese Grenze zieht diese Funktion:
 *
 * | Weglassbar | Nicht weglassbar |
 * | --- | --- |
 * | führendes `to` | Partikel (`out` in `to single out`) |
 * | Klammerzusätze `(pl.)`, `(n.)`, `(adj.)` | Präpositionen (`on`, `of`) |
 * | Platzhalter `sb.`, `sth.`, `sb./sth.` | feste Bestandteile (`a phrase`) |
 *
 * Zusätzlich gelten die ausgeschriebenen Platzhalter (`somebody/something`)
 * und beide Seiten einer Schrägstrich-Alternative.
 *
 * ## Warum das Lemma hier **nicht** vorkommt
 *
 * Bis 4B.3 stand hier `forms.add(lemmaOf(entry))`. Das Lemma zu
 * `to depend on sb./sth.` ist `depend` – und damit war `depend` eine
 * akzeptierte Antwort. Die Prüfung hat also genau den Fehler durchgewunken,
 * dessentwegen die Lernform überhaupt vollständig ist.
 *
 * Das Lemma bleibt, wofür es da ist: Suche, Dublettenerkennung, Wortfamilien
 * (siehe `studyView.ts`). Für die Antwortprüfung ist es zu kurz.
 */
export function impliedAnswers(entry: Pick<VocabEntry, 'english'>): string[] {
  const form = collapseWhitespace(entry.english);
  if (!form) return [];

  // Klammerzusätze am Ende: (pl.), (sg.), (n.), (v.), (adj.) …
  const withoutMarkers = collapseWhitespace(form.replace(/\((?:[^()]{0,12})\)\s*$/g, ' '));

  const forms = new Set<string>();

  for (const base of new Set([form, withoutMarkers].filter(Boolean))) {
    const words = tightenSlashes(base).split(' ');
    const hasTo = /^to$/i.test(words[0] ?? '');

    for (const variant of expandSlashes(words)) {
      // Vier Achsen, alle unabhängig: mit/ohne `to`, mit/ohne Platzhalter,
      // abgekürzt/ausgeschrieben. Das ist übersichtlicher als eine Kaskade
      // von Sonderfällen – und deckt `to depend on somebody/something`
      // genauso ab wie `depend on`.
      for (const dropTo of hasTo ? [false, true] : [false]) {
        for (const dropPlaceholders of [false, true]) {
          for (const spelled of [false, true]) {
            const parts: string[] = [];
            for (const [index, word] of variant.entries()) {
              if (dropTo && index === 0 && /^to$/i.test(word)) continue;
              if (isPlaceholder(word)) {
                if (dropPlaceholders) continue;
                parts.push(spelled ? spellOut(word) : word);
                continue;
              }
              parts.push(word);
            }
            const candidate = collapseWhitespace(parts.join(' '));
            // Eine Variante, die nur noch aus `to` besteht, ist keine.
            if (candidate && !/^to$/i.test(candidate)) forms.add(candidate);
          }
        }
      }
    }
  }

  forms.delete(form);
  return [...forms].slice(0, MAX_VARIANTS);
}

/**
 * Eine kurze, lesbare Kennzeichnung: `(n.)`, `(v.)`, `(adj.)`, `(pl.)`.
 *
 * Sie steht in Listen neben der Lernform, damit bei verbundenen Formen auf
 * einen Blick klar ist, welche gemeint ist.
 */
const SHORT_PART_LABELS: Readonly<Record<PartOfSpeech, string>> = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  phrase: 'phr.',
  preposition: 'präp.',
  other: '',
};

export function shortPartLabel(partOfSpeech: PartOfSpeech | undefined): string {
  return partOfSpeech ? SHORT_PART_LABELS[partOfSpeech] : '';
}

/** Die ausgeschriebene Beschriftung – für Screenreader und Auswahlfelder. */
export function longPartLabel(
  partOfSpeech: PartOfSpeech | undefined,
  grammaticalNumber?: GrammaticalNumber,
): string {
  const part = partOfSpeech ? PART_OF_SPEECH_LABELS[partOfSpeech] : '';
  const number = grammaticalNumber ? GRAMMATICAL_NUMBER_LABELS[grammaticalNumber] : '';
  return [part, number].filter(Boolean).join(', ');
}

/**
 * Gruppiert Einträge nach `lexicalGroupId`.
 *
 * Einträge ohne Gruppe stehen jeweils für sich – sie bekommen **keine**
 * erfundene gemeinsame Gruppe, auch wenn sie zufällig dasselbe Lemma teilen.
 * Ob zwei Formen zusammengehören, entscheidet die Lehrkraft beim Erstellen,
 * nicht eine Ähnlichkeitsrechnung beim Anzeigen.
 */
export function groupRelatedForms<T extends Pick<VocabEntry, 'id' | 'lexicalGroupId'>>(
  entries: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  const result: T[][] = [];

  for (const entry of entries) {
    const key = collapseWhitespace(entry.lexicalGroupId ?? '');
    if (!key) {
      result.push([entry]);
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
      continue;
    }
    const created = [entry];
    groups.set(key, created);
    result.push(created);
  }

  return result;
}
