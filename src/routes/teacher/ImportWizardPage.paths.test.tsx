import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImportWizardPage } from './ImportWizardPage';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { clearAllLocalData } from '../../data/db';
import { serializePack } from '../../domain/vocabpack';
import { newId } from '../../domain/ids';
import type { VocabPack } from '../../domain/schema';

/**
 * Die **anderen** Importwege – und dass der vereinfachte Textmodus sie nicht
 * mitgenommen hat.
 *
 * Schwierigkeit und Themen-Tags verschwinden gezielt im Textimport: Für ein aus
 * einem Artikel gehobenes Wort kennt sie niemand. Bei einer CSV-Datei, einer
 * eingefügten Liste oder einem vorhandenen Paket ist die Lage umgekehrt – dort
 * können die Angaben schon dastehen, und sie stillschweigend unsichtbar zu
 * machen hieße, Arbeit zu verlieren, die jemand gemacht hat.
 */

const LISTE = ['to apologise\tsich entschuldigen', 'crowded\tvoll, überfüllt'].join('\n');

function setup(query = ''): ReturnType<typeof userEvent.setup> {
  render(
    <ProviderRegistry>
      <MemoryRouter initialEntries={[`/material/import${query}`]}>
        <Routes>
          <Route path="/material/import" element={<ImportWizardPage />} />
          <Route path="/material/:packId" element={<p>Paketseite</p>} />
        </Routes>
      </MemoryRouter>
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

async function pasteList(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByLabelText('Vokabelliste einfügen'));
  await user.paste(LISTE);
  await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Eingefügte Liste', () => {
  it('führt in einem Schritt in die Prüfung', async () => {
    const user = setup();
    await pasteList(user);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('to apologise');
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('sich entschuldigen');
    expect(screen.getByLabelText('Titel')).toBeInTheDocument();
  });

  it('bietet Schwierigkeit und Themen-Tags weiterhin an', async () => {
    const user = setup();
    await pasteList(user);

    await user.click(
      screen.getByRole('button', { name: /Beispielsatz für to apologise bearbeiten/ }),
    );
    expect(screen.getByLabelText('Schwierigkeit')).toBeInTheDocument();
    expect(screen.getByLabelText('Themen-Tags')).toBeInTheDocument();
    expect(screen.getByLabelText('Notiz')).toBeInTheDocument();
    expect(screen.getByLabelText(/Alternativantworten/)).toBeInTheDocument();
  });

  it('lässt den Lernkontext hier bearbeiten – es gibt keinen Schritt 2 dafür', async () => {
    const user = setup();
    await pasteList(user);

    expect(screen.getByLabelText('Jahrgang')).toBeInTheDocument();
    expect(screen.getByLabelText('GeR-Niveau')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('B1');
  });

  it('zeigt die Vorschlagswerkstatt, die der Textweg ausblendet', async () => {
    const user = setup();
    await pasteList(user);
    // Sie schlägt genau die Felder vor, die es hier auch gibt.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Vorschläge/ })).toBeInTheDocument(),
    );
  });
});

describe('CSV', () => {
  it('liest eine Datei und behält den vollen Umfang', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'CSV-Datei' }));

    const csv = 'Englisch;Deutsch;Schwierigkeit\nto apologise;sich entschuldigen;3\n';
    const datei = new File([csv], 'vokabeln.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('CSV-Datei auswählen'), datei);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Beispielsatz für to apologise bearbeiten/ }),
    );
    /*
      `within` auf den aufgeklappten Bereich: Bei einer CSV-Datei heißt auch
      eine Spaltenrolle „Schwierigkeit“, und die steht in der Zuordnungskarte
      darüber.
    */
    const details = document.querySelector('.details');
    expect(details).not.toBeNull();
    const feld = within(details as HTMLElement).getByLabelText('Schwierigkeit');
    await user.selectOptions(feld, '3');
    expect(feld).toHaveValue('3');
    expect(within(details as HTMLElement).getByLabelText('Themen-Tags')).toBeInTheDocument();
  });
});

describe('Paketimport', () => {
  function packMitAngaben(): VocabPack {
    const now = new Date().toISOString();
    return {
      meta: {
        id: newId(),
        title: 'Unit 3 – City life',
        topic: 'City life',
        grade: '7',
        cefrLevel: 'A2+',
        cefrLevelOverridden: false,
        direction: 'both',
        description: 'Ein vorhandener Hinweis.',
        createdAt: now,
        updatedAt: now,
      },
      entries: [
        {
          id: newId(),
          english: 'crowded',
          germanAnswers: ['überfüllt'],
          acceptedEnglishAnswers: ['crowded out'],
          partOfSpeech: 'adjective',
          exampleSentences: [{ english: 'The bus was crowded.', german: 'Der Bus war voll.' }],
          topicTags: ['City life', 'transport'],
          notes: 'Nicht mit „crowd“ verwechseln.',
          difficulty: 3,
          sourceType: 'import',
        },
      ],
    };
  }

  it('behält Schwierigkeit, Tags, Notiz und Alternativantworten sichtbar', async () => {
    /*
      Der Fall, der den vereinfachten Modus gefährlich machen würde: Hier
      **gibt** es die Angaben. Sie auszublenden hieße, gepflegte Daten
      unsichtbar zu machen – und beim nächsten Speichern womöglich zu
      verlieren.
    */
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'LexiFlow-Paket (.vocabpack.json)' }));

    const datei = new File([serializePack(packMitAngaben())], 'unit3.vocabpack.json', {
      type: 'application/json',
    });
    await user.upload(
      screen.getByLabelText('LexiFlow-Paket (.vocabpack.json) auswählen'),
      datei,
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    // Titel und Beschreibung kommen mit.
    expect(screen.getByLabelText('Titel')).toHaveValue('Unit 3 – City life');
    expect(screen.getByLabelText('Beschreibung (optional)')).toHaveValue('Ein vorhandener Hinweis.');

    await user.click(screen.getByRole('button', { name: /Beispielsatz für crowded bearbeiten/ }));
    expect(screen.getByLabelText('Schwierigkeit')).toHaveValue('3');
    expect(screen.getByLabelText('Themen-Tags')).toHaveValue('City life, transport');
    expect(screen.getByLabelText('Notiz')).toHaveValue('Nicht mit „crowd“ verwechseln.');
    expect(screen.getByLabelText(/Alternativantworten/)).toHaveValue('crowded out');
    // Und die deutsche Satzübersetzung steht ebenfalls da.
    expect(screen.getByLabelText('Beispielsatz 1 Deutsch, crowded')).toHaveValue(
      'Der Bus war voll.',
    );
  });
});

describe('Themenwerkstatt', () => {
  it('bleibt über ?quelle=thema erreichbar', async () => {
    setup('?quelle=thema');
    // Ohne Sprachmodell sagt sie das – und bietet den Weg über eine leere Liste.
    expect(
      await screen.findByText(/Themenwerkstatt ist in diesem Browser nicht verfügbar/),
    ).toBeInTheDocument();
  });

  it('führt über eine leere Liste in die Prüfung mit vollem Umfang', async () => {
    const user = setup('?quelle=thema');
    await screen.findByText(/Themenwerkstatt ist in diesem Browser nicht verfügbar/);

    await user.type(screen.getByRole('textbox', { name: /Thema/ }), 'City life');
    await user.click(screen.getByRole('button', { name: 'Leere Liste anlegen' }));

    await user.type(screen.getByLabelText('Englisch, Zeile 1'), 'crowded');
    await user.click(screen.getByRole('button', { name: /Beispielsatz für crowded bearbeiten/ }));
    expect(screen.getByLabelText('Themen-Tags')).toHaveValue('City life');
  });
});
