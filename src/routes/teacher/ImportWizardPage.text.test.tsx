import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  await user.click(screen.getByRole('button', { name: /^Text (lokal )?analysieren/ }));
}

describe('Textwerkstatt im Import-Assistenten', () => {
  it('startet über ?quelle=text direkt in der Textquelle', () => {
    setup();
    expect(screen.getByLabelText('Englischer Text')).toBeInTheDocument();
    expect(screen.getByText('Kandidaten prüfen')).toBeInTheDocument();
  });

  it('sagt vor der Analyse genau, was gespeichert wird und was nicht', () => {
    setup();
    const notice = screen.getByText(/Der Text wird auf diesem Gerät verarbeitet/);

    // Der Gesamttext bleibt außen vor …
    expect(notice).toHaveTextContent(
      /vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/,
    );
    // … die Originalsätze der übernommenen Vokabeln aber nicht.
    expect(notice).toHaveTextContent(
      /Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze Teil des Pakets und beim Export mitgegeben/,
    );
    expect(notice).toHaveTextContent(/in der Vorschau bearbeiten oder entfernen/);
  });

  it('nennt denselben Umfang auch im Feldhinweis', () => {
    setup();
    expect(
      screen.getByText(/Gespeichert wird nur, was du übernimmst: die Vokabeln und ihre Originalsätze/),
    ).toBeInTheDocument();
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
    // Seit Sprint 3B.1a genügt der eine Klick auf die Hauptaktion: Die
    // Vorschläge laufen nach der Vorbereitung von selbst an.
    await analyze(user);

    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('crowded-de');
  });
});

describe('Lernkontext in der Vorschau', () => {
  it('teilt sich den Zustand mit dem Metadaten-Schritt', async () => {
    const user = setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    // Lernkontext in der Vorschau ausfüllen …
    expect(screen.getByRole('heading', { name: 'Lernkontext' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    await user.type(screen.getByLabelText(/^Thema/), 'City life');

    // … steht im nächsten Schritt bereits so da.
    await user.click(screen.getByRole('button', { name: 'Weiter zu den Metadaten' }));
    expect(screen.getByLabelText('Jahrgang')).toHaveValue('9');
    expect(screen.getByLabelText('Thema')).toHaveValue('City life');
    // Das GeR-Niveau folgt dem Jahrgang wie gewohnt.
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('B1');
  });

  it('erklärt, wofür der Lernkontext gebraucht wird', async () => {
    const user = setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    expect(
      screen.getByText(/helfen dabei, Schwierigkeit und Themen-Tags passend vorzuschlagen/),
    ).toBeInTheDocument();
  });
});

describe('Gewünschte Anzahl Vokabelvorschläge', () => {
  /** Ein Text mit deutlich mehr Kandidaten, als angefordert werden. */
  const LONG =
    'The crowded bus was late today. Litter is a problem in the neighbourhood. ' +
    'A quiet pavement helps everyone here. The crowded street was very noisy. ' +
    'Traffic makes the journey slow. A busy crossing needs patience.';

  it('lässt sich vor der Analyse festlegen', () => {
    setup();
    const select = screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge');

    for (const value of ['5', '10', '15', '20', '30']) {
      expect(within(select).getByRole('option', { name: `${value} Vokabelvorschläge` })).toBeInTheDocument();
    }
    expect(within(select).getByRole('option', { name: 'Andere Anzahl …' })).toBeInTheDocument();
    // Vorbelegt ist die gebräuchlichste Größe.
    expect(select).toHaveValue('20');
  });

  it('begrenzt die angezeigten Kandidaten auf die gewählte Anzahl', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge'), '5');
    await analyze(user, LONG);

    expect(await screen.findByRole('heading', { name: 'Gefundene Vokabelkandidaten (5)' }))
      .toBeInTheDocument();
    expect(screen.getByText('5 von 5 geeigneten Vokabeln gefunden.')).toBeInTheDocument();
  });

  it('erfindet nichts, wenn der Text weniger hergibt', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge'), '30');
    await analyze(user, TEXT);

    const found = screen.getAllByRole('checkbox', { name: /übernehmen$/ }).length;
    expect(found).toBeLessThan(30);
    expect(
      screen.getByText(new RegExp(`${found} von 30 geeigneten Vokabeln gefunden\\.`)),
    ).toBeInTheDocument();
    expect(screen.getByText(/erfunden wird nichts/)).toBeInTheDocument();
  });

  it('erlaubt eine eigene Zahl zwischen 1 und 50', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge'), 'custom');

    const field = screen.getByLabelText('Eigene Anzahl');
    expect(field).toHaveAttribute('min', '1');
    expect(field).toHaveAttribute('max', '50');

    await user.clear(field);
    await user.type(field, '3');
    await analyze(user, LONG);

    expect(await screen.findByRole('heading', { name: 'Gefundene Vokabelkandidaten (3)' }))
      .toBeInTheDocument();
    expect(screen.getByText('3 von 3 geeigneten Vokabeln gefunden.')).toBeInTheDocument();
  });

  it('hält eine unsinnige Eingabe im erlaubten Bereich', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge'), 'custom');

    const field = screen.getByLabelText('Eigene Anzahl');
    await user.clear(field);
    await user.type(field, '99');
    await user.tab();
    expect(field).toHaveValue(50);

    await user.clear(field);
    await user.type(field, '0');
    await user.tab();
    expect(field).toHaveValue(1);
  });

  it('funktioniert ohne jedes Sprachmodell', async () => {
    // Kein KI-Anbieter in der Registry – die Begrenzung ist rein lokal.
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Gewünschte Anzahl Vokabelvorschläge'), '5');
    await analyze(user, LONG);

    expect(screen.getAllByRole('checkbox', { name: /übernehmen$/ })).toHaveLength(5);
    expect(
      await screen.findByText(/Dieser Browser bietet kein lokales Sprachmodell/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1: Übersetzung im Hauptweg, Wortformen und Abkürzungen sichtbar
// ---------------------------------------------------------------------------

const BAY_TEXT = [
  'One island rises out of the water.',
  'Around 1,969 islands fill the bay, and the islands attract visitors.',
  'The protected area covers about 600 sq mi.',
].join(' ');

describe('Übersetzung im Hauptweg', () => {
  it('verspricht Übersetzungen nur, wenn es sie geben kann', async () => {
    // Ohne Anbieter bleibt es beim ehrlichen, rein lokalen Versprechen.
    setup();
    expect(
      await screen.findByRole('button', { name: 'Text lokal analysieren' }),
    ).toBeInTheDocument();
  });

  it('bietet mit ladbarem Modell die Analyse samt Übersetzungsvorschlägen an', async () => {
    const { provider } = createFakeTranslationProvider({ availability: 'downloadable' });
    setup(provider);

    expect(
      await screen.findByRole('button', { name: 'Text analysieren und Übersetzungen vorschlagen' }),
    ).toBeInTheDocument();
  });

  it('startet die Vorbereitung im Klickpfad, ohne auf sie zu warten', async () => {
    // `gatePrepare` lässt `prepare()` offen. Die Analyse muss trotzdem fertig
    // werden – sie ist rein lokal und hat mit dem Modell nichts zu tun.
    const { provider, prepareCount } = createFakeTranslationProvider({ gatePrepare: true });
    const user = setup(provider);
    await screen.findByRole('button', { name: 'Text analysieren und Übersetzungen vorschlagen' });

    await analyze(user);

    expect(prepareCount()).toBe(1);
    expect(await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ }))
      .toBeInTheDocument();
  });

  it('bleibt ohne Anbieter vollständig benutzbar und sagt warum', async () => {
    const user = setup();
    await analyze(user);

    expect(await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ }))
      .toBeInTheDocument();
    expect(screen.getByText(/keine lokale Übersetzung/i)).toBeInTheDocument();
    // Die deutsche Antwort lässt sich weiterhin von Hand eintragen.
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toBeEnabled();
  });
});

describe('Wortformen und Abkürzungen in der Prüfung', () => {
  it('zeigt die beobachteten Formen und ihre gemeinsame Häufigkeit', async () => {
    const user = setup();
    await analyze(user, BAY_TEXT);

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByText(/Im Text: islands, island · insgesamt 3-mal/)).toBeInTheDocument();
    expect(screen.getByText(/Plural: islands/)).toBeInTheDocument();
    // Und keine zweite Zeile für die Pluralform.
    expect(screen.queryByLabelText('Deutsche Antwort für „islands“')).not.toBeInTheDocument();
  });

  it('macht aus „600 sq mi“ einen Vorschlag mit bearbeitbarer Langform', async () => {
    const user = setup();
    await analyze(user, BAY_TEXT);

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    const longForm = screen.getByLabelText('Langform für „sq mi“');
    expect(longForm).toHaveValue('square mile (sq mi)');

    // Bruchstücke gibt es nicht mehr.
    expect(screen.queryByLabelText('Deutsche Antwort für „sq“')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Deutsche Antwort für „mi“')).not.toBeInTheDocument();
  });

  it('kennzeichnet eine unbekannte Abkürzung, statt sie zu erfinden', async () => {
    const user = setup();
    await analyze(user, 'The engine delivers 400 bhp on the long test track.');

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByLabelText('Langform für „bhp“')).toHaveValue('bhp');
    expect(screen.getByText('Abkürzung – Langform prüfen')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1a: Die Hauptaktion hält ihr Versprechen
// ---------------------------------------------------------------------------

describe('Ein Klick, ein Ablauf', () => {
  it('ruft prepare genau einmal auf und zeigt die Analyse sofort', async () => {
    // `gatePrepare` hält die Vorbereitung offen: Die Analyse darf trotzdem
    // nicht auf sie warten.
    const { provider, prepareCount, releasePrepare } = createFakeTranslationProvider({
      gatePrepare: true,
    });
    const user = setup(provider);
    await screen.findByRole('button', { name: 'Text analysieren und Übersetzungen vorschlagen' });

    await analyze(user);

    expect(await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ }))
      .toBeInTheDocument();
    expect(prepareCount()).toBe(1);
    // Solange die Vorbereitung läuft, gibt es noch keinen Vorschlag.
    expect(screen.queryByText('crowded-de')).not.toBeInTheDocument();

    releasePrepare();

    // Kein zweiter Klick: Die Vorschläge laufen von selbst an.
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
  });

  it('lässt die deutschen Felder leer, bis ein Vorschlag übernommen wird', async () => {
    const { provider } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyze(user);

    await screen.findByText('crowded-de');
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('crowded-de');
  });

  it('meldet eine gescheiterte Vorbereitung und wiederholt sie erfolgreich', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ prepareFailures: 1 });
    const user = setup(provider);
    await analyze(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/konnte nicht geladen werden/);
    expect(alert).toHaveTextContent(/von Hand eintragen/);
    // Die Handeingabe funktioniert weiterhin.
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(2);
  });

  it('erzeugt ohne Anbieter gar keine Vorbereitung', async () => {
    const user = setup();
    await analyze(user);

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByText(/keine lokale Übersetzung/i)).toBeInTheDocument();
    expect(screen.queryByText(/wird vorbereitet/)).not.toBeInTheDocument();
  });
});

describe('Lokale Abkürzungsvorschläge', () => {
  const UNIT_TEXT = 'The protected area covers about 600 sq mi of calm water.';

  it('zeigt die bekannte deutsche Entsprechung auch ohne Übersetzungsmodell', async () => {
    const user = setup();
    await analyze(user, UNIT_TEXT);

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByLabelText('Langform für „sq mi“')).toHaveValue('square mile (sq mi)');
    expect(screen.getByText('lokaler Vorschlag')).toBeInTheDocument();
    expect(screen.getByText('die Quadratmeile')).toBeInTheDocument();
  });

  it('trägt den Vorschlag erst nach ausdrücklicher Übernahme ein', async () => {
    const user = setup();
    await analyze(user, UNIT_TEXT);

    const field = await screen.findByLabelText('Deutsche Antwort für „square mile (sq mi)“');
    expect(field).toHaveValue('');

    await user.click(
      screen.getByRole('button', { name: 'Vorschlag für square mile (sq mi) übernehmen' }),
    );
    expect(field).toHaveValue('die Quadratmeile');
  });

  it('erfindet für eine unbekannte Abkürzung keine Übersetzung', async () => {
    const user = setup();
    await analyze(user, 'The heavy engine delivers 400 bhp on the long test track.');

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByLabelText('Deutsche Antwort für „bhp“')).toHaveValue('');
    expect(screen.getByText('Abkürzung – Langform prüfen')).toBeInTheDocument();
    expect(screen.queryByText('lokaler Vorschlag')).not.toBeInTheDocument();
  });

  it('wählt eine ungeklärte Abkürzung nicht von selbst aus', async () => {
    const user = setup();
    await analyze(user, 'The heavy engine delivers 400 bhp on the long test track.');

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    expect(screen.getByLabelText('bhp übernehmen')).not.toBeChecked();
    expect(screen.getByLabelText('engine übernehmen')).toBeChecked();
  });

  it('zählt ungeklärte Abkürzungen getrennt', async () => {
    const user = setup();
    await analyze(user, 'The heavy engine delivers 400 bhp on the long test track.');

    await screen.findByRole('heading', { name: /Gefundene Vokabelkandidaten/ });
    // Der Satz steht sichtbar **und** in der Vorlesehilfe – hier zählt der
    // sichtbare, deshalb die genaue Fassung.
    expect(
      screen.getByText(
        '6 von 20 geeigneten Vokabeln gefunden · 1 Abkürzung muss geprüft werden. ' +
          'Der Text enthält nicht mehr geeignete Kandidaten – erfunden wird nichts.',
        { exact: true },
      ),
    ).toBeInTheDocument();
  });
});
