import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { checkAnswer } from '../../../domain/answerCheck';
import { fehlererklaerung, formangaben, hinweiseFuer } from '../../../domain/sprache';
import { makeEntry } from '../../../test/fixtures';
import type { VocabEntry } from '../../../domain/schema';
import { Beispiel, Fehlerkarte, Formtafel, Hinweistreppe } from './Sprache';

const haus = makeEntry({
  english: 'house',
  germanAnswers: ['Haus'],
  partOfSpeech: 'noun',
  exampleSentences: [{ english: 'The house is blue.', german: 'Das Haus ist blau.' }],
});

const gehen: VocabEntry = {
  ...makeEntry({ english: 'went', lemma: 'go', partOfSpeech: 'verb', germanAnswers: ['ging'] }),
  inflection: { kind: 'verb', base: 'go', pastSimple: 'went', pastParticiple: 'gone', irregular: true },
};

function zeichne(baum: React.ReactElement) {
  cleanup();
  render(baum);
  return userEvent.setup();
}

describe('die Hinweistreppe', () => {
  const hinweise = hinweiseFuer(haus, 'de-en');

  it('zeigt am Anfang keinen Hinweis, sondern den Weg dorthin', () => {
    zeichne(<Hinweistreppe hinweise={hinweise} offen={0} aufMehr={() => {}} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hinweis/ })).toBeInTheDocument();
  });

  it('zeigt genau so viele Stufen, wie offen sind', () => {
    zeichne(<Hinweistreppe hinweise={hinweise} offen={2} aufMehr={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('hält den Stand nicht selbst, sondern meldet ihn nach außen', async () => {
    const mehr = vi.fn();
    const user = zeichne(<Hinweistreppe hinweise={hinweise} offen={1} aufMehr={mehr} />);
    await user.click(screen.getByRole('button', { name: /Noch ein Hinweis/ }));
    expect(mehr).toHaveBeenCalledTimes(1);
    // Die Komponente hat sich nicht selbst weitergeschaltet.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('bietet keinen weiteren Hinweis, wenn alle offen sind', () => {
    zeichne(<Hinweistreppe hinweise={hinweise} offen={hinweise.length} aufMehr={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt gar nichts, wenn es nichts zu zeigen gibt', () => {
    const { container } = render(<Hinweistreppe hinweise={[]} offen={3} aufMehr={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });
});

describe('die Fehlerkarte', () => {
  it('sagt, was passiert ist, und nennt die richtige Antwort', () => {
    const ergebnis = checkAnswer('house', haus.germanAnswers);
    zeichne(<Fehlerkarte erklaerung={fehlererklaerung('house', ergebnis, haus, 'en-de')!} />);
    expect(screen.getByText(/englische Wort/)).toBeInTheDocument();
    expect(screen.getByText('Haus')).toBeInTheDocument();
  });

  it('urteilt nicht über die Person', () => {
    const ergebnis = checkAnswer('quatsch', haus.germanAnswers);
    const { container } = render(
      <Fehlerkarte erklaerung={fehlererklaerung('quatsch', ergebnis, haus, 'en-de')!} />,
    );
    expect(container.textContent).not.toMatch(/du hast|leider|schade|falsch gemacht|wieder/i);
    cleanup();
  });
});

describe('die Formtafel', () => {
  it('nennt Form und Bezeichnung als Paar', () => {
    zeichne(<Formtafel angaben={formangaben(gehen)} />);
    const bezeichnung = screen.getByText('Past Simple');
    expect(bezeichnung.tagName).toBe('DT');
    expect(bezeichnung.nextElementSibling?.textContent).toBe('went');
  });

  it('verschwindet, wenn es nichts zu zeigen gibt', () => {
    const { container } = render(<Formtafel angaben={formangaben(haus)} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });
});

describe('der Beispielsatz', () => {
  it('zeigt die Übersetzung erst auf Wunsch', async () => {
    const user = zeichne(<Beispiel englisch="The house is blue." deutsch="Das Haus ist blau." />);
    expect(screen.queryByText('Das Haus ist blau.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Übersetzung zeigen' }));
    expect(screen.getByText('Das Haus ist blau.')).toBeInTheDocument();
  });

  it('bietet einen anderen Satz nur an, wenn es einen gibt', () => {
    zeichne(<Beispiel englisch="The house is blue." />);
    expect(screen.queryByRole('button', { name: 'Anderer Satz' })).not.toBeInTheDocument();

    zeichne(<Beispiel englisch="The house is blue." aufAnderen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anderer Satz' })).toBeInTheDocument();
  });
});
