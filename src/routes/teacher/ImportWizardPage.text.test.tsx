import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImportWizardPage } from './ImportWizardPage';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { MAX_TEXT_LENGTH } from '../../domain/textExtraction';
import { createFakeTranslationProvider } from '../../test/fakeTranslator';
import type { TranslationProvider } from '../../translation/TranslationProvider';
import type { ProviderState } from '../../providers/state';

/**
 * Der Import-Assistent auf dem Textweg – jetzt in drei Schritten:
 * **Text analysieren → Empfehlungen generieren → Prüfen & Speichern**.
 *
 * Der Empfehlungsschritt ist neu dazwischengetreten und ändert den Rhythmus:
 * Die Analyse liefert Kandidaten, aber noch keine Liste zum Abhaken. Erst ein
 * ausdrücklicher Klick erzeugt Empfehlungen – und was dabei entsteht, wird
 * übernommen, sobald es eine deutsche Antwort hat.
 */

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

type User = ReturnType<typeof userEvent.setup>;

async function analyze(user: User, text = TEXT): Promise<void> {
  await user.click(screen.getByLabelText('Englischer Text'));
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Text analysieren' }));
}

/**
 * Der zweite Schritt in einem Aufruf.
 *
 * Die Anzahl steht auf 20, damit die geprüften Wörter der kurzen Testtexte
 * sicher dabei sind – die Rangfolge selbst prüft `recommendation.test.ts`.
 */
async function recommend(user: User): Promise<void> {
  const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
  await waitFor(() => expect(knopf).toBeEnabled(), { timeout: 20000 });
  await user.selectOptions(screen.getByLabelText('Anzahl'), '20');
  await user.click(knopf);
}

async function analyzeAndRecommend(user: User, text = TEXT): Promise<void> {
  await analyze(user, text);
  await recommend(user);
}

/** Antworten eintragen und in den letzten Schritt gehen. */
async function toReview(user: User, word: string, answer: string): Promise<void> {
  await user.type(screen.getByLabelText(`Deutsche Antwort für „${word}“`), answer);
  await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));
}

describe('Der Weg durch die drei Schritte', () => {
  it('startet über ?quelle=text direkt in der Textquelle', () => {
    setup();
    expect(screen.getByLabelText('Englischer Text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(
      screen.getByRole('button', { name: /Schritt 2: Empfehlungen generieren/ }),
    ).toBeInTheDocument();
  });

  it('macht die späteren Schritte erst erreichbar, wenn sie es sind', async () => {
    const user = setup();
    const zweiter = () =>
      screen.getByRole('button', { name: /Schritt 2: Empfehlungen generieren/ });
    const dritter = () => screen.getByRole('button', { name: /Schritt 3: Prüfen & Speichern/ });
    expect(zweiter()).toBeDisabled();
    expect(dritter()).toBeDisabled();

    await analyze(user);
    await waitFor(() => expect(zweiter()).toBeEnabled());
    // Der dritte bleibt gesperrt, solange keine Vokabel übernommen wird.
    expect(dritter()).toBeDisabled();
  });

  it('führt vom Text über die Empfehlungen bis zum Speichern', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    expect(screen.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeInTheDocument();
    await toReview(user, 'crowded', 'überfüllt');

    // Weitergabe an die vorhandene DraftTable – keine zweite Editorlogik.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('crowded');
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('überfüllt');

    // Titel und Speichern stehen in **demselben** Schritt wie die Tabelle.
    expect(screen.getByLabelText('Titel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paket speichern (1 Vokabeln)' })).toBeInTheDocument();
  });

  it('hält den Zustand fest, wenn man im Stepper zurückspringt', async () => {
    /*
      Der wichtigste Test dieses Sprints. Ein Stepper, der beim Zurückgehen die
      Arbeit vergisst, ist schlimmer als gar keiner: Er lädt zu einem Klick
      ein, der etwas kostet.
    */
    const user = setup();
    await analyzeAndRecommend(user);
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    // In den ersten Schritt und wieder zurück.
    await user.click(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' }));
    expect(screen.getByLabelText('Englischer Text')).toHaveValue(TEXT);
    await user.click(screen.getByRole('button', { name: /Schritt 2: Empfehlungen generieren/ }));

    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  it('übernimmt den Originalsatz als Beispielsatz', async () => {
    const user = setup();
    await analyzeAndRecommend(user);
    await toReview(user, 'crowded', 'überfüllt');

    await user.click(screen.getByLabelText(/Beispielsatz für crowded anzeigen/));
    expect(screen.getByDisplayValue('The neighbourhood is crowded.')).toBeInTheDocument();
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

  it('reicht einen übernommenen Vorschlag als text-ai weiter', async () => {
    const { provider } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyzeAndRecommend(user);

    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: /Vorschlag .+ für crowded übernehmen/ }));
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('crowded-de');
  });
});

describe('Der Datenschutzhinweis steht als kleines i hinter der Überschrift', () => {
  it('ist zunächst zugeklappt und trägt seinen Namen im aria-label', () => {
    setup();
    const knopf = screen.getByRole('button', { name: 'Hinweis zur Textverarbeitung' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(knopf).toHaveAttribute('aria-controls');
    expect(screen.queryByText(/Der Text wird auf diesem Gerät verarbeitet/)).not.toBeInTheDocument();
    // Der alte, beschriftete Knopf ist weg.
    expect(
      screen.queryByRole('button', { name: 'Was passiert mit meinem Text?' }),
    ).not.toBeInTheDocument();
  });

  it('steht direkt hinter „Woher kommen die Vokabeln?“', () => {
    setup();
    const kopf = screen.getByRole('heading', { name: 'Woher kommen die Vokabeln?' }).parentElement;
    expect(kopf).toContainElement(screen.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }));
  });

  it('schließt mit Escape und gibt den Fokus zurück', async () => {
    const user = setup();
    const knopf = screen.getByRole('button', { name: 'Hinweis zur Textverarbeitung' });
    await user.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(knopf).toHaveFocus();
  });

  it('sagt aufgeklappt genau, was gespeichert wird und was nicht', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }));
    const panel = screen.getByRole('group', { name: 'Verarbeitung auf diesem Gerät' });

    // Der Gesamttext bleibt außen vor …
    expect(panel).toHaveTextContent(
      /vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/,
    );
    // … die Originalsätze der übernommenen Vokabeln aber nicht.
    expect(panel).toHaveTextContent(
      /Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze Teil des Pakets und beim Export mitgegeben/,
    );
    expect(panel).toHaveTextContent(/Prüfen & Speichern/);
  });

  it('nennt denselben Umfang auch im Feldhinweis', () => {
    setup();
    expect(
      screen.getByText(
        /Gespeichert wird nur, was du übernimmst: die Vokabeln und ihre Originalsätze/,
      ),
    ).toBeInTheDocument();
  });
});

describe('Die Schalter vor der Analyse sind weg', () => {
  it('fragt nicht mehr nach Funktionswörtern, Eigennamen und Anzahl', () => {
    /*
      Alle drei verlangten eine Entscheidung über einen Text, den noch niemand
      gesehen hatte. Die Anzahl steht jetzt im Empfehlungsschritt – dort lässt
      sie sich ändern, ohne neu zu analysieren.
    */
    setup();
    expect(screen.queryByText(/Funktionswörter einblenden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Eigennamen einblenden/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Gewünschte Anzahl Vokabelvorschläge'),
    ).not.toBeInTheDocument();
  });

  it('bietet die Anzahl stattdessen im Empfehlungsschritt an', async () => {
    const user = setup();
    await analyze(user);
    expect(await screen.findByLabelText('Anzahl')).toBeInTheDocument();
  });
});

describe('Der Stepper im Assistenten', () => {
  it('beginnt bei Schritt 1 und lässt die übrigen gesperrt', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(
      screen.getByRole('button', { name: /Schritt 2: Empfehlungen generieren/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /Schritt 3: Prüfen & Speichern/ })).toBeDisabled();
  });

  it('gibt Schritt 3 erst frei, wenn eine Vokabel übernommen wird', async () => {
    const user = setup();
    await analyzeAndRecommend(user);
    expect(screen.getByRole('button', { name: /Schritt 3: Prüfen & Speichern/ })).toBeDisabled();

    await toReview(user, 'crowded', 'überfüllt');
    expect(screen.getByRole('button', { name: /Schritt 3: Prüfen & Speichern/ })).toBeEnabled();
  });

  it('bewahrt bei 3 → 2 → 3 alle Eingaben beider Schritte', async () => {
    /*
      Der Test, für den es den Stepper gibt. Wer im letzten Schritt merkt, dass
      eine Vokabel fehlt, geht zurück, ergänzt sie und kommt wieder – Titel,
      Beschreibung und Lernrichtung müssen dann noch dastehen, und die
      Empfehlungen ebenso.
    */
    const user = setup();
    await analyzeAndRecommend(user);
    await toReview(user, 'crowded', 'überfüllt');

    await user.type(screen.getByLabelText('Titel'), 'Unit 3');
    await user.type(screen.getByLabelText('Beschreibung (optional)'), 'Kurzer Hinweis.');
    await user.selectOptions(screen.getByLabelText('Lernrichtung'), 'de-en');

    // Zurück in Schritt 2 …
    await user.click(screen.getByRole('button', { name: /Schritt 2: Empfehlungen generieren/ }));
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
    await user.type(screen.getByLabelText('Deutsche Antwort für „litter“'), 'Müll');

    // … und wieder nach vorn.
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));
    expect(screen.getByLabelText('Titel')).toHaveValue('Unit 3');
    expect(screen.getByLabelText('Beschreibung (optional)')).toHaveValue('Kurzer Hinweis.');
    expect(screen.getByLabelText('Lernrichtung')).toHaveValue('de-en');
    expect(screen.getByText(/^2 Zeilen ·/)).toBeInTheDocument();
  });

  it('ist mit der Tastatur bedienbar und setzt den Fokus sichtbar', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    /*
      Erst abwarten, dass die Anwendung ihren Fokus gesetzt hat.

      Nach dem Empfehlungslauf wandert der Fokus auf die Ergebnisüberschrift –
      absichtlich, damit nach dem Klick niemand oben stehen bleibt und die neue
      Liste unten übersieht (`TextCandidateReview`). Das passiert in einem
      `requestAnimationFrame`, also **nach** dem Klick, um den es hier gar
      nicht geht.

      Wer davor den Stepper fokussiert, verliert den Fokus einen Wimpernschlag
      später wieder an die Überschrift; `{Enter}` läuft dann ins Leere, und der
      Test scheitert – aber nicht an der Tastaturbedienung, sondern daran, dass
      er zwei Dinge gleichzeitig getan hat. Genau das war die Ursache des
      sporadischen Fehlschlags in der vollen Suite: nichts Langsames, sondern
      ein Rennen um den Fokus.
    */
    const ergebnis = await screen.findByRole('heading', { name: /Vorgeschlagene Vokabeln/ });
    await waitFor(() => expect(ergebnis).toHaveFocus());

    const erster = screen.getByRole('button', { name: 'Schritt 1: Text analysieren' });
    erster.focus();
    expect(erster).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByLabelText('Englischer Text')).toBeInTheDocument();
    await waitFor(() => expect(erster).toHaveAttribute('aria-current', 'step'));
  });

  it('zeigt für andere Quellen nur zwei Schritte', () => {
    /*
      Aus einer CSV-Datei gibt es nichts zu empfehlen – dort stehen die
      Vokabeln schon. Ein Schritt, den es für diese Quelle nicht gibt, wird
      nicht angezeigt.
    */
    render(
      <ProviderRegistry>
        <MemoryRouter initialEntries={['/material/import']}>
          <Routes>
            <Route path="/material/import" element={<ImportWizardPage />} />
          </Routes>
        </MemoryRouter>
      </ProviderRegistry>,
    );
    expect(screen.getByRole('button', { name: 'Schritt 1: Quelle wählen' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Schritt 2: Prüfen & Speichern/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Empfehlungen generieren/ })).not.toBeInTheDocument();
  });
});

describe('Schritt 3 zeigt im Textimport nur, was es wirklich gibt', () => {
  async function toStepThree(user: User): Promise<void> {
    await analyzeAndRecommend(user);
    await toReview(user, 'crowded', 'überfüllt');
  }

  it('zeigt genau die vorgesehenen Angaben', async () => {
    const user = setup();
    await toStepThree(user);

    expect(screen.getByLabelText('Titel')).toBeInTheDocument();
    expect(screen.getByLabelText('Beschreibung (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Lernrichtung')).toBeInTheDocument();
    expect(screen.getByText(/Lernkontext:/)).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Wortart, Zeile 1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Beispielsatz für crowded anzeigen/ }),
    ).toBeInTheDocument();
  });

  it('zeigt Schwierigkeit und Themen-Tags nirgends – auch nicht aufgeklappt', async () => {
    /*
      Der Kern der Nachbesserung: Sie aus der Tabelle in den aufgeklappten
      Bereich zu schieben war keine Vereinfachung, sondern eine Umzugskiste.
      Für eine aus einem Artikel gehobene Vokabel kennt niemand ihre
      Schwierigkeit, und ein leeres Themen-Tag-Feld fragt nach etwas, das
      es nicht gibt.
    */
    const user = setup();
    await toStepThree(user);

    expect(screen.queryByLabelText(/Schwierigkeit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Themen-Tags/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Beispielsatz für crowded anzeigen/ }));

    expect(screen.queryByLabelText(/Schwierigkeit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Themen-Tags/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notiz/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Alternativantworten/)).not.toBeInTheDocument();
  });

  it('lässt im aufgeklappten Bereich nur den Beispielsatz und sein Entfernen', async () => {
    const user = setup();
    await toStepThree(user);
    await user.click(screen.getByRole('button', { name: /Beispielsatz für crowded anzeigen/ }));

    expect(screen.getByLabelText('Beispielsatz 1 Englisch, crowded')).toHaveValue(
      'The neighbourhood is crowded.',
    );
    expect(
      screen.getByRole('button', { name: 'Beispielsatz 1 entfernen, crowded' }),
    ).toHaveTextContent('Entfernen');

    // Ohne deutsche Satzübersetzung gibt es auch kein Feld dafür.
    expect(screen.queryByLabelText('Beispielsatz 1 Deutsch, crowded')).not.toBeInTheDocument();
    // Und kein Umsortieren, kein Hinzufügen, kein Satzassistent.
    expect(screen.queryByRole('button', { name: /nach oben/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Beispielsatz hinzufügen/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Satzassistent/)).not.toBeInTheDocument();
  });

  it('zeigt die deutsche Satzübersetzung, wenn es eine gibt', async () => {
    const { provider } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyzeAndRecommend(user);

    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: /Vorschlag .+ für crowded übernehmen/ }));
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));
    await user.click(screen.getByRole('button', { name: /Beispielsatz für crowded anzeigen/ }));

    expect(screen.getByLabelText('Beispielsatz 1 Deutsch, crowded')).toHaveValue(
      'The neighbourhood is crowded.-de',
    );
  });

  it('nimmt nur beantwortete Empfehlungen mit', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    const offen = screen.getAllByLabelText(/^Deutsche Antwort für/).length;
    expect(offen).toBeGreaterThan(1);

    await toReview(user, 'crowded', 'überfüllt');
    // Genau eine Zeile – die anderen Empfehlungen blieben offen und bleiben dort.
    expect(screen.getAllByRole('row')).toHaveLength(2); // Kopfzeile + eine Vokabel
    expect(screen.getByText(/^1 Zeilen ·/)).toBeInTheDocument();
  });
});

describe('GeR folgt dem Jahrgang, bis jemand widerspricht', () => {
  it('schlägt zum Jahrgang vor', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '5');
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('A1+');

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('B1');
  });

  it('lässt eine manuelle Wahl auch beim Jahrgangswechsel stehen', async () => {
    /*
      Der Punkt der Überschreibung: Wer das Niveau bewusst gesetzt hat, will es
      nicht beim nächsten Klick auf den Jahrgang wieder verlieren.
    */
    const user = setup();
    await analyzeAndRecommend(user);

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    await user.selectOptions(screen.getByLabelText('GeR-Niveau'), 'B2');
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('B2');

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '7');
    expect(screen.getByLabelText('GeR-Niveau')).toHaveValue('B2');
  });

  it('trägt den Themenvorschlag aus dem Text ein, statt ihn nur anzudeuten', async () => {
    const user = setup();
    await analyzeAndRecommend(
      user,
      'Coastal Erosion in Cornwall\n\nErosion threatens the settlement. Erosion is measured yearly.',
    );

    const thema = screen.getByLabelText('Thema');
    expect(thema).toHaveValue('Coastal Erosion in Cornwall');
    expect(thema).toHaveAccessibleDescription(/Aus der Überschrift des Textes vorgeschlagen/);

    // Und er ist ein ganz normales Feld.
    await user.clear(thema);
    await user.type(thema, 'City life');
    expect(thema).toHaveValue('City life');
  });

  it('erfindet kein Thema, wenn nichts heraussticht', async () => {
    const user = setup();
    await analyzeAndRecommend(user, 'One two three four five six seven eight nine.');
    expect(screen.getByLabelText('Thema')).toHaveValue('');
    expect(screen.getByLabelText('Thema')).toHaveAccessibleDescription(
      /ließ sich kein Thema ableiten/,
    );
  });
});

describe('Der Lernkontext wird nur einmal gesetzt', () => {
  it('steht im letzten Schritt kompakt und unveränderlich da', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    await toReview(user, 'crowded', 'überfüllt');

    // Kein zweites Auswahlfeld für dieselbe Entscheidung. Der Empfehlungsschritt
    // bleibt eingehängt, ist aber `hidden` – und damit aus dem Baum der
    // Hilfstechnik heraus.
    expect(screen.queryByRole('combobox', { name: 'Jahrgang' })).not.toBeInTheDocument();
    expect(screen.getByText(/Lernkontext:/)).toHaveTextContent(/Klasse 9/);
    expect(screen.getByText(/Lernkontext:/)).toHaveTextContent(/B1/);
    expect(screen.getByText(/Lernkontext:/)).toHaveTextContent(
      /im Schritt „Empfehlungen generieren“ änderbar/,
    );
  });

  it('behält die optionale Beschreibung bis ins Paket', async () => {
    const user = setup();
    await analyzeAndRecommend(user);
    await toReview(user, 'crowded', 'überfüllt');

    const feld = screen.getByLabelText('Beschreibung (optional)');
    expect(feld).toHaveValue('');
    await user.type(feld, 'Achte auf die Adjektive.');
    expect(feld).toHaveValue('Achte auf die Adjektive.');
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
  it('heißt überall gleich und verspricht nichts, was der Browser nicht kann', async () => {
    /*
      Die Beschriftung hieß früher je nach Browserlage anders. Der Schritt
      heißt aber „Text analysieren“, und genau das tut die Schaltfläche
      überall. Was das Sprachmodell zusätzlich kostet, steht als Satz darunter
      – nicht als Versprechen im Knopf.
    */
    setup();
    expect(await screen.findByRole('button', { name: 'Text analysieren' })).toBeInTheDocument();
    expect(screen.queryByText(/Sprachmodell im Hintergrund vorbereitet/)).not.toBeInTheDocument();
  });

  it('sagt vorher, dass beim Analysieren ein Modell geladen wird', async () => {
    const { provider } = createFakeTranslationProvider({ availability: 'downloadable' });
    setup(provider);
    expect(
      await screen.findByText(/Sprachmodell im Hintergrund vorbereitet/),
    ).toBeInTheDocument();
  });

  it('startet die Vorbereitung im Klickpfad, ohne auf sie zu warten', async () => {
    // `gatePrepare` lässt `prepare()` offen. Die Analyse muss trotzdem fertig
    // werden – sie ist rein lokal und hat mit dem Modell nichts zu tun.
    const { provider, prepareCount } = createFakeTranslationProvider({ gatePrepare: true });
    const user = setup(provider);
    await screen.findByText(/Sprachmodell im Hintergrund vorbereitet/);

    await analyze(user);

    expect(prepareCount()).toBe(1);
    expect(
      await screen.findByRole('heading', { name: 'Empfehlungen generieren' }),
    ).toBeInTheDocument();
  });

  it('bleibt ohne Anbieter vollständig benutzbar und sagt warum', async () => {
    const user = setup();
    await analyzeAndRecommend(user);

    // Seit 4B.2 steht die Begründung im benannten Aufklapper unter den
    // Ergebnissen statt als Kasten davor.
    await user.click(
      screen.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ }),
    );
    expect(screen.getByText(/keine lokale Übersetzung/i)).toBeInTheDocument();
    // Die deutsche Antwort lässt sich weiterhin von Hand eintragen.
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toBeEnabled();
  });
});

describe('Wortformen und Abkürzungen im Empfehlungsschritt', () => {
  it('zeigt die beobachteten Formen und ihre gemeinsame Häufigkeit', async () => {
    const user = setup();
    await analyzeAndRecommend(user, BAY_TEXT);

    /*
      Die beobachteten Formen stehen seit 4B.2 im Aufklapper „Formen im Text
      und Herkunft“ – in der Karte selbst steht das Wort, die Häufigkeit, der
      Satz und die Antwort. Der Aufklapper ist benannt, nicht „Details“.
    */
    const zeile = screen.getByLabelText('Deutsche Antwort für „island“').closest('li');
    if (!zeile) throw new Error('Keine Zeile für island');
    await user.click(within(zeile).getByRole('button', { name: /Formen im Text/ }));

    expect(screen.getByText(/Im Text: islands, island · insgesamt 3-mal/)).toBeInTheDocument();
    expect(screen.getByText(/Plural: islands/)).toBeInTheDocument();
    // Und keine zweite Zeile für die Pluralform.
    expect(screen.queryByLabelText('Deutsche Antwort für „islands“')).not.toBeInTheDocument();
  });

  it('macht aus „600 sq mi“ einen Vorschlag mit bearbeitbarer Langform', async () => {
    const user = setup();
    await analyzeAndRecommend(user, BAY_TEXT);

    expect(screen.getByLabelText('Langform für „sq mi“')).toHaveValue('square mile (sq mi)');

    // Bruchstücke gibt es nicht mehr.
    expect(screen.queryByLabelText('Deutsche Antwort für „sq“')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Deutsche Antwort für „mi“')).not.toBeInTheDocument();
  });

  it('kennzeichnet eine unbekannte Abkürzung, statt sie zu erfinden', async () => {
    const user = setup();
    await analyzeAndRecommend(user, 'The engine delivers 400 bhp on the long test track.');

    expect(screen.getByLabelText('Langform für „bhp“')).toHaveValue('bhp');
    expect(screen.getByText('Abkürzung – Langform prüfen')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1a: Die Hauptaktion hält ihr Versprechen – jetzt eine Stufe später
// ---------------------------------------------------------------------------

describe('Ein Klick, ein Ablauf', () => {
  it('bereitet beim Analysieren vor und löst das Versprechen beim Empfehlen ein', async () => {
    /*
      Die Reihenfolge hat sich verschoben, das Versprechen nicht: Der
      Modelldownload beginnt beim Analysieren, aber Vorschläge kann es erst
      geben, wenn es Empfehlungen gibt. Ein früherer Entwurf übersetzte sofort
      nach der Vorbereitung – über eine Zeilenliste, die zu diesem Zeitpunkt
      noch leer war, und lieferte deshalb gar nichts.
    */
    const { provider, prepareCount, releasePrepare } = createFakeTranslationProvider({
      gatePrepare: true,
    });
    const user = setup(provider);
    await analyze(user);

    expect(prepareCount()).toBe(1);
    releasePrepare();
    await screen.findByText(/Sprachmodell ist bereit/);

    await recommend(user);

    // Kein zweiter Klick auf das Modell: Die Vorschläge laufen von selbst an.
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
  });

  it('übersetzt nach dem Empfehlen, wenn die Vorbereitung länger dauert', async () => {
    const { provider, prepareCount, releasePrepare } = createFakeTranslationProvider({
      gatePrepare: true,
    });
    const user = setup(provider);
    await analyzeAndRecommend(user);

    // Solange die Vorbereitung läuft, gibt es noch keinen Vorschlag.
    expect(screen.queryByText('crowded-de')).not.toBeInTheDocument();

    releasePrepare();
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
  });

  it('lässt die deutschen Felder leer, bis ein Vorschlag übernommen wird', async () => {
    const { provider } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyzeAndRecommend(user);

    await screen.findByText('crowded-de');
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Vorschlag .+ für crowded übernehmen/ }));
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('crowded-de');
  });

  it('meldet eine gescheiterte Vorbereitung und wiederholt sie erfolgreich', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ prepareFailures: 1 });
    const user = setup(provider);
    await analyzeAndRecommend(user);

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
    await analyzeAndRecommend(user);

    await user.click(
      screen.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ }),
    );
    expect(screen.getByText(/keine lokale Übersetzung/i)).toBeInTheDocument();
    expect(screen.queryByText(/wird vorbereitet/)).not.toBeInTheDocument();
  });
});

describe('Lokale Abkürzungsvorschläge', () => {
  const UNIT_TEXT = 'The protected area covers about 600 sq mi of calm water.';

  it('zeigt die bekannte deutsche Entsprechung auch ohne Übersetzungsmodell', async () => {
    const user = setup();
    await analyzeAndRecommend(user, UNIT_TEXT);

    expect(screen.getByLabelText('Langform für „sq mi“')).toHaveValue('square mile (sq mi)');
    expect(screen.getByText('lokal')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Vorschlag „die Quadratmeile“ für square mile/ }),
    ).toBeInTheDocument();
  });

  it('trägt den Vorschlag erst nach ausdrücklicher Übernahme ein', async () => {
    const user = setup();
    await analyzeAndRecommend(user, UNIT_TEXT);

    const field = screen.getByLabelText('Deutsche Antwort für „square mile (sq mi)“');
    expect(field).toHaveValue('');

    await user.click(
      screen.getByRole('button', { name: /Vorschlag .+ für square mile \(sq mi\) übernehmen/ }),
    );
    expect(field).toHaveValue('die Quadratmeile');
  });

  it('erfindet für eine unbekannte Abkürzung keine Übersetzung', async () => {
    const user = setup();
    await analyzeAndRecommend(user, 'The heavy engine delivers 400 bhp on the long test track.');

    expect(screen.getByLabelText('Deutsche Antwort für „bhp“')).toHaveValue('');
    expect(screen.getByText('Abkürzung – Langform prüfen')).toBeInTheDocument();
    expect(screen.queryByText('lokal')).not.toBeInTheDocument();
  });

  it('nimmt eine ungeklärte Abkürzung nicht ins Paket, solange sie offen ist', async () => {
    /*
      Früher blieb hier ein Häkchen aus. Jetzt entscheidet die Antwort: Ohne
      deutsche Antwort geht die Zeile nicht mit – und das steht in der
      Zählung, statt in einem stillen Kästchen.
    */
    const user = setup();
    await analyzeAndRecommend(user, 'The heavy engine delivers 400 bhp on the long test track.');

    await user.type(screen.getByLabelText('Deutsche Antwort für „engine“'), 'der Motor');
    expect(screen.getByLabelText('Deutsche Antwort für „bhp“')).toHaveValue('');
    expect(screen.getByRole('button', { name: '1 Vokabel prüfen & speichern' })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1b: Der erste Modelldownload bleibt sichtbar und abbrechbar
// ---------------------------------------------------------------------------

describe('Fortschritt und Abbruch der Vorbereitung', () => {
  it('zeigt Fortschritt, der schon vor dem Öffnen des Schritts gemeldet wurde', async () => {
    // Der Fake meldet 0.25 und 0.75 noch innerhalb von `prepare()` – also
    // bevor der Empfehlungsschritt überhaupt steht.
    const { provider, releasePrepare } = createFakeTranslationProvider({
      gatePrepare: true,
      progress: [0.25, 0.75],
    });
    const user = setup(provider);
    await analyze(user);

    // Der zuletzt gemeldete Wert steht sofort da, nichts ist verloren gegangen.
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveValue(0.75));
    expect(screen.getAllByText('75 %').length).toBeGreaterThan(0);

    releasePrepare();
    await recommend(user);
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
  });

  it('bricht den laufenden Modelldownload wirklich ab', async () => {
    const { provider, translated } = createFakeTranslationProvider({ gatePrepare: true });
    const user = setup(provider);
    await analyze(user);

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    // Verständlich benannt – ein Abbruch ist kein Modellfehler.
    expect(await screen.findByText('Laden abgebrochen.', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Und es wurde nichts übersetzt.
    expect(translated).toEqual([]);
  });

  it('erlaubt nach dem Abbruch einen erfolgreichen neuen Versuch', async () => {
    const { provider, prepareCount, releasePrepare } = createFakeTranslationProvider({
      gatePrepare: true,
    });
    const user = setup(provider);
    await analyze(user);

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await screen.findByText('Laden abgebrochen.', { exact: true });
    expect(prepareCount()).toBe(1);

    // Der Neuversuch bekommt einen eigenen AbortController.
    releasePrepare();
    await recommend(user);
    await user.click(
      screen.getByRole('button', { name: /Vorschläge erzeugen|Sprachmodell laden/ }),
    );

    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(2);
  });

  it('lädt kein Modell für einen zu langen Text', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyze(user, 'a '.repeat(MAX_TEXT_LENGTH));

    expect(await screen.findByRole('alert')).toHaveTextContent(/20\.000 Zeichen/);
    expect(prepareCount()).toBe(0);
  });

  it('lädt kein Modell, wenn der Text nichts Brauchbares enthält', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider();
    const user = setup(provider);
    await analyze(user, 'The and or but is.');

    expect(await screen.findByRole('alert')).toHaveTextContent(/keine geeigneten Vokabelkandidaten/);
    expect(prepareCount()).toBe(0);
  });

  it('bricht die Vorbereitung ab, wenn der Schritt verlassen wird', async () => {
    const { provider } = createFakeTranslationProvider({ gatePrepare: true });
    const user = setup(provider);
    await analyzeAndRecommend(user);

    await user.click(screen.getByRole('button', { name: 'Zurück zum Text' }));

    // Zurück in der Textquelle – und keine späten Zustandsänderungen.
    expect(await screen.findByLabelText('Englischer Text')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1b: Ein verspäteter Zustandsbericht darf nicht zurückstufen
// ---------------------------------------------------------------------------

describe('Rennen zwischen Verfügbarkeit und Vorbereitung', () => {
  it('bleibt nach erfolgreicher Vorbereitung auf „bereit“', async () => {
    // Ein Anbieter, dessen `getAvailability` offen bleibt und erst *nach* der
    // gelungenen Vorbereitung antwortet – mit dem veralteten „downloadable“.
    const base = createFakeTranslationProvider();
    let answerAvailability: (state: ProviderState) => void = () => undefined;
    const late = new Promise<ProviderState>((resolve) => {
      answerAvailability = resolve;
    });

    // Die Werkstatt fragt zuerst und bekommt sofort Antwort; der
    // Empfehlungsschritt fragt danach – und seine Antwort kommt erst nach der
    // Vorbereitung.
    let asked = 0;
    const provider: TranslationProvider = {
      ...base.provider,
      getAvailability: () => {
        asked += 1;
        return asked === 1 ? Promise.resolve('downloadable' as ProviderState) : late;
      },
    };

    const user = setup(provider);
    await analyzeAndRecommend(user);

    // Die Vorbereitung ist durch, die Vorschläge sind da.
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();

    // Jetzt trudelt die alte Auskunft ein.
    answerAvailability('downloadable');
    await waitFor(() => expect(base.prepareCount()).toBe(1));

    // Die Oberfläche fordert keinen neuen Modelldownload.
    expect(
      screen.queryByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'KI-Vorschläge für offene Empfehlungen' }),
    ).toBeInTheDocument();
    expect(base.prepareCount()).toBe(1);
  });
});
