import { useEffect, useMemo, useState } from 'react';
import type { AiConnectionSummary, AiGateway } from '../../application/repositories';
import { Alert, Button, Card } from '../../ui/components';
import { createCoachAnbieter } from './coachAnbieter';
import {
  coachHinweisBestaetigen,
  coachHinweisGesehen,
  type HinweisSpeicher,
} from './ki-ui/hinweisSpeicher';
import { Lerncoach } from './ki-ui/Lerncoach';
import type { Coachaufgabe } from './ki-ui/vertrag';

const ZUGAENGE = [
  {
    id: 'gemini',
    adapter: 'gemini',
    label: 'Google Gemini API',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
  },
  {
    id: 'openai',
    adapter: 'openai-kompatibel',
    label: 'OpenAI API',
    baseUrl: 'https://api.openai.com/v1/',
  },
  {
    id: 'anthropic',
    adapter: 'anthropic-kompatibel',
    label: 'Anthropic Claude API',
    baseUrl: 'https://api.anthropic.com/v1/',
  },
  {
    id: 'kompatibel',
    adapter: 'openai-kompatibel',
    label: 'OpenAI-kompatibler Anbieter',
    baseUrl: '',
  },
] as const;

type ZugangId = (typeof ZUGAENGE)[number]['id'];

function browserspeicher(): HinweisSpeicher | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface LerncoachEinbettungProps {
  readonly aufgabe: Coachaufgabe;
  readonly freigegeben: boolean;
  readonly profilId?: string;
  readonly ai?: AiGateway;
  /** Nur im Test austauschbar; produktiv ist es der lokale Gerätespeicher. */
  readonly hinweisSpeicher?: HinweisSpeicher;
}

/**
 * Die einzige Brücke zwischen Übungsrunde, persönlicher Verbindung und der
 * reinen Lerncoach-Oberfläche. Sie liest weder Lernstand noch Kursdaten.
 */
export function LerncoachEinbettung({
  aufgabe,
  freigegeben,
  profilId,
  ai,
  hinweisSpeicher,
}: LerncoachEinbettungProps) {
  const speicher = hinweisSpeicher ?? browserspeicher();
  const [verbindungen, setVerbindungen] = useState<AiConnectionSummary[] | undefined>();
  const [ausgewaehlt, setAusgewaehlt] = useState('');
  const [hinweisGesehen, setHinweisGesehen] = useState(() => {
    if (!speicher || !profilId) return false;
    try {
      return coachHinweisGesehen(speicher, profilId);
    } catch {
      return false;
    }
  });
  const [fehler, setFehler] = useState('');
  const [entfernenBestaetigen, setEntfernenBestaetigen] = useState(false);

  async function laden() {
    if (!freigegeben || !ai || !profilId) return;
    try {
      const liste = (await ai.listConnections()).filter((eintrag) => eintrag.active);
      setVerbindungen(liste);
      setAusgewaehlt((bisher) =>
        liste.some((eintrag) => eintrag.id === bisher) ? bisher : (liste[0]?.id ?? ''),
      );
      setFehler('');
    } catch {
      setFehler('Deine Lerncoach-Zugänge konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    void laden();
    // `laden` ist absichtlich lokal: Ein Wechsel der Aufgabe soll keine
    // Verbindungsliste neu laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freigegeben, ai, profilId]);

  const verbindung = verbindungen?.find((eintrag) => eintrag.id === ausgewaehlt);
  const anbieter = useMemo(
    () =>
      ai && verbindung
        ? createCoachAnbieter({
            gateway: ai,
            connectionId: verbindung.id,
            name: verbindung.label,
          })
        : undefined,
    [ai, verbindung],
  );

  function bestaetigen() {
    if (speicher && profilId) {
      try {
        coachHinweisBestaetigen(speicher, profilId);
      } catch {
        // Die laufende Sitzung darf weitergehen. Ohne Speicher erscheint der
        // Hinweis beim nächsten Laden erneut – die sichere Fehlerrichtung.
      }
    }
    setHinweisGesehen(true);
  }

  if (!freigegeben) {
    return (
      <Lerncoach
        aufgabe={aufgabe}
        freigegeben={false}
        hinweisGesehen={false}
        aufHinweisVerstanden={() => {}}
      />
    );
  }

  if (!ai || !profilId) {
    return (
      <Alert tone="info" title="Lerncoach nicht verfügbar">
        Die Übungsrunde funktioniert vollständig ohne KI-Unterstützung.
      </Alert>
    );
  }

  if (fehler) return <Alert tone="error">{fehler}</Alert>;
  if (verbindungen === undefined) return <p className="muted">Lerncoach wird vorbereitet …</p>;
  if (verbindungen.length === 0) {
    return <ZugangEinrichten ai={ai} nachSpeichern={laden} />;
  }

  return (
    <div className="stack">
      {verbindungen.length > 1 ? (
        <div className="field">
          <label htmlFor="lerncoach-zugang">Lerncoach-Zugang</label>
          <select
            id="lerncoach-zugang"
            value={ausgewaehlt}
            onChange={(event) => setAusgewaehlt(event.target.value)}
          >
            {verbindungen.map((eintrag) => (
              <option key={eintrag.id} value={eintrag.id}>
                {eintrag.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Lerncoach
        aufgabe={aufgabe}
        freigegeben
        {...(anbieter ? { anbieter } : {})}
        hinweisGesehen={hinweisGesehen}
        aufHinweisVerstanden={bestaetigen}
      />
      {verbindung ? (
        entfernenBestaetigen ? (
          <Alert tone="warning" title="Zugang wirklich entfernen?">
            <p>
              Der verschlüsselte API-Schlüssel wird gelöscht. LexiFlow kann ihn danach nicht
              wiederherstellen.
            </p>
            <div className="row">
              <Button variant="quiet" onClick={() => setEntfernenBestaetigen(false)}>
                Abbrechen
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void ai.deleteConnection(verbindung.id).then(async () => {
                    setEntfernenBestaetigen(false);
                    await laden();
                  }).catch(() => setFehler('Der Zugang konnte nicht entfernt werden.'));
                }}
              >
                Wirklich entfernen
              </Button>
            </div>
          </Alert>
        ) : (
          <Button variant="quiet" onClick={() => setEntfernenBestaetigen(true)}>
            Zugang entfernen
          </Button>
        )
      ) : null}
    </div>
  );
}

function ZugangEinrichten({ ai, nachSpeichern }: { ai: AiGateway; nachSpeichern: () => Promise<void> }) {
  const [zugangId, setZugangId] = useState<ZugangId>('gemini');
  const [modell, setModell] = useState('');
  const [schluessel, setSchluessel] = useState('');
  const [adresse, setAdresse] = useState('');
  const [fehler, setFehler] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const zugang = ZUGAENGE.find((eintrag) => eintrag.id === zugangId)!;
  const eigeneAdresse = zugang.id === 'kompatibel';

  async function speichern() {
    setSpeichert(true);
    setFehler('');
    try {
      const gespeichert = await ai.saveConnection({
        label: zugang.label,
        adapter: zugang.adapter,
        baseUrl: eigeneAdresse ? adresse.trim() : zugang.baseUrl,
        model: modell.trim(),
        secret: schluessel,
      });
      setSchluessel('');
      const probe = await ai.testConnection(gespeichert.id);
      if (!probe.ok) setFehler(`Der Zugang ist gespeichert, antwortet aber noch nicht: ${probe.message}`);
      await nachSpeichern();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Der Zugang konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card className="ki-coach">
      <h3 className="ki-coach__titel">Eigenen Lerncoach verbinden</h3>
      <p>
        Du brauchst einen API-Schlüssel des Anbieters. Ein normales ChatGPT-, Claude- oder
        Gemini-Konto ist nicht automatisch ein API-Zugang. Der Schlüssel wird verschlüsselt
        gespeichert und später nicht mehr angezeigt.
      </p>
      {fehler ? <Alert tone="error">{fehler}</Alert> : null}
      <div className="field">
        <label htmlFor="lerncoach-anbieter">Anbieter</label>
        <select
          id="lerncoach-anbieter"
          value={zugangId}
          onChange={(event) => setZugangId(event.target.value as ZugangId)}
        >
          {ZUGAENGE.map((eintrag) => (
            <option key={eintrag.id} value={eintrag.id}>{eintrag.label}</option>
          ))}
        </select>
      </div>
      {eigeneAdresse ? (
        <div className="field">
          <label htmlFor="lerncoach-adresse">API-Adresse</label>
          <input
            id="lerncoach-adresse"
            type="url"
            value={adresse}
            onChange={(event) => setAdresse(event.target.value)}
            placeholder="https://…/v1/"
          />
          <p className="small muted">Die Verwaltung muss den Host vorher freigegeben haben.</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="lerncoach-modell">Modellname</label>
        <input
          id="lerncoach-modell"
          value={modell}
          onChange={(event) => setModell(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="lerncoach-schluessel">API-Schlüssel</label>
        <input
          id="lerncoach-schluessel"
          type="password"
          value={schluessel}
          onChange={(event) => setSchluessel(event.target.value)}
          autoComplete="off"
        />
      </div>
      <Button
        variant="primary"
        disabled={
          speichert ||
          modell.trim() === '' ||
          schluessel.trim() === '' ||
          (eigeneAdresse && adresse.trim() === '')
        }
        onClick={() => void speichern()}
      >
        {speichert ? 'Wird verbunden …' : 'Zugang verbinden'}
      </Button>
    </Card>
  );
}
