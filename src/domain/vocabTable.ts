import { GRADE_LABELS } from './cefr';
import { DIRECTION_LABELS, PART_OF_SPEECH_LABELS } from './schema';
import { formatAnswers } from './normalize';
import { longPartLabel } from './learningForm';
import type { PackMeta, VocabEntry, VocabPack } from './schema';

/**
 * Ein Vokabelpaket als **Tabelle** – zum Ausdrucken und zum Weiterrechnen.
 *
 * ## Warum das hier steht und nicht in der Ansicht
 *
 * Dieselbe Tabelle entsteht an vier Stellen: in der normalen
 * Lehrkraftanwendung, in der portablen Lehrkraftdatei, im Lernbereich und in
 * einer exportierten Lerndatei. Vier Oberflächen, eine Wahrheit – und die
 * gehört an eine Stelle, an der man sie prüfen kann, ohne etwas zu rendern.
 *
 * ## Was hier ausdrücklich nicht passiert
 *
 * Nichts wird verändert. Kein Paket, kein Lernstand, keine Reihenfolge im
 * Speicher. Die Funktionen hier lesen und geben zurück; eine Vokabelliste
 * auszudrucken ist keine Bearbeitung.
 */

/** Wie die Zeilen sortiert werden. */
export type TableOrder =
  /** So, wie das Paket sie führt – die Reihenfolge der Lehrkraft. */
  | 'pack'
  /** Alphabetisch nach der englischen Lernform. */
  | 'alphabetical';

export interface TableRow {
  id: string;
  /** Die vollständige englische Lernform: `to depend on sb./sth.` */
  english: string;
  /**
   * Die deutschen Bedeutungen, durch **Semikolon** getrennt.
   *
   * Dieselbe Schreibweise wie in den Eingabefeldern und auf den Karten. Ein
   * Komma bleibt Inhalt: „einen Begriff, eine Redewendung prägen“ ist **eine**
   * Bedeutung, und wer sie am Komma zerlegte, machte zwei falsche daraus.
   */
  german: string;
  /** Ausgeschrieben – `Substantiv, Plural`. Leer, wenn nicht gesetzt. */
  partOfSpeech: string;
  exampleEnglish: string;
  exampleGerman: string;
}

export interface TableOptions {
  order?: TableOrder;
}

/**
 * Die Zeilen der Tabelle.
 *
 * `toSorted` statt `sort`: Die übergebene Liste ist die des Pakets, und die
 * an Ort und Stelle umzustellen hieße, beim Drucken die Reihenfolge im
 * Speicher zu ändern.
 */
export function tableRows(
  entries: readonly VocabEntry[],
  options: TableOptions = {},
): TableRow[] {
  const rows = entries.map<TableRow>((entry) => {
    const [example] = entry.exampleSentences;
    return {
      id: entry.id,
      english: entry.english,
      german: formatAnswers(entry.germanAnswers),
      partOfSpeech: entry.partOfSpeech
        ? longPartLabel(entry.partOfSpeech, entry.grammaticalNumber)
        : '',
      exampleEnglish: example?.english ?? '',
      exampleGerman: example?.german ?? '',
    };
  });

  if (options.order !== 'alphabetical') return rows;

  /*
    `localeCompare` mit `de` und `sensitivity: 'base'`: Ein Ausdruck, in dem
    `Zebra` vor `apple` steht, weil Großbuchstaben kleinere Codepoints haben,
    sieht nach einem Fehler aus – und ist einer.
  */
  return rows.toSorted((a, b) =>
    a.english.localeCompare(b.english, 'de', { sensitivity: 'base' }),
  );
}

/** Die Kopfzeile über der Tabelle – dieselbe Auskunft wie im Paket. */
export interface TableHeader {
  title: string;
  description: string;
  grade: string;
  cefrLevel: string;
  direction: string;
  count: number;
  /** „24 Vokabeln · Klasse 9 · B1 · beide Richtungen“ */
  summary: string;
}

export function tableHeader(meta: PackMeta, count: number): TableHeader {
  const grade = GRADE_LABELS[meta.grade];
  const direction = DIRECTION_LABELS[meta.direction];
  return {
    title: meta.title,
    description: meta.description ?? '',
    grade,
    cefrLevel: meta.cefrLevel,
    direction,
    count,
    summary: [
      `${count} ${count === 1 ? 'Vokabel' : 'Vokabeln'}`,
      grade,
      meta.cefrLevel,
      direction,
      ...(meta.topic ? [meta.topic] : []),
    ].join(' · '),
  };
}

/* ------------------------------------------------------------------- CSV */

/** Die Spalten der Tabellendatei, in dieser Reihenfolge. */
export const CSV_COLUMNS = [
  'Englisch',
  'Deutsch',
  'Wortart',
  'Beispielsatz Englisch',
  'Beispielsatz Deutsch',
  'Thema',
  'Jahrgang',
  'GeR-Niveau',
] as const;

/**
 * Ein Feld für die CSV-Datei.
 *
 * Gequotet wird **immer**, nicht nur bei Bedarf. Die bedarfsgesteuerte Variante
 * ist kürzer und stolpert über genau die Zeichen, die in diesen Daten
 * vorkommen: Semikolon (das Trennzeichen der Bedeutungen), Komma (Inhalt einer
 * deutschen Bedeutung), Anführungszeichen (in Beispielsätzen) und
 * Zeilenumbrüche (in Beschreibungen). Ein Feld, das immer in Anführungszeichen
 * steht, kann keines davon falsch machen.
 *
 * Ein `"` im Inhalt wird nach RFC 4180 verdoppelt.
 */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Das Trennzeichen ist das **Semikolon**.
 *
 * Nicht aus Gewohnheit: Ein Komma träfe im deutschen Excel auf eine
 * Ländereinstellung, die das Komma als Dezimaltrennzeichen liest – die Datei
 * landete dann komplett in Spalte A. Das Semikolon ist das, was Excel unter
 * deutschen Einstellungen erwartet, und Numbers und LibreOffice erkennen es
 * ebenfalls.
 *
 * Die Bedeutungen **innerhalb** eines Feldes trennt ebenfalls ein Semikolon –
 * das ist kein Widerspruch, weil jedes Feld in Anführungszeichen steht.
 */
const DELIMITER = ';';

/**
 * `\r\n` als Zeilenende – RFC 4180, und der einzige Umbruch, den ältere
 * Excel-Fassungen unter Windows zuverlässig lesen.
 */
const NEWLINE = '\r\n';

/**
 * Das Byte-Order-Mark.
 *
 * Ohne es öffnet Excel unter Windows eine UTF-8-Datei in der
 * Windows-1252-Codierung: Aus „überfüllt“ wird „Ã¼berfÃ¼llt“. Drei Bytes am
 * Anfang verhindern das, und alle anderen Programme überlesen sie.
 */
export const CSV_BOM = '﻿';

/**
 * Das Paket als Tabellendatei.
 *
 * Verändert nichts – weder das Paket noch einen Lernstand. Der Ausdruck und
 * die Tabelle sind Lesevorgänge.
 */
export function packToCsv(pack: VocabPack, options: TableOptions = {}): string {
  const rows = tableRows(pack.entries, options);
  const topic = pack.meta.topic ?? '';
  const grade = GRADE_LABELS[pack.meta.grade];

  const lines = [
    CSV_COLUMNS.map(csvField).join(DELIMITER),
    ...rows.map((row) =>
      [
        row.english,
        row.german,
        row.partOfSpeech,
        row.exampleEnglish,
        row.exampleGerman,
        topic,
        grade,
        pack.meta.cefrLevel,
      ]
        .map(csvField)
        .join(DELIMITER),
    ),
  ];

  return CSV_BOM + lines.join(NEWLINE) + NEWLINE;
}

/**
 * Ein Dateiname, der auf jedem Dateisystem funktioniert und trotzdem sagt,
 * worum es geht: `unit-3-city-life-8-vokabelliste.csv`.
 */
export function csvFileName(meta: PackMeta): string {
  const slug = meta.title
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'vokabelliste'}-${meta.grade.toLocaleLowerCase('de-DE')}-vokabelliste.csv`;
}

/** Die ausgeschriebene Wortart – hier, damit die Ansicht nichts rechnen muss. */
export function partOfSpeechLabel(entry: VocabEntry): string {
  return entry.partOfSpeech ? PART_OF_SPEECH_LABELS[entry.partOfSpeech] : '';
}
