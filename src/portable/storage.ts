/**
 * Speicherbereitschaft prüfen – bevor die App etwas verspricht.
 *
 * Unter `file://` verhalten sich Browser unterschiedlich: Chromium und Firefox
 * geben IndexedDB frei, andere (und jeder private Modus) können sie sperren.
 * Statt beim ersten Schreibversuch abzustürzen, wird einmal ehrlich geprüft –
 * und das Ergebnis bestimmt, was die Oberfläche über den Lernstand behauptet.
 *
 * Es wird nichts gelöscht: Die Prüfung legt eine eigene, winzige Datenbank an
 * und räumt ausschließlich diese wieder weg.
 */

export type StorageState = 'unbekannt' | 'verfuegbar' | 'gesperrt';

const PROBE_DB = 'lexiflow-speichertest';

export interface StorageCheck {
  state: StorageState;
  /** Kurzer Grund, wenn gesperrt – für die Anzeige, nicht für Entwickler. */
  reason?: string;
}

/** Öffnet testweise eine eigene Datenbank und schließt sie wieder. */
export async function checkStorage(): Promise<StorageCheck> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return { state: 'gesperrt', reason: 'Dieser Browser stellt hier keinen dauerhaften Speicher bereit.' };
  }

  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(PROBE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('probe')) {
          request.result.createObjectStore('probe');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('unbekannt'));
      request.onblocked = () => reject(new Error('blockiert'));
    });

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('probe', 'readwrite');
      tx.objectStore('probe').put(1, 'k');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('unbekannt'));
    });

    database.close();
    // Nur die eigene Testdatenbank – fremde Browserdaten bleiben unberührt.
    indexedDB.deleteDatabase(PROBE_DB);
    return { state: 'verfuegbar' };
  } catch {
    return {
      state: 'gesperrt',
      reason: 'Dieser Browser erlaubt hier keinen dauerhaften Speicher.',
    };
  }
}

/** Der Satz, der in der Schülerdatei über dem Lernstand steht. */
export function storageNotice(state: StorageState): string {
  if (state === 'gesperrt') {
    return 'Dein Lernstand kann in dieser Datei nicht gespeichert werden. Du kannst weiterüben – beim Schließen geht der Fortschritt aber verloren.';
  }
  return 'Dein Lernstand wird in diesem Browser gespeichert. Wenn du die Datei umbenennst, verschiebst oder in einem anderen Browser öffnest, kann er dort nicht verfügbar sein.';
}
