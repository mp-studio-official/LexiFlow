import type { PackMeta, VocabEntry, VocabPack } from '../domain/schema';

let counter = 0;

export function makeEntry(partial: Partial<VocabEntry> = {}): VocabEntry {
  counter += 1;
  return {
    id: partial.id ?? `entry-${counter}`,
    english: partial.english ?? `word${counter}`,
    germanAnswers: partial.germanAnswers ?? [`Wort${counter}`],
    acceptedEnglishAnswers: partial.acceptedEnglishAnswers ?? [],
    exampleSentences: partial.exampleSentences ?? [],
    topicTags: partial.topicTags ?? [],
    sourceType: partial.sourceType ?? 'import',
    ...(partial.partOfSpeech ? { partOfSpeech: partial.partOfSpeech } : {}),
    /*
      Die strukturierten Anteile der Lernform (Sprint 4B.2/4B.3).

      Sie fehlten hier bis 4B.3 – die Fixture hat sie stillschweigend
      geschluckt. Ein Test, der `grammaticalNumber: 'plural'` übergibt und ein
      Objekt ohne dieses Feld zurückbekommt, prüft anschließend etwas anderes
      als das, was er zu prüfen glaubt; aufgefallen ist es an einer Wortart,
      die „Substantiv“ statt „Substantiv, Plural“ meldete.
    */
    ...(partial.lemma ? { lemma: partial.lemma } : {}),
    ...(partial.complementPattern ? { complementPattern: partial.complementPattern } : {}),
    ...(partial.grammaticalNumber ? { grammaticalNumber: partial.grammaticalNumber } : {}),
    ...(partial.lexicalGroupId ? { lexicalGroupId: partial.lexicalGroupId } : {}),
    ...(partial.notes ? { notes: partial.notes } : {}),
    ...(partial.difficulty ? { difficulty: partial.difficulty } : {}),
  };
}

export function makeMeta(partial: Partial<PackMeta> = {}): PackMeta {
  const now = '2026-03-01T09:00:00.000Z';
  return {
    id: partial.id ?? 'pack-1',
    title: partial.title ?? 'Unit 3 – Sports',
    topic: partial.topic ?? 'Sports',
    grade: partial.grade ?? '7',
    cefrLevel: partial.cefrLevel ?? 'A2+',
    cefrLevelOverridden: partial.cefrLevelOverridden ?? false,
    direction: partial.direction ?? 'en-de',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    ...(partial.description ? { description: partial.description } : {}),
  };
}

/**
 * Paket, in dem jedes optionale Feld belegt ist – Grundlage für den
 * Roundtrip-Test „öffnen und unverändert speichern verliert nichts“.
 */
export function makeRichPack(overrides: Partial<PackMeta> = {}): VocabPack {
  return {
    meta: makeMeta({ direction: 'both', description: 'Vollständig belegtes Paket.', ...overrides }),
    entries: [
      {
        id: 'rich-1',
        english: 'to apologise',
        germanAnswers: ['sich entschuldigen', 'um Verzeihung bitten'],
        acceptedEnglishAnswers: ['to apologize', 'apologise'],
        partOfSpeech: 'verb',
        exampleSentences: [
          { english: 'You should apologise to your neighbour.', german: 'Du solltest dich bei deinem Nachbarn entschuldigen.' },
          { english: 'He apologised again the next day.' },
        ],
        topicTags: ['school', 'manners'],
        notes: 'BE: apologise, AE: apologize',
        difficulty: 4,
        sourceType: 'manual',
      },
      {
        id: 'rich-2',
        english: 'crowded',
        germanAnswers: ['überfüllt', 'voll'],
        acceptedEnglishAnswers: [],
        partOfSpeech: 'adjective',
        exampleSentences: [{ english: 'The bus was crowded this morning.' }],
        topicTags: ['city'],
        difficulty: 2,
        sourceType: 'import',
      },
      {
        id: 'rich-3',
        english: 'litter',
        germanAnswers: ['Müll'],
        acceptedEnglishAnswers: [],
        exampleSentences: [],
        topicTags: [],
        sourceType: 'topic-ai',
      },
    ],
  };
}

/** Kleines Paket mit Beispielsätzen – reicht für Multiple Choice und Lückensätze. */
export function makePack(): VocabPack {
  return {
    meta: makeMeta(),
    entries: [
      makeEntry({
        id: 'e-crowded',
        english: 'crowded',
        germanAnswers: ['überfüllt', 'voll'],
        partOfSpeech: 'adjective',
        exampleSentences: [{ english: 'The bus was crowded this morning.', german: 'Der Bus war heute Morgen überfüllt.' }],
        topicTags: ['city'],
      }),
      makeEntry({
        id: 'e-neighbourhood',
        english: 'neighbourhood',
        germanAnswers: ['Nachbarschaft', 'Viertel'],
        partOfSpeech: 'noun',
        exampleSentences: [{ english: 'They moved to a quiet neighbourhood.' }],
        topicTags: ['city'],
      }),
      makeEntry({
        id: 'e-apologise',
        english: 'to apologise',
        germanAnswers: ['sich entschuldigen'],
        acceptedEnglishAnswers: ['to apologize'],
        partOfSpeech: 'verb',
        exampleSentences: [],
        topicTags: ['school'],
      }),
      makeEntry({
        id: 'e-litter',
        english: 'litter',
        germanAnswers: ['Müll', 'Abfall'],
        partOfSpeech: 'noun',
        exampleSentences: [{ english: 'Please do not drop litter in the park.' }],
        topicTags: ['city'],
      }),
      makeEntry({
        id: 'e-quiet',
        english: 'quiet',
        germanAnswers: ['ruhig', 'leise'],
        partOfSpeech: 'adjective',
        exampleSentences: [{ english: 'The street is very quiet at night.' }],
        topicTags: ['city'],
      }),
    ],
  };
}
