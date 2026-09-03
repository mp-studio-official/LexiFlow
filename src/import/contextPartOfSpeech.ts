import type { PartOfSpeech } from '../domain/schema';
import { precedingWord } from '../domain/wordForms';
import { guessPartOfSpeech } from '../domain/wordRules';

/**
 * Welche Wortart **an dieser Stelle im Text** gemeint ist.
 *
 * ## Wozu
 *
 * Das Wörterbuch führt `island` als Substantiv **und** als Verb, `known` als
 * Adjektiv **und** als Form von `know`, `track` als beides. Ohne Kontext ist
 * jedes dieser Wörter mehrdeutig, und die automatische Übernahme muss
 * schweigen – auch dort, wo der Satz die Frage längst beantwortet hat.
 * „the island“ ist kein Verb, und dass es eines sein *könnte*, ist kein Grund,
 * „Insel“ zurückzuhalten.
 *
 * Dieses Modul liest deshalb den Satz, aus dem die Vokabel stammt, und sagt –
 * **wenn** der Satz eindeutig ist –, welche Wortart dort steht. Alles Weitere
 * entscheidet `safeAutoAnswer`.
 *
 * ## Der Maßstab: lieber nichts als eine Vermutung
 *
 * Es wird nicht geparst und nicht geraten. Ausgewertet werden genau zwei
 * Nachbarn – das Wort davor und das Wort danach (für die Adjektivregel noch
 * das übernächste). Was sich damit nicht belegen lässt, bleibt offen, und
 * offen heißt: Das Antwortfeld bleibt leer und die Bedeutungen stehen als
 * Chips daneben.
 *
 * Der Fehler, den es zu vermeiden gilt, ist nicht „zu selten erkannt“. Es ist
 * „falsch erkannt“: Eine falsche Wortart wählt die falsche Bedeutungsgruppe,
 * trägt sie ein, und danach sieht sie aus wie eine geprüfte Antwort.
 *
 * ## Die Regeln, in dieser Reihenfolge
 *
 * 1. **Ein `-ly`-Adverb folgt** → Verb. „prices rose *sharply*“.
 * 2. **`to` oder ein Subjektpronomen oder ein Modalverb geht voraus** → Verb.
 *    „*to* track“, „*we* track“, „*they* depend“.
 * 3. **Ein Gradwort oder ein Adverb geht voraus und ein Inhaltswort folgt**
 *    → Adjektiv. „the *best* known example“, „a *widely* known author“.
 * 4. **Das Wort trägt eine Adjektivendung, ein Inhaltswort folgt, und danach
 *    schließt die Wortgruppe** → Adjektiv. „*crowded* streets.“,
 *    „*natural* barriers to survive“.
 * 5. **Ein Artikel, Zahlwort oder Possessiv geht voraus** → Substantiv.
 *    „*the* island“, „*an* island“, „*these* islands“, „*a* track“.
 *
 * Regel 4 steht **vor** Regel 5, sonst würde „the crowded streets“ zum
 * Substantiv – der Artikel gehört dort zu `streets`, nicht zu `crowded`.
 * Regel 4 verlangt den Abschluss der Wortgruppe, damit „Litter covers the
 * street“ nicht als „Litter“ + Substantiv gelesen wird: Nach „covers“ steht
 * „the“, und ein Artikel schließt nichts ab, er fängt an.
 */

/** Gradwörter, die vor einem Adjektiv stehen können. */
const DEGREE_WORDS = new Set([
  'more', 'most', 'less', 'least', 'very', 'so', 'too', 'quite', 'rather',
  'best', 'better', 'well', 'as', 'equally', 'far',
]);

/** `to` und Subjektpronomen – dasselbe Signal wie in `wordForms`. */
const VERB_BEFORE = new Set([
  'to', 'he', 'she', 'it', 'they', 'we', 'i', 'you', 'who', 'nobody', 'everyone',
  'someone', 'somebody', 'everybody',
  // Modalverben: Was danach steht, ist ein Infinitiv.
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
]);

/** Artikel, Zahlwörter und Possessive – dasselbe Signal wie in `wordForms`. */
const NOUN_BEFORE = new Set([
  'the', 'a', 'an', 'this', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
  'our', 'their', 'many', 'much', 'some', 'few', 'several', 'all', 'both',
  'no', 'any', 'each', 'every', 'other', 'more', 'most', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine', 'ten', 'thousand', 'million',
]);

/**
 * Wörter, die **keine** Inhaltswörter sind.
 *
 * Gebraucht an zwei Stellen: Ein Adjektiv braucht ein Inhaltswort hinter sich
 * (ein Adjektiv ohne Bezugswort ist keines), und die Wortgruppe schließt,
 * wenn eines dieser Wörter folgt.
 */
const FUNCTION_WORDS = new Set([
  ...NOUN_BEFORE,
  ...VERB_BEFORE,
  'and', 'or', 'but', 'nor', 'that', 'which', 'because', 'when', 'while',
  'if', 'than', 'as', 'though', 'although', 'whether',
  'in', 'on', 'at', 'of', 'for', 'with', 'from', 'by', 'into', 'onto', 'over',
  'under', 'between', 'among', 'along', 'near', 'during', 'without', 'about',
  'after', 'before', 'against', 'through', 'across', 'behind', 'beyond',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'having', 'do', 'does', 'did', 'not', 'there', 'here', 'then',
]);

/**
 * Endungen, die im Englischen fast nur an Adjektiven stehen.
 *
 * `-ed` und `-ing` sind die Ausnahme davon – sie sind auch Verbformen. Sie
 * stehen trotzdem hier, weil Regel 4 zusätzlich verlangt, dass ein Inhaltswort
 * folgt und die Wortgruppe danach schließt: „crowded streets.“ ist ein
 * Adjektiv, „crowded the room“ nicht, und „the room crowded quickly“ fängt
 * Regel 1 vorher ab.
 */
const ADJECTIVE_SUFFIXES = [
  'ous', 'ful', 'ive', 'able', 'ible', 'ical', 'ic', 'ish', 'less', 'ant',
  'ent', 'al', 'ary', 'ory', 'ed', 'ing',
];

/** Buchstabenwort ohne Funktion – das, worauf sich ein Adjektiv beziehen kann. */
function isContentWord(word: string | undefined): boolean {
  const clean = (word ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+$/u, '');
  if (clean.length === 0) return false;
  if (/^\d/.test(clean)) return false;
  return !FUNCTION_WORDS.has(clean);
}

/**
 * Schließt hier die Wortgruppe?
 *
 * Ja, wenn gar nichts mehr folgt, ein Satzzeichen folgt oder ein Funktionswort
 * folgt, das keine neue Wortgruppe eröffnet. Ein Artikel eröffnet eine – er
 * schließt deshalb ausdrücklich **nicht** ab.
 */
function closesPhrase(word: string | undefined): boolean {
  const clean = (word ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+$/u, '');
  if (clean.length === 0) return true;
  if (NOUN_BEFORE.has(clean)) return false;
  return FUNCTION_WORDS.has(clean);
}

function normalizeNeighbour(word: string | undefined): string {
  return (word ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+$/u, '');
}

/** Die Fundstelle der Form im Satz – als ganzes Wort, ohne Rücksicht auf Groß-/Kleinschreibung. */
function locate(sentence: string, written: string): { index: number; length: number } | undefined {
  const needle = written.trim();
  if (!sentence || !needle) return undefined;
  const match = new RegExp(
    `(?<![\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
    'iu',
  ).exec(sentence);
  return match ? { index: match.index, length: match[0].length } : undefined;
}

/**
 * Die Wortart des konkreten Vorkommens – oder `undefined`, wenn der Satz sie
 * nicht hergibt.
 *
 * `written` ist die Form, wie sie **im Satz** steht (`islands`, nicht
 * `island`): Gesucht wird eine Fundstelle, und die gibt es nur für die
 * geschriebene Form.
 */
export function contextPartOfSpeech(
  sentence: string,
  written: string,
): PartOfSpeech | undefined {
  /*
    Eine Wortgruppe hat keinen einzelnen Nachbarn, an dem sich etwas ablesen
    ließe – und sie ist ohnehin selten mehrdeutig. `depend on` bleibt offen.
  */
  if (/\s/.test(written.trim())) return undefined;

  const at = locate(sentence, written);
  if (!at) return undefined;

  const before = normalizeNeighbour(precedingWord(sentence, at.index));

  /*
    Die beiden nächsten Wörter **und** was zwischen ihnen steht.

    Das Trennzeichen zählt mit: „crowded streets, and …“ schließt nach
    `streets` ab, „crowded streets are …“ auch – aber „covers the street“ eben
    nicht, weil `the` eine neue Wortgruppe eröffnet. Ohne das Komma im Blick
    müsste man raten.
  */
  const tail = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)?([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)?/u
    .exec(sentence.slice(at.index + at.length));
  const after = tail?.[2];
  const gap = tail?.[3] ?? '';
  const afterNext = tail?.[4];

  // Regel 1: Ein `-ly`-Adverb dahinter bezieht sich auf ein Verb.
  if (after && guessPartOfSpeech(after).partOfSpeech === 'adverb') return 'verb';

  // Regel 2: `to`, Subjektpronomen, Modalverb.
  if (VERB_BEFORE.has(before)) return 'verb';

  const contentFollows = isContentWord(after);

  // Regel 3: Gradwort oder Adverb davor, Inhaltswort dahinter.
  if (
    contentFollows &&
    (DEGREE_WORDS.has(before) || guessPartOfSpeech(before).partOfSpeech === 'adverb')
  ) {
    return 'adjective';
  }

  // Regel 4: Adjektivendung, Inhaltswort dahinter, danach schließt die Gruppe.
  const lower = written.trim().toLowerCase();
  const groupEnds = /[^\s]/.test(gap) || closesPhrase(afterNext);
  if (
    contentFollows &&
    groupEnds &&
    ADJECTIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix) && lower.length > suffix.length + 2)
  ) {
    return 'adjective';
  }

  // Regel 5: Artikel, Zahlwort oder Possessiv davor.
  if (NOUN_BEFORE.has(before) || /^\d/.test(before)) return 'noun';

  return undefined;
}
