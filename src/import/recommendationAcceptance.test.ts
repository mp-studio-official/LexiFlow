import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeText } from '../domain/textExtraction';
import { createOfflineDictionary } from '../dictionary/offlineDictionary';
import { summarizeLookup, type DictionarySuggestionSummary } from './dictionarySuggestions';
import {
  familyKeys,
  looksLikePublication,
  recommend,
  resolveBaseForm,
  type BaseFormDecision,
  type RecommendationInput,
} from './recommendation';
import { ATTRITIONAL_COMBAT_TEXT } from './fixtures/attritionalCombat';
import type { CefrLevel, Grade } from '../domain/cefr';
import type { DictionaryProvider } from '../dictionary/DictionaryProvider';

/**
 * Der Akzeptanzfall: ein Fachartikel über psychische Ausfälle im
 * Abnutzungskrieg.
 *
 * Diese Datei prüft **Eigenschaften**, keine Wortlisten. Eine hartcodierte
 * Erwartung wie „Platz 1 ist `attritional combat`“ wäre ein Test der jetzigen
 * Gewichte, nicht der Sache: Er würde bei jeder Verbesserung rot und bei jeder
 * Verschlechterung, die zufällig dieselbe Liste erzeugt, grün. Geprüft wird
 * deshalb, was die Empfehlung leisten soll:
 *
 * - Sie nimmt **nicht** die ersten Inhaltswörter des Textes.
 * - Mehrere anspruchsvolle Begriffe stehen weit oben.
 * - Mehrwortbegriffe überleben und werden nicht von ihren Teilen verdrängt.
 * - Zeitschriftenapparat („issue“) ist keine Lernvokabel.
 * - Keine Wortfamilie erscheint zweimal.
 * - Klasse 5 und Q1 erzeugen erkennbar verschiedene Listen.
 *
 * **Zur Ehrlichkeit:** Was hier „passend zum Niveau“ heißt, ist eine Schätzung
 * aus messbaren Merkmalen (Länge, Silben, Wortbildung, Häufigkeit, Stellung,
 * Wörterbuchtreffer). Es gibt keine lizenzierte GeR-Wortliste in diesem
 * Projekt, und es wird keine behauptet.
 */

const analysis = analyzeText(ATTRITIONAL_COMBAT_TEXT);
const publicationContext = looksLikePublication(ATTRITIONAL_COMBAT_TEXT);

/**
 * Der Akzeptanzfall läuft mit dem **echten** Offline-Wörterbuch.
 *
 * Ein Fake wäre hier ein Zirkelschluss: Die Zusammenführung von `kept` und
 * `keep` steht und fällt mit den Lemmata, die der ausgelieferte Datensatz
 * tatsächlich liefert. Was hier grün ist, ist grün für die Lehrkraft.
 */
let lookups = new Map<string, DictionarySuggestionSummary>();

beforeAll(async () => {
  const dictionary = createOfflineDictionary();
  if (!(await dictionary.isAvailable())) throw new Error('Offline-Wörterbuch fehlt.');
  const found = new Map<string, DictionarySuggestionSummary>();
  for (const candidate of analysis.candidates) {
    const summary = summarizeLookup(await dictionary.lookup(candidate.english));
    if (summary) found.set(candidate.id, summary);
  }
  lookups = found;
}, 60_000);

function inputs(): RecommendationInput[] {
  return analysis.candidates.map((candidate) => ({
    candidate,
    dictionary: lookups.get(candidate.id),
  }));
}

function top(grade: Grade, cefrLevel: CefrLevel, count = 15): string[] {
  return recommend(inputs(), {
    context: { grade, cefrLevel },
    sort: 'recommended',
    count,
    publicationContext,
  }).map((item) => item.candidate.english);
}

/** Die ersten Inhaltswörter, so wie sie im Text stehen. */
function textOrder(count = 15): string[] {
  return recommend(inputs(), {
    context: { grade: 'Q1', cefrLevel: 'B2/C1' },
    sort: 'text-order',
    count,
    publicationContext,
  }).map((item) => item.candidate.english);
}

/**
 * Die Begriffe, die der Auftrag als Beispiele für „anspruchsvoll“ nennt.
 * Erwartet wird **nicht**, dass alle erscheinen – sondern dass mehrere davon
 * weit oben stehen.
 */
const ANSPRUCHSVOLL = [
  'attritional combat',
  'psychological casualties',
  'manpower shortages',
  'undermine',
  'standardized regulations',
  'paramount',
  'frontline',
  'clinician',
  'endure',
  'tacit admission',
  'bombardment',
  'resilience',
  'evacuation',
  'archival research',
  'neuropsychiatric',
];

function countAnspruchsvoll(words: readonly string[]): number {
  const lower = words.map((word) => word.toLowerCase());
  return ANSPRUCHSVOLL.filter((term) => lower.includes(term)).length;
}

describe('Der Text gibt überhaupt her, was geprüft werden soll', () => {
  it('enthält Mehrwortbegriffe als eigene Kandidaten', () => {
    const words = analysis.candidates.map((item) => item.english.toLowerCase());
    expect(words).toContain('attritional combat');
    expect(words).toContain('psychological casualties');
    expect(words.filter((word) => word.includes(' ')).length).toBeGreaterThanOrEqual(4);
  });

  it('trägt Zeitschriftenapparat und wird als Publikation erkannt', () => {
    expect(publicationContext).toBe(true);
    expect(analysis.candidates.map((item) => item.english.toLowerCase())).toContain('issue');
  });

  it('beginnt mit Alltagssprache – das ist die Falle', () => {
    const anfang = textOrder(10).map((word) => word.toLowerCase());
    expect(countAnspruchsvoll(anfang)).toBe(0);
  });
});

describe('Standardsortierung für die Oberstufe', () => {
  it('nimmt nicht einfach die ersten Inhaltswörter', () => {
    const empfohlen = top('Q1', 'B2/C1');
    const anfang = textOrder();
    expect(empfohlen).not.toEqual(anfang);
    // Höchstens ein Viertel Überschneidung – sonst wäre es faktisch dasselbe.
    const gemeinsam = empfohlen.filter((word) => anfang.includes(word));
    expect(gemeinsam.length).toBeLessThanOrEqual(Math.floor(empfohlen.length / 4));
  });

  it('stellt mehrere anspruchsvolle Begriffe weit nach vorn', () => {
    const empfohlen = top('Q1', 'B2/C1');
    expect(countAnspruchsvoll(empfohlen)).toBeGreaterThanOrEqual(5);
    // Und mindestens zwei davon stehen unter den ersten fünf.
    expect(countAnspruchsvoll(empfohlen.slice(0, 5))).toBeGreaterThanOrEqual(2);
  });

  it('lässt Mehrwortbegriffe stehen, statt sie in Einzelwörter zu zerlegen', () => {
    const empfohlen = top('Q1', 'B2/C1');
    expect(empfohlen.filter((word) => word.includes(' ')).length).toBeGreaterThanOrEqual(3);
  });

  it('hält den Zeitschriftenapparat aus den Empfehlungen heraus', () => {
    /*
      `issue` ist hier die Heftnummer. Ohne den Apparatabschlag stand es bei
      Klasse 5 auf Platz 1 – ein Wort aus der Kopfzeile, das mit dem Thema des
      Artikels nichts zu tun hat.
    */
    expect(top('Q1', 'B2/C1', 20).map((word) => word.toLowerCase())).not.toContain('issue');
    expect(top('5', 'A1+', 20).map((word) => word.toLowerCase())).not.toContain('issue');
  });

  it('schlägt keine Wortfamilie zweimal vor', () => {
    const chosen = recommend(inputs(), {
      context: { grade: 'Q1', cefrLevel: 'B2/C1' },
      sort: 'recommended',
      count: 20,
      publicationContext,
    });
    const belegt = new Set<string>();
    for (const item of chosen) {
      for (const family of familyKeys(item.candidate.english, item.dictionary)) {
        expect(belegt.has(family)).toBe(false);
        belegt.add(family);
      }
    }
  });

  it('trennt Klasse 5 und Oberstufe erkennbar', () => {
    const fuenf = top('5', 'A1+');
    const q1 = top('Q1', 'B2/C1');
    const gemeinsam = fuenf.filter((word) => q1.includes(word));
    // Höchstens ein Drittel Überschneidung.
    expect(gemeinsam.length).toBeLessThanOrEqual(Math.floor(fuenf.length / 3));
    // Und die Fachbegriffe landen bei Klasse 5 nicht vorn.
    expect(countAnspruchsvoll(fuenf)).toBeLessThan(countAnspruchsvoll(q1));
  });

  it('liefert bei gleicher Eingabe dieselbe Reihenfolge', () => {
    expect(top('Q1', 'B2/C1')).toEqual(top('Q1', 'B2/C1'));
  });
});

describe('Empfehlungsqualität – was nach der Korrektur nicht mehr dastehen darf', () => {
  const INFLECTED = ['kept', 'wrote', 'written', 'rose', 'risen', 'men', 'letters', 'casualties'];

  it('bietet keine gebeugte Form an, wo das Wörterbuch die Grundform kennt', () => {
    /*
      `kept`, `wrote`, `rose` und `men` standen als Vokabeln in der Liste. So
      lernt sie niemand – und wer sie so ins Paket nimmt, bekommt sie im
      Trainer auch so abgefragt.
    */
    const alle = [...top('5', 'A1+', 20), ...top('Q1', 'B2/C1', 20)].map((word) =>
      word.toLowerCase(),
    );
    for (const form of INFLECTED) expect(alle).not.toContain(form);
  });

  it('führt die Grundform statt der gebeugten auf', () => {
    const fuenf = top('5', 'A1+', 20).map((word) => word.toLowerCase());
    // Der Text enthält `kept`, `wrote`, `rose` und `men` – und keine davon sonst.
    expect(fuenf).toContain('keep');
    expect(fuenf).toContain('write');
    expect(fuenf).toContain('man');
    expect(fuenf).toContain('rise');
  });

  it('macht aus einer Schreibvariante keine andere Vokabel', () => {
    /*
      `story` steht im Datensatz als Form von `storey` – als Schreibvariante,
      nicht als Beugung. Die erste Fassung der Zusammenführung ersetzte es und
      machte aus der Geschichte ein Stockwerk. Ebenso `letters`, das über eine
      Variante bei `litter` landete statt bei `letter`.
    */
    const fuenf = top('5', 'A1+', 20).map((word) => word.toLowerCase());
    expect(fuenf).toContain('story');
    expect(fuenf).not.toContain('storey');
    expect(fuenf).not.toContain('litter');
  });

  it('schlägt kein Zahlwort vor', () => {
    /*
      `four` stand für Klasse 5 auf Platz fünf. Es kommt aus „collects four
      studies“ – ein Zahlwort ist in einem Sachtext nie die Vokabel, wegen der
      jemand den Text ausgewählt hat.
    */
    const alle = [...top('5', 'A1+', 20), ...top('Q1', 'B2/C1', 20)].map((word) =>
      word.toLowerCase(),
    );
    expect(alle).not.toContain('four');
  });

  it('nimmt den Zeitschriftentitel nicht für ein Fachgebiet', () => {
    /*
      Aus der Kopfzeile `Military History Quarterly, Vol. 12, Issue 3.` entstand
      der Mehrwortbegriff `military History` und stand bei Q1 unter den ersten
      zehn. Der Artikel handelt nicht von Militärgeschichte; das ist der
      Briefkopf.
    */
    const q1 = top('Q1', 'B2/C1', 20).map((word) => word.toLowerCase());
    expect(q1.some((word) => word.startsWith('military'))).toBe(false);
    expect(q1).not.toContain('quarterly');
  });

  it('lässt einen einmaligen, belastbaren Mehrwortbegriff zu', () => {
    /*
      `tacit admission` und `archival research` kommen je zweimal vor,
      `manpower shortages` ebenfalls – aber `divisional records` steht nur
      einmal da. Zwei lange, gewichtige Wörter, keines Alltagswortschatz: Wer
      solche Begriffe erst ab dem zweiten Vorkommen anbietet, bietet sie
      meistens gar nicht an.
    */
    expect(top('Q1', 'B2/C1', 20).map((word) => word.toLowerCase())).toContain(
      'divisional records',
    );
  });

  it('füllt nach der Zusammenführung bis zur gewünschten Anzahl auf', () => {
    /*
      Die Zusammenführung nimmt Kandidaten heraus. Bricht die Schleife bei der
      ersten Lücke ab, bekommt die Lehrkraft statt fünfzehn Vorschlägen neun –
      ohne dass irgendwo stünde, warum.
    */
    expect(top('Q1', 'B2/C1', 15)).toHaveLength(15);
    expect(top('5', 'A1+', 15)).toHaveLength(15);
    // Und die Anzahl wächst mit der Anforderung, statt bei einer Lücke zu enden.
    expect(top('Q1', 'B2/C1', 20).length).toBeGreaterThan(15);
  });

  it('schreibt ein Wort aus dem Satzanfang klein, wenn es kein Eigenname ist', () => {
    /*
      `Military`, `Psychological` und `Small` standen groß in den Empfehlungen,
      weil sie im Text nur einen Satz begannen. Wer sie so übernimmt, lernt eine
      Vokabel falsch.
    */
    const alle = [...top('5', 'A1+', 20), ...top('Q1', 'B2/C1', 20)];
    const grossGeschrieben = alle.filter((word) => /^[A-Z]/.test(word));
    // Erlaubt bleiben nur durchgehende Großschreibungen – Akronyme.
    for (const word of grossGeschrieben) expect(word).toBe(word.toUpperCase());
  });
});

/**
 * Dieselben Fälle wie in `recommendation.test.ts` – hier aber gegen den
 * **ausgelieferten** Datensatz.
 *
 * Die Unit-Tests dort prüfen die Regel an nachgebauten Einträgen; sie bleiben
 * grün, auch wenn das echte Wörterbuch etwas anderes sagt. Was hier grün ist,
 * ist grün für die Lehrkraft.
 */
describe('Mehrdeutige Wortformen am echten Wörterbuch', () => {
  let dictionary: DictionaryProvider;

  beforeAll(() => {
    dictionary = createOfflineDictionary();
  });

  async function decide(word: string, sentence: string): Promise<BaseFormDecision> {
    return resolveBaseForm(word, summarizeLookup(await dictionary.lookup(word)), sentence);
  }

  it('unterscheidet die Blume von der Vergangenheit', async () => {
    expect(await decide('rose', 'The rose bloomed in the garden.')).toEqual({ kind: 'keep' });
    expect(await decide('rose', 'Prices rose sharply last year.')).toEqual({
      kind: 'base',
      lemma: 'rise',
    });
  });

  it('unterscheidet das Leben vom Wohnen', async () => {
    expect(await decide('lives', 'She lives in London.')).toEqual({ kind: 'base', lemma: 'live' });
    expect(await decide('lives', 'Their lives changed forever.')).toEqual({
      kind: 'base',
      lemma: 'life',
    });
  });

  it('unterscheidet das Partizip vom Adjektiv', async () => {
    expect(await decide('written', 'He has written a letter.')).toEqual({
      kind: 'base',
      lemma: 'write',
    });
    expect(await decide('written', 'A written agreement followed.')).toEqual({ kind: 'keep' });
  });

  it('hält die Gegenproben aus 4B.1b', async () => {
    expect(await decide('story', 'Behind those letters lies a harder story.')).toEqual({
      kind: 'keep',
    });
    expect(await decide('crowded', 'The neighbourhood is crowded.')).toEqual({ kind: 'keep' });
    expect(await decide('litter', 'Litter covers the quiet street.')).toEqual({ kind: 'keep' });
  });

  it('führt eindeutige Beugungen weiterhin zusammen', async () => {
    expect(await decide('kept', 'His mother kept them in a box.')).toMatchObject({ lemma: 'keep' });
    expect(await decide('wrote', 'The soldier wrote home every week.')).toMatchObject({
      lemma: 'write',
    });
    expect(await decide('letters', 'His letters were short.')).toMatchObject({ lemma: 'letter' });
    expect(await decide('men', 'Bombardment left men unable to endure.')).toMatchObject({
      lemma: 'man',
    });
  });

  it('bleibt bei der Textform, wenn der Satz nichts hergibt', async () => {
    expect(await decide('rose', 'Casualties rose.')).toMatchObject({ kind: 'unresolved' });
    expect(await decide('lives', 'Lives changed.')).toMatchObject({ kind: 'unresolved' });
  });
});

describe('Der Apparatabschlag greift nur im Publikationskontext', () => {
  it('lässt „issue“ in einem gewöhnlichen Sachtext eine normale Vokabel sein', () => {
    /*
      Ein ständiger Abschlag wäre eine Bevormundung: In einem Text über einen
      politischen Streit ist `issue` genau die Vokabel, um die es geht.
    */
    const text =
      'The issue divided the town for years. Every issue of water rights returned. ' +
      'The council debated the issue again and again.';
    expect(looksLikePublication(text)).toBe(false);
    const ohneApparat = recommend(
      analyzeText(text).candidates.map((candidate) => ({ candidate })),
      { context: { grade: '9', cefrLevel: 'B1' }, sort: 'recommended', count: 5 },
    ).map((item) => item.candidate.english.toLowerCase());
    expect(ohneApparat).toContain('issue');
  });
});
