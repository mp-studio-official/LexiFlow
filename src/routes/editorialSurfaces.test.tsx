import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { TeacherHomePage } from './teacher/TeacherHomePage';
import { StudentHomePage } from './student/StudentHomePage';
import { clearAllLocalData } from '../data/db';
import { savePack } from '../data/packRepo';
import { makeEntry, makeMeta } from '../test/fixtures';

/**
 * Sprint 3A: Die vier überarbeiteten Oberflächen.
 *
 * Das Redesign darf nichts wegnehmen. Diese Datei prüft deshalb vor allem,
 * dass jede bisherige Aktion weiterhin unter demselben zugänglichen Namen
 * erreichbar ist – und dass die neuen leeren Zustände wirklich erklären, wie
 * der erste Inhalt entsteht.
 */

function renderPage(element: React.ReactElement, route = '/') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={element} />
        <Route path="/material" element={<h1>Material</h1>} />
        <Route path="/material/import" element={<h1>Import</h1>} />
        <Route path="/material/:packId" element={<h1>Paketeditor</h1>} />
        <Route path="/lernen" element={<h1>Lernen</h1>} />
        <Route path="/lernen/:packId" element={<h1>Paket</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Startseite', () => {
  it('führt editorial ein, statt zwei Kacheln anzubieten', () => {
    renderPage(<HomePage />);

    expect(screen.getByText('Local-first Vocab Studio')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Vokabelarbeit, die sich nicht nach Verwaltung anfühlt.',
      }),
    ).toBeInTheDocument();
  });

  it('bietet genau zwei Wege hinein – primär und sekundär', () => {
    renderPage(<HomePage />);

    expect(screen.getByRole('link', { name: 'Material erstellen' })).toHaveAttribute(
      'href',
      '/material',
    );
    expect(screen.getByRole('link', { name: 'Jetzt lernen' })).toHaveAttribute('href', '/lernen');
  });

  it('nennt die vier Datenschutzversprechen unverändert', () => {
    renderPage(<HomePage />);

    expect(screen.getByText(/Keine Anmeldung, keine Schülerkonten/)).toBeInTheDocument();
    expect(
      screen.getByText(/Lehrkräfte sehen keine Lernstände, Antworten oder Lernzeiten/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Keine Noten, keine Abgaben, keine Ranglisten/)).toBeInTheDocument();
    expect(screen.getByText(/Keine Telemetrie, keine Werbung/)).toBeInTheDocument();
  });
});

describe('Material – Creator-Studio', () => {
  it('fragt handlungsorientiert und behält alle Erstellungswege', async () => {
    renderPage(<TeacherHomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Was willst du heute erstellen?' }),
    ).toBeInTheDocument();

    // Dieselben Beschriftungen wie vor dem Redesign.
    for (const label of [
      'Neues Paket aus Liste erstellen',
      'Aus englischem Text erstellen',
      'Zu einem Thema erstellen',
      'Paketdatei öffnen (.vocabpack.json)',
    ]) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('LexiFlow-Paketdatei auswählen')).toBeInTheDocument();
  });

  it('führt die drei Quellen sichtbar unterschieden auf', () => {
    renderPage(<TeacherHomePage />);

    expect(screen.getByText('Aus einem Text')).toBeInTheDocument();
    expect(screen.getByText('Aus einer Liste')).toBeInTheDocument();
    expect(screen.getByText('Zu einem Thema')).toBeInTheDocument();
  });

  it('führt jede Quelle an ihr bisheriges Ziel', async () => {
    const user = renderPage(<TeacherHomePage />);

    await user.click(screen.getByRole('button', { name: 'Neues Paket aus Liste erstellen' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Import' })).toBeInTheDocument();
  });

  it('erklärt im leeren Zustand den ersten Schritt', async () => {
    renderPage(<TeacherHomePage />);

    expect(await screen.findByRole('heading', { name: 'Noch kein Material' })).toBeInTheDocument();
    expect(screen.getByText(/So entsteht das erste Paket/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neues Paket aus Liste erstellen' })).toHaveAttribute(
      'href',
      '/material/import',
    );
  });

  it('zeigt vorhandene Pakete als Feed mit allen bisherigen Aktionen', async () => {
    await savePack({
      meta: makeMeta({ id: 'pack-1', title: 'Unit 3 – City life', topic: 'City' }),
      entries: [makeEntry(), makeEntry()],
    });
    renderPage(<TeacherHomePage />);

    const card = (await screen.findByRole('heading', { name: 'Unit 3 – City life' })).closest(
      'article',
    ) as HTMLElement;

    expect(within(card).getByRole('link', { name: 'Unit 3 – City life' })).toHaveAttribute(
      'href',
      '/material/pack-1',
    );
    expect(within(card).getByText('2 Vokabeln')).toBeInTheDocument();
    expect(within(card).getByText('Klasse 7')).toBeInTheDocument();
    expect(within(card).getByText('A2+')).toBeInTheDocument();
    expect(within(card).getByText('City')).toBeInTheDocument();
    expect(within(card).getByText(/geändert/)).toBeInTheDocument();

    expect(within(card).getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Exportieren' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
  });

  it('fragt vor dem Löschen weiterhin nach', async () => {
    await savePack({ meta: makeMeta({ id: 'pack-1' }), entries: [makeEntry()] });
    const user = renderPage(<TeacherHomePage />);

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(screen.getByText(/Paket und zugehörige Lernstände löschen\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('behält den Hinweis zum Export', async () => {
    renderPage(<TeacherHomePage />);
    expect(
      await screen.findByText(/Lernstände werden nie exportiert/),
    ).toBeInTheDocument();
  });
});

describe('Lernen – Feed statt Dashboard', () => {
  it('fragt nach einer Runde, nicht nach Auswertung', async () => {
    renderPage(<StudentHomePage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bereit für eine kurze Runde?' }),
    ).toBeInTheDocument();
    // Kein Gamification-Vokabular.
    expect(screen.queryByText(/Punkte|Rangliste|Serie|Streak/i)).not.toBeInTheDocument();
  });

  it('erklärt im leeren Zustand, woher ein Paket kommt', async () => {
    renderPage(<StudentHomePage />);

    expect(
      await screen.findByRole('heading', { name: 'Noch keine Pakete auf diesem Gerät' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Selbst ein Paket erstellen' })).toHaveAttribute(
      'href',
      '/material',
    );
    expect(screen.getByRole('button', { name: 'Paket hinzufügen (.vocabpack.json)' }))
      .toBeInTheDocument();
  });

  it('stellt fällige Aufgaben nach vorn und bleibt bei den ehrlichen Zahlen', async () => {
    await savePack({
      meta: makeMeta({ id: 'pack-1', title: 'Unit 3 – City life' }),
      entries: [makeEntry(), makeEntry(), makeEntry()],
    });
    renderPage(<StudentHomePage />);

    // Drei neue Vokabeln sind sofort dran.
    expect(await screen.findByText(/3 Vokabeln sind dran/)).toBeInTheDocument();

    const card = (await screen.findByRole('heading', { name: 'Unit 3 – City life' })).closest(
      'article',
    ) as HTMLElement;
    expect(within(card).getByText('3 Vokabeln zum Üben bereit')).toBeInTheDocument();
    expect(within(card).getByText('0 von 3 sicher · 3 zum Üben bereit')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Öffnen' })).toHaveAttribute(
      'href',
      '/lernen/pack-1',
    );
  });

  it('nennt freies Üben, ohne es in den Vordergrund zu stellen', async () => {
    await savePack({ meta: makeMeta({ id: 'pack-1' }), entries: [makeEntry()] });
    renderPage(<StudentHomePage />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Öffnen' })).toBeInTheDocument());
    expect(screen.getByText(/freies Üben/i)).toBeInTheDocument();
    // Die Hauptaktion bleibt das Öffnen des Pakets.
    expect(screen.queryByRole('link', { name: /Frei üben/ })).not.toBeInTheDocument();
  });

  it('behält den Lernstand je Richtung bei zweisprachigen Paketen', async () => {
    await savePack({
      meta: makeMeta({ id: 'pack-1', direction: 'both' }),
      entries: [makeEntry(), makeEntry()],
    });
    renderPage(<StudentHomePage />);

    expect(await screen.findByText(/verstehen \(EN→DE\): 0 von 2/)).toBeInTheDocument();
    expect(screen.getByText(/anwenden \(DE→EN\): 0 von 2/)).toBeInTheDocument();
  });
});
