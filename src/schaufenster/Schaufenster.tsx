import { auszeichnungen, rundenfortschritt, tagesstand } from '../domain/motivation';
import { fehlererklaerung, formangaben, hinweiseFuer } from '../domain/sprache';
import { checkAnswer } from '../domain/answerCheck';
import type { VocabEntry } from '../domain/schema';
import { Werkstatt } from '../hosted/teacher/werkstatt/Werkstatt';
import { anfang, werkstattZug } from '../hosted/teacher/werkstatt/zustand';
import {
  Abschlussfeier,
  Auszeichnungsliste,
  Rundenbalken,
  Tagesziel,
} from '../hosted/learner/motivation/Motivation';
import { Beispiel, Fehlerkarte, Formtafel, Hinweistreppe } from '../hosted/learner/sprache/Sprache';
import { Lerncoach } from '../hosted/learner/ki-ui/Lerncoach';
import { fakeAnbieter } from '../hosted/learner/ki-ui/vertrag';

/**
 * Das Schaufenster — alle neuen Bausteine auf einer Seite.
 *
 * ## Wofür es da ist
 *
 * Keiner dieser Bausteine hängt an einer produktiven Route; das ist
 * Absicht und steht so im Produktvertrag. Ohne eine Seite, die sie zeigt,
 * liessen sie sich aber nicht in einem echten Browser messen — und eine
 * Zusage über Tippziele, Überlauf und Fokus, die nur aus jsdom stammt, ist
 * keine Messung, sondern eine Hoffnung.
 *
 * ## Warum es kein Einstiegspunkt der Anwendung ist
 *
 * Es wird nur von `scripts/schaufenster-bauen.mjs` gerendert und landet
 * in keinem ausgelieferten Bündel. Eine Route dafür gäbe es erst, wenn
 * Codex die Bausteine verdrahtet — und dann gäbe es das Schaufenster
 * nicht mehr, sondern die echten Seiten.
 */

const PAKET: VocabEntry = {
  id: 'e1',
  english: 'went',
  lemma: 'go',
  germanAnswers: ['ging'],
  acceptedEnglishAnswers: [],
  exampleSentences: [{ english: 'We went home early.', german: 'Wir gingen früh nach Hause.' }],
  topicTags: [],
  sourceType: 'import',
  partOfSpeech: 'verb',
  inflection: {
    kind: 'verb',
    base: 'go',
    pastSimple: 'went',
    pastParticiple: 'gone',
    irregular: true,
  },
};

const WERKSTATT = werkstattZug(
  werkstattZug(anfang(), {
    art: 'text-eingefuegt',
    text: 'house\tHaus\ncar\tAuto\ntree\tBaum\nhouse\tGebäude\nbike\t',
  }),
  { art: 'titel-geaendert', titel: 'Unit 3 — City life' },
);

const GRUNDLAGE = {
  lerntage: [{ localDay: '2026-10-13', taskCount: 12 }],
  beherrschung: { beherrscht: 12, offen: 8, gesamt: 20 },
  paketstaende: [{ beherrscht: 12, offen: 0, gesamt: 12 }],
  serie: {
    laenge: 5,
    laengste: 9,
    heuteGeschafft: true,
    ruhetageVerbraucht: 1,
    ruhetageUebrig: 1,
  },
  wochenziel: 4,
  lerntageDerWoche: 3,
};

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="abschnitt" style={{ marginBlockEnd: '3rem' }}>
      <div className="abschnitt__kopf">
        <h2 className="abschnitt__titel">{titel}</h2>
      </div>
      {children}
    </section>
  );
}

export function Schaufenster() {
  const ergebnis = checkAnswer('go', [PAKET.english]);
  const erklaerung = fehlererklaerung('go', ergebnis, PAKET, 'de-en');

  return (
    <div className="huelle">
      <div className="huelle__arbeit">
        <main className="huelle__inhalt" id="inhalt">
          <div className="stack">
            <h1>Schaufenster der nächsten Stufe</h1>

            <Abschnitt titel="Werkstatt — Vorschau">
              <Werkstatt stand={WERKSTATT} aufZug={() => {}} aufFertig={() => {}} />
            </Abschnitt>

            <Abschnitt titel="Werkstatt — leer">
              <Werkstatt stand={anfang()} aufZug={() => {}} aufFertig={() => {}} />
            </Abschnitt>

            <Abschnitt titel="Motivation">
              <Tagesziel stand={tagesstand({ localDay: '2026-10-13', taskCount: 6 })} />
              <Rundenbalken stand={rundenfortschritt(7, 20)} />
              <Abschlussfeier
                frisch={auszeichnungen(GRUNDLAGE).filter((e) => e.erreicht).slice(0, 2)}
                runde={rundenfortschritt(20, 20)}
                aufWeiter={() => {}}
              />
              <Auszeichnungsliste auszeichnungen={auszeichnungen(GRUNDLAGE)} />
            </Abschnitt>

            <Abschnitt titel="Sprachliche Hilfen">
              <Hinweistreppe hinweise={hinweiseFuer(PAKET, 'de-en')} offen={2} aufMehr={() => {}} />
              {erklaerung ? <Fehlerkarte erklaerung={erklaerung} /> : null}
              <Formtafel angaben={formangaben(PAKET)} />
              <Beispiel
                englisch="We went home early."
                deutsch="Wir gingen früh nach Hause."
                aufAnderen={() => {}}
              />
            </Abschnitt>

            <Abschnitt titel="Lerncoach">
              <Lerncoach
                aufgabe={{
                  lernform: 'went',
                  richtung: 'de-en',
                  beispielsatz: 'We went home early.',
                  antwort: 'goed',
                  loesung: 'went',
                  sprache: 'de',
                  niveau: 'A2',
                }}
                freigegeben
                anbieter={fakeAnbieter()}
                hinweisGesehen
                aufHinweisVerstanden={() => {}}
              />
            </Abschnitt>
          </div>
        </main>
      </div>
    </div>
  );
}
