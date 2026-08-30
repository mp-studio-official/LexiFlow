import { describe, expect, it } from 'vitest';
import {
  AnalysisAbortedError,
  MAX_TEXT_LENGTH,
  TextTooLongError,
  analyzeText,
  extractTextCandidates,
  normalizeToken,
  segmentSentences,
  segmentSentencesFallback,
  segmentWords,
  segmentWordsFallback,
  sortCandidates,
} from './textExtraction';

const TEXT = [
  'The neighbourhood is crowded today.',
  'Litter is a problem in the neighbourhood.',
  "The children don't drop litter here.",
  'A well-known artist painted the wall in 2024.',
  'Visit https://example.com/info or write to info@example.com for details.',
].join(' ');

function byWord(text: string, word: string) {
  return extractTextCandidates(text).find((candidate) => candidate.normalizedEnglish === word);
}

describe('Satzsegmentierung', () => {
  it('trennt an Satzzeichen', () => {
    const sentences = segmentSentences('The bus was crowded. It is quiet now! Really?');
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'The bus was crowded.',
      'It is quiet now!',
      'Really?',
    ]);
  });

  it('liefert Offsets, die auf den Quelltext zeigen', () => {
    const text = 'One sentence. Two sentences.';
    const [first, second] = segmentSentences(text);
    expect(text.slice(first?.start ?? 0)).toMatch(/^One sentence\./);
    expect(text.slice(second?.start ?? 0)).toBe('Two sentences.');
  });

  it('lässt leere Abschnitte aus', () => {
    expect(segmentSentences('   \n\n  ')).toEqual([]);
  });
});

describe('Fallback-Satzsegmentierung', () => {
  it('trennt ohne Intl.Segmenter genauso', () => {
    expect(
      segmentSentencesFallback('The bus was crowded. It is quiet now!').map((s) => s.text),
    ).toEqual(['The bus was crowded.', 'It is quiet now!']);
  });

  it('trennt nicht nach gängigen Abkürzungen', () => {
    const sentences = segmentSentencesFallback('Mr. Smith likes it. He left.');
    expect(sentences.map((s) => s.text)).toEqual(['Mr. Smith likes it.', 'He left.']);
  });

  it('behält mehrfache Endzeichen und schließende Anführungszeichen beim Satz', () => {
    const text = '"Really?!" she asked. Then she left.';
    const sentences = segmentSentencesFallback(text);
    expect(sentences[0]?.text).toBe('"Really?!"');
    expect(sentences.at(-1)?.text).toBe('Then she left.');
  });

  it('trennt genauso wie Intl.Segmenter', () => {
    for (const text of [
      'The bus was crowded. It is quiet now! Really?',
      '"Really?!" she asked. Then she left.',
      'Litter is a problem. The children pick it up.',
    ]) {
      expect(segmentSentencesFallback(text).map((s) => s.text)).toEqual(
        segmentSentences(text).map((s) => s.text),
      );
    }
  });

  it('gibt einen Text ohne Satzzeichen als einen Satz zurück', () => {
    expect(segmentSentencesFallback('no punctuation here').map((s) => s.text)).toEqual([
      'no punctuation here',
    ]);
  });
});

describe('Wortsegmentierung', () => {
  it('hält Apostrophwörter zusammen', () => {
    expect(segmentWords("The children don't mind.").map((t) => t.text)).toContain("don't");
  });

  it('hält den sächsischen Genitiv zusammen', () => {
    expect(segmentWords("the neighbourhood's problem").map((t) => t.text)).toContain(
      "neighbourhood's",
    );
  });

  it('hält Bindestrichwörter zusammen', () => {
    expect(segmentWords('a well-known artist').map((t) => t.text)).toContain('well-known');
  });

  it('lässt reine Zahlen aus', () => {
    expect(segmentWords('painted in 2024').map((t) => t.text)).toEqual(['painted', 'in']);
  });

  it('liefert Offsets im Satz', () => {
    const sentence = 'the crowded bus';
    const token = segmentWords(sentence).find((t) => t.text === 'crowded');
    expect(sentence.slice(token?.offset ?? 0, (token?.offset ?? 0) + 7)).toBe('crowded');
  });
});

describe('Fallback-Wortsegmentierung', () => {
  it('verhält sich wie die Segmenter-Variante', () => {
    const sentence = "A well-known artist doesn't paint 12 walls.";
    expect(segmentWordsFallback(sentence).map((t) => t.text)).toEqual([
      'A',
      'well-known',
      'artist',
      "doesn't",
      'paint',
      'walls',
    ]);
  });
});

describe('normalizeToken', () => {
  it('vereinheitlicht Apostrophe und Groß-/Kleinschreibung', () => {
    expect(normalizeToken('Don’t')).toBe("don't");
    expect(normalizeToken('Well‑known')).toBe('well-known');
  });
});

describe('extractTextCandidates', () => {
  it('führt Dubletten case-insensitiv zusammen und zählt alle Vorkommen', () => {
    const litter = byWord(TEXT, 'litter');
    expect(litter?.occurrences).toBe(2);
    const neighbourhood = byWord(TEXT, 'neighbourhood');
    expect(neighbourhood?.occurrences).toBe(2);
  });

  it('erhält die Schreibweise aus dem Text und bevorzugt eine Fundstelle im Satz', () => {
    // „Litter“ steht am Satzanfang, „litter“ mitten im Satz.
    expect(byWord(TEXT, 'litter')?.english).toBe('litter');
  });

  it('ordnet jedem Kandidaten den Originalsatz zu', () => {
    const crowded = byWord(TEXT, 'crowded');
    expect(crowded?.sourceSentence).toBe('The neighbourhood is crowded today.');
    expect(TEXT).toContain(crowded?.sourceSentence ?? '#');
    expect(crowded?.sentenceIndex).toBe(0);
  });

  it('blendet Stoppwörter standardmäßig aus', () => {
    expect(byWord(TEXT, 'the')).toBeUndefined();
    expect(byWord(TEXT, 'is')).toBeUndefined();
    expect(byWord(TEXT, "don't")).toBeUndefined();
  });

  it('kann Stoppwörter auf Wunsch einblenden', () => {
    const withStopwords = extractTextCandidates(TEXT, { includeStopwords: true });
    expect(withStopwords.some((c) => c.normalizedEnglish === 'the')).toBe(true);
  });

  it('lässt Zahlen, URLs und E-Mail-Adressen aus', () => {
    for (const token of ['2024', 'https', 'example', 'com', 'info']) {
      expect(byWord(TEXT, token)).toBeUndefined();
    }
  });

  it('behält Bindestrichwörter als einen Kandidaten', () => {
    expect(byWord(TEXT, 'well-known')?.english).toBe('well-known');
  });

  it('blendet wahrscheinliche Eigennamen aus und auf Wunsch wieder ein', () => {
    const text = 'We visited Berlin last summer. Berlin was crowded.';
    expect(extractTextCandidates(text).some((c) => c.normalizedEnglish === 'berlin')).toBe(false);

    const withNames = extractTextCandidates(text, { includeProperNouns: true });
    const berlin = withNames.find((c) => c.normalizedEnglish === 'berlin');
    expect(berlin?.isLikelyProperNoun).toBe(true);
    expect(berlin?.english).toBe('Berlin');
  });

  it('hält ein nur am Satzanfang großgeschriebenes Wort nicht für einen Eigennamen', () => {
    const candidate = byWord('Crowded streets everywhere.', 'crowded');
    expect(candidate?.isLikelyProperNoun).toBe(false);
  });

  it('erfindet weder Übersetzung noch Wortart', () => {
    const candidate = byWord(TEXT, 'crowded');
    expect(Object.keys(candidate ?? {}).sort()).toEqual([
      'english',
      'firstOccurrence',
      'id',
      'isLikelyProperNoun',
      'normalizedEnglish',
      'occurrences',
      'sentenceIndex',
      'sourceSentence',
    ]);
  });

  it('respektiert die Mindestlänge', () => {
    const candidates = extractTextCandidates('Go to a big zoo.', {
      includeStopwords: true,
      minLength: 3,
    });
    expect(candidates.every((c) => c.normalizedEnglish.length >= 3)).toBe(true);
  });

  it('liefert bei leerem Text nichts', () => {
    expect(extractTextCandidates('')).toEqual([]);
  });
});

describe('Sortierung', () => {
  const text = 'Alpha beta beta gamma gamma gamma.';

  it('folgt standardmäßig der Reihenfolge im Text', () => {
    const order = extractTextCandidates(text).map((c) => c.normalizedEnglish);
    expect(order).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('kann nach Häufigkeit sortieren', () => {
    const order = extractTextCandidates(text, { sort: 'frequency' }).map(
      (c) => c.normalizedEnglish,
    );
    expect(order).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('ist deterministisch', () => {
    const first = extractTextCandidates(TEXT, { sort: 'frequency' });
    const second = extractTextCandidates(TEXT, { sort: 'frequency' });
    expect(first).toEqual(second);
  });

  it('sortiert eine vorhandene Liste ohne erneute Analyse', () => {
    const candidates = extractTextCandidates(text);
    expect(sortCandidates(candidates, 'frequency').map((c) => c.normalizedEnglish)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
  });
});

describe('Grenzen und Abbruch', () => {
  it('erlaubt genau 20.000 Zeichen', () => {
    const text = `${'word '.repeat(3999)}end.`.padEnd(MAX_TEXT_LENGTH, '!');
    expect(text).toHaveLength(MAX_TEXT_LENGTH);
    expect(() => extractTextCandidates(text)).not.toThrow();
  });

  it('lehnt längere Texte verständlich ab, statt still zu kürzen', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    expect(() => extractTextCandidates(text)).toThrow(TextTooLongError);
    try {
      extractTextCandidates(text);
    } catch (error: unknown) {
      expect((error as Error).message).toContain('20.000');
    }
  });

  it('bricht über ein AbortSignal ab', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => extractTextCandidates(TEXT, { signal: controller.signal })).toThrow(
      AnalysisAbortedError,
    );
  });
});

describe('analyzeText', () => {
  it('liefert Kandidaten samt erklärender Zahlen', () => {
    const analysis = analyzeText(TEXT);
    expect(analysis.candidates.length).toBeGreaterThan(0);
    expect(analysis.sentenceCount).toBeGreaterThanOrEqual(4);
    expect(analysis.hiddenStopwords).toBeGreaterThan(0);
  });

  it('zählt ausgeblendete Eigennamen getrennt', () => {
    const analysis = analyzeText('We visited Berlin. Berlin was crowded.');
    expect(analysis.hiddenProperNouns).toBe(1);
  });
});
