import { Link } from 'react-router-dom';
import { APP_CLAIM } from '../pwa/manifest';

/**
 * Editorialer Einstieg (Sprint 3A).
 *
 * Keine Auswahl aus zwei gleichrangigen Kacheln mehr, sondern eine Aussage:
 * eine Schlagzeile, ein Satz Erklärung, zwei Wege hinein – und darunter die
 * Versprechen, die dieses Produkt von Schulsoftware unterscheiden. Sie stehen
 * bewusst als knappe, gesetzte Liste da und nicht als Werbefläche.
 */

const PROMISES: readonly { term: string; text: string }[] = [
  {
    term: 'Ohne Konto',
    text: 'Keine Anmeldung, keine Konten, keine Klassenverwaltung.',
  },
  {
    term: 'Ohne Einsicht',
    text: 'Lehrkräfte sehen keine Lernstände, Antworten oder Lernzeiten.',
  },
  {
    term: 'Ohne Bewertung',
    text: 'Keine Noten, keine Abgaben, keine Ranglisten.',
  },
  {
    term: 'Ohne Tracking',
    text: 'Keine Telemetrie, keine Werbung, keine Server im Hintergrund.',
  },
];

export function HomePage() {
  return (
    <div>
      <section className="hero">
        <p className="claim">{APP_CLAIM}</p>
        <h1 className="display">Vokabelarbeit, die sich nicht nach Verwaltung anfühlt.</h1>
        <div className="rule" aria-hidden="true" />
        <p className="lede">
          LexiFlow ist ein Vokabeltrainer für Englisch, der ohne Konto, ohne Anmeldung und ohne
          Serververbindung auskommt. Material entsteht hier in Minuten – aus einem Text, einer
          Liste oder einem Thema. Lernstände bleiben auf dem Gerät, auf dem gelernt wird.
        </p>

        <div className="hero__actions">
          <Link className="btn btn--primary" to="/material">
            Material erstellen
          </Link>
          <Link className="btn" to="/lernen">
            Jetzt lernen
          </Link>
        </div>

        <dl className="promises">
          {PROMISES.map((promise) => (
            <div key={promise.term}>
              <dt className="promises__term">{promise.term}</dt>
              <dd className="promises__text" style={{ margin: 0 }}>
                {promise.text}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
