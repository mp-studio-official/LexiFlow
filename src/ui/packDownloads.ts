import { serializePack, suggestFilename } from '../domain/vocabpack';
import {
  areaBlockers,
  describeFileSize,
  sizeAdvice,
  type LearningArea,
} from '../domain/learningArea';
import { buildLearningAreaHtml, buildStudentHtml } from '../portable/studentExport';
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
  | {
      ok: true;
      message: string;
      filename: string;
      /**
       * Ein Satz, der neben dem Erfolg steht – heute nur zur Dateigröße.
       *
       * Getrennt von `message` und nicht darin: Die Datei **ist** erstellt.
       * Beides in einen Satz zu packen hieße, einen Erfolg wie ein halbes
       * Scheitern klingen zu lassen.
       */
      warning?: string;
    }
  | { ok: false; message: string };

/**
 * Wie groß die erzeugte Datei wirklich ist – in Bytes.
 *
 * `TextEncoder` und nicht `html.length`: Eine Zeichenkette zählt Zeichen, eine
 * Datei zählt Bytes, und „überfüllt“ ist in UTF-8 länger als es aussieht. Der
 * Unterschied ist bei einer deutschen Vokabelliste keine Rundung.
 *
 * Kein `Blob`: Der existiert unter `file://` zwar auch, aber `TextEncoder`
 * kostet keine Objektzuweisung und ist in jedem Zielbrowser vorhanden.
 */
function byteSize(html: string): number {
  return new TextEncoder().encode(html).length;
}

/** Der Hinweis zur Größe – als Feld, das es nur gibt, wenn es etwas zu sagen gibt. */
function advice(bytes: number): { warning?: string } {
  const text = sizeAdvice(bytes);
  return text ? { warning: text } : {};
}

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
        'Lerndateien lassen sich in der portablen Datei „LexiFlow-Lehrkraft.html“ erzeugen.',
    };
  }

  const result = buildStudentHtml(runtime, pack);
  if (!result.ok) {
    return {
      ok: false,
      message: `Die Lerndatei konnte nicht erzeugt werden: ${result.errors.join(' · ')}`,
    };
  }

  downloadText(result.filename, result.html, 'text/html');
  const bytes = byteSize(result.html);
  return {
    ok: true,
    filename: result.filename,
    message: `Lerndatei erstellt: ${result.filename} (${describeFileSize(bytes)})`,
    ...advice(bytes),
  };
}

/**
 * Ein **Lernbereich** als eigenständige Lerndatei – mehrere Pakete, eine Datei.
 *
 * Derselbe Weg wie beim einzelnen Paket, mit einem Unterschied, der in der
 * Reihenfolge steckt: Erst wird geprüft, ob überhaupt etwas auszugeben ist,
 * **dann** wird gebaut. Eine Datei mit null Paketen ließe sich technisch
 * erzeugen; sie wäre bei achtundzwanzig Lernenden eine leere Startseite und
 * bei der Lehrkraft eine Rückfrage am nächsten Morgen.
 *
 * Die Pakete kommen als Parameter und werden hier nicht nachgeladen: Was in
 * die Datei kommt, hat die aufrufende Seite bereits vor Augen – und ein
 * zweiter Lesevorgang könnte etwas anderes finden als das, was dort steht.
 */
export async function downloadLearningAreaFile(
  area: Pick<LearningArea, 'id' | 'title' | 'description'>,
  packs: readonly VocabPack[],
): Promise<PackDownloadOutcome> {
  const blockers = areaBlockers({ title: area.title, packIds: packs.map((pack) => pack.meta.id) });
  if (blockers.length > 0) return { ok: false, message: blockers.join(' ') };

  const runtime = await loadStudentRuntime();
  if (!runtime) {
    return {
      ok: false,
      message:
        'Lerndateien lassen sich in der portablen Datei „LexiFlow-Lehrkraft.html“ erzeugen.',
    };
  }

  const result = buildLearningAreaHtml(runtime, area, packs);
  if (!result.ok) {
    return {
      ok: false,
      message: `Die Lerndatei konnte nicht erzeugt werden: ${result.errors.join(' · ')}`,
    };
  }

  downloadText(result.filename, result.html, 'text/html');
  /*
    Die Größe wird **gemessen** und nicht geschätzt: Erst hier steht die Datei
    fertig da. Eine Vorhersage aus der Vokabelzahl wäre ein Modell, und ein
    Modell weicht ab, sobald jemand längere Beispielsätze schreibt.
  */
  const bytes = byteSize(result.html);
  return {
    ok: true,
    filename: result.filename,
    message: `Lerndatei erstellt: ${result.filename} (${describeFileSize(bytes)})`,
    ...advice(bytes),
  };
}
