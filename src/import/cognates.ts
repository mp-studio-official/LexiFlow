import { normalizeAnswer, splitAnswers } from '../domain/normalize';
import { partOfSpeechOfSource } from './dictionarySuggestions';
import type { DictionaryEntry } from '../dictionary/DictionaryProvider';
import type { PartOfSpeech } from '../domain/schema';

/**
 * Wörter, die im Deutschen genauso heißen wie im Englischen.
 *
 * ## Der Befund, um den es geht
 *
 * Seit Sprint 4B.5 prüft der Entwurf: „Übersetzung stimmt mit dem englischen
 * Stichwort überein." Der Anlass war ein echter Fehler – wer eine Liste in die
 * falsche Spalte einfügt, bekommt sonst ein Paket, in dem jede Karte
 * `erosion → erosion` fragt.
 *
 * Der Befund hält seither das Speichern auf, bis jemand ihn bestätigt. Und
 * genau das ist bei einem Text über Küstenerosion unbrauchbar: `erosion`,
 * `motor`, `Manifest Destiny` – jede zweite Vokabel, jede einzeln zu
 * bestätigen. Wer zwanzigmal „ist schon richtig" geklickt hat, klickt es beim
 * einundzwanzigsten Mal auch dann, wenn es diesmal wirklich ein Fehler war.
 *
 * ## Die Regel
 *
 * Der Befund entfällt **nur mit Beleg**: Das Offline-Wörterbuch muss die
 * identische Übersetzung ausdrücklich führen, und zwar in einer
 * Bedeutungsgruppe, deren Wortart zur Wortart der Vokabel passt.
 *
 * Was die Regel ausdrücklich **nicht** tut:
 *
 * - Sie macht die Prüfung nicht pauschal unverbindlich. Ohne Beleg bleibt
 *   „Bitte prüfen" – und ohne Wörterbuch gibt es nie einen Beleg.
 * - Sie rät nicht. Eine Ähnlichkeitsheuristik („endet auf -ion, klingt
 *   lateinisch") beliefe jeden Übertragungsfehler mit, dessen falsche Antwort
 *   zufällig lateinisch aussieht.
 * - Sie hält nicht ewig. Der Beleg gilt für **einen** Sachverhalt: diese
 *   Lernform, diese Bedeutung, diese Wortart. Ändert sich einer der drei
 *   Werte, ist es ein anderer Fall und der Befund kommt zurück (siehe
 *   `cognateFingerprint`).
 *
 * ## Warum die Wortart mitzählt
 *
 * `to fall` und `der Fall` schreiben sich gleich und haben nichts miteinander
 * zu tun. Ein Wörterbucheintrag zum Substantiv belegt nicht, dass die
 * Übersetzung eines Verbs stimmt. Wo die Wortart der Vokabel unbekannt ist,
 * zählt jede Gruppe – dann ist die Aussage schwächer, aber sie ist immer noch
 * ein Beleg aus der Quelle und keine Vermutung.
 */

/**
 * Die Bedeutungen einer Zeile, die mit der englischen Lernform übereinstimmen.
 *
 * Verglichen wird über `normalizeAnswer`: Groß- und Kleinschreibung,
 * Randzeichen und Mehrfachleerzeichen zählen nicht. `Erosion` und `erosion`
 * sind derselbe Fall – und das ist der häufige.
 *
 * **Nicht** über den toleranteren Schlüssel ohne Artikel: `die Bank` und `bank`
 * sind ein Fall, den man ansehen soll, und „der Beleg gilt" wäre dort eine zu
 * weit reichende Aussage.
 */
export function identicalMeanings(english: string, german: string): string[] {
  const headword = normalizeAnswer(english);
  if (!headword) return [];
  return splitAnswers(german).filter((meaning) => normalizeAnswer(meaning) === headword);
}

/**
 * Belegt das Wörterbuch die identische Übersetzung – ausdrücklich?
 *
 * „Ausdrücklich" heißt: Der Eintrag führt sie als deutsche Entsprechung. Ein
 * Verweis auf ein anderes Stichwort (`via`) zählt hier **nicht** mit: Er ist
 * eine Schlussfolgerung der Anwendung und nicht die Auskunft der Quelle, und
 * ein Beleg, der auf einer Schlussfolgerung beruht, ist keiner.
 *
 * Registermarker und Klammerzusätze stehen dem Beleg dagegen nicht im Weg. Sie
 * verhindern in `safeAutoAnswer`, dass eine Bedeutung **ohne Rückfrage
 * übernommen** wird – eine ganz andere Frage als die hier: Hier ist die
 * Übersetzung bereits da, und gefragt ist nur, ob die Quelle sie kennt.
 */
export function attestsIdenticalMeaning(
  entries: readonly DictionaryEntry[],
  english: string,
  partOfSpeech?: PartOfSpeech | undefined,
): boolean {
  const headword = normalizeAnswer(english);
  if (!headword || entries.length === 0) return false;

  /*
    Die Wortart filtert, wo sie bekannt ist – und wo sie zu nichts führt,
    filtert sie nicht.

    Ein Wörterbuch, das `erosion` nur als Substantiv führt, und eine Vokabel
    ohne gesetzte Wortart: Dass die Filterung dann leer ausginge, wäre kein
    Grund, den vorhandenen Beleg zu verwerfen.
  */
  const matching = partOfSpeech
    ? entries.filter((entry) => partOfSpeechOfSource(entry.partOfSpeech) === partOfSpeech)
    : entries;
  const relevant = matching.length > 0 ? matching : partOfSpeech ? [] : entries;

  return relevant.some((entry) =>
    entry.senses.some(
      (sense) =>
        // Ein Verweis ist eine Schlussfolgerung, kein Beleg.
        !sense.via &&
        sense.suggestions.some((suggestion) => normalizeAnswer(suggestion.german) === headword),
    ),
  );
}

/**
 * Wofür ein Beleg gilt: diese Lernform, diese Wortart.
 *
 * Dieselbe Bauart wie `reviewFingerprint` in `draft.ts`, und aus demselben
 * Grund: Gespeichert wird nicht „belegt: ja", sondern **wofür**. Wer nach dem
 * Beleg die Lernform austauscht, hat einen anderen Fall vor sich.
 *
 * Die Bedeutung selbst steht nicht darin – sie ist per Definition die
 * normalisierte Lernform, sonst gäbe es den Befund gar nicht.
 */
export function cognateFingerprint(
  english: string,
  partOfSpeech: PartOfSpeech | '' | undefined,
): string {
  return `${normalizeAnswer(english)}::${partOfSpeech ?? ''}`;
}
