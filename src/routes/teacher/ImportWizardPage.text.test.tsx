import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImportWizardPage } from './ImportWizardPage';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { MAX_TEXT_LENGTH } from '../../domain/textExtraction';
import { createFakeTranslationProvider } from '../../test/fakeTranslator';
import type { TranslationProvider } from '../../translation/TranslationProvider';

const TEXT = 'The neighbourhood is crowded. Litter is a problem in the neighbourhood.';

function setup(provider?: TranslationProvider) {
  render(
    <ProviderRegistry {...(provider ? { value: { translation: provider } } : {})}>
      <MemoryRouter initialEntries={['/material/import?quelle=text']}>
        <Routes>
          <Route path="/material/import" element={<ImportWizardPage />} />
          <Route path="/material/:packId" element={<p>Paketseite</p>} />
        </Routes>
      </MemoryRouter>
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

async function analyze(user: ReturnType<typeof userEvent.setup>, text = TEXT): Promise<void> {
  await user.click(screen.getByLabelText('Englischer Text'));
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Text lokal analysieren' }));
}

describe('Textwerkstatt im Import-Assistenten', () => {
  it('startet über ?quelle=text direkt in der Textquelle', () => {
    setup();
    expect(screen.getByLabelText('Englischer Text')).toBeInTheDocument();
    expect(screen.getByText('Kandidaten prüfen')).toBeInTheDocument();
  });

  it('weist vor der Analyse auf die lokale Verarbeitung hin', () => {
    setup();
    expect(screen.getByText(/Der Text wird auf diesem Gerät verarbeitet/)).toBeInTheDocument();
    expect(screen.getByText(/wird nicht gespeichert und nicht exportiert/)).toBeInTheDocument();
  });

  it('führt vom Text über die Kandidaten in Vorschau und Metadaten', async () => {
    const user = setup();
    await analyze(user);

    expect(
      await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    // Weitergabe an die vorhandene DraftTable – keine zweite Editorlogik.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('crowded');
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('überfüllt');

    await user.click(screen.getByRole('button', { name: 'Weiter zu den Metadaten' }));

    // Weitergabe an das vorhandene MetadataForm.
    expect(screen.getByRole('heading', { name: 'Metadaten' })).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paket speichern (1 Vokabeln)' })).toBeInTheDocument();
  });

  it('übernimmt den Originalsatz als Beispielsatz', async () => {
    const user = setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    await user.click(screen.getByLabelText('Details für crowded öffnen'));
    expect(screen.getByDisplayValue('The neighbourhood is crowded.')).toBeInTheDocument();
  });

  it('lässt eine Zeile ohne deutsche Antwort sichtbar, aber nicht speicherbar', async () => {
    const user = setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('crowded');
    expect(screen.getByText(/Deutsche Übersetzung fehlt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weiter zu den Metadaten' })).toBeDisabled();
  });

  it('lehnt zu lange Texte verständlich ab, statt still zu kürzen', async () => {
    const user = setup();
    await analyze(user, 'a '.repeat(MAX_TEXT_LENGTH));
    expect(await screen.findByRole('alert')).toHaveTextContent(/20\.000 Zeichen/);
    expect(screen.getByLabelText('Englischer Text')).toBeInTheDocument();
  });

  it('erklärt einen Text ohne verwertbare Kandidaten', async () => {
    const user = setup();
    await analyze(user, 'The and or but is.');
    expect(await screen.findByRole('alert')).toHaveTextContent(/keine geeigneten Vokabelkandidaten/);
  });

  it('reicht einen übernommenen Vorschlag als text-ai in die Vorschau', async () => {
    const { provider } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyze(user);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('crowded-de');
  });
});
