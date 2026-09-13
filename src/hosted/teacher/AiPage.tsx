import { useCallback, useEffect, useState } from 'react';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, EmptyState } from '../../ui/components';
import type { AiConnectionSummary } from '../../application/repositories';

/**
 * Der KI-Zugang einer Lehrkraft – im Konto.
 *
 * ## Was diese Seite über den Schlüssel sagt, und warum
 *
 * Sie sagt es zweimal: beim Eintragen und danach. Ein Feld „API-Schlüssel"
 * ohne einen Satz darüber, wohin er geht, ist der Anfang der Geschichte, in
 * der jemand einen Schlüssel aus einer Anleitung kopiert und er bei einem
 * Dritten landet.
 *
 * Nach dem Speichern gibt es keinen Weg zurück: Die Seite zeigt eine Maske,
 * weil es nur noch eine Maske gibt. Der Klartext liegt versiegelt in der
 * Datenbank, und die Spalten dafür sind für den Browser nicht einmal lesbar.
 *
 * ## Warum die Adresse meist gar kein Feld ist
 *
 * Bei den offiziellen Anbietern steht sie fest (ADR-9). Ein Feld daneben
 * bestimmte, **wohin** dieser Schlüssel samt Schülertexten geht – und wer
 * eine solche Zeichenkette einmal kopiert hat, prüft sie nicht.
 *
 * Für die „kompatiblen" Anbieter – das sind die, bei denen eine Schule
 * tatsächlich einen eigenen Server betreibt – gibt es das Feld, aber nur für
 * Hosts, die eine Verwaltung freigegeben hat. Deshalb steht dort eine Auswahl
 * und kein Textfeld.
 *
 * ## Warum lazy
 *
 * Eine Lehrkraft, die keine KI benutzt, lädt diese Seite nie.
 */

/** Dieselbe Liste wie in `supabase/functions/ai-gateway/anbieter.ts`. */
const ANBIETER = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    adresse: 'https://generativelanguage.googleapis.com/v1beta/',
    eigeneAdresse: false,
    schluessel: true,
  },
  {
    id: 'openai-kompatibel',
    label: 'OpenAI-kompatibel',
    adresse: 'https://api.openai.com/v1/',
    eigeneAdresse: true,
    schluessel: true,
  },
  {
    id: 'anthropic-kompatibel',
    label: 'Anthropic-kompatibel',
    adresse: 'https://api.anthropic.com/v1/',
    eigeneAdresse: true,
    schluessel: true,
  },
  {
    id: 'browsermodell',
    label: 'Modell im Browser',
    adresse: '',
    eigeneAdresse: false,
    schluessel: false,
  },
] as const;

type AnbieterId = (typeof ANBIETER)[number]['id'];

export function AiPage() {
  const ai = useOptionalRepository('ai');

  const [liste, setListe] = useState<AiConnectionSummary[] | undefined>(undefined);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');

  const [adapter, setAdapter] = useState<AnbieterId>('gemini');
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [schluessel, setSchluessel] = useState('');
  const [adresse, setAdresse] = useState('');

  const anbieter = ANBIETER.find((eintrag) => eintrag.id === adapter)!;

  const laden = useCallback(async () => {
    if (!ai) return;
    try {
      setListe(await ai.listConnections());
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Die KI-Zugänge sind nicht abrufbar.');
    }
  }, [ai]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!ai) {
    return <Alert tone="info">In dieser Fassung gibt es keinen KI-Zugang im Konto.</Alert>;
  }

  async function tue(was: () => Promise<string>) {
    setFehler('');
    setMeldung('');
    try {
      setMeldung(await was());
      await laden();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Das hat nicht geklappt.');
    }
  }

  async function speichern() {
    await tue(async () => {
      const gespeichert = await ai!.saveConnection({
        label: label.trim(),
        adapter,
        baseUrl: anbieter.eigeneAdresse ? adresse.trim() : anbieter.adresse,
        model: model.trim(),
        secret: schluessel,
      });
      /*
        Sofort vergessen. Der Klartext hat im Zustand einer Ansicht nichts zu
        suchen – auch nicht „nur bis zum Neuladen": Ein Zustand, der ihn
        hält, landet in jedem Fehlerbericht und in jedem Screenshot der
        Entwicklerwerkzeuge.
      */
      setSchluessel('');
      setLabel('');
      setModel('');
      setAdresse('');
      return `„${gespeichert.label}" ist gespeichert. Der Schlüssel ist von hier an nicht mehr lesbar.`;
    });
  }

  return (
    <div className="stack">
      <h1>KI-Zugang</h1>

      <Alert tone="info" title="Was mit dem Schlüssel passiert">
        Er geht einmal an den Server, wird dort verschlüsselt abgelegt und kommt nie wieder heraus –
        auch nicht für dich. Danach siehst du nur noch die letzten vier Zeichen. Anfragen stellt der
        Server; dein Browser spricht nie mit dem Anbieter.
      </Alert>

      {fehler ? <Alert tone="error">{fehler}</Alert> : null}
      {meldung ? <Alert tone="success">{meldung}</Alert> : null}

      <Card>
        <h2 style={{ marginTop: 0 }}>Zugang hinzufügen</h2>

        <div className="field">
          <label htmlFor="ki-anbieter">Anbieter</label>
          <select
            id="ki-anbieter"
            value={adapter}
            onChange={(event) => setAdapter(event.target.value as AnbieterId)}
          >
            {ANBIETER.map((eintrag) => (
              <option key={eintrag.id} value={eintrag.id}>
                {eintrag.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ki-label">Name für dich</label>
          <input
            id="ki-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="z. B. Schulzugang Englisch"
          />
        </div>

        {anbieter.schluessel ? (
          <div className="field">
            <label htmlFor="ki-schluessel">API-Schlüssel</label>
            <input
              id="ki-schluessel"
              type="password"
              autoComplete="off"
              value={schluessel}
              onChange={(event) => setSchluessel(event.target.value)}
            />
            <p className="small muted" style={{ marginBottom: 0 }}>
              Geht an {anbieter.eigeneAdresse && adresse.trim() !== '' ? adresse.trim() : anbieter.adresse} – und an keine
              andere Adresse.
            </p>
          </div>
        ) : (
          <p className="small muted">
            Dieses Modell läuft in deinem Browser. Es braucht keinen Schlüssel und geht nie ins
            Netz – auch nicht über den Server.
          </p>
        )}

        {anbieter.schluessel ? (
          <div className="field">
            <label htmlFor="ki-model">Modell</label>
            <input
              id="ki-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="z. B. gemini-3.5-flash-lite"
            />
          </div>
        ) : null}

        {anbieter.eigeneAdresse ? (
          <div className="field">
            <label htmlFor="ki-adresse">Eigene Adresse (optional)</label>
            <input
              id="ki-adresse"
              value={adresse}
              onChange={(event) => setAdresse(event.target.value)}
              placeholder={anbieter.adresse}
            />
            <p className="small muted" style={{ marginBottom: 0 }}>
              Nur Hosts, die deine Verwaltung freigegeben hat. Leer lassen heißt: {anbieter.adresse}
            </p>
          </div>
        ) : null}

        <Button
          variant="primary"
          disabled={label.trim() === '' || (anbieter.schluessel && schluessel === '')}
          onClick={() => void speichern()}
        >
          Speichern
        </Button>
      </Card>

      {liste === undefined ? <p className="muted">Zugänge werden geladen …</p> : null}

      {liste !== undefined && liste.length === 0 ? (
        <EmptyState title="Noch kein KI-Zugang">
          <p style={{ marginBottom: 0 }}>
            LexiFlow funktioniert vollständig ohne. Ein Zugang ergänzt Vorschläge bei der
            Materialerstellung – im Lernbereich wird nie ein Modell angerufen.
          </p>
        </EmptyState>
      ) : null}

      {(liste ?? []).map((zugang) => (
        <Card key={zugang.id}>
          <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>{zugang.label}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {ANBIETER.find((eintrag) => eintrag.id === zugang.adapter)?.label ?? zugang.adapter}
            {zugang.model ? ` · ${zugang.model}` : ''}
            {zugang.maskedSecret ? ` · Schlüssel ${zugang.maskedSecret}` : ''}
            {zugang.lastCheckedAt
              ? ` · zuletzt geprüft ${new Date(zugang.lastCheckedAt).toLocaleDateString('de-DE')}`
              : ''}
          </p>

          <div className="row" style={{ marginTop: '0.8rem', flexWrap: 'wrap' }}>
            <Button
              small
              onClick={() =>
                tue(async () => {
                  const ergebnis = await ai!.testConnection(zugang.id);
                  if (!ergebnis.ok) throw new Error(ergebnis.message);
                  return ergebnis.message;
                })
              }
            >
              Verbindung prüfen
            </Button>
            <Button
              small
              variant="quiet"
              onClick={() =>
                tue(async () => {
                  await ai!.deleteConnection(zugang.id);
                  return `„${zugang.label}" ist entfernt. Der Schlüssel ist damit weg.`;
                })
              }
            >
              Entfernen
            </Button>
          </div>
        </Card>
      ))}

      <Card quiet>
        <p className="small muted" style={{ margin: 0 }}>
          Ein Modell bekommt Wörter und Beispielsätze zu sehen – nie Namen, nie Lernstände, nie
          etwas aus dem Lernbereich. Das gilt unabhängig davon, welchen Anbieter du wählst.
        </p>
      </Card>
    </div>
  );
}

export default AiPage;
