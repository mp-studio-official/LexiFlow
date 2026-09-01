import { useEffect, useState } from 'react';
import { Alert, Button, Card } from '../../ui/components';
import type { DictionaryMeta, DictionaryProvider } from '../../dictionary/DictionaryProvider';
import { createOfflineDictionary } from '../../dictionary/offlineDictionary';

/**
 * Quelle, Lizenz und Ausgabe des Offline-Wörterbuchs – sichtbar, nicht im
 * Kleingedruckten.
 *
 * Das Wörterbuch ist aus fremdem, unter CC BY-SA 4.0 stehendem Material
 * abgeleitet. Wer damit arbeitet, soll ohne Suche sehen können, woher es kommt,
 * wie alt es ist und unter welchen Bedingungen er es weitergeben darf. Und er
 * soll es **mitnehmen** können: Der Export enthält die Metadaten und einen
 * lesbaren Auszug des abgeleiteten Bestands.
 *
 * Was hier ausdrücklich **nicht** steht: eine Rechtsauskunft. Dokumentiert wird
 * die technische Trennung – LexiFlows Code auf der einen Seite, der abgeleitete
 * Datensatz mit seiner eigenen Lizenz auf der anderen.
 */

export interface DictionaryLicencePanelProps {
  /** Einspeisbar für Tests; im Betrieb das eingebaute Wörterbuch. */
  dictionary?: DictionaryProvider;
  /** Wie die erzeugte Datei ausgeliefert wird. Getrennt, damit Tests sie sehen. */
  onDownload?: (filename: string, content: string) => void;
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DictionaryLicencePanel({ dictionary, onDownload }: DictionaryLicencePanelProps) {
  const [meta, setMeta] = useState<DictionaryMeta | undefined>();
  const [state, setState] = useState<'laedt' | 'da' | 'fehlt'>('laedt');

  useEffect(() => {
    let active = true;
    const provider = dictionary ?? createOfflineDictionary();
    void provider.meta().then((value) => {
      if (!active) return;
      setMeta(value);
      setState(value ? 'da' : 'fehlt');
    });
    return () => {
      active = false;
    };
  }, [dictionary]);

  function exportMetadata(): void {
    if (!meta) return;
    const payload = {
      erzeugt: new Date().toISOString(),
      hinweis:
        'Abgeleiteter Wörterbuchdatensatz aus dem englischen Wiktionary, extrahiert mit wiktextract. ' +
        'Weitergabe unter CC BY-SA 4.0. Zitate, Bilder und Audio sind nicht enthalten. ' +
        'Dies ist eine Herkunfts- und Lizenzangabe, keine Rechtsberatung.',
      quelle: meta.quelle,
      lizenz: meta.lizenz,
      format: { version: meta.formatVersion, shards: meta.shardCount },
      zahlen: meta.zahlen,
    };
    const content = JSON.stringify(payload, null, 2) + '\n';
    (onDownload ?? download)('lexiflow-woerterbuch-quelle.json', content);
  }

  if (state === 'laedt') {
    return (
      <p className="small muted" role="status">
        Wörterbuchangaben werden gelesen …
      </p>
    );
  }

  if (state === 'fehlt' || !meta) {
    return (
      <Alert tone="info">
        In dieser Auslieferung ist kein Offline-Wörterbuch enthalten. Wortform- und
        Abkürzungserkennung funktionieren unverändert.
      </Alert>
    );
  }

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Offline-Wörterbuch: Quelle und Lizenz</h3>

      <dl className="promises">
        <div>
          <dt className="promises__term">Quelle</dt>
          <dd className="promises__text">
            {meta.quelle.name}, Stand {meta.quelle.dump} (extrahiert {meta.quelle.extraktion}) ·{' '}
            <a href={meta.lizenz.rueckverweis} rel="noreferrer">
              en.wiktionary.org
            </a>
          </dd>
        </div>
        <div>
          <dt className="promises__term">Werkzeug</dt>
          <dd className="promises__text">
            {meta.quelle.werkzeug}, Fassungen {meta.quelle.wiktextract.join(' / ')}
          </dd>
        </div>
        <div>
          <dt className="promises__term">Prüfsumme der Quelldatei</dt>
          <dd className="promises__text">
            <code className="mono small">{meta.quelle.sha256}</code>
            <br />
            <span className="muted small">SHA-256, {meta.quelle.pruefsummeHinweis}.</span>
          </dd>
        </div>
        <div>
          <dt className="promises__term">Lizenz</dt>
          <dd className="promises__text">
            <a href={meta.lizenz.url} rel="noreferrer">
              {meta.lizenz.name}
            </a>{' '}
            – {meta.lizenz.hinweis}
          </dd>
        </div>
      </dl>

      <p className="small muted">
        Der Datensatz ist von LexiFlows Programmcode getrennt: Der Code ist keine Bearbeitung des
        Wörterbuchs, beide liegen in derselben Datei nebeneinander. Die Weitergabepflichten der
        Lizenz betreffen den Datensatz. Das ist eine technische Einordnung, keine Rechtsberatung.
      </p>

      <p className="small muted">
        Wiktionary ist ein Wiki. Die Einträge sind unterschiedlich gut belegt – jeder Vorschlag ist
        ein Vorschlag und wird nie automatisch zur Antwort.
      </p>

      <div className="row">
        <Button onClick={exportMetadata}>Quelle und Lizenz exportieren (.json)</Button>
      </div>
    </Card>
  );
}
