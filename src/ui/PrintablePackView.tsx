import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LogoMark } from './Logo';
import { Button } from './components';
import { COPYRIGHT_NOTICE } from './Copyright';
import { downloadText } from './download';
import { getPack } from '../data/packRepo';
import { csvFileName, packToCsv, tableHeader, tableRows, type TableOrder } from '../domain/vocabTable';
import type { VocabPack } from '../domain/schema';

/**
 * Die Vokabelliste zum Ausdrucken – und zum Speichern als PDF.
 *
 * ## Warum hier keine PDF-Bibliothek steht
 *
 * Eine PDF-Bibliothek wäre ein zweiter Satz Schriften, ein zweites
 * Layoutmodell und ein Megabyte, das in **jeder** portablen Datei mitreist –
 * für eine Aufgabe, die jeder Browser seit zwanzig Jahren beherrscht. Der
 * Ausdruck ist deshalb eine ganz normale Seite mit einem `@media print`-Block,
 * und `window.print()` öffnet den Dialog des Systems. „Als PDF sichern“ steht
 * dort in Safari genauso wie in Chrome.
 *
 * Der Nebeneffekt ist der eigentliche Gewinn: Wer den Ausdruck ändern will,
 * ändert CSS. Wer ein PDF anders haben will, ändert eine Bibliothek.
 *
 * ## Warum eine Liste und keine Tabelle mehr (Sprint 4B.7)
 *
 * Bis 4B.6 war das Blatt eine vierspaltige Tabelle. Auf dem Bildschirm sah das
 * ordentlich aus; auf Papier zerfiel es. Eine englische Lernform wie
 * `to depend on sb./sth.` und ein ganzer Beispielsatz teilen sich in einer
 * 28-%-Spalte nichts – sie brechen beide um, und aus einer Zeile werden vier
 * Zeilen, die man nicht mehr als eine Vokabel liest.
 *
 * Die gelieferte Vorlage macht es anders und richtig: **untereinander** statt
 * nebeneinander. Zuerst das Wort, fett. Darunter der Satz. Darunter die
 * Übersetzung. Drei Zeilen, die zusammen ein Ding sind – und die volle
 * Blattbreite für jede davon.
 *
 * Was dabei verloren geht, ist der wiederholte Tabellenkopf auf Seite 2 und 3.
 * Er war ein echter Gewinn, solange es Spalten gab, deren Bedeutung man raten
 * musste. Ohne Spalten gibt es nichts zu raten: Fett ist das Wort, in
 * Anführungszeichen der Satz, darunter das Deutsche.
 *
 * ## Was auf dem Papier **nicht** landet
 *
 * Navigation, Schaltflächen, Einstellungen – alles, was man anklicken kann,
 * ist im Druck ausgeblendet. Ein ausgedruckter Knopf ist ein Fleck.
 *
 * ## Warum die Ansicht nichts verändert
 *
 * Sie liest das Paket und rechnet daraus eine Liste. Kein Speichern, kein
 * Lernstand, keine Sortierung im Speicher (siehe `vocabTable.ts`). Eine
 * Vokabelliste auszudrucken ist keine Bearbeitung.
 */

export interface PrintablePackViewProps {
  /**
   * Wohin „Zurück“ führt. Im Lehrkraftbereich zur Paketseite, im Lernbereich
   * zur Paketübersicht – dieselbe Ansicht, zwei Wege hinein.
   */
  backTo: string;
  backLabel: string;
}

type Density = 'compact' | 'roomy';

/**
 * Der Schlüssel, unter dem die Kurszeile liegt.
 *
 * Sie gehört **nicht** ins Paket. Ein Paket wandert zwischen Lehrkräften,
 * Klassen und Halbjahren; „E | GK | Q1 | Ohm“ tut das nicht. Stünde die Zeile
 * im Paket, trüge jede weitergegebene Datei den Kurs desjenigen, der sie
 * zuletzt gedruckt hat.
 *
 * Sie gehört aber auch nicht in den Zustand einer Seite: Wer zwanzig Pakete
 * druckt, tippt sie sonst zwanzigmal. Der Kurs ist eine Eigenschaft des
 * Geräts, an dem gedruckt wird – dort liegt sie, und nur dort.
 */
const COURSE_KEY = 'lexiflow.print.course';

/**
 * Lesen und Schreiben in einem Speicher, den es vielleicht nicht gibt.
 *
 * Im privaten Fenster und bei gesperrtem Speicher wirft schon der **Zugriff**
 * auf `localStorage`, nicht erst der Aufruf. Eine Vokabelliste, die deswegen
 * gar nicht erst erscheint, wäre der schlechteste denkbare Tausch für eine
 * Bequemlichkeit.
 */
function readCourse(): string {
  try {
    return window.localStorage.getItem(COURSE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeCourse(value: string): void {
  try {
    window.localStorage.setItem(COURSE_KEY, value);
  } catch {
    /* Kein Speicher – dann gilt die Zeile für diesen Ausdruck und sonst nichts. */
  }
}

export function PrintablePackView({ backTo, backLabel }: PrintablePackViewProps) {
  const { packId = '' } = useParams();
  const [pack, setPack] = useState<VocabPack | null>(null);
  const [loading, setLoading] = useState(true);

  const [showExamples, setShowExamples] = useState(true);
  const [order, setOrder] = useState<TableOrder>('pack');
  const [density, setDensity] = useState<Density>('compact');
  const [course, setCourse] = useState(readCourse);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = await getPack(packId);
      if (!active) return;
      setPack(found ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  if (loading) return <p className="muted">Vokabelliste wird geladen …</p>;
  if (!pack) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <p className="muted">Es existiert kein Paket mit dieser Kennung auf diesem Gerät.</p>
        <Link className="btn" to={backTo}>
          {backLabel}
        </Link>
      </div>
    );
  }

  const rows = tableRows(pack.entries, { order });
  const header = tableHeader(pack.meta, rows.length);
  /*
    Ein Beispielsatz ist optional – und wenn keine Zeile einen hat, wäre die
    Zeile eine leere Zeile. Die Einstellung bleibt trotzdem sichtbar; sie
    verschwinden zu lassen hieße, die Erklärung mitzunehmen, warum es hier
    nichts einzustellen gibt.
  */
  const anyExample = rows.some((row) => row.exampleEnglish);
  const withExamples = showExamples && anyExample;
  const courseLine = course.trim();

  function handleCsv(): void {
    if (!pack) return;
    downloadText(csvFileName(pack.meta), packToCsv(pack, { order }), 'text/csv');
  }

  function handleCourse(value: string): void {
    setCourse(value);
    writeCourse(value);
  }

  return (
    <div className="stack printable">
      {/* --------------------------------------------- nur am Bildschirm */}
      <div className="print-hidden stack">
        <div className="row">
          <Link className="btn" to={backTo}>
            {backLabel}
          </Link>
          <span className="spacer" />
          <Button onClick={handleCsv}>Als Tabelle herunterladen (.csv)</Button>
          <Button variant="primary" onClick={() => window.print()}>
            Drucken / als PDF speichern
          </Button>
        </div>

        <fieldset className="print-settings">
          <legend>Was auf das Blatt kommt</legend>

          <label>
            <input
              type="checkbox"
              checked={showExamples}
              disabled={!anyExample}
              onChange={(event) => setShowExamples(event.target.checked)}
            />{' '}
            Beispielsätze mitdrucken
            {anyExample ? null : ' (keine im Paket)'}
          </label>

          <label>
            Reihenfolge{' '}
            <select value={order} onChange={(event) => setOrder(event.target.value as TableOrder)}>
              <option value="pack">wie im Paket</option>
              <option value="alphabetical">alphabetisch</option>
            </select>
          </label>

          <label>
            Zeilenhöhe{' '}
            <select
              value={density}
              onChange={(event) => setDensity(event.target.value as Density)}
            >
              <option value="compact">kompakt</option>
              <option value="roomy">großzügig</option>
            </select>
          </label>
        </fieldset>

        <p className="small muted" style={{ margin: 0 }}>
          Der Ausdruck entsteht auf diesem Gerät. Im Druckdialog lässt er sich auch als PDF
          sichern. Am Paket und an Lernständen ändert sich dabei nichts.
        </p>
      </div>

      {/* ------------------------------------------------ Blatt und Liste */}
      <div className="sheet" data-density={density}>
        <header className="sheet__head">
          {/*
            Die Kurszeile steht ganz oben links – vor Marke und Titel.

            Auf dem Bildschirm ist sie ein Feld, auf Papier eine Zeile. Beides
            aus **einem** Wert: Ein Feld, das man im Druck nur entkleidet,
            hinterlässt je nach Browser einen Rahmen, einen Platzhaltertext
            oder eine abgeschnittene Zeile – ein leeres Feld sogar eine leere
            Zeile mit Rahmen. Zwei Elemente, von denen immer genau eines
            sichtbar ist, haben keines dieser Probleme.
          */}
          <div className="sheet__course">
            <label className="sheet__course-field print-hidden">
              <span className="sheet__course-label">Kopfzeile</span>
              <input
                type="text"
                value={course}
                placeholder="E | GK | Q1 | Ohm"
                onChange={(event) => handleCourse(event.target.value)}
              />
            </label>
            {courseLine ? <p className="sheet__course-line">{courseLine}</p> : null}
          </div>

          <div className="sheet__brand">
            {/*
              Die gelieferte Schwarzweiß-Fassung. Ein Ausdruck ist meistens
              schwarzweiß, und ein Zeichen, das nur in Farbe funktioniert, ist
              dort ein grauer Klecks.
            */}
            <LogoMark size={26} tone="bw" />
            <span className="sheet__wordmark">LexiFlow</span>
          </div>

          <div className="sheet__titles">
            <h1 className="sheet__title">{header.title}</h1>
            <p className="sheet__meta">{header.summary}</p>
            {header.description ? (
              <p className="sheet__description">{header.description}</p>
            ) : null}
          </div>
        </header>

        {/*
          Eine Liste, keine Tabelle – und eine **nummerierte**.

          Die Nummer ist kein Schmuck: Sie ist der kürzeste Weg, im Unterricht
          auf eine Vokabel zu zeigen („Nummer 14“), ohne sie vorzulesen. Sie
          folgt der eingestellten Reihenfolge, weil sie sich auf das Blatt
          bezieht, das in der Hand liegt, und nicht auf das Paket.
        */}
        <ol className="sheet__list">
          {rows.map((row) => (
            <li className="sheet__entry" key={row.id}>
              {/*
                Die Lernform steht in einem eigenen Element und nicht als
                nackter Text neben der Wortart. Ohne es klebte beides
                zusammen – sichtbar hielte der Abstand sie auseinander, aber
                vorgelesen und beim Kopieren stünde da
                „to depend on sb./sth.Verb“.
              */}
              <p className="sheet__word">
                <span className="sheet__form">{row.english}</span>
                {row.partOfSpeech ? (
                  <span className="sheet__pos">
                    {' '}
                    {row.partOfSpeech}
                  </span>
                ) : null}
              </p>
              {withExamples && row.exampleEnglish ? (
                <p className="sheet__example">
                  „{row.exampleEnglish}“
                  {row.exampleGerman ? (
                    <span className="sheet__example-de"> – {row.exampleGerman}</span>
                  ) : null}
                </p>
              ) : null}
              <p className="sheet__german">{row.german}</p>
            </li>
          ))}
        </ol>

        {rows.length === 0 ? <p className="muted">Dieses Paket enthält keine Vokabeln.</p> : null}

        {/*
          Der Vermerk steht auf jedem Blatt, nicht nur auf dem ersten.

          Ein Ausdruck wird auseinandergerissen, kopiert und weitergereicht;
          eine Herkunft, die nur auf Seite 1 steht, ist ab Seite 2 keine. Die
          Wiederholung leistet die Druckregel (`position: fixed` im Druck ist
          eine Kopf-/Fußzeile), nicht das Markup.
        */}
        <p className="sheet__foot">{COPYRIGHT_NOTICE}</p>
      </div>
    </div>
  );
}
