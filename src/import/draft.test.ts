import { describe, expect, it } from 'vitest';
import { detectColumns } from './columnDetect';
import {
  addSentence,
  blocksSaving,
  buildDrafts,
  confirmReview,
  deselectDuplicates,
  draftsToEntries,
  emptyDraft,
  hasBlockingError,
  needsReview,
  reviewFingerprint,
  reviewIssues,
  moveSentence,
  newSentence,
  parseDifficulty,
  parsePartOfSpeech,
  removeSentence,
  summarize,
  updateSentence,
  validateDrafts,
} from './draft';

const ROWS = [
  ['Englisch', 'Deutsch', 'Wortart', 'Beispielsatz'],
  ['crowded', 'überfüllt; voll', 'adj', 'The bus was crowded.'],
  ['litter', 'Müll', 'n', 'Do not drop litter here.'],
  ['crowded', 'voll', 'adj', ''],
  ['', 'ohne Stichwort', '', ''],
];

function drafts() {
  return buildDrafts(ROWS, detectColumns(ROWS), { splitMultipleMeanings: true });
}

describe('buildDrafts', () => {
  it('überspringt die Kopfzeile', () => {
    expect(drafts()).toHaveLength(4);
  });

  it('übernimmt Wortarten in normalisierter Form', () => {
    expect(drafts()[0]?.partOfSpeech).toBe('adjective');
    expect(drafts()[1]?.partOfSpeech).toBe('noun');
  });

  it('trennt Mehrfachbedeutungen auf Wunsch', () => {
    expect(drafts()[0]?.german).toBe('überfüllt; voll');
  });

  it('legt den Beispielsatz als ersten Satz an', () => {
    expect(drafts()[0]?.sentences).toHaveLength(1);
    expect(drafts()[0]?.sentences[0]?.english).toBe('The bus was crowded.');
    expect(drafts()[2]?.sentences).toHaveLength(0);
  });

  it('markiert importierte Zeilen als Import', () => {
    expect(drafts()[0]?.sourceType).toBe('import');
  });
});

describe('Beispielsätze bearbeiten', () => {
  const base = {
    ...emptyDraft(),
    english: 'crowded',
    german: 'voll',
    sentences: [newSentence('One.'), newSentence('Two.'), newSentence('Three.')],
  };

  it('fügt einen leeren Satz hinzu', () => {
    expect(addSentence(base).sentences).toHaveLength(4);
  });

  it('ändert einen einzelnen Satz', () => {
    const id = base.sentences[1]!.id;
    const updated = updateSentence(base, id, { german: 'Zwei.' });
    expect(updated.sentences[1]?.german).toBe('Zwei.');
    expect(updated.sentences[0]?.german).toBe('');
  });

  it('entfernt einen Satz', () => {
    const updated = removeSentence(base, base.sentences[0]!.id);
    expect(updated.sentences.map((sentence) => sentence.english)).toEqual(['Two.', 'Three.']);
  });

  it('verschiebt einen Satz nach oben und unten', () => {
    const id = base.sentences[2]!.id;
    expect(moveSentence(base, id, -1).sentences.map((s) => s.english)).toEqual([
      'One.',
      'Three.',
      'Two.',
    ]);
    expect(moveSentence(base, base.sentences[0]!.id, 1).sentences.map((s) => s.english)).toEqual([
      'Two.',
      'One.',
      'Three.',
    ]);
  });

  it('ignoriert Verschiebungen über die Ränder hinaus', () => {
    expect(moveSentence(base, base.sentences[0]!.id, -1)).toBe(base);
    expect(moveSentence(base, base.sentences[2]!.id, 1)).toBe(base);
  });
});

describe('validateDrafts', () => {
  it('markiert fehlendes Stichwort als Fehler', () => {
    const row = drafts()[3];
    expect(row && hasBlockingError(row)).toBe(true);
  });

  it('markiert Duplikate als Hinweis', () => {
    const rows = drafts();
    expect(rows[2]?.duplicateOf).toBe(rows[0]?.id);
    expect(rows[2] && hasBlockingError(rows[2])).toBe(false);
  });

  it('warnt, wenn kein Beispielsatz das Stichwort enthält', () => {
    const [row] = validateDrafts([
      {
        ...emptyDraft(),
        english: 'crowded',
        german: 'voll',
        sentences: [newSentence('The bus was full.')],
      },
    ]);
    expect(row?.issues.some((issue) => issue.field === 'example')).toBe(true);
  });

  it('warnt nicht, wenn wenigstens ein Satz das Stichwort enthält', () => {
    const [row] = validateDrafts([
      {
        ...emptyDraft(),
        english: 'crowded',
        german: 'voll',
        sentences: [newSentence('The bus was full.'), newSentence('It was crowded.')],
      },
    ]);
    expect(row?.issues.some((issue) => issue.field === 'example')).toBe(false);
  });

  it('meldet eine deutsche Satzentsprechung ohne englischen Satz als Fehler', () => {
    const [row] = validateDrafts([
      {
        ...emptyDraft(),
        english: 'crowded',
        german: 'voll',
        sentences: [newSentence('', 'Der Bus war voll.')],
      },
    ]);
    expect(row && hasBlockingError(row)).toBe(true);
  });

  it('warnt vor überflüssigen Alternativantworten', () => {
    const [row] = validateDrafts([
      { ...emptyDraft(), english: 'crowded', german: 'voll', acceptedEnglish: 'Crowded' },
    ]);
    expect(row?.issues.some((issue) => issue.field === 'accepted')).toBe(true);
  });

  it('entfernt eine Duplikatmarkierung nach Korrektur wieder', () => {
    const initial = drafts();
    const fixed = validateDrafts(
      initial.map((draft, index) => (index === 2 ? { ...draft, english: 'quiet' } : draft)),
    );
    expect(fixed[2]?.duplicateOf).toBeUndefined();
  });
});

describe('summarize', () => {
  it('zählt Auswahl, Fehler und Duplikate', () => {
    const summary = summarize(drafts());
    expect(summary.total).toBe(4);
    expect(summary.errors).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(summary.selected).toBe(3);
  });
});

describe('deselectDuplicates', () => {
  it('nimmt Duplikate aus der Auswahl', () => {
    const result = deselectDuplicates(drafts());
    expect(result[2]?.include).toBe(false);
    expect(result[0]?.include).toBe(true);
  });
});

describe('draftsToEntries', () => {
  it('erzeugt gültige Einträge mit mehreren Übersetzungen', () => {
    const entries = draftsToEntries(drafts(), 'import');
    expect(entries).toHaveLength(3);
    expect(entries[0]?.germanAnswers).toEqual(['überfüllt', 'voll']);
    expect(entries[0]?.exampleSentences[0]?.english).toBe('The bus was crowded.');
    expect(entries[0]?.sourceType).toBe('import');
  });

  it('übernimmt Alternativantworten, Schwierigkeit und mehrere Sätze', () => {
    const [entry] = draftsToEntries(
      [
        {
          ...emptyDraft(),
          english: 'to apologise',
          german: 'sich entschuldigen',
          acceptedEnglish: 'to apologize; apologise',
          difficulty: 4,
          sentences: [
            newSentence('You should apologise.', 'Du solltest dich entschuldigen.'),
            newSentence('He apologised again.'),
          ],
        },
      ],
      'manual',
    );
    expect(entry?.acceptedEnglishAnswers).toEqual(['to apologize', 'apologise']);
    expect(entry?.difficulty).toBe(4);
    expect(entry?.exampleSentences).toEqual([
      { english: 'You should apologise.', german: 'Du solltest dich entschuldigen.' },
      { english: 'He apologised again.' },
    ]);
  });

  it('lässt fehlerhafte und abgewählte Zeilen aus', () => {
    const selection = drafts().map((draft, index) =>
      index === 1 ? { ...draft, include: false } : draft,
    );
    expect(draftsToEntries(selection, 'import')).toHaveLength(2);
  });

  it('ergänzt zusätzliche Themen-Tags ohne Dubletten', () => {
    const entries = draftsToEntries(drafts(), 'import', ['Unit 3']);
    expect(entries[0]?.topicTags).toContain('Unit 3');
  });
});

describe('parsePartOfSpeech', () => {
  it('kennt deutsche und englische Kürzel', () => {
    expect(parsePartOfSpeech('Substantiv')).toBe('noun');
    expect(parsePartOfSpeech('v.')).toBe('verb');
    expect(parsePartOfSpeech('unbekannt')).toBe('');
  });
});

describe('parseDifficulty', () => {
  it('akzeptiert nur 1 bis 5', () => {
    expect(parseDifficulty(3)).toBe(3);
    expect(parseDifficulty('5')).toBe(5);
    expect(parseDifficulty(0)).toBe('');
    expect(parseDifficulty(6)).toBe('');
    expect(parseDifficulty(undefined)).toBe('');
  });
});

/**
 * Sprint 4B.5: „Bitte prüfen“ nur dort, wo es etwas zu entscheiden gibt.
 *
 * Bis 4B.4 bekam jede Zeile mit irgendeiner Warnung diesen Status. Bei zwanzig
 * Empfehlungen waren das zwölf, von denen elf nichts zu entscheiden hatten –
 * und die zwölfte ging darin unter. Die Trennung hier ist deshalb keine
 * Feinheit, sie ist der ganze Zweck.
 */
describe('Offene fachliche Befunde', () => {
  function zeile(partial: Partial<ReturnType<typeof emptyDraft>>) {
    const [row] = validateDrafts([{ ...emptyDraft(), include: true, ...partial }]);
    if (!row) throw new Error('keine Zeile');
    return row;
  }

  it('erklärt eine offene Frage zur Lernform zum Befund', () => {
    const row = zeile({
      english: 'depend',
      german: 'abhängen',
      formNeedsReview: true,
      formReviewReason: 'Im Text steht „depend on“. Gehört das „on“ zur Vokabel?',
    });
    expect(reviewIssues(row)).toHaveLength(1);
    expect(needsReview(row)).toBe(true);
  });

  it('erklärt einen fehlenden Beispielsatzbezug nicht zum Befund', () => {
    /*
      „Kein Beispielsatz enthält das Stichwort“ ist eine Auskunft, keine Frage.
      Es gibt nichts zu bestätigen – man ändert den Satz oder man lässt es.
    */
    const row = zeile({
      english: 'island',
      german: 'die Insel',
      sentences: [{ id: 's1', english: 'The bay is quiet.', german: '' }],
    });
    expect(row.issues.length).toBeGreaterThan(0);
    expect(reviewIssues(row)).toHaveLength(0);
    expect(needsReview(row)).toBe(false);
  });

  it('hält eine Zeile ohne jeden Befund für in Ordnung', () => {
    const row = zeile({ english: 'island', german: 'die Insel' });
    expect(needsReview(row)).toBe(false);
    expect(blocksSaving(row)).toBe(false);
  });
});

describe('Bestätigen – und wann die Bestätigung verfällt', () => {
  function offen() {
    const [row] = validateDrafts([
      {
        ...emptyDraft(),
        include: true,
        english: 'depend',
        german: 'abhängen',
        formNeedsReview: true,
        formReviewReason: 'Gehört das „on“ zur Vokabel?',
      },
    ]);
    if (!row) throw new Error('keine Zeile');
    return row;
  }

  it('nimmt die Zeile nach der Bestätigung aus dem Weg', () => {
    const [bestaetigt] = validateDrafts([confirmReview(offen())]);
    expect(bestaetigt && needsReview(bestaetigt)).toBe(false);
    expect(bestaetigt && blocksSaving(bestaetigt)).toBe(false);
    // Der Befund bleibt sichtbar – bestätigt heißt nicht verschwunden.
    expect(bestaetigt && reviewIssues(bestaetigt)).toHaveLength(1);
  });

  it('verfällt, wenn sich die englische Lernform ändert', () => {
    const bestaetigt = confirmReview(offen());
    const [geaendert] = validateDrafts([{ ...bestaetigt, english: 'depend on' }]);
    expect(geaendert && needsReview(geaendert)).toBe(true);
    expect(geaendert?.reviewConfirmedFor).toBeUndefined();
  });

  it('verfällt, wenn sich die Übersetzung ändert', () => {
    const bestaetigt = confirmReview(offen());
    const [geaendert] = validateDrafts([{ ...bestaetigt, german: 'angewiesen sein auf' }]);
    expect(geaendert && needsReview(geaendert)).toBe(true);
  });

  it('verfällt, wenn sich die Wortart ändert', () => {
    const bestaetigt = confirmReview(offen());
    const [geaendert] = validateDrafts([{ ...bestaetigt, partOfSpeech: 'verb' }]);
    expect(geaendert && needsReview(geaendert)).toBe(true);
  });

  it('überlebt eine Änderung, die den Befund nicht berührt', () => {
    /*
      Eine Notiz, ein Themen-Tag, ein zusätzlicher Beispielsatz: Sie ändern
      nichts an der Frage, die beantwortet wurde. Eine Bestätigung, die daran
      zerbricht, wäre eine Schikane.
    */
    const bestaetigt = confirmReview(offen());
    const [geaendert] = validateDrafts([{ ...bestaetigt, notes: 'Für die Klassenarbeit' }]);
    expect(geaendert && needsReview(geaendert)).toBe(false);
  });

  it('lässt sich von zusätzlichem Leerraum nicht täuschen', () => {
    const bestaetigt = confirmReview(offen());
    const [geaendert] = validateDrafts([{ ...bestaetigt, german: ' abhängen ' }]);
    expect(geaendert && needsReview(geaendert)).toBe(false);
  });

  it('unterscheidet den Fingerabdruck nach allen drei Feldern', () => {
    const row = offen();
    expect(reviewFingerprint(row)).not.toBe(reviewFingerprint({ ...row, english: 'x' }));
    expect(reviewFingerprint(row)).not.toBe(reviewFingerprint({ ...row, german: 'x' }));
    expect(reviewFingerprint(row)).not.toBe(reviewFingerprint({ ...row, partOfSpeech: 'verb' }));
  });
});

describe('Der Prüfstatus bleibt im Entwurf', () => {
  it('steht in keinem Eintrag des Pakets', () => {
    /*
      Marcs Vorgabe: „Der Prüfstatus ist reine Erstellungsinformation und darf
      nicht unnötig Bestandteil des exportierten Lernpakets werden.“

      Geprüft wird über die Schlüssel des Eintrags, nicht über einen bekannten
      Namen: So fällt auch auf, wenn das Feld später einmal anders heißt.
    */
    const [row] = validateDrafts([
      {
        ...emptyDraft(),
        include: true,
        english: 'depend',
        german: 'abhängen',
        formNeedsReview: true,
        formReviewReason: 'Gehört das „on“ zur Vokabel?',
      },
    ]);
    if (!row) throw new Error('keine Zeile');

    const [entry] = draftsToEntries([confirmReview(row)], 'import');
    expect(entry).toBeDefined();
    const serialisiert = JSON.stringify(entry);
    expect(serialisiert).not.toContain('reviewConfirmedFor');
    expect(serialisiert).not.toContain('formNeedsReview');
    expect(serialisiert).not.toContain('issues');
  });
});
