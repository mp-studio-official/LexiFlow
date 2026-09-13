import { useCallback, useEffect, useState } from 'react';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { soloUrlFrom } from '../../runtime/entryUrls';
import { Alert, Button, Card } from '../../ui/components';
import { getPack, listPacks } from '../../data/packRepo';
import type { PackMeta } from '../../domain/schema';

/**
 * Pakete aus „LexiFlow ohne Konto" ins Konto übernehmen.
 *
 * ## Warum das überhaupt geht
 *
 * Beide Auslieferungen liegen unter demselben Ursprung – `/LexiFlow/` und
 * `/LexiFlow/portal/`. IndexedDB gehört dem Ursprung, nicht dem Pfad: Das
 * Portal liest denselben Speicher, in dem die kontofreie Anwendung ihre
 * Pakete hat. Wer bisher ohne Konto gearbeitet hat, muss nichts exportieren
 * und nichts hochladen.
 *
 * Das ist eine hübsche Folge von ADR-10 und war nicht der Grund dafür – aber
 * es ist der Grund, warum diese Seite ohne Dateiauswahl auskommt.
 *
 * ## Warum das lazy geladen wird
 *
 * Diese Datei zieht den lokalen Speicher (Dexie) ins Bündel. Eine Lehrkraft
 * braucht sie einmal. Statisch importiert läge sie in jedem Portalbündel und
 * bei jedem Aufruf im Netz.
 *
 * ## Was übernommen wird – und was nicht
 *
 * Pakete. **Keine Lernstände**: Sie gehören der Person, an deren Gerät sie
 * entstanden sind, und es gibt in diesem Produkt keinen Weg, sie irgendwo
 * anders hinzubringen.
 */
export function LocalImportPanel({ onUebernommen }: { onUebernommen: () => Promise<void> }) {
  const packs = useOptionalRepository('packs');
  const [lokale, setLokale] = useState<PackMeta[] | undefined>(undefined);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [fertig, setFertig] = useState(0);

  const laden = useCallback(async () => {
    try {
      setLokale(await listPacks());
    } catch {
      /*
        Kein Fehler nach außen: Ein Browser ohne dauerhaften Speicher – privates
        Fenster, gesperrte Website-Daten – ist kein Defekt, sondern ein Gerät,
        auf dem es eben nichts zu übernehmen gibt.
      */
      setLokale([]);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!packs || lokale === undefined || lokale.length === 0) return null;

  async function uebernehmen() {
    setFehler('');
    setLaeuft(true);
    let gezaehlt = 0;
    try {
      for (const meta of lokale ?? []) {
        const pack = await getPack(meta.id);
        if (!pack) continue;
        await packs!.importFromLocal(pack);
        gezaehlt += 1;
      }
      setFertig(gezaehlt);
      await onUebernommen();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Die Übernahme ist nicht durchgelaufen.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card quiet>
      <h2 style={{ marginTop: 0 }}>Auf diesem Gerät liegen {lokale.length} Pakete</h2>
      <p>
        Sie stammen aus{' '}
        <a href={soloUrlFrom(import.meta.env.BASE_URL)}>LexiFlow ohne Konto</a> und liegen im
        Speicher dieses Browsers. Du kannst sie ins Konto übernehmen – dort lassen sie sich
        veröffentlichen und einer Lerngruppe geben.
      </p>

      {fehler ? <Alert tone="error">{fehler}</Alert> : null}
      {fertig > 0 ? (
        <Alert tone="success">
          {fertig} {fertig === 1 ? 'Paket ist' : 'Pakete sind'} übernommen. Die lokalen bleiben, wo
          sie sind – es wird nichts verschoben.
        </Alert>
      ) : null}

      <Button onClick={() => void uebernehmen()} disabled={laeuft}>
        {laeuft ? 'Einen Moment …' : 'Alle übernehmen'}
      </Button>

      <p className="small muted" style={{ marginBottom: 0 }}>
        Übernommen werden nur die Vokabelpakete. Lernstände bleiben auf dem Gerät, auf dem sie
        entstanden sind – auch deine eigenen.
      </p>
    </Card>
  );
}

export default LocalImportPanel;
