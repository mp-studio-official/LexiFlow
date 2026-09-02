import { describe, expect, it } from 'vitest';
import { checkAnswer, checkChoice } from './answerCheck';

const MEANINGS = ['Nachbarschaft', 'Viertel'];

describe('checkAnswer', () => {
  it('akzeptiert jede hinterlegte Bedeutung', () => {
    expect(checkAnswer('Nachbarschaft', MEANINGS).verdict).toBe('correct');
    expect(checkAnswer('Viertel', MEANINGS).verdict).toBe('correct');
  });

  it('ignoriert Groß-/Kleinschreibung, Leerzeichen und Schlusspunkt', () => {
    expect(checkAnswer('  nachbarschaft. ', MEANINGS).verdict).toBe('correct');
  });

  it('akzeptiert mehrere Eingaben am Semikolon, wenn eine davon passt', () => {
    expect(checkAnswer('Viertel; Gegend', MEANINGS).verdict).toBe('correct');
  });

  it('hält ein Komma für Inhalt, nicht für ein Trennzeichen', () => {
    /*
      Seit Sprint 4B.2: „einen Begriff, eine Redewendung prägen“ ist **eine**
      Antwort. Wer sie vollständig eintippt, hat recht; wer nur die erste
      Hälfte tippt, hat es nicht.
    */
    const erwartet = ['einen Begriff, eine Redewendung prägen'];
    expect(checkAnswer('einen Begriff, eine Redewendung prägen', erwartet).verdict).toBe('correct');
    expect(checkAnswer('einen Begriff', erwartet).verdict).toBe('wrong');
  });

  it('toleriert fehlende Artikel und „to“', () => {
    const result = checkAnswer('apologise', ['to apologise']);
    expect(result.verdict).toBe('correct');
    expect(result.hint).toContain('to apologise');
  });

  it('wertet einen kleinen Tippfehler als „fast richtig“', () => {
    const result = checkAnswer('Nachbarschat', MEANINGS);
    expect(result.verdict).toBe('almost');
    expect(result.matched).toBe('Nachbarschaft');
  });

  it('wertet ein anderes Wort als falsch', () => {
    expect(checkAnswer('Hund', MEANINGS).verdict).toBe('wrong');
  });

  it('ist bei kurzen Wörtern streng', () => {
    expect(checkAnswer('haus', ['maus']).verdict).toBe('wrong');
  });

  it('meldet leere Eingaben', () => {
    const result = checkAnswer('   ', MEANINGS);
    expect(result.verdict).toBe('wrong');
    expect(result.hint).toMatch(/nichts eingegeben/i);
  });

  it('gibt immer alle erwarteten Antworten zurück', () => {
    expect(checkAnswer('irgendwas', MEANINGS).expected).toEqual(MEANINGS);
  });
});

describe('checkChoice', () => {
  it('vergleicht normalisiert', () => {
    expect(checkChoice(' Viertel ', MEANINGS).verdict).toBe('correct');
  });

  it('kennt kein „fast richtig“', () => {
    expect(checkChoice('Viertl', MEANINGS).verdict).toBe('wrong');
  });
});
