import { useId, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Field } from '../../../ui/components';
import { LeererZustand } from '../../../ui/bausteine';
import type { DraftRow } from '../../../import/draft';
import {
  type GepruefterEntwurf,
  type Werkstattstand,
  type Werkstattzug,
  fertigerEntwurf,
  istFertig,
} from './zustand';
import './werkstatt.css';

/**
 * Die Werkstatt im Portal — aus vorhandenem Material ein Paket.
 *
 * ## Was diese Komponente ist und was nicht
 *
 * Sie ist **rein**: Sie holt sich kein Repository, keine Sitzung, keine
 * Rolle und keine Kennung. Was passieren soll, meldet sie als Zug; was
 * dabei herauskommt, reicht sie als Entwurf weiter. Die produktive
 * Verdrahtung — veröffentlichen, zuweisen, Route — macht Codex.
 *
 * ## Warum es keinen Schritt „Spalten zuordnen" gibt
 *
 * Weil die Erkennung ihn in den meisten Fällen überflüssig macht und ein
 * Pflichtschritt, der meistens nur bestätigt wird, zu einem Klick wird, den
 * niemand mehr liest. Die Zuordnung steht stattdessen **über** der Vorschau
 * als Satz („Eine Tabelle, durch Tabulatoren getrennt, 2 Spalten") und
 * lässt sich dort ändern. Wer sie nicht braucht, sieht sie trotzdem; wer
 * sie braucht, findet sie an der Stelle, an der ihm auffällt, dass etwas
 * nicht stimmt.
 *
 * ## Warum die Vorschau eine Liste und keine Tabelle ist
 *
 * Eine Tabelle mit sieben Spalten ist bei 390 px keine Tabelle mehr,
 * sondern ein waagerechtes Scrollfeld. Jede Vokabel steht deshalb als
 * eigener Block mit beschrifteten Feldern; am Schreibtisch liegen die
 * Blöcke nebeneinander.
 */

export interface WerkstattProps {
  readonly stand: Werkstattstand;
  readonly aufZug: (zug: Werkstattzug) => void;
  /**
   * „Veröffentlichen und einer Lerngruppe geben."
   *
   * Noch nicht verdrahtet: Diese Komponente ruft den Rückruf auf, mehr
   * nicht. Was dann geschieht, entscheidet die Einbettung.
   */
  readonly aufFertig: (entwurf: GepruefterEntwurf) => void;
  /**
   * Keine Verbindung.
   *
   * Lesen und Korrigieren gehen weiter — das passiert alles im Browser.
   * Nur die Abgabe braucht den Server, und die wird dann nicht versprochen.
   */
  readonly offline?: boolean;
  /** Läuft die Abgabe gerade? */
  readonly gibtAb?: boolean;
}

export function Werkstatt({ stand, aufZug, aufFertig, offline, gibtAb }: WerkstattProps) {
  switch (stand.schritt) {
    case 'quelle':
      return <Quellenschritt aufZug={aufZug} />;
    case 'liest':
      return <Lieststritt {...(stand.dateiname === undefined ? {} : { name: stand.dateiname })} />;
    case 'fehler':
      return (
        <Fehlerschritt
          {...(stand.meldung === undefined ? {} : { meldung: stand.meldung })}
          aufZug={aufZug}
        />
      );
    case 'vorschau':
      return (
        <Vorschauschritt
          stand={stand}
          aufZug={aufZug}
          aufFertig={aufFertig}
          {...(offline === undefined ? {} : { offline })}
          {...(gibtAb === undefined ? {} : { gibtAb })}
        />
      );
  }
}

function Quellenschritt({ aufZug }: { aufZug: (zug: Werkstattzug) => void }) {
  const [text, setText] = useState('');
  const dateifeld = useRef<HTMLInputElement>(null);
  const hinweisId = useId();

  return (
    <div className="stack werkstatt">
      <Card>
        <h2 className="werkstatt__titel">Material einfügen</h2>
        <p id={hinweisId} className="small muted werkstatt__hinweis">
          Eine Liste aus Word, Excel, Google Sheets oder einem Dokument. Das Format wird erkannt —
          Spalten müssen nicht vorher zugeordnet werden.
        </p>
        <Field label="Vokabeln einfügen" hint="Eine Vokabel je Zeile, Englisch und Deutsch.">
          {(props) => (
            <textarea
              {...props}
              rows={8}
              value={text}
              spellCheck={false}
              onChange={(ereignis) => setText(ereignis.target.value)}
              placeholder={'house\tHaus\ncar\tAuto'}
            />
          )}
        </Field>
        <div className="row werkstatt__handlungen">
          <Button
            variant="primary"
            disabled={text.trim().length === 0}
            onClick={() => aufZug({ art: 'text-eingefuegt', text })}
          >
            Weiter
          </Button>
        </div>
      </Card>

      <Card quiet>
        <h2 className="werkstatt__titel">Oder eine Datei</h2>
        <p className="small muted werkstatt__hinweis">
          CSV, TSV, Excel (.xlsx) oder ein LexiFlow-Paket.
        </p>
        <input
          ref={dateifeld}
          className="werkstatt__datei"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.json"
          aria-label="Datei auswählen"
          onChange={(ereignis) => {
            const datei = ereignis.target.files?.[0];
            if (datei) aufZug({ art: 'datei-gewaehlt', name: datei.name });
          }}
        />
      </Card>
    </div>
  );
}

function Lieststritt({ name }: { name?: string }) {
  return (
    <div className="stack werkstatt">
      <Card>
        <p className="muted" role="status">
          {name ? `„${name}" wird gelesen …` : 'Die Datei wird gelesen …'}
        </p>
      </Card>
    </div>
  );
}

function Fehlerschritt({
  meldung,
  aufZug,
}: {
  meldung?: string;
  aufZug: (zug: Werkstattzug) => void;
}) {
  return (
    <div className="stack werkstatt">
      <Alert tone="error" title="Das ließ sich nicht lesen">
        <p>{meldung ?? 'Die Quelle ließ sich nicht lesen.'}</p>
      </Alert>
      <div className="row werkstatt__handlungen">
        <Button variant="primary" onClick={() => aufZug({ art: 'verworfen' })}>
          Andere Quelle wählen
        </Button>
      </div>
    </div>
  );
}

function Vorschauschritt({
  stand,
  aufZug,
  aufFertig,
  offline,
  gibtAb,
}: {
  stand: Werkstattstand;
  aufZug: (zug: Werkstattzug) => void;
  aufFertig: (entwurf: GepruefterEntwurf) => void;
  offline?: boolean;
  gibtAb?: boolean;
}) {
  const befund = stand.befund;
  const fertig = istFertig(stand);

  function aendere(id: string, teil: Partial<DraftRow>) {
    aufZug({
      art: 'zeilen-geaendert',
      zeilen: stand.zeilen.map((zeile) => (zeile.id === id ? { ...zeile, ...teil } : zeile)),
    });
  }

  return (
    <div className="stack werkstatt">
      {stand.erkennung ? (
        <Alert tone={stand.erkennung.sicher ? 'info' : 'warning'}>
          <p className="werkstatt__erkennung">
            {stand.erkennung.begruendung}{' '}
            {stand.erkennung.sicher ? null : <strong>Bitte kurz nachsehen.</strong>}
          </p>
        </Alert>
      ) : null}

      {befund && befund.duplicates > 0 ? (
        <Alert tone="warning" title="Doppelte Stichwörter">
          <p>
            {befund.duplicates === 1
              ? 'Ein Stichwort kommt mehrfach vor.'
              : `${befund.duplicates} Stichwörter kommen mehrfach vor.`}{' '}
            Sie sind unten gekennzeichnet; abwählen genügt.
          </p>
        </Alert>
      ) : null}

      {stand.unzugeordnet.length > 0 ? (
        <Alert tone="warning" title="Nicht zugeordnete Zeilen">
          <ul className="werkstatt__unzugeordnet">
            {stand.unzugeordnet.slice(0, 5).map((zeile) => (
              <li key={zeile}>{zeile}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <Field label="Name des Lernpakets" hint="Zum Beispiel „Unit 3 — City life“.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={stand.titel}
              onChange={(ereignis) =>
                aufZug({ art: 'titel-geaendert', titel: ereignis.target.value })
              }
            />
          )}
        </Field>
      </Card>

      {befund ? (
        <p className="small muted werkstatt__zusammenfassung" role="status">
          {befund.selected} von {befund.total} Vokabeln ausgewählt
          {befund.errors > 0 ? ` · ${befund.errors} unvollständig` : ''}
          {befund.warnings > 0 ? ` · ${befund.warnings} zum Nachsehen` : ''}
        </p>
      ) : null}

      {stand.zeilen.length === 0 ? (
        <LeererZustand titel="Keine Vokabel erkannt">
          <p>Die Quelle enthielt keine Zeile, die sich als Vokabel lesen ließ.</p>
        </LeererZustand>
      ) : (
        <ul className="werkstatt__liste">
          {stand.zeilen.map((zeile) => (
            <Vorschauzeile key={zeile.id} zeile={zeile} aufAendern={aendere} />
          ))}
        </ul>
      )}

      {offline ? (
        <Alert tone="warning" title="Gerade keine Verbindung">
          <p>
            Lesen und Korrigieren geht weiter — das passiert alles hier im Browser. Das
            Veröffentlichen braucht die Verbindung und wartet, bis sie zurück ist.
          </p>
        </Alert>
      ) : null}

      <div className="row werkstatt__handlungen">
        <Button
          variant="primary"
          disabled={!fertig || offline === true || gibtAb === true}
          onClick={() => {
            const entwurf = fertigerEntwurf(stand);
            if (entwurf) aufFertig(entwurf);
          }}
        >
          {gibtAb ? 'Einen Moment …' : 'Veröffentlichen und zuweisen'}
        </Button>
        <Button variant="quiet" onClick={() => aufZug({ art: 'verworfen' })}>
          Verwerfen
        </Button>
      </div>

      {fertig ? null : (
        <p className="small muted werkstatt__offen" role="status">
          {stand.titel.trim().length === 0
            ? 'Es fehlt noch ein Name für das Lernpaket.'
            : 'Es sind noch unvollständige Zeilen ausgewählt.'}
        </p>
      )}
    </div>
  );
}

function Vorschauzeile({
  zeile,
  aufAendern,
}: {
  zeile: DraftRow;
  aufAendern: (id: string, teil: Partial<DraftRow>) => void;
}) {
  const fehler = zeile.issues.filter((befund) => befund.level === 'error');
  const warnungen = zeile.issues.filter((befund) => befund.level === 'warning');

  return (
    <li className="werkstatt__zeile" data-fehler={fehler.length > 0 ? 'ja' : undefined}>
      <div className="werkstatt__auswahl">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={zeile.include}
            onChange={(ereignis) => aufAendern(zeile.id, { include: ereignis.target.checked })}
          />
          <span className="werkstatt__auswahltext">Übernehmen</span>
        </label>
        {zeile.duplicateOf ? <Badge tone="warning">doppelt</Badge> : null}
      </div>

      <div className="werkstatt__felder">
        <Field label="Englisch">
          {(props) => (
            <input
              {...props}
              type="text"
              value={zeile.english}
              spellCheck={false}
              onChange={(ereignis) => aufAendern(zeile.id, { english: ereignis.target.value })}
            />
          )}
        </Field>
        <Field label="Deutsch" hint="Mehrere Antworten mit Semikolon trennen.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={zeile.german}
              onChange={(ereignis) => aufAendern(zeile.id, { german: ereignis.target.value })}
            />
          )}
        </Field>
      </div>

      {fehler.length > 0 || warnungen.length > 0 ? (
        <ul className="werkstatt__befunde">
          {[...fehler, ...warnungen].map((befund) => (
            <li
              key={`${befund.level}-${befund.message}`}
              data-art={befund.level === 'error' ? 'fehler' : 'hinweis'}
            >
              {befund.message}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default Werkstatt;
