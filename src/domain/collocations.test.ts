import { describe, expect, it } from 'vitest';
import {
  MIN_COLLOCATION_OCCURRENCES,
  contentRuns,
  findCollocations,
  type CollocationSource,
} from './collocations';
import { segmentSentences } from './textExtraction';

function sentencesOf(text: string): CollocationSource[] {
  return segmentSentences(text).map((sentence) => ({
    text: sentence.text,
    start: sentence.start,
    index: sentence.index,
  }));
}

function found(text: string): string[] {
  return findCollocations(sentencesOf(text)).map((item) => item.normalized);
}

describe('Läufe von Inhaltswörtern', () => {
  it('endet an Funktionswörtern und an Satzzeichen', () => {
    const runs = contentRuns('Psychological casualties of attritional combat, again.').map((run) =>
      run.map((part) => part.normalized).join(' '),
    );
    expect(runs).toEqual(['psychological casualties', 'attritional combat']);
  });

  it('lässt kurze Wörter und Zahlen nicht in ein Paar', () => {
    // `the` ist Funktionswort, `1917` eine Zahl, `gas` zu kurz – jedes davon
    // beendet den Lauf. Übrig bleibt das eine echte Paar.
    const runs = contentRuns('The 1917 army used gas masks').map((run) =>
      run.map((part) => part.normalized).join(' '),
    );
    expect(runs).toEqual(['army used']);
  });
});

describe('Mehrwortbegriffe finden', () => {
  it('nimmt ein Paar erst ab der zweiten Fundstelle', () => {
    expect(MIN_COLLOCATION_OCCURRENCES).toBe(2);
    expect(found('Attritional combat was common.')).toEqual([]);
    expect(found('Attritional combat was common. Attritional combat continued.')).toEqual([
      'attritional combat',
    ]);
  });

  it('verbindet nichts über ein Satzzeichen hinweg', () => {
    /*
      „combat, psychological“ steht zweimal nebeneinander und ist trotzdem
      kein Begriff – dazwischen steht ein Komma.
    */
    const text =
      'In combat, psychological strain grew. In combat, psychological strain grew again.';
    expect(found(text)).not.toContain('combat psychological');
  });

  it('nimmt kein Paar mit einem Funktionswort', () => {
    const text = 'The problem of combat. The problem of combat.';
    expect(found(text)).not.toContain('problem of');
    expect(found(text)).not.toContain('of combat');
  });

  it('löst überlappende Paare zugunsten des häufigeren auf', () => {
    /*
      „standardized regulations governing“ ergibt zwei Paare. Beide
      anzubieten hieße, dasselbe Stück Text zweimal zu verkaufen.
    */
    const text = [
      'Standardized regulations governing evacuation existed.',
      'Standardized regulations governing evacuation existed.',
      'Standardized regulations were rare.',
    ].join(' ');
    const result = found(text);
    expect(result).toContain('standardized regulations');
    expect(result).not.toContain('regulations governing');
  });

  it('merkt sich Schreibweise, Satz und Fundstelle der ersten Stelle', () => {
    const text = 'Archival research helps. Later, archival research helped again.';
    const [first] = findCollocations(sentencesOf(text));
    expect(first?.display).toBe('Archival research');
    expect(first?.sourceSentence).toBe('Archival research helps.');
    expect(first?.firstOccurrence).toBe(0);
    expect(first?.occurrences).toBe(2);
  });

  it('hält ein Wort mit sich selbst nicht für einen Begriff', () => {
    expect(found('Alpha beta beta gamma gamma gamma.')).toEqual([]);
  });

  it('liefert bei gleichem Text dasselbe Ergebnis', () => {
    const text = 'Manpower shortages grew. Manpower shortages grew further.';
    expect(found(text)).toEqual(found(text));
  });
});
