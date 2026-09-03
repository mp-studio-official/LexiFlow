import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LogoMark } from './Logo';
import { Button } from './components';
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
 * ## Was auf dem Papier **nicht** landet
 *
 * Navigation, Schaltflächen, Einstellungen – alles, was man anklicken kann,
 * ist im Druck ausgeblendet. Ein ausgedruckter Knopf ist ein Fleck.
 *
 * ## Warum die Ansicht nichts verändert
 *
 * Sie liest das Paket und rechnet daraus eine Tabelle. Kein Speichern, kein
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

export function PrintablePackView({ backTo, backLabel }: PrintablePackViewProps) {
  const { packId = '' } = useParams();
  const [pack, setPack] = useState<VocabPack | null>(null);
  const [loading, setLoading] = useState(true);

  const [showExamples, setShowExamples] = useState(true);
  const [order, setOrder] = useState<TableOrder>('pack');
  const [density, setDensity] = useState<Density>('compact');

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
    Spalte eine leere Spalte. Die Einstellung bleibt trotzdem sichtbar; sie
    verschwinden zu lassen hieße, die Erklärung mitzunehmen, warum es hier
    nichts einzustellen gibt.
  */
  const anyExample = rows.some((row) => row.exampleEnglish);
  const withExamples = showExamples && anyExample;

  function handleCsv(): void {
    if (!pack) return;
    downloadText(csvFileName(pack.meta), packToCsv(pack, { order }), 'text/csv');
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

      {/* ------------------------------------------------ Blatt und Tabelle */}
      <div className="sheet" data-density={density}>
        <header className="sheet__head">
          <div className="sheet__brand">
            {/*
              Die einfarbige Fassung: Ein Ausdruck ist meistens schwarzweiß,
              und ein Zeichen, das nur in Farbe funktioniert, ist dort ein
              grauer Klecks.
            */}
            <LogoMark size={26} tone="mono" />
            <span className="sheet__wordmark">LexiFlow</span>
          </div>
          <div>
            <h1 className="sheet__title">{header.title}</h1>
            <p className="sheet__meta">{header.summary}</p>
            {header.description ? (
              <p className="sheet__description">{header.description}</p>
            ) : null}
          </div>
        </header>

        <table className="sheet__table">
          {/*
            `<thead>` ist nicht Kosmetik: Nur ein echter Tabellenkopf wird beim
            Seitenumbruch wiederholt. Auf Seite 3 ohne Spaltenüberschriften zu
            stehen ist genau der Fehler, den man erst nach dem Drucken sieht.
          */}
          <thead>
            <tr>
              <th scope="col">Englisch</th>
              <th scope="col">Deutsch</th>
              <th scope="col">Wortart</th>
              {withExamples ? <th scope="col">Beispielsatz</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="sheet__english">{row.english}</td>
                <td>{row.german}</td>
                <td className="sheet__pos">{row.partOfSpeech}</td>
                {withExamples ? (
                  <td className="sheet__example">
                    {row.exampleEnglish}
                    {row.exampleGerman ? (
                      <>
                        <br />
                        <span className="sheet__example-de">{row.exampleGerman}</span>
                      </>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 ? <p className="muted">Dieses Paket enthält keine Vokabeln.</p> : null}
      </div>
    </div>
  );
}
