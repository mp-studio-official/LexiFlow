import { z } from 'zod';
import {
  VOCABPACK_KIND,
  vocabPackFileSchema,
  type VocabPack,
  type VocabPackFile,
} from './schema';
import { APP_NAME, APP_VERSION, describeZodErrors, toPackFile } from './vocabpack';
import { migrateToCurrent, UnsupportedFormatVersionError } from './migrations';

/**
 * Ein **Lernbereich**: ein Titel und die Pakete, die dazugehören.
 *
 * Bis Sprint 4B.7 gab eine Lehrkraft genau ein Paket aus der Hand – eine
 * HTML-Datei, ein Paket. Für eine Unit reicht das; für ein Halbjahr nicht. Wer
 * sechs Pakete verteilt, verteilt sechs Dateien, und jede davon ist im
 * Downloadordner einer fünfzehnjährigen Person eine Datei, die sie wiederfinden
 * muss.
 *
 * Ein Lernbereich ist die Klammer darum: **eine** Datei, mehrere Pakete, ein
 * gemeinsamer Lernstand.
 *
 * ## Was ein Lernbereich ausdrücklich nicht ist
 *
 * Er ist **keine Lerngruppe und keine Klasse**. Er trägt keine Namen, keine
 * Zuordnung von Personen und keinen Zugang. Er ist eine Zusammenstellung von
 * Material – dieselbe Datei geht an alle, und was jemand damit macht, bleibt
 * auf dessen Gerät. Es gibt keinen Rückkanal; es kann keinen geben, weil die
 * Datei nichts sendet.
 *
 * ## Warum die Kennung im Bereich steht und nicht im Dateinamen
 *
 * Eine Lehrkraft gibt denselben Bereich mehrmals aus: erst mit vier Paketen,
 * nach den Ferien mit sechs, dazwischen mit einer korrigierten Vokabel. Wer
 * die zweite Datei öffnet, soll seinen Lernstand aus der ersten wiederfinden.
 *
 * Die Kennung `id` leistet das: Sie bestimmt den Namen der lokalen Datenbank
 * (siehe `portable/embedded.ts`). Bleibt sie gleich, findet die neue Datei den
 * alten Stand und ergänzt ihn; neue Vokabeln kommen als unbearbeitet dazu, und
 * keine bereits gelernte verliert ihr Fach.
 *
 * Sie ist damit die einzige Angabe in dieser Datei, die man **nicht** ändern
 * darf, ohne es zu meinen.
 *
 * ## Warum ein Einzelpaket derselbe Fall ist
 *
 * Die Ausgabe eines einzelnen Pakets erzeugt seit 4B.7 ebenfalls einen
 * Lernbereich – einen mit genau einem Paket, dessen Kennung die des Pakets
 * ist. Zwei Datenformen für dieselbe Sache wären zwei Migrationswege, zwei
 * Leseroutinen und zwei Stellen, an denen ein Lernstand verlorengehen kann.
 *
 * Dass die Kennung dabei die Paket-Id ist, ist kein Detail: Es ist der Grund,
 * warum eine Lerndatei, die vor 4B.7 verteilt wurde, nach einer Neuausgabe
 * denselben Lernstand wiederfindet.
 */

/** Version des eingebetteten Lernbereich-Formats. */
export const LEARNING_AREA_FORMAT_VERSION = 1;
export const LEARNING_AREA_KIND = 'lexiflow.lernbereich' as const;

/** Wie viele Pakete ein Lernbereich höchstens trägt. */
export const LEARNING_AREA_MAX_PACKS = 40;

const trimmed = z.string().trim();
const nonEmpty = trimmed.min(1);

/**
 * Der Lernbereich, wie er in der Datei steht.
 *
 * Die Pakete stehen als vollständige `VocabPackFile`-Objekte darin – Zeichen
 * für Zeichen dasselbe wie in einer einzelnen `.vocabpack.json`. Eine eigene,
 * gekürzte Paketform wäre ein zweites Format mit eigener Migration; die
 * Ersparnis wären ein paar Bytes.
 */
export const learningAreaFileSchema = z.object({
  kind: z.literal(LEARNING_AREA_KIND),
  formatVersion: z.number().int().min(1),
  app: z
    .object({ name: trimmed.default(APP_NAME), version: trimmed.default(APP_VERSION) })
    .optional(),
  /** Bleibt über Neuausgaben hinweg gleich – daran hängt der Lernstand. */
  id: nonEmpty,
  title: nonEmpty.max(120),
  description: trimmed.max(2000).optional(),
  packs: z.array(vocabPackFileSchema).min(1).max(LEARNING_AREA_MAX_PACKS),
});
export type LearningAreaFile = z.infer<typeof learningAreaFileSchema>;

/**
 * Ein Lernbereich im Speicher der Lehrkraft.
 *
 * Hier stehen **Kennungen** und nicht die Pakete selbst: Der Bereich verweist
 * auf das, was in der Bibliothek liegt. Kopierte er die Pakete, wäre jede
 * Korrektur an einer Vokabel eine Korrektur an zwei Stellen – und die zweite
 * vergäße man.
 */
export interface LearningArea {
  id: string;
  title: string;
  description?: string;
  /** Die Pakete in der Reihenfolge, in der sie erscheinen sollen. */
  packIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Die Form, die in der Datei landet. Reine Rechnung, kein Speicherzugriff. */
export function toLearningAreaFile(
  area: Pick<LearningArea, 'id' | 'title' | 'description'>,
  packs: readonly VocabPack[],
): LearningAreaFile {
  return {
    kind: LEARNING_AREA_KIND,
    formatVersion: LEARNING_AREA_FORMAT_VERSION,
    app: { name: APP_NAME, version: APP_VERSION },
    id: area.id,
    title: area.title,
    ...(area.description ? { description: area.description } : {}),
    packs: packs.map(toPackFile),
  };
}

/**
 * Ein einzelnes Paket als Lernbereich mit genau einem Paket.
 *
 * Die Kennung ist die des Pakets – siehe oben: Daran hängt, dass eine erneut
 * ausgegebene Lerndatei den Lernstand der vorigen wiederfindet.
 */
export function singlePackArea(pack: VocabPack): LearningAreaFile {
  return toLearningAreaFile(
    {
      id: pack.meta.id,
      title: pack.meta.title,
      ...(pack.meta.description ? { description: pack.meta.description } : {}),
    },
    [pack],
  );
}

export type ParseLearningAreaResult =
  | { ok: true; area: LearningAreaFile }
  | { ok: false; errors: string[] };

/**
 * Einen Lernbereich aus JSON lesen – **und** eine alte Einzelpaket-Datei.
 *
 * Vor 4B.7 stand in einer Lerndatei ein nacktes `VocabPackFile`. Solche
 * Dateien sind längst verteilt; sie tragen zwar ihre eigene Laufzeit in sich
 * und lesen sich selbst, aber dieselbe Leseroutine muss beides können, damit
 * es nicht zwei gibt.
 *
 * Unterschieden wird an `kind` und nicht daran, ob `packs` vorhanden ist: Eine
 * Prüfung auf ein Feld beantwortet die Frage „ist das überhaupt eine
 * LexiFlow-Datei?“ nicht – ein beliebiges JSON mit einem `packs`-Feld käme
 * sonst bis in die Schemaprüfung.
 */
export function parseLearningArea(text: string): ParseLearningAreaResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ['Die Datei ist kein gültiges JSON.'] };
  }

  const kind = (raw as { kind?: unknown } | null)?.kind;

  if (kind === VOCABPACK_KIND) {
    // Eine Datei aus der Zeit vor den Lernbereichen: ein einzelnes Paket.
    let migrated: unknown;
    try {
      migrated = migrateToCurrent(raw);
    } catch (error: unknown) {
      if (error instanceof UnsupportedFormatVersionError) {
        return { ok: false, errors: [error.message] };
      }
      return { ok: false, errors: ['Die Datei konnte nicht gelesen werden.'] };
    }
    const parsed = vocabPackFileSchema.safeParse(migrated);
    if (!parsed.success) return { ok: false, errors: describeZodErrors(parsed.error) };
    return { ok: true, area: wrapLegacyPack(parsed.data) };
  }

  if (kind !== LEARNING_AREA_KIND) {
    return { ok: false, errors: ['Die Datei ist kein LexiFlow-Lernbereich.'] };
  }

  /*
    Jedes Paket geht einzeln durch die Migration – nicht der Bereich als
    Ganzes. Die Migrationen kennen Pakete; ein Bereich, den man ihnen
    hinreichte, käme unverändert zurück, und ein Bereich mit einem Paket der
    Version 1 wäre damit unlesbar.
  */
  const shallow = raw as { packs?: unknown };
  if (!Array.isArray(shallow.packs)) {
    return { ok: false, errors: ['packs: In dieser Datei stehen keine Pakete.'] };
  }

  const packs: unknown[] = [];
  for (const pack of shallow.packs) {
    try {
      packs.push(migrateToCurrent(pack));
    } catch (error: unknown) {
      if (error instanceof UnsupportedFormatVersionError) {
        return { ok: false, errors: [error.message] };
      }
      return { ok: false, errors: ['Ein Paket in dieser Datei konnte nicht gelesen werden.'] };
    }
  }

  const parsed = learningAreaFileSchema.safeParse({ ...(raw as object), packs });
  if (!parsed.success) return { ok: false, errors: describeZodErrors(parsed.error) };
  return { ok: true, area: parsed.data };
}

/** Eine alte Einzelpaket-Datei als Lernbereich mit einem Paket. */
function wrapLegacyPack(pack: VocabPackFile): LearningAreaFile {
  return {
    kind: LEARNING_AREA_KIND,
    formatVersion: LEARNING_AREA_FORMAT_VERSION,
    id: pack.meta.id,
    title: pack.meta.title,
    ...(pack.meta.description ? { description: pack.meta.description } : {}),
    packs: [pack],
  };
}

/** Die Pakete eines gelesenen Bereichs in der Form, mit der die App arbeitet. */
export function areaPacks(area: LearningAreaFile): VocabPack[] {
  return area.packs.map((pack) => ({ meta: pack.meta, entries: pack.entries }));
}

/** Was auf der Übersicht über einem Bereich steht. */
export function describeArea(packs: readonly Pick<VocabPack, 'entries'>[]): string {
  const packCount = packs.length;
  const words = packs.reduce((sum, pack) => sum + pack.entries.length, 0);
  return [
    `${packCount} ${packCount === 1 ? 'Paket' : 'Pakete'}`,
    `${words} ${words === 1 ? 'Vokabel' : 'Vokabeln'}`,
  ].join(' · ');
}

/**
 * Der Dateiname eines Lernbereichs.
 *
 * Dieselbe Reduktion wie beim Paket: Umlaute ausgeschrieben, alles Übrige auf
 * ASCII. Der Name überlebt Windows, macOS, Moodle und E-Mail-Anhänge
 * unverändert; Punkte, Schrägstriche und Steuerzeichen können nicht entstehen.
 */
export function learningAreaFileName(title: string): string {
  const slug = title
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${slug || 'lernbereich'}-lexiflow.html`;
}

/** Der Fenstertitel der Datei – ohne HTML-Sonderzeichen. */
export function learningAreaDocumentTitle(title: string): string {
  const clean = title.replace(/[<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'Lernbereich'} – LexiFlow`;
}

/**
 * Ab welcher Dateigröße ein Wort dazugehört: **2 MiB**.
 *
 * Keine Grenze, sondern ein Hinweis – und die Zahl ist gemessen, nicht
 * geschätzt. Aus der fertigen Lernlaufzeit (666,9 KiB) und Paketen mit
 * vollständigen Lernformen, zwei Bedeutungen und einem Beispielsatz je Vokabel:
 *
 * | Inhalt | Vokabeln | Datei |
 * | --- | --- | --- |
 * | 1 Paket × 60 | 60 | 690,7 KiB |
 * | 6 Pakete × 60 | 360 | 808,5 KiB |
 * | 20 Pakete × 60 | 1200 | 1141,0 KiB |
 * | 40 Pakete × 60 | 2400 | 1617,2 KiB |
 * | 40 Pakete × 100 | 4000 | 2240,7 KiB |
 *
 * Die Obergrenze von 40 Paketen ist damit **kein** Größenproblem: Selbst
 * ausgereizt bleibt die Datei kleiner als ein Foto aus einem Telefon. Der
 * Hinweis greift erst dort, wo ein Bereich ungewöhnlich viel Inhalt trägt –
 * und er redet nicht vom Browser, der 2 MB mühelos öffnet, sondern vom Weg
 * dorthin: Moodle-Grenzen, Mobilfunk, achtundzwanzig Downloads im
 * Schulnetz.
 *
 * ## Warum keine harte Schranke
 *
 * Weil es dafür keine Messung auf den Zielgeräten gibt. Eine Zahl, ab der die
 * Ausgabe verweigert würde, wäre geraten – und sie stünde einer Lehrkraft im
 * Weg, deren Halbjahresbereich nun einmal groß ist. Wer die Datei trotzdem
 * verteilen will, soll das können; er soll es nur nicht versehentlich tun.
 */
export const LEARNING_AREA_SIZE_HINT_BYTES = 2 * 1024 * 1024;

/** Eine Dateigröße, wie sie eine Lehrkraft lesen würde: `1,4 MB`. */
export function describeFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1000) return `${kib.toFixed(0).replace('.', ',')} KB`;
  return `${(kib / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Der Satz zur Größe einer fertigen Lerndatei – oder keiner.
 *
 * `undefined` heißt „unauffällig", und dann steht auch nichts da. Ein Hinweis,
 * der immer erscheint, ist nach dem dritten Mal keiner mehr.
 */
export function sizeAdvice(bytes: number): string | undefined {
  if (bytes < LEARNING_AREA_SIZE_HINT_BYTES) return undefined;
  return (
    `Diese Datei ist mit ${describeFileSize(bytes)} ungewöhnlich groß. ` +
    'Sie funktioniert – aber prüfe, ob deine Plattform sie annimmt, und bedenke, ' +
    'dass die Lerngruppe sie herunterladen muss. Ein Bereich mit weniger Paketen ' +
    'wäre leichter zu verteilen.'
  );
}

/** Ein Lernbereich ohne Pakete lässt sich nicht ausgeben – und warum. */
export function areaBlockers(area: { title: string; packIds: readonly string[] }): string[] {
  const blockers: string[] = [];
  if (!area.title.trim()) blockers.push('Der Lernbereich braucht einen Titel.');
  if (area.packIds.length === 0) {
    blockers.push('Wähle mindestens ein Paket aus, das in den Lernbereich soll.');
  }
  if (area.packIds.length > LEARNING_AREA_MAX_PACKS) {
    blockers.push(
      `Ein Lernbereich fasst höchstens ${LEARNING_AREA_MAX_PACKS} Pakete. Teile ihn auf.`,
    );
  }
  return blockers;
}
