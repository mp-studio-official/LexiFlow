import { parsePackFile } from '../domain/vocabpack';
import { type Delimiter, detectDelimiter, parseCsv, parsePastedText, stripBom } from './csv';
import { type ColumnMapping, detectColumns } from './columnDetect';
import {
  type DraftRow,
  type DraftSummary,
  buildDrafts,
  draftFromEntry,
  summarize,
  validateDrafts,
} from './draft';
import { looksStructured, parseStructuredList, structuredToDrafts } from './structuredList';
import { XlsxReadError, readXlsx } from './xlsx';

/**
 * Der eine Eingang in den Import.
 *
 * ## Was hier neu ist — und was ausdrücklich nicht
 *
 * Nichts an dieser Datei liest selbst ein Format. `parseCsv`,
 * `parsePastedText`, `readXlsx`, `parseStructuredList`, `detectColumns`,
 * `buildDrafts` und `validateDrafts` standen alle schon da und werden
 * benutzt, nicht nachgebaut. Neu ist allein die **Entscheidung**, welches
 * davon dran ist.
 *
 * Bisher traf die ein Radiobutton: Die Lehrkraft musste vorher sagen, ob
 * das, was sie gleich einfügt, eine CSV-Datei, eine Tabelle oder freier
 * Text ist. Das ist eine Frage nach etwas, das man dem Inhalt ansieht — und
 * eine falsche Antwort darauf führt nicht zu einer Fehlermeldung, sondern
 * zu einer Liste, in der alles in der falschen Spalte steht.
 *
 * ## Warum die Erkennung sagt, wie sicher sie ist
 *
 * Eine Erkennung, die immer behauptet, sie habe es erkannt, ist für die
 * Oberfläche wertlos: Sie kann dann nie entscheiden, ob sie die Vorschau
 * einfach zeigt oder lieber nachfragt. `sicher` trennt beides, und
 * `begruendung` ist der Satz, der in der Oberfläche darüber steht — damit
 * eine Lehrkraft die Entscheidung nachvollziehen und umstellen kann,
 * statt sie zu erraten.
 *
 * ## Warum hier kein `File` vorkommt
 *
 * Ein `File` gibt es nur im Browser. Diese Datei bekommt Name, Größe und
 * schon gelesenen Inhalt; wer liest, ist die Oberfläche. Dadurch lässt sich
 * jeder Fall hier prüfen, ohne eine Datei anzulegen oder einen Browser zu
 * starten.
 */

/** Woher die Vokabeln kommen sollen. */
export type Quelle =
  | { readonly art: 'text'; readonly text: string }
  | {
      readonly art: 'datei';
      readonly name: string;
      readonly groesse: number;
      /** Schon gelesen: Text für textartige Dateien, Puffer für Tabellenblätter. */
      readonly inhalt: string | ArrayBuffer;
    };

export type Quellenart =
  | 'tabelle'
  | 'fliesstext'
  | 'eingefuegte-liste'
  | 'strukturierte-liste'
  | 'tabellenblatt'
  | 'lexiflow-paket'
  | 'unklar';

export interface Erkennung {
  readonly art: Quellenart;
  /** Ein Satz, der in der Oberfläche über der Vorschau stehen kann. */
  readonly begruendung: string;
  /**
   * Reicht das, um ohne Rückfrage fortzufahren?
   *
   * `false` heißt nicht „kaputt", sondern „zeig der Lehrkraft, was du
   * angenommen hast, bevor du damit weiterrechnest".
   */
  readonly sicher: boolean;
  readonly trennzeichen?: Delimiter;
  /** Bei Tabellenblättern: das gelesene Blatt und die Auswahl daneben. */
  readonly blatt?: string;
  readonly blaetter?: readonly string[];
}

export type Importergebnis =
  | {
      readonly art: 'gelesen';
      readonly erkennung: Erkennung;
      readonly zeilen: readonly DraftRow[];
      /** Nur bei Tabellen gesetzt; die strukturierte Liste ordnet selbst zu. */
      readonly zuordnung?: ColumnMapping;
      readonly befund: DraftSummary;
      /** Zeilen, die zu keiner Vokabel gehörten. Sie gehen nicht verloren. */
      readonly unzugeordnet: readonly string[];
    }
  /**
   * Zusammenhängender Text — nicht zu Zeilen zerlegbar, sondern zu
   * analysieren.
   *
   * Der Universalimport hört hier bewusst auf. Was aus Fließtext wird,
   * entscheidet die Textwerkstatt zusammen mit der Lehrkraft; eine
   * Vokabelliste daraus zu bauen wäre genau die stille Fehlannahme, die
   * diese Spielart abstellt.
   */
  | { readonly art: 'fliesstext'; readonly erkennung: Erkennung; readonly text: string }
  | { readonly art: 'leer'; readonly grund: string }
  | { readonly art: 'fehler'; readonly grund: string }
  | { readonly art: 'zu-gross'; readonly grund: string; readonly grenze: number };

export interface Importoptionen {
  /** Mehrere Bedeutungen in der Deutsch-Spalte auftrennen. Vorgabe: ja. */
  readonly mehrfachbedeutungenTrennen?: boolean;
  /** Ein anderes Trennzeichen als das erkannte erzwingen. */
  readonly trennzeichen?: Delimiter;
  /** Eine andere Spaltenzuordnung als die erkannte erzwingen. */
  readonly zuordnung?: ColumnMapping;
  /** Ein anderes Blatt als das erste. */
  readonly blatt?: string;
}

/**
 * Grenzen, ab denen abgelehnt statt gelesen wird.
 *
 * Nicht, weil mehr nicht ginge, sondern weil eine Oberfläche mit
 * zwanzigtausend Zeilen keine Vorschau mehr ist. Wer mehr hat, teilt auf —
 * und erfährt das als Satz, nicht als eingefrorene Seite.
 */
export const GRENZE_ZEILEN = 2_000;
export const GRENZE_BYTES = 5 * 1024 * 1024;

const PAKETENDUNG = /\.(vocabpack\.json|json)$/i;
const BLATTENDUNG = /\.xlsx$/i;

function istLeer(text: string): boolean {
  return text.trim().length === 0;
}

function zeilenzahl(text: string): number {
  return text.split('\n').filter((zeile) => zeile.trim().length > 0).length;
}

/**
 * Wie viele Felder eine Zeile im Schnitt hat.
 *
 * Der Unterschied zwischen „Tabelle" und „einfach Text untereinander": Eine
 * Tabelle hat in fast jeder Zeile gleich viele Felder, und es sind mehr als
 * eines.
 */
function spaltenbild(text: string, trenner: Delimiter): { spalten: number; einheitlich: boolean } {
  const zeilen = text
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0)
    .slice(0, 30);
  if (zeilen.length === 0) return { spalten: 0, einheitlich: false };
  const zahlen = zeilen.map((zeile) => zeile.split(trenner).length);
  const haeufigste = zahlen
    .slice()
    .sort((a, b) => zahlen.filter((z) => z === b).length - zahlen.filter((z) => z === a).length)[0]!;
  const treffer = zahlen.filter((zahl) => zahl === haeufigste).length;
  return { spalten: haeufigste, einheitlich: treffer / zahlen.length >= 0.8 };
}


/**
 * Woran man zusammenhängenden Text erkennt — und woran eine Liste.
 *
 * ## Warum das überhaupt eine eigene Frage ist
 *
 * Bis hierher fiel alles ohne erkennbare zweite Spalte auf
 * `eingefuegte-liste`. Ein englischer Sachtext hat keine zweite Spalte,
 * also war er eine einspaltige Vokabelliste — mit „Scotland is in the
 * North of Britain." als erster Vokabel. Das ist keine schlechte
 * Erkennung, sondern eine fehlende: Die Frage wurde nie gestellt.
 *
 * ## Woran unterschieden wird
 *
 * An drei Dingen, die eine Vokabelliste zuverlässig **nicht** hat:
 *
 * 1. **Wörter je Zeile.** Eine Vokabelzeile hat ein bis vier Wörter,
 *    auch mit Artikel und Partikel (`to depend on – abhängen von`). Ein
 *    Textabsatz hat Dutzende, und selbst hart umbrochener Text liegt bei
 *    acht bis fünfzehn.
 * 2. **Satzschlusszeichen.** Vokabelzeilen enden nicht mit Punkt.
 * 3. **Satzlänge.** Ein Satz aus zwei Wörtern ist eher eine Abkürzung
 *    mit Punkt als ein Satz.
 *
 * Keines der drei allein genügt. Eine Liste von Beispielsätzen hätte
 * Punkte, eine Liste langer Wendungen hätte viele Wörter je Zeile — erst
 * zusammen ergeben sie ein Bild.
 *
 * ## Warum die Zahl der Sätze über `sicher` entscheidet
 *
 * Ein einzelner Satz ist Fließtext, aber ein dürftiger: Daraus entstehen
 * eine Handvoll Kandidaten, und die Lehrkraft soll das vorher wissen statt
 * hinterher. Deshalb `sicher: false` mit dem Grund im Satz daneben — nicht
 * eine andere Quellenart, denn eine Liste ist er deswegen nicht.
 */
interface Textbild {
  readonly woerter: number;
  readonly zeilen: number;
  readonly saetze: number;
  readonly woerterJeZeile: number;
  readonly woerterJeSatz: number;
}

/* Satzschluss: Punkt, Ruf- oder Fragezeichen, gefolgt von Leerraum oder Ende. */
const SATZSCHLUSS = /[.!?]["')\]]?(?=\s|$)/g;

function textbild(text: string): Textbild {
  const zeilen = text
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0);
  const woerter = text.split(/\s+/).filter((wort) => /[\p{L}]/u.test(wort)).length;
  const saetze = (text.match(SATZSCHLUSS) ?? []).length;
  return {
    woerter,
    zeilen: zeilen.length,
    saetze,
    woerterJeZeile: zeilen.length === 0 ? 0 : woerter / zeilen.length,
    woerterJeSatz: saetze === 0 ? 0 : woerter / saetze,
  };
}

/** Mindestmaße, ab denen von Fließtext die Rede sein kann. */
const FLIESSTEXT = {
  /**
   * Weniger ist kein Text, sondern eine Überschrift oder ein Stichwort.
   *
   * Sechs und nicht zehn: „Scotland is in the North of Britain." hat
   * sieben Wörter und ist ein Satz. Ihn „eine Zeile je Vokabel, ohne
   * erkennbare zweite Spalte" zu nennen wäre eine falsche Aussage über
   * den Inhalt — dass daraus wenig entsteht, sagt `sicher: false`, und
   * das ist die richtige Stelle dafür.
   */
  woerter: 6,
  /** Eine Vokabelzeile bleibt deutlich darunter — auch mit Partikel. */
  woerterJeZeile: 6,
  /** Ein „Satz" aus zwei Wörtern ist eher „z. B." als ein Satz. */
  woerterJeSatz: 4,
  /** Ab hier lohnt die Analyse ohne Vorbehalt. */
  sicherAbSaetzen: 2,
  sicherAbWoertern: 25,
} as const;

function istFliesstext(bild: Textbild): boolean {
  if (bild.woerter < FLIESSTEXT.woerter) return false;
  if (bild.saetze < 1) return false;
  if (bild.woerterJeZeile < FLIESSTEXT.woerterJeZeile) return false;
  return bild.woerterJeSatz >= FLIESSTEXT.woerterJeSatz;
}

function fliesstexterkennung(bild: Textbild, dateiname?: string): Erkennung {
  const woher = dateiname ? ` aus „${dateiname}“` : '';
  const sicher = bild.saetze >= FLIESSTEXT.sicherAbSaetzen && bild.woerter >= FLIESSTEXT.sicherAbWoertern;
  return {
    art: 'fliesstext',
    begruendung: sicher
      ? `Ein zusammenhängender Text${woher} mit ${bild.saetze} Sätzen und ${bild.woerter} Wörtern — er wird nach Lernwörtern durchsucht.`
      : `Nur ${bild.saetze === 1 ? 'ein Satz' : `${bild.saetze} Sätze`}${woher} mit ${bild.woerter} Wörtern — daraus entstehen wenige Vorschläge.`,
    sicher,
  };
}

/** Was diese Quelle ist — ohne sie schon zu lesen. */
export function erkenneQuelle(quelle: Quelle): Erkennung {
  if (quelle.art === 'datei') {
    if (BLATTENDUNG.test(quelle.name)) {
      return {
        art: 'tabellenblatt',
        begruendung: 'Eine Excel-Datei — das erste Blatt wird gelesen.',
        sicher: true,
      };
    }
    if (PAKETENDUNG.test(quelle.name)) {
      return {
        art: 'lexiflow-paket',
        begruendung: 'Ein LexiFlow-Paket — die Einträge werden übernommen.',
        sicher: true,
      };
    }
    if (typeof quelle.inhalt !== 'string') {
      return {
        art: 'unklar',
        begruendung: 'Diese Datei lässt sich nicht als Text lesen.',
        sicher: false,
      };
    }
    return erkenneText(quelle.inhalt, quelle.name);
  }
  return erkenneText(quelle.text);
}

function erkenneText(roh: string, dateiname?: string): Erkennung {
  const text = stripBom(roh);
  if (istLeer(text)) {
    return { art: 'unklar', begruendung: 'Es steht nichts darin.', sicher: false };
  }

  if (looksStructured(text)) {
    return {
      art: 'strukturierte-liste',
      begruendung: 'Eine gegliederte Liste mit Angaben je Vokabel.',
      sicher: true,
    };
  }

  const trenner = detectDelimiter(text);
  const bild = spaltenbild(text, trenner);
  if (bild.spalten >= 2 && bild.einheitlich) {
    const name = {
      '\t': 'Tabulatoren',
      ';': 'Semikola',
      ',': 'Kommas',
      '|': 'senkrechte Striche',
    }[trenner];
    return {
      art: 'tabelle',
      begruendung: dateiname
        ? `Eine Tabelle aus „${dateiname}", durch ${name} getrennt, ${bild.spalten} Spalten.`
        : `Eine Tabelle, durch ${name} getrennt, ${bild.spalten} Spalten.`,
      sicher: true,
      trennzeichen: trenner,
    };
  }

  /*
    Erst jetzt die Frage nach dem Fließtext — nach der einheitlichen
    Tabelle, vor allem anderen.

    Die Reihenfolge ist keine Geschmacksfrage. Nach der einheitlichen
    Tabelle, weil eine Tabelle mit Beispielsätzen in der zweiten Spalte
    eine Tabelle bleibt. Vor der uneinheitlichen, weil ein Absatz mit drei
    Kommas sonst als „vermutlich eine Tabelle mit vier Spalten" durchginge
    — genau das tat der Scotland-Text bis hierher.
  */
  const gestalt = textbild(text);
  if (istFliesstext(gestalt)) {
    return dateiname ? fliesstexterkennung(gestalt, dateiname) : fliesstexterkennung(gestalt);
  }

  if (bild.spalten >= 2) {
    return {
      art: 'tabelle',
      begruendung: `Vermutlich eine Tabelle, aber die Zeilen haben unterschiedlich viele Felder.`,
      sicher: false,
      trennzeichen: trenner,
    };
  }

  return {
    art: 'eingefuegte-liste',
    begruendung:
      'Eine Zeile je Vokabel, ohne erkennbare zweite Spalte — die Übersetzungen fehlen womöglich.',
    sicher: false,
  };
}

function ausZeilen(
  erkennung: Erkennung,
  rohzeilen: string[][],
  optionen: Importoptionen,
): Importergebnis {
  if (rohzeilen.length === 0) {
    return { art: 'leer', grund: 'Darin stand keine einzige Zeile.' };
  }
  const zuordnung = optionen.zuordnung ?? detectColumns(rohzeilen);
  const zeilen = buildDrafts(rohzeilen, zuordnung, {
    splitMultipleMeanings: optionen.mehrfachbedeutungenTrennen ?? true,
  });
  return {
    art: 'gelesen',
    erkennung,
    zeilen,
    zuordnung,
    befund: summarize(zeilen),
    unzugeordnet: [],
  };
}

/** Rohtext — eingefügt oder aus einer Textdatei. */
export function importiereText(roh: string, optionen: Importoptionen = {}): Importergebnis {
  const text = stripBom(roh);
  if (istLeer(text)) {
    return { art: 'leer', grund: 'Es steht nichts darin.' };
  }
  if (zeilenzahl(text) > GRENZE_ZEILEN) {
    return {
      art: 'zu-gross',
      grund: `Mehr als ${GRENZE_ZEILEN} Zeilen auf einmal. Bitte in kleinere Teile zerlegen.`,
      grenze: GRENZE_ZEILEN,
    };
  }

  const erkennung = optionen.trennzeichen
    ? { ...erkenneText(text), art: 'tabelle' as const, trennzeichen: optionen.trennzeichen }
    : erkenneText(text);

  if (erkennung.art === 'fliesstext') {
    return { art: 'fliesstext', erkennung, text };
  }

  if (erkennung.art === 'strukturierte-liste') {
    const gelesen = parseStructuredList(text);
    const zeilen = structuredToDrafts(gelesen);
    return {
      art: 'gelesen',
      erkennung,
      zeilen,
      befund: summarize(zeilen),
      unzugeordnet: gelesen.unassigned,
    };
  }

  if (erkennung.art === 'tabelle' && erkennung.trennzeichen) {
    return ausZeilen(erkennung, parseCsv(text, erkennung.trennzeichen), optionen);
  }

  /*
    Der Rest geht über `parsePastedText`: Es findet auch Trenner, die keine
    Tabelle ergeben — „house - Haus", „house = Haus". Erkennt es gar nichts,
    entsteht eine einspaltige Liste, und die Befunde sagen dann deutlich,
    dass die Übersetzungen fehlen. Das ist ehrlicher, als die Zeilen
    wegzuwerfen.
  */
  return ausZeilen(erkennung, parsePastedText(text), optionen);
}

/** Eine Datei, deren Inhalt die Oberfläche schon gelesen hat. */
export function importiereDatei(quelle: Quelle, optionen: Importoptionen = {}): Importergebnis {
  if (quelle.art !== 'datei') return importiereText(quelle.text, optionen);

  if (quelle.groesse > GRENZE_BYTES) {
    const mb = Math.round(GRENZE_BYTES / (1024 * 1024));
    return {
      art: 'zu-gross',
      grund: `Die Datei ist größer als ${mb} MB. Bitte in kleinere Teile zerlegen.`,
      grenze: GRENZE_BYTES,
    };
  }

  const erkennung = erkenneQuelle(quelle);

  if (erkennung.art === 'tabellenblatt') {
    if (typeof quelle.inhalt === 'string') {
      return { art: 'fehler', grund: 'Diese Excel-Datei wurde als Text statt als Datei gelesen.' };
    }
    let blaetter;
    try {
      blaetter = readXlsx(quelle.inhalt);
    } catch (fehler) {
      return {
        art: 'fehler',
        grund:
          fehler instanceof XlsxReadError
            ? fehler.message
            : 'Diese Excel-Datei ließ sich nicht lesen.',
      };
    }
    if (blaetter.length === 0) {
      return { art: 'leer', grund: 'Die Arbeitsmappe hat kein Blatt mit Inhalt.' };
    }
    const gewaehlt = optionen.blatt
      ? (blaetter.find((blatt) => blatt.name === optionen.blatt) ?? blaetter[0]!)
      : blaetter[0]!;
    const mitBlatt: Erkennung = {
      ...erkennung,
      begruendung: `Blatt „${gewaehlt.name}" aus „${quelle.name}".`,
      blatt: gewaehlt.name,
      blaetter: blaetter.map((blatt) => blatt.name),
    };
    return ausZeilen(mitBlatt, gewaehlt.rows, optionen);
  }

  if (erkennung.art === 'lexiflow-paket') {
    if (typeof quelle.inhalt !== 'string') {
      return { art: 'fehler', grund: 'Diese Paketdatei wurde nicht als Text gelesen.' };
    }
    const gelesen = parsePackFile(quelle.inhalt);
    if (!gelesen.ok) {
      return { art: 'fehler', grund: gelesen.errors[0] ?? 'Die Paketdatei ist nicht lesbar.' };
    }
    const zeilen = validateDrafts(gelesen.pack.entries.map(draftFromEntry));
    return {
      art: 'gelesen',
      erkennung: {
        ...erkennung,
        begruendung: `${zeilen.length} Einträge aus „${quelle.name}".`,
      },
      zeilen,
      befund: summarize(zeilen),
      unzugeordnet: [],
    };
  }

  if (typeof quelle.inhalt !== 'string') {
    return { art: 'fehler', grund: 'Diese Datei lässt sich nicht als Text lesen.' };
  }
  return importiereText(quelle.inhalt, optionen);
}

/** Die Felder, an denen eine Handkorrektur sichtbar wird. */
const FELDER = [
  'english',
  'german',
  'acceptedEnglish',
  'partOfSpeech',
  'lemma',
  'complementPattern',
  'grammaticalNumber',
  'tags',
  'notes',
  'difficulty',
  'include',
] as const satisfies readonly (keyof DraftRow)[];

/**
 * Ein Feld aus der neuen Lesung übernehmen — typsicher.
 *
 * Über `Record<string, unknown>` ginge es kürzer und wäre eine Lüge: Der
 * Typprüfer sähe dann nicht mehr, dass links und rechts dasselbe Feld
 * steht. Mit dem gebundenen `K` prüft er genau das.
 */
function uebernimm<K extends (typeof FELDER)[number]>(
  ziel: DraftRow,
  feld: K,
  quelle: DraftRow,
): void {
  ziel[feld] = quelle[feld];
}

export interface Verschmelzung {
  /** Was die vorige Erkennung erzeugt hat — der Vergleichsmaßstab. */
  readonly vorherErzeugt: readonly DraftRow[];
  /** Was jetzt in der Oberfläche steht, Handkorrekturen eingeschlossen. */
  readonly bearbeitet: readonly DraftRow[];
  /** Was die neue Erkennung erzeugt hat. */
  readonly neuErzeugt: readonly DraftRow[];
}

/**
 * Eine neue Erkennung, ohne die Handarbeit wegzuwerfen.
 *
 * ## Das Problem, das es ohne diese Funktion gibt
 *
 * Die Lehrkraft korrigiert in der Vorschau zwanzig Übersetzungen, merkt
 * dann, dass die dritte Spalte falsch zugeordnet ist, stellt sie um — und
 * die zwanzig Korrekturen sind weg, weil die Zeilen neu erzeugt wurden.
 * Das ist der Fall, den „Lehrkrafteingaben nie automatisch überschreiben"
 * wirklich meint; alles andere ist leicht.
 *
 * ## Wie entschieden wird, was Handarbeit war
 *
 * Ein Dreiwegvergleich, wie beim Zusammenführen von Texten: Unterscheidet
 * sich das Bearbeitete vom **vorher Erzeugten**, hat ein Mensch das
 * geändert — dann bleibt es. Sonst gilt die neue Lesung. Dafür braucht es
 * keine Markierung in `DraftRow` und keine Schemaänderung; es braucht nur,
 * dass man das Erzeugte aufhebt.
 *
 * Zeilen, die es nur im Bearbeiteten gibt, sind von Hand ergänzt und
 * bleiben. Zeilen, die nur die neue Lesung hat, kommen dazu.
 *
 * ## Warum zweimal verschieden zugeordnet wird
 *
 * Die erste Fassung suchte alle drei Listen über `id` zusammen und ließ
 * dabei **jede** Zeile unberührt: `buildDrafts` vergibt bei jeder Lesung
 * frische Kennungen, also fand sie in `neuErzeugt` nie etwas wieder und
 * hielt alles für Handarbeit. Gemerkt hat das die Prüfung „behält die
 * Handkorrektur und übernimmt den Rest" — die zweite Hälfte ihres Namens
 * stimmte nicht mehr.
 *
 * Richtig ist zweierlei Zuordnung, weil es zwei verschiedene Beziehungen
 * sind:
 *
 * - `bearbeitet` ↔ `vorherErzeugt` über die **Kennung**. Das Bearbeitete
 *   stammt vom vorher Erzeugten ab, teilt also dessen Kennungen, und
 *   überlebt so auch das Löschen oder Umsortieren einzelner Zeilen.
 * - `vorherErzeugt` ↔ `neuErzeugt` über die **Reihenfolge**. Beide sind
 *   Lesungen derselben Quelle, nur mit anderen Einstellungen; was sich
 *   ändert, ist die Zuordnung der Spalten, nicht die Folge der Zeilen.
 */
export function verschmelzeNeuerkennung({
  vorherErzeugt,
  bearbeitet,
  neuErzeugt,
}: Verschmelzung): DraftRow[] {
  const vorherNachId = new Map(vorherErzeugt.map((zeile) => [zeile.id, zeile]));
  /** Die neue Lesung derselben Zeile — über den Listenplatz gefunden. */
  const neuFuerVorher = new Map<string, DraftRow>();
  vorherErzeugt.forEach((zeile, platz) => {
    const neu = neuErzeugt[platz];
    if (neu) neuFuerVorher.set(zeile.id, neu);
  });
  const uebernommen = new Set<DraftRow>();

  const verschmolzen = bearbeitet.map((zeile) => {
    const vorher = vorherNachId.get(zeile.id);
    const neu = vorher ? neuFuerVorher.get(vorher.id) : undefined;
    /*
      Ohne Vorlage von damals lässt sich nicht sagen, was Handarbeit war —
      dann ist die Zeile im Zweifel Handarbeit und bleibt unberührt.
    */
    if (!vorher || !neu) return zeile;
    uebernommen.add(neu);

    const ergebnis: DraftRow = { ...zeile };
    for (const feld of FELDER) {
      const warHandarbeit = zeile[feld] !== vorher[feld];
      if (!warHandarbeit) uebernimm(ergebnis, feld, neu);
    }
    return ergebnis;
  });

  const dazu = neuErzeugt.filter((zeile) => !uebernommen.has(zeile));
  return validateDrafts([...verschmolzen, ...dazu]);
}
