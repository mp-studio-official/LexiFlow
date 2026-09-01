import { describe, expect, it } from 'vitest';
import { headingOf, keyTerms, suggestTopic } from './topicSuggestion';

describe('Überschrift erkennen', () => {
  it('nimmt eine kurze erste Zeile ohne Satzzeichen', () => {
    expect(headingOf('Coastal Erosion in Cornwall\n\nThe cliffs are retreating.')).toBe(
      'Coastal Erosion in Cornwall',
    );
  });

  it('hält einen Satz nicht für eine Überschrift', () => {
    expect(headingOf('The cliffs are retreating fast.')).toBeUndefined();
    expect(headingOf('Was ist passiert?')).toBeUndefined();
  });

  it('hält ein einzelnes Wort nicht für eine Überschrift', () => {
    // Ein einzelnes Wort am Anfang ist häufiger ein Listenkopf als ein Titel.
    expect(headingOf('Erosion\n\nThe cliffs are retreating.')).toBeUndefined();
  });

  it('hält eine sehr lange Zeile nicht für eine Überschrift', () => {
    const lang = 'Coastal erosion and the long term consequences for settlements along the shore';
    expect(headingOf(lang)).toBeUndefined();
  });
});

describe('Tragende Begriffe', () => {
  it('nimmt nur mehrfach vorkommende Inhaltswörter', () => {
    const text =
      'Erosion threatens the settlement. Erosion is measured yearly. The settlement was moved.';
    const terms = keyTerms(text, 4).map((term) => term.toLowerCase());
    expect(terms).toContain('erosion');
    expect(terms).toContain('settlement');
    // „yearly“ kommt nur einmal vor.
    expect(terms).not.toContain('yearly');
  });

  it('übergeht kurze Wörter und Zahlen', () => {
    const terms = keyTerms('The 2024 plan. The 2024 plan was good.', 5);
    expect(terms.every((term) => term.length >= 4)).toBe(true);
    expect(terms).not.toContain('2024');
  });
});

describe('Themenvorschlag', () => {
  it('bevorzugt die Überschrift', () => {
    const result = suggestTopic('Coastal Erosion in Cornwall\n\nErosion threatens the settlement.');
    expect(result).toEqual({ topic: 'Coastal Erosion in Cornwall', source: 'heading' });
  });

  it('bildet sonst einen Vorschlag aus den häufigsten Begriffen', () => {
    const result = suggestTopic(
      'Erosion threatens the settlement. Erosion is measured. The settlement was moved.',
    );
    expect(result.source).toBe('frequency');
    expect(result.topic.toLowerCase()).toContain('erosion');
    expect(result.topic).toContain(' und ');
  });

  it('erfindet nichts, wenn nichts heraussticht', () => {
    /*
      Der wichtigste Fall. „Text vom 3. September“ wäre ehrlicher als eine
      erfundene Kapitelüberschrift – und ein falscher Vorschlag kostet
      Vertrauen und muss weggeklickt werden.
    */
    expect(suggestTopic('One two three four five six.')).toEqual({ topic: '', source: 'none' });
    expect(suggestTopic('')).toEqual({ topic: '', source: 'none' });
  });

  it('liefert bei gleichem Text dasselbe Ergebnis', () => {
    const text = 'Erosion threatens the settlement. Erosion is measured. The settlement was moved.';
    expect(suggestTopic(text)).toEqual(suggestTopic(text));
  });
});
