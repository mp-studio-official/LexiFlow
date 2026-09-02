/**
 * Text aus einer PDF holen – **lokal**, ohne einen einzigen Netzwerkaufruf.
 *
 * ## Die Abhängigkeit
 *
 * `pdfjs-dist` (Mozilla, **Apache-2.0**). Die Lizenz erlaubt die Weitergabe im
 * eigenen Produkt ohne Copyleft; die Attribution steht in
 * `third_party/pdfjs/NOTICE.md`, der Lizenztext daneben in
 * `third_party/pdfjs/LICENSE`. Ausgewählt wurde sie, weil sie die einzige verbreitete
 * PDF-Textextraktion ist, die vollständig im Browser läuft und sich ohne
 * externe Datei einbetten lässt – beides ist hier keine Vorliebe, sondern
 * Voraussetzung: Die portable Lehrkraftdatei liegt unter `file://` und hat
 * kein Netz.
 *
 * ## Kein externer Worker
 *
 * pdf.js lagert die Arbeit normalerweise in eine zweite Datei aus
 * (`pdf.worker.js`). Unter `file://` gibt es die nicht – der Pfad zeigte ins
 * Leere, und in Safari scheitert auch der Umweg über eine Blob-URL. Deshalb
 * läuft die Zerlegung hier **im Hauptthread**: `disableWorker` ist gesetzt,
 * der Workercode wird mitgebündelt. Der Preis ist eine kurze Blockade des
 * Bildschirms bei großen Dateien; dagegen steht die Seitengrenze und der
 * Abbruch.
 *
 * ## Kein OCR
 *
 * Diese Datei liest **auswählbaren** Text. Eine gescannte Seite ist ein Bild,
 * und ein Bild enthält keinen Text. Statt so zu tun, als könnte man das
 * erkennen, sagt `PdfTextResult.kind === 'no-text'` es der Lehrkraft.
 */

/** Obergrenzen. Bewusst großzügig, aber endlich. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

export interface PdfProgress {
  page: number;
  pages: number;
}

export type PdfTextResult =
  | { kind: 'text'; text: string; pages: number }
  /** Die Datei ist lesbar, enthält aber keinen auswählbaren Text. */
  | { kind: 'no-text'; pages: number }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export interface PdfTextOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: PdfProgress) => void) | undefined;
  maxPages?: number | undefined;
}

/**
 * `Promise.try` – von pdf.js benutzt, in Safari erst ab 18.2 vorhanden.
 *
 * Fünf Zeilen statt einer Versionsgrenze: Ohne diesen Zusatz liefe der
 * PDF-Import auf jedem Gerät ins Leere, dessen Browser ein Jahr älter ist –
 * und das sind in einer Schule die meisten.
 *
 * Zwei Eigenschaften sind zugesichert und geprüft:
 *
 * 1. **Sie steht, bevor pdf.js lädt.** Der Aufruf erfolgt synchron vor den
 *    `import()`-Ausdrücken in `loadPdfjs`. Stünde er danach, hätte pdf.js beim
 *    Auswerten seines Moduls schon zugegriffen.
 * 2. **Sie überschreibt nichts.** `??=` weist nur zu, wenn dort noch nichts
 *    steht. Wo der Browser eine eigene, spezifikationsgetreue Implementierung
 *    mitbringt, bleibt diese in Gebrauch.
 */
export function ensurePromiseTry(): void {
  const target = Promise as unknown as {
    try?: <T, A extends unknown[]>(fn: (...args: A) => T | PromiseLike<T>, ...args: A) => Promise<T>;
  };
  /*
    Die zusätzlichen Argumente sind **nicht** schmückendes Beiwerk. pdf.js
    ruft `Promise.try(handler, docParams)` – eine Ergänzung, die nur `fn()`
    aufruft, liefert dem Handler `undefined` und pdf.js scheitert mit
    „Cannot destructure property 'docId' of 'docParams'“. Erst beim zweiten
    Dokument, weil das erste noch mit der nativen Fassung lief.
  */
  target.try ??= <T, A extends unknown[]>(
    fn: (...args: A) => T | PromiseLike<T>,
    ...args: A
  ): Promise<T> => new Promise<T>((resolve) => resolve(fn(...args)));
}

/** Ein einzelnes Textstück, so wie pdf.js es liefert. */
interface TextItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
  hasEOL?: unknown;
}

function isTextItem(value: unknown): value is TextItem {
  return typeof value === 'object' && value !== null && 'str' in value;
}

/**
 * Setzt die Stücke einer Seite zu Zeilen zusammen.
 *
 * pdf.js liefert Textstücke mit Position, nicht Zeilen. Wer sie einfach
 * aneinanderhängt, bekommt aus einer zweispaltigen Vokabelliste Kraut und
 * Rüben. Gruppiert wird deshalb nach der **Grundlinie** (dem `y`-Wert der
 * Transformationsmatrix): Was auf derselben Höhe steht, gehört in eine Zeile.
 *
 * Das ist bewusst einfach gehalten. Eine echte Layoutanalyse mit Spalten- und
 * Tabellenerkennung wäre ein eigenes Projekt; hier genügt, dass die
 * Reihenfolge und die Zeilengruppierung erhalten bleiben – den Rest macht der
 * strukturierte Parser, und was er nicht sicher zuordnen kann, markiert er
 * sichtbar als „Bitte prüfen“.
 *
 * ## Warum die Lücke gemessen wird
 *
 * Wortzwischenräume stehen in einer PDF nicht zwingend als Leerzeichen im
 * Text. Viele Erzeuger setzen das nächste Stück einfach weiter rechts ab –
 * dann liefert pdf.js `["erste", "Zeile,"]` ohne jedes Leerzeichen, und ein
 * stumpfes Aneinanderhängen macht daraus „ersteZeile,“. Andere Erzeuger
 * schreiben das Leerzeichen mit; hängte man dort zusätzlich eines an, stünde
 * überall ein doppelter Abstand.
 *
 * Beides trifft dieselbe Regel: Ein Leerzeichen kommt dazwischen, wenn
 * zwischen dem Ende des einen Stücks (`x + width`) und dem Anfang des nächsten
 * eine sichtbare Lücke liegt. Das abschließende `\s+ → ' '` fängt den Fall ab,
 * dass die Lücke **und** ein echtes Leerzeichen vorhanden sind.
 */
export function linesFromItems(items: readonly unknown[]): string[] {
  interface Part {
    x: number;
    end: number;
    gapWidth: number;
    text: string;
  }
  const rows = new Map<number, Part[]>();

  for (const raw of items) {
    if (!isTextItem(raw)) continue;
    const text = typeof raw.str === 'string' ? raw.str : '';
    if (!text) continue;

    const transform = Array.isArray(raw.transform) ? raw.transform : [];
    const x = typeof transform[4] === 'number' ? transform[4] : 0;
    const y = typeof transform[5] === 'number' ? transform[5] : 0;
    const width = typeof raw.width === 'number' ? raw.width : 0;
    const height = typeof raw.height === 'number' ? raw.height : 0;
    // Auf ganze Punkte runden: Zwei Stücke derselben Zeile weichen um
    // Bruchteile ab, sobald die Schriftgröße wechselt.
    const line = Math.round(y);

    /*
      Ab welcher Lücke ein Leerzeichen fällig ist, hängt an der Schriftgröße:
      In einer 20-Punkt-Zeile ist ein Punkt Abstand nichts, in einer
      6-Punkt-Fußnote ein Wortzwischenraum. Fehlt die Höhe – etwa in einem
      Test, der nur Positionen setzt –, bleibt ein Punkt als Untergrenze.
    */
    const part: Part = { x, end: x + width, gapWidth: Math.max(1, height * 0.25), text };

    const row = rows.get(line);
    if (row) row.push(part);
    else rows.set(line, [part]);
  }

  return [...rows.entries()]
    // Von oben nach unten: In PDF wächst y nach oben.
    .sort((left, right) => right[0] - left[0])
    .map(([, parts]) =>
      parts
        .sort((left, right) => left.x - right.x)
        .reduce((line, part, index) => {
          if (index === 0) return part.text;
          const previous = parts[index - 1];
          const gap = previous ? part.x - previous.end : 0;
          return gap > part.gapWidth ? `${line} ${part.text}` : line + part.text;
        }, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length > 0);
}

/**
 * Lädt pdf.js **und** den Workercode – erst, wenn wirklich eine PDF kommt.
 *
 * Der zweite Import ist der wichtige. `pdf.js` läuft ohne echten Worker über
 * einen „fake worker“, und der holt sich seinen Code normalerweise so:
 *
 * ```js
 * const worker = await import(GlobalWorkerOptions.workerSrc);
 * ```
 *
 * Das ist zur **Laufzeit** eine Anfrage an eine URL. Unter `file://` gibt es
 * die nicht, in der portablen Einzeldatei erst recht nicht – die Funktion
 * schlüge dort mit „Setting up fake worker failed“ fehl, und zwar erst dann,
 * wenn jemand eine PDF auswählt.
 *
 * pdf.js sieht dafür einen Ausweg vor: Steht der Handler unter
 * `globalThis.pdfjsWorker`, nimmt es ihn und lädt nichts nach. Genau das tun
 * die beiden Zeilen unten. Der Workercode wird damit Teil des Bündels statt
 * einer zweiten Datei – das kostet Größe und ist der Preis dafür, dass die
 * Funktion offline und unter `file://` überhaupt existiert.
 */
async function loadPdfjs() {
  /*
    Beide Importe sind dynamisch: Im normalen Build wird daraus ein eigener
    Chunk, den nur der Lehrkraftbereich anfordert. Die Schülerlaufzeit
    importiert dieses Modul nirgends und trägt die Bibliothek deshalb nicht.
  */
  ensurePromiseTry();

  /*
    Der **Legacy-Build**: Er zielt auf ältere Browser als der Standardbuild.
    Für ein Schul-iPad, das kein Systemupdate mehr bekommt, ist das der
    Unterschied zwischen „funktioniert“ und „weiße Seite“.
  */
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]);

  const scope = globalThis as { pdfjsWorker?: unknown };
  scope.pdfjsWorker ??= worker;

  return pdfjs;
}

/**
 * Zerlegt eine PDF in Text. Gibt niemals `throw` an die Oberfläche weiter –
 * eine kaputte Datei ist ein Ergebnis, kein Absturz.
 */
export async function extractPdfText(
  data: ArrayBuffer,
  options: PdfTextOptions = {},
): Promise<PdfTextResult> {
  if (data.byteLength > MAX_PDF_BYTES) {
    return {
      kind: 'error',
      message: `Die Datei ist größer als ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB. Bitte teile sie auf oder füge den Text ein.`,
    };
  }

  const limit = options.maxPages ?? MAX_PDF_PAGES;

  try {
    const pdfjs = await loadPdfjs();
    if (options.signal?.aborted) return { kind: 'cancelled' };

    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      // Kein zweiter Thread und keine zweite Datei – siehe Kopfkommentar.
      disableWorker: true,
      // Keine Schriften, keine Bilder, keine externen Ressourcen nachladen.
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
    } as Parameters<typeof pdfjs.getDocument>[0]);

    options.signal?.addEventListener('abort', () => void task.destroy(), { once: true });

    const document = await task.promise;
    const pages = document.numPages;

    if (pages > limit) {
      await task.destroy();
      return {
        kind: 'error',
        message: `Die PDF hat ${pages} Seiten; verarbeitet werden höchstens ${limit}. Bitte wähle einen Ausschnitt oder füge den Text ein.`,
      };
    }

    const collected: string[] = [];
    for (let index = 1; index <= pages; index += 1) {
      if (options.signal?.aborted) {
        await task.destroy();
        return { kind: 'cancelled' };
      }
      options.onProgress?.({ page: index, pages });

      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const lines = linesFromItems(content.items);
      // Eine Leerzeile zwischen Seiten: Der Parser trennt Einträge daran.
      if (lines.length > 0) collected.push(lines.join('\n'));
      page.cleanup();
    }

    await task.destroy();
    const text = collected.join('\n\n').trim();

    return text.length > 0 ? { kind: 'text', text, pages } : { kind: 'no-text', pages };
  } catch (error) {
    if (options.signal?.aborted) return { kind: 'cancelled' };
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'error',
      message: `Die PDF konnte nicht gelesen werden (${message}). Bitte füge den Text ein.`,
    };
  }
}

/** Der Satz, der bei einer gescannten PDF erscheint – ehrlich und mit Ausweg. */
export const NO_TEXT_MESSAGE =
  'In dieser PDF wurde kein auswählbarer Text gefunden. Füge den Text ein oder verwende vorher eine OCR-Anwendung.';

/**
 * Nur für den Größenprototyp: hält den dynamischen Import am Leben, damit der
 * Bundler pdf.js wirklich einplant. Wird von der Oberfläche ersetzt.
 */

