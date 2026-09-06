import { useEffect, useRef, useState } from 'react';

import { Alert, Button, Card, Field } from '../../ui/components';
import {
  GEMINI_CAPABILITIES,
  GEMINI_CAPABILITY_LABELS,
  TRANSMITTED,
} from '../../ai/gemini/capabilities';
import {
  KEY_STORAGE_NOTICE,
  forgetKey,
  isRemembered,
  loadKey,
  looksLikeApiKey,
  saveKey,
} from '../../ai/gemini/credentials';
import { GEMINI_MODELS } from '../../ai/gemini/endpoint';
import { GeminiError } from '../../ai/gemini/errors';
import {
  createGeminiAiProvider,
  GEMINI_NOTICE,
  type GeminiAssistant,
} from '../../ai/gemini/geminiAiProvider';
import { loadModel, saveModel } from '../../ai/gemini/settings';

/**
 * Der optionale Gemini-Assistent – die einzige Seite, auf der er eingerichtet wird.
 *
 * ## Diese Seite liegt hinter `lazy`
 *
 * Nicht nur wegen der Dateigröße. Sie ist die **einzige** Stelle, die den
 * Gemini-Anbieter importiert, und sie hängt allein an einer Route der
 * Lehrkraftanwendung. Damit landet der ganze Zweig in einem eigenen Bündel, das
 * die Lern-Dateien nie anfassen – `StudentApp.tsx` kennt diese Route nicht.
 * Ein Artefakttest hält fest, dass in einer ausgegebenen Lern-Datei weder der
 * Endpunkt noch Anbietercode steht.
 *
 * ## Was hier absichtlich fehlt
 *
 * **Ein Feld für die Adresse.** In dieses Formular trägt jemand seinen
 * Schlüssel ein; ein Feld daneben, das bestimmt, wohin er geht, ist genau der
 * Angriff, den man sich damit einhandelt (siehe `endpoint.ts`).
 *
 * **Ein Knopf, der den gespeicherten Schlüssel wieder anzeigt.** Es gibt ihn
 * nicht. „Anzeigen“ zeigt, was gerade getippt wird – damit ein eingefügter
 * Schlüssel vor dem Speichern geprüft werden kann – und schaltet nach kurzer
 * Zeit von selbst zurück. Ein gespeicherter Schlüssel erscheint nur noch
 * maskiert.
 *
 * **Ein Verbindungstest beim Öffnen.** Diese Seite ruft von sich aus nichts
 * auf. Der Test steht auf einem Knopf.
 */

/** Wie lange ein sichtbar gemachter Schlüssel sichtbar bleibt. */
const REVEAL_MS = 10_000;

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export interface AssistantSettingsPageProps {
  /**
   * Nur für Tests: ein Assistent mit eingestecktem Transport.
   *
   * In der Anwendung entsteht er hier – mit einer Funktion, die den Schlüssel
   * **bei jeder Anfrage neu** holt. Ein festgehaltener überlebte sonst das
   * Vergessen.
   */
  createAssistant?: (getModel: () => string) => GeminiAssistant;
}

export function AssistantSettingsPage({ createAssistant }: AssistantSettingsPageProps = {}) {
  const [gespeichert, setGespeichert] = useState(() => loadKey());
  const [eingabe, setEingabe] = useState('');
  const [sichtbar, setSichtbar] = useState(false);
  const [merken, setMerken] = useState(() => isRemembered());
  const [modell, setModell] = useState(() => loadModel());
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [hinweis, setHinweis] = useState('');

  const modellRef = useRef(modell);
  modellRef.current = modell;

  /* Sichtbarkeit läuft von selbst ab – ein offenes Feld überdauert sonst die Pause. */
  useEffect(() => {
    if (!sichtbar) return undefined;
    const timer = setTimeout(() => setSichtbar(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [sichtbar]);

  function assistent(): GeminiAssistant {
    if (createAssistant) return createAssistant(() => modellRef.current);
    return createGeminiAiProvider({
      getKey: () => loadKey()?.key,
      getModel: () => modellRef.current,
    });
  }

  function handleSpeichern(): void {
    const wert = eingabe.trim();
    if (!looksLikeApiKey(wert)) {
      setStatus({
        kind: 'error',
        message:
          'Das sieht nicht nach einem Schlüssel aus. Er besteht aus einer längeren Zeichenfolge ohne Leerzeichen.',
      });
      return;
    }

    const abgelegt = saveKey(wert, merken);
    setGespeichert(abgelegt);
    /*
      Das Feld wird geleert und der Schlüssel nie wieder hineingeschrieben. Ein
      Eingabefeld mit dem Klartext darin steht sonst offen, solange die Seite
      offen ist – und geht in jeden Screenshot mit ein.
    */
    setEingabe('');
    setSichtbar(false);
    setStatus({ kind: 'idle' });

    /*
      `isRemembered()` und nicht `merken`: In einem privaten Fenster kann das
      Merken scheitern. Ein Kästchen, das gesetzt aussieht, obwohl nichts
      gemerkt wurde, wäre eine Lüge.
    */
    const wirklichGemerkt = isRemembered();
    setMerken(wirklichGemerkt);
    setHinweis(
      wirklichGemerkt
        ? 'Der Schlüssel ist eingetragen und auf diesem Gerät gemerkt.'
        : 'Der Schlüssel gilt für diese Sitzung. Beim Schließen des Browsers wird er vergessen.',
    );
  }

  function handleVergessen(): void {
    forgetKey();
    setGespeichert(undefined);
    setEingabe('');
    setMerken(false);
    setStatus({ kind: 'idle' });
    setHinweis('Die Zugangsdaten wurden vergessen. Es liegt kein Schlüssel mehr vor.');
  }

  async function handleTesten(): Promise<void> {
    setStatus({ kind: 'testing' });
    setHinweis('');
    try {
      await assistent().testConnection();
      setStatus({ kind: 'ok' });
    } catch (error: unknown) {
      /*
        Nur die deutsche Meldung aus `errors.ts`. Der Rumpf der Google-Antwort
        wird dort gelesen und nicht weitergereicht.
      */
      setStatus({
        kind: 'error',
        message:
          error instanceof GeminiError
            ? error.message
            : 'Der Test ist fehlgeschlagen. Es wurde nichts übertragen.',
      });
    }
  }

  function handleModell(wert: string): void {
    setModell(saveModel(wert));
    // Ein Modellwechsel macht einen früheren Erfolg zu einer alten Auskunft.
    setStatus({ kind: 'idle' });
  }

  const eingerichtet = gespeichert !== undefined;

  return (
    <div className="stack" style={{ maxWidth: '46rem' }}>
      <h1>Optionaler Gemini-Assistent</h1>

      <p className="lede">
        LexiFlow arbeitet vollständig ohne diesen Assistenten. Wer ihn einrichtet, kann
        an einzelnen Stellen der Materialerstellung Google Gemini um einen Vorschlag
        bitten – immer erst nach einem Klick und immer mit dem Hinweis, was dabei
        übertragen wird.
      </p>

      <Card>
        <h2>Status</h2>
        <p>
          {eingerichtet ? (
            <>
              Ein Schlüssel liegt vor: <span className="mono">{gespeichert.key.masked}</span>{' '}
              {gespeichert.storage === 'device'
                ? '(auf diesem Gerät gemerkt)'
                : '(nur für diese Sitzung)'}
            </>
          ) : (
            'Nicht eingerichtet. Ohne Schlüssel wird nichts übertragen und nichts angefragt.'
          )}
        </p>
        {status.kind === 'ok' ? (
          <Alert tone="success" title="Verbindung steht">
            Der Schlüssel wurde von Google akzeptiert.
          </Alert>
        ) : null}
        {status.kind === 'error' ? (
          <Alert tone="error" title="Das hat nicht geklappt">
            {status.message}
          </Alert>
        ) : null}
        {hinweis ? <p className="muted small">{hinweis}</p> : null}
      </Card>

      <Card>
        <h2>Zugangsdaten</h2>

        <Field
          label="API-Schlüssel"
          hint="Aus der Google-AI-Studio-Konsole. LexiFlow prüft ihn nicht von sich aus – erst „Verbindung testen“ fragt bei Google nach."
        >
          {(props) => (
            <input
              {...props}
              type={sichtbar ? 'text' : 'password'}
              value={eingabe}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setEingabe(event.target.value)}
              placeholder={eingerichtet ? 'Neuen Schlüssel eintragen …' : ''}
            />
          )}
        </Field>

        <div className="row">
          <Button variant="primary" onClick={handleSpeichern} disabled={eingabe.trim().length === 0}>
            Schlüssel übernehmen
          </Button>
          <Button
            onClick={() => setSichtbar((vorher) => !vorher)}
            disabled={eingabe.length === 0}
            aria-pressed={sichtbar}
          >
            {sichtbar ? 'Verbergen' : 'Anzeigen'}
          </Button>
          <Button onClick={() => void handleTesten()} disabled={!eingerichtet || status.kind === 'testing'}>
            {status.kind === 'testing' ? 'Wird geprüft …' : 'Verbindung testen'}
          </Button>
          <Button variant="danger" onClick={handleVergessen} disabled={!eingerichtet}>
            Zugangsdaten vergessen
          </Button>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={merken}
            onChange={(event) => {
              const gewuenscht = event.target.checked;
              setMerken(gewuenscht);
              /*
                Sofort wirksam und nicht erst beim nächsten Speichern: Wer das
                Häkchen entfernt, will den gemerkten Schlüssel jetzt loswerden.
              */
              if (!gewuenscht && gespeichert) {
                const neu = saveKey(gespeichert.key.reveal(), false);
                setGespeichert(neu);
                setHinweis('Der Schlüssel gilt nur noch für diese Sitzung.');
              }
            }}
          />
          Auf diesem Gerät merken
        </label>

        <p className="muted small">{KEY_STORAGE_NOTICE}</p>
        <p className="muted small">
          Der Schlüssel wird nie wieder vollständig angezeigt und steht in keinem Export,
          keiner Lern-Datei, keiner CSV-Datei und keiner Fehlermeldung.
        </p>
      </Card>

      <Card>
        <h2>Modell</h2>
        <Field
          label="Gemini-Modell"
          hint="Die Wahl ist eine Kostenentscheidung. Ein anderes Modell ändert nichts daran, was übertragen wird."
        >
          {(props) => (
            <select {...props} value={modell} onChange={(event) => handleModell(event.target.value)}>
              {GEMINI_MODELS.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.label} – {eintrag.hint}
                </option>
              ))}
              {/*
                Ein gespeichertes Modell, das nicht mehr in der Liste steht,
                bleibt sichtbar. Sonst spränge die Auswahl beim Öffnen stumm auf
                einen anderen Eintrag – und die nächste Anfrage ginge an ein
                Modell, das niemand gewählt hat.
              */}
              {GEMINI_MODELS.some((eintrag) => eintrag.id === modell) ? null : (
                <option value={modell}>{modell} (nicht in dieser Fassung geführt)</option>
              )}
            </select>
          )}
        </Field>
      </Card>

      <Card quiet>
        <h2>Was übertragen wird</h2>
        <p className="muted small">{GEMINI_NOTICE}</p>
        <dl className="promises">
          {GEMINI_CAPABILITIES.map((capability) => (
            <div key={capability}>
              <dt className="promises__term">{GEMINI_CAPABILITY_LABELS[capability]}</dt>
              <dd className="promises__text">{TRANSMITTED[capability].items.join(', ')}.</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">
          Keine Namen, keine Lernstände, keine Paketkennungen. Der eingefügte Quelltext
          selbst wird nie übertragen – bei einer Textempfehlung gehen nur die lokal
          gefundenen Wortkandidaten mit je einem Satz hinaus.
        </p>
      </Card>

      <Card quiet>
        <h2>Was der Assistent nicht tut</h2>
        <ul>
          <li>Er läuft nie von selbst – jede Anfrage braucht einen Klick.</li>
          <li>Er sieht keine Lernstände und wird im Lernbereich gar nicht erst geladen.</li>
          <li>Er darf im Netz nicht nachschlagen; es sind keine Werkzeuge aktiviert.</li>
          <li>Seine Vorschläge gelten nie als geprüft und überschreiben nichts von Hand Eingetragenes.</li>
        </ul>
      </Card>
    </div>
  );
}

export default AssistantSettingsPage;
