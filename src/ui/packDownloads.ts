import { serializePack, suggestFilename } from '../domain/vocabpack';
import { buildStudentHtml } from '../portable/studentExport';
import { loadStudentRuntime } from '../portable/studentRuntime';
import { downloadText } from './download';
import type { VocabPack } from '../domain/schema';

/**
 * Die beiden Wege, ein Paket aus der Hand zu geben – an genau einer Stelle.
 *
 * Bis 4B.2 lagen sie in `PackEditorPage`, weil es nur dort einen Knopf dafür
 * gab. Mit den Paketblöcken auf der Materialseite (Entwurfsroute B) gibt es
 * sie zweimal, und zwei Kopien derselben Exportlogik driften auseinander –
 * spätestens dann, wenn eine davon eine Prüfung dazubekommt und die andere
 * nicht. Also stehen sie hier, und beide Oberflächen rufen dasselbe auf.
 *
 * Beide Funktionen liefern statt eines `throw` ein Ergebnis mit fertigem
 * deutschen Text. Der Grund ist nicht Bequemlichkeit: Ein fehlender
 * Schüler-Export ist im Web-Build **kein Fehler**, sondern eine Eigenschaft
 * dieses Builds – und die Oberfläche soll das erklären können, ohne den Grund
 * aus einem Ausnahmetext zu raten.
 */

export type PackDownloadOutcome =
  | { ok: true; message: string; filename: string }
  | { ok: false; message: string };

/** Das Paket als weiterbearbeitbare LexiFlow-Datei. Läuft in jedem Build. */
export function downloadPackFile(pack: VocabPack): PackDownloadOutcome {
  const filename = suggestFilename(pack.meta);
  downloadText(filename, serializePack(pack));
  return { ok: true, filename, message: `Paketdatei erstellt: ${filename}` };
}

/**
 * Das Paket als eigenständige Lerndatei – ein Paket, eine HTML-Datei.
 *
 * Der Weg ist bewusst derselbe wie beim Paket-Export: Blob, Objekt-URL,
 * Anker-Klick. Das funktioniert auch in Safari und ohne Server; nichts
 * verlässt dabei das Gerät.
 */
export async function downloadStudentFile(pack: VocabPack): Promise<PackDownloadOutcome> {
  const runtime = await loadStudentRuntime();
  if (!runtime) {
    return {
      ok: false,
      message:
        'Die Einzeldatei lässt sich in der portablen Datei „LexiFlow-Lehrkraft.html“ erzeugen.',
    };
  }

  const result = buildStudentHtml(runtime, pack);
  if (!result.ok) {
    return { ok: false, message: `Die Einzeldatei konnte nicht erzeugt werden: ${result.errors.join(' · ')}` };
  }

  downloadText(result.filename, result.html, 'text/html');
  return { ok: true, filename: result.filename, message: `Einzeldatei erstellt: ${result.filename}` };
}
