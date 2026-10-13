import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../answerCheck';
import type { VocabEntry } from '../schema';
import { makeEntry } from '../../test/fixtures';
import {
  aussprachequelle,
  beispielsatz,
  fehlererklaerung,
  formangaben,
  hinweiseFuer,
} from './index';

/**
 * Sprachliche Hilfen — deterministisch, aus dem, was die Lehrkraft eingab.
 *
 * Geprüft wird vor allem die Grenze: Diese Funktionen erklären, sie
 * urteilen nicht. Kein Pfad hier kann aus `wrong` ein `correct` machen.
 */

const haus = makeEntry({
  english: 'house',
  germanAnswers: ['Haus'],
  partOfSpeech: 'noun',
  exampleSentences: [
    { english: 'We live in a small house.', german: 'Wir wohnen in einem kleinen Haus.' },
    { english: 'The house is blue.' },
  ],
});

const gehen: VocabEntry = {
  ...makeEntry({ english: 'went', lemma: 'go', partOfSpeech: 'verb', germanAnswers: ['ging'] }),
  inflection: {
    kind: 'verb',
    base: 'go',
    pastSimple: 'went',
    pastParticiple: 'gone',
    irregular: true,
  },
};

describe('gestufte Hinweise', () => {
  it('fangen bei der Wortart an und enden beim Wortanfang', () => {
    const hinweise = hinweiseFuer(haus, 'de-en');
    expect(hinweise[0]?.art).toBe('wortart');
    expect(hinweise.at(-1)?.art).toBe('anfang');
  });

  it('nummerieren lückenlos von eins an', () => {
    const hinweise = hinweiseFuer(haus, 'de-en');
    expect(hinweise.map((h) => h.stufe)).toEqual(
      Array.from({ length: hinweise.length }, (_, platz) => platz + 1),
    );
  });

  it('verraten die Lösung in keiner Stufe ganz', () => {
    for (const richtung of ['en-de', 'de-en'] as const) {
      const gesucht = richtung === 'en-de' ? 'Haus' : 'house';
      for (const hinweis of hinweiseFuer(haus, richtung)) {
        if (hinweis.art === 'satz') continue;
        expect(hinweis.text.toLowerCase()).not.toContain(gesucht.toLowerCase());
      }
    }
  });

  it('bauen die Lücke aus einem Beispielsatz — nur dort, wo sie hilft', () => {
    const nachEnglisch = hinweiseFuer(haus, 'de-en');
    expect(nachEnglisch.find((h) => h.art === 'satz')?.text).toContain('___');
    /*
      Umgekehrt nicht: Ein englischer Satz mit einer Lücke verrät die
      deutsche Antwort nicht — er hilft dann auch nicht.
    */
    expect(hinweiseFuer(haus, 'en-de').find((h) => h.art === 'satz')).toBeUndefined();
  });

  it('erfinden keine Stufe, die die Vokabel nicht hergibt', () => {
    const nackt = makeEntry({ english: 'x', germanAnswers: ['y'] });
    const hinweise = hinweiseFuer(nackt, 'de-en');
    expect(hinweise.some((h) => h.art === 'wortart')).toBe(false);
    expect(hinweise.some((h) => h.art === 'satz')).toBe(false);
    expect(hinweise.length).toBeGreaterThan(0);
  });

  it('sind bei leerer Vokabel leer statt erfunden', () => {
    expect(hinweiseFuer(makeEntry({ english: '', germanAnswers: ['x'] }), 'de-en')).toEqual([]);
  });
});

describe('Fehlererklärungen erklären — sie urteilen nicht', () => {
  it('sagen bei einer richtigen Antwort gar nichts', () => {
    const ergebnis = checkAnswer('Haus', haus.germanAnswers);
    expect(ergebnis.verdict).toBe('correct');
    expect(fehlererklaerung('Haus', ergebnis, haus, 'en-de')).toBeUndefined();
  });

  it('erkennen die vertauschte Richtung', () => {
    const ergebnis = checkAnswer('house', haus.germanAnswers);
    const erklaerung = fehlererklaerung('house', ergebnis, haus, 'en-de');
    expect(erklaerung?.art).toBe('richtung-vertauscht');
    expect(erklaerung?.text).toMatch(/englische Wort/);
  });

  it('erkennen die Grundform statt der Lernform', () => {
    const ergebnis = checkAnswer('go', [gehen.english]);
    const erklaerung = fehlererklaerung('go', ergebnis, gehen, 'de-en');
    expect(erklaerung?.art).toBe('grundform-statt-lernform');
    expect(erklaerung?.text).toContain('went');
  });

  it('nennen bei „fast richtig" die Schreibweise', () => {
    const ergebnis = checkAnswer('hous', [haus.english]);
    expect(ergebnis.verdict).toBe('almost');
    expect(fehlererklaerung('hous', ergebnis, haus, 'de-en')?.art).toBe('schreibweise');
  });

  it('nennen alle richtigen Antworten, wenn es mehrere gibt', () => {
    const vieldeutig = makeEntry({ english: 'get', germanAnswers: ['bekommen', 'werden'] });
    const ergebnis = checkAnswer('nehmen', vieldeutig.germanAnswers);
    const erklaerung = fehlererklaerung('nehmen', ergebnis, vieldeutig, 'en-de');
    expect(erklaerung?.art).toBe('andere-bedeutung');
    expect(erklaerung?.text).toContain('bekommen');
    expect(erklaerung?.text).toContain('werden');
  });

  it('sagen bei leerer Eingabe, dass nichts dastand', () => {
    const ergebnis = checkAnswer('', haus.germanAnswers);
    expect(fehlererklaerung('', ergebnis, haus, 'en-de')?.art).toBe('nichts-erkannt');
  });

  it('nennen immer die richtigen Antworten mit', () => {
    const ergebnis = checkAnswer('quatsch', haus.germanAnswers);
    expect(fehlererklaerung('quatsch', ergebnis, haus, 'en-de')?.richtig).toEqual(['Haus']);
  });

  it('machen aus keinem Urteil ein anderes', () => {
    /*
      Die Zusage in einem Satz: Das Ergebnis geht unverändert hinein und
      wird nur beschrieben. `Fehlererklaerung` hat gar kein Feld, in dem
      ein neues Urteil stehen könnte.
    */
    const ergebnis = checkAnswer('quatsch', haus.germanAnswers);
    const erklaerung = fehlererklaerung('quatsch', ergebnis, haus, 'en-de');
    expect(Object.keys(erklaerung!).sort()).toEqual(['art', 'richtig', 'text']);
  });
});

describe('Beispielsätze wechseln', () => {
  it('geben bei jeder Begegnung den nächsten', () => {
    expect(beispielsatz(haus, 0)?.english).toBe('We live in a small house.');
    expect(beispielsatz(haus, 1)?.english).toBe('The house is blue.');
    expect(beispielsatz(haus, 2)?.english).toBe('We live in a small house.');
  });

  it('bleiben bei derselben Begegnung gleich', () => {
    expect(beispielsatz(haus, 7)?.english).toBe(beispielsatz(haus, 7)?.english);
  });

  it('kommen ohne Beispielsatz zurecht', () => {
    expect(beispielsatz(makeEntry({ exampleSentences: [] }), 3)).toBeUndefined();
  });
});

describe('Formangaben zeigen nur, was dasteht', () => {
  it('nennen die Verbformen', () => {
    expect(formangaben(gehen)).toEqual([
      { label: 'Grundform', wert: 'go' },
      { label: 'Past Simple', wert: 'went' },
      { label: 'Past Participle', wert: 'gone' },
    ]);
  });

  it('erfinden keinen Plural', () => {
    expect(formangaben(haus)).toEqual([]);
  });

  it('sagen „unzählbar" statt einen Plural zu behaupten', () => {
    const wasser: VocabEntry = {
      ...makeEntry({ english: 'water', partOfSpeech: 'noun' }),
      inflection: { kind: 'noun', singular: 'water', uncountable: true },
    };
    expect(formangaben(wasser)).toEqual([{ label: 'Zahl', wert: 'nur Singular (unzählbar)' }]);
  });
});

describe('Aussprache ist vorbereitet, nicht behauptet', () => {
  it('liefert heute keine Quelle', () => {
    expect(aussprachequelle(haus)).toBeUndefined();
  });
});
