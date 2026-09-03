import { describe, expect, it } from 'vitest';

import {
  confirmReview,
  emptyDraft,
  validateDrafts,
  type DraftRow,
} from './draft';
import { describeBlockers, saveBlockers } from './saveBlockers';

/**
 * Was das Speichern aufhält – und in welcher Reihenfolge.
 *
 * Die Reihenfolge ist der Gegenstand dieser Tests, nicht ein Nebeneffekt. Wer
 * einen blockierten Speicherversuch abarbeitet, läuft die Liste von oben nach
 * unten durch; eine Liste, die sich beim Beheben umsortiert, fühlt sich an wie
 * ein Fehler in der Software.
 */

function row(partial: Partial<DraftRow>): DraftRow {
  return { ...emptyDraft(), include: true, ...partial };
}

function drafts(...rows: DraftRow[]): DraftRow[] {
  return validateDrafts(rows);
}

describe('Die Reihenfolge steht fest', () => {
  it('nennt zuerst den Titel, dann die Zeilen', () => {
    const list = saveBlockers({
      title: '',
      drafts: drafts(row({ english: '', german: 'die Insel' }), row({ english: 'bay', german: '' })),
    });

    expect(list.map((blocker) => blocker.kind)).toEqual(['title', 'english', 'german']);
  });

  it('nennt die fehlende Lernform vor der fehlenden Antwort', () => {
    /*
      Auch dann, wenn die Antwortzeile in der Tabelle weiter oben steht: Ohne
      englische Lernform gibt es keine Vokabel, und eine Antwort ohne Vokabel
      ist keine halbe, sondern gar keine.
    */
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(row({ english: 'bay', german: '' }), row({ english: '', german: 'die Insel' })),
    });

    expect(list.map((blocker) => blocker.kind)).toEqual(['english', 'german']);
  });

  it('nennt die offene fachliche Frage nach den fehlenden Feldern', () => {
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(
        row({ english: 'island', german: 'island' }),
        row({ english: 'bay', german: '' }),
      ),
    });

    expect(list.map((blocker) => blocker.kind)).toEqual(['german', 'review']);
  });

  it('behält innerhalb einer Sorte die Reihenfolge der Tabelle', () => {
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(
        row({ english: 'bay', german: '' }),
        row({ english: 'water', german: '' }),
      ),
    });

    expect(list.map((blocker) => blocker.message)).toEqual([
      '„bay“: Die deutsche Antwort fehlt.',
      '„water“: Die deutsche Antwort fehlt.',
    ]);
  });
});

describe('Was nicht aufhält', () => {
  it('lässt eine abgewählte Zeile offen', () => {
    /*
      Sie landet in keinem Paket. Jemanden zu einer Entscheidung über etwas zu
      zwingen, das er gerade weggelegt hat, wäre Beschäftigung.
    */
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(
        row({ english: 'island', german: 'die Insel' }),
        row({ english: 'bay', german: '', include: false }),
      ),
    });

    expect(list).toEqual([]);
  });

  it('lässt eine bestätigte Prüfzeile durch', () => {
    const [offen] = drafts(row({ english: 'island', german: 'island' }));
    if (!offen) throw new Error('keine Zeile');
    const bestaetigt = validateDrafts([confirmReview(offen)]);

    expect(saveBlockers({ title: 'Unit 3', drafts: bestaetigt })).toEqual([]);
  });

  it('hält nichts auf, wenn alles stimmt', () => {
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(row({ english: 'island', german: 'die Insel' })),
    });
    expect(list).toEqual([]);
  });

  it('meldet eine leere Auswahl als eigenen Punkt', () => {
    const list = saveBlockers({
      title: 'Unit 3',
      drafts: drafts(row({ english: 'island', german: 'die Insel', include: false })),
    });
    expect(list.map((blocker) => blocker.kind)).toEqual(['selection']);
  });
});

describe('Die Meldung', () => {
  it('nennt bei einer Stelle nur diese', () => {
    const list = saveBlockers({ title: '', drafts: [] });
    expect(describeBlockers(list)).toBe(
      'Speichern ist noch nicht möglich. Das Paket braucht einen Titel.',
    );
  });

  it('nennt bei mehreren die Zahl und die erste', () => {
    const list = saveBlockers({
      title: '',
      drafts: drafts(row({ english: 'bay', german: '' })),
    });
    const text = describeBlockers(list);
    expect(text).toContain('2 offene Stellen');
    expect(text).toContain('Das Paket braucht einen Titel.');
  });

  it('sagt nichts, wenn nichts offen ist', () => {
    expect(describeBlockers([])).toBe('');
  });
});
