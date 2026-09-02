import { splitAnswers } from '../domain/normalize';
import { collapseWhitespace, sentenceContainsHeadword } from '../domain/wordMatch';
import { newSentence, type DraftRow, type DraftSentence } from './draft';
import type { AiSentenceSuggestion, AlternativeSentenceRequest, SentenceMode } from '../ai/AiProvider';

/**
 * Der Satzassistent – die prüfbare Hälfte.
 *
 * Ein Satzvorschlag ist genau das: ein Vorschlag. Bevor er einer Lehrkraft
 * überhaupt angezeigt wird, muss er ein paar harte Bedingungen erfüllen, denn
 * ein Beispielsatz ohne Stichwort ist als Lückensatz wertlos und ein doppelter
 * Satz ist bloß Rauschen.
 *
 * **Nichts wird still repariert.** Wir kürzen keinen zu langen Satz, wir
 * entfernen keine Auszeichnungen und wir bauen kein Stichwort ein – jede dieser
 * „Reparaturen“ könnte die Bedeutung verändern. Ein Vorschlag, der die Prüfung
 * nicht besteht, wird abgelehnt und darf neu erzeugt werden.
 *
 * Alles hier ist rein: keine Netzaufrufe, kein Zustand, keine Mutation der
 * übergebenen Entwurfszeile.
 */

/** Das Paketformat erlaubt zehn Beispielsätze je Vokabel. */
export const MAX_SENTENCES = 10;

/** Und 400 Zeichen je Satz – dieselbe Grenze wie im Schema. */
export const MAX_SENTENCE_LENGTH = 400;

export type SentenceRejection =
  | 'empty'
  | 'markup'
  | 'too-long'
  | 'missing-headword'
  | 'duplicate';

export type SentenceCheck =
  | { ok: true; english: string; german: string }
  | { ok: false; reason: SentenceRejection; message: string };

export const SENTENCE_MODE_LABELS: Readonly<Record<SentenceMode, string>> = {
  create: 'Beispielsatz vorschlagen',
  simpler: 'Einfacheren Satz vorschlagen',
  'different-context': 'Anderen Kontext vorschlagen',
};

function reject(reason: SentenceRejection, message: string): SentenceCheck {
  return { ok: false, reason, message };
}

/** Vergleichsform für die Dublettenprüfung – Groß-/Kleinschreibung egal. */
function comparable(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

/**
 * Prüft einen Modellvorschlag gegen genau die Zeile, für die er gedacht ist.
 *
 * Die Reihenfolge der Prüfungen bestimmt, welche Meldung die Lehrkraft sieht –
 * sie geht deshalb von der offensichtlichsten zur fachlichsten Ursache.
 */
export function checkSentenceSuggestion(
  suggestion: AiSentenceSuggestion,
  draft: Pick<DraftRow, 'english' | 'sentences'>,
): SentenceCheck {
  const english = collapseWhitespace(suggestion.english ?? '');
  const german = collapseWhitespace(suggestion.german ?? '');
  const headword = collapseWhitespace(draft.english);

  if (english.length === 0) {
    return reject('empty', 'Das Sprachmodell hat keinen Satz geliefert.');
  }

  if (/<[^>]*>/.test(english) || /<[^>]*>/.test(german)) {
    return reject(
      'markup',
      'Der Vorschlag enthielt Auszeichnungen (HTML). Er wird nicht übernommen.',
    );
  }

  if (english.length > MAX_SENTENCE_LENGTH || german.length > MAX_SENTENCE_LENGTH) {
    return reject(
      'too-long',
      `Der Vorschlag war länger als ${MAX_SENTENCE_LENGTH} Zeichen. Gekürzt wird er nicht – das könnte den Sinn verändern.`,
    );
  }

  if (headword.length === 0 || !sentenceContainsHeadword(english, headword)) {
    return reject(
      'missing-headword',
      'Der Vorschlag enthält das Stichwort nicht. Ein Beispielsatz ohne Stichwort taugt nicht als Lückensatz.',
    );
  }

  const known = new Set(draft.sentences.map((sentence) => comparable(sentence.english)));
  if (known.has(comparable(english))) {
    return reject('duplicate', 'Dieser Satz steht schon bei dieser Vokabel.');
  }

  return { ok: true, english, german };
}

/** Ist noch Platz für einen weiteren Satz? */
export function canAddSentence(draft: Pick<DraftRow, 'sentences'>): boolean {
  return draft.sentences.length < MAX_SENTENCES;
}

/**
 * Hängt einen geprüften Satz an. Gibt bei vollem Kontingent die **unveränderte**
 * Zeile zurück, statt still etwas anderes zu tun.
 *
 * `sourceType` bleibt unberührt: Ein ergänzter Satz macht aus einer von Hand
 * getippten Vokabel keine Modellvokabel.
 */
export function addSuggestedSentence(
  draft: DraftRow,
  sentence: { english: string; german?: string },
): DraftRow {
  if (!canAddSentence(draft)) return draft;
  return {
    ...draft,
    sentences: [...draft.sentences, newSentence(sentence.english, sentence.german ?? '')],
  };
}

/** Ersetzt genau einen Satz – nur nach ausdrücklicher Auswahl in der Oberfläche. */
export function replaceSentenceWith(
  draft: DraftRow,
  sentenceId: string,
  sentence: { english: string; german?: string },
): DraftRow {
  if (!draft.sentences.some((item) => item.id === sentenceId)) return draft;
  return {
    ...draft,
    sentences: draft.sentences.map((item): DraftSentence =>
      item.id === sentenceId
        ? { ...item, english: sentence.english, german: sentence.german ?? '' }
        : item,
    ),
  };
}

/** Baut die Anfrage an den Anbieter – aus genau dieser Zeile, sonst nichts. */
export function sentenceRequestFor(draft: DraftRow, mode: SentenceMode): AlternativeSentenceRequest {
  return {
    english: collapseWhitespace(draft.english),
    germanAnswers: splitAnswers(draft.german),
    ...(draft.partOfSpeech ? { partOfSpeech: draft.partOfSpeech } : {}),
    existingSentences: draft.sentences
      .map((sentence) => collapseWhitespace(sentence.english))
      .filter((sentence) => sentence.length > 0),
    mode,
  };
}

/** Welche Modi sind für diese Zeile sinnvoll? Ohne Satz gibt es nichts zu variieren. */
export function availableModes(draft: Pick<DraftRow, 'sentences'>): SentenceMode[] {
  const hasSentence = draft.sentences.some((sentence) => sentence.english.trim().length > 0);
  return hasSentence ? ['simpler', 'different-context'] : ['create'];
}
