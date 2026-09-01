import { describe, expect, it } from 'vitest';
import { analyzeText } from '../domain/textExtraction';
import {
  familyKeys,
  looksLikePublication,
  recommend,
  type RecommendationInput,
} from './recommendation';
import { ATTRITIONAL_COMBAT_TEXT } from './fixtures/attritionalCombat';
import type { CefrLevel, Grade } from '../domain/cefr';

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

function inputs(): RecommendationInput[] {
  return analysis.candidates.map((candidate) => ({ candidate }));
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
