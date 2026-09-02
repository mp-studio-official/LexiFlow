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

  const marker = parts.grammaticalNumber ? NUMBER_MARKERS[parts.grammaticalNumber] : '';
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
 * Antworten, die neben der Lernform selbst gelten sollen.
 *
 * Wer `to accuse sb. of sth.` lernt, hat die Vokabel auch dann gekonnt, wenn
 * er `to accuse` schreibt – die Platzhalter sind eine Schreibkonvention des
 * Vokabelhefts, keine Vokabel. Erzeugt werden ausschließlich **Verkürzungen**
 * der vorhandenen Form; nichts wird hinzuerfunden.
 */
export function impliedAnswers(entry: Pick<VocabEntry, 'english' | 'lemma'>): string[] {
  const form = collapseWhitespace(entry.english);
  const forms = new Set<string>();

  const withoutMarkers = collapseWhitespace(form.replace(/\((?:[^()]{0,12})\)\s*$/g, ' '));
  if (withoutMarkers && withoutMarkers !== form) forms.add(withoutMarkers);

  const lemma = lemmaOf(entry);
  if (lemma && lemma !== form) {
    forms.add(lemma);
    if (/^to\s/i.test(form)) forms.add(`to ${lemma}`);
  }

  forms.delete(form);
  return [...forms];
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
