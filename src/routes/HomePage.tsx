import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="stack" style={{ '--gap': '1.5rem' } as CSSProperties}>
      <div>
        <h1>LexiFlow</h1>
        <p className="muted" style={{ maxWidth: '46rem' }}>
          Ein Vokabeltrainer für Englisch, der ohne Konto, ohne Anmeldung und ohne
          Serververbindung auskommt. Lernstände bleiben auf diesem Gerät und sind für
          niemanden sonst sichtbar.
        </p>
      </div>

      <div className="choice-grid">
        <Link className="choice" to="/lernen">
          <h2>Lernen</h2>
          <p>
            Vokabelpakete öffnen und üben – Karteikarte, Multiple Choice, offene
            Übersetzung und Lückensätze.
          </p>
        </Link>
        <Link className="choice" to="/material">
          <h2>Material erstellen</h2>
          <p>
            Vokabellisten einfügen oder importieren, prüfen, mit Metadaten versehen und
            als Paket weitergeben. Kein Login nötig.
          </p>
        </Link>
      </div>

      <div className="card card--quiet">
        <h2 style={{ fontSize: '1.05rem' }}>Was diese App bewusst nicht tut</h2>
        <ul className="muted small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>Keine Schülerkonten und keine Klassenverwaltung.</li>
          <li>Keine Einsicht von Lehrkräften in Lernstände, Antworten oder Lernzeiten.</li>
          <li>Keine Noten, keine Abgaben, keine Ranglisten.</li>
          <li>Keine Telemetrie, keine Werbung, kein externes Tracking.</li>
        </ul>
      </div>
    </div>
  );
}
