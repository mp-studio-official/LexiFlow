import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_PDF_BYTES,
  NO_TEXT_MESSAGE,
  ensurePromiseTry,
  extractPdfText,
  linesFromItems,
} from './pdfText';

/**
 * Sprint 4B.2: Text aus einer PDF – lokal, ohne Worker, ohne Netz.
 *
 * Die beiden Prüfsteine sind echte PDF-Dateien im Quellbaum: eine mit
 * auswählbarem Text, eine mit einem Bild und **ohne** Textebene. Sie sind
 * winzig (unter einem Kilobyte) und von Hand erzeugt, damit sie keine
 * Lizenzfrage aufwerfen und im Diff lesbar bleiben.
 */

const root = resolve(import.meta.dirname, '../..');

function bytesOf(name: string): ArrayBuffer {
  const buffer = readFileSync(resolve(root, 'src/import/fixtures', name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

describe('Die Promise.try-Ergänzung', () => {
  const original = (Promise as unknown as { try?: unknown }).try;

  afterEach(() => {
    const target = Promise as unknown as { try?: unknown };
    if (original === undefined) delete target.try;
    else target.try = original;
  });

  it('überschreibt eine vorhandene Implementierung nicht', () => {
    /*
      Die wichtigere der beiden Zusagen. Wo der Browser eine eigene,
      spezifikationsgetreue Implementierung mitbringt, muss diese in Gebrauch
      bleiben – eine Ersatzdefinition darüberzulegen hieße, das Verhalten
      stillschweigend zu ändern.
    */
    const eigene = () => Promise.resolve('nativ');
    (Promise as unknown as { try?: unknown }).try = eigene;

    ensurePromiseTry();

    expect((Promise as unknown as { try?: unknown }).try).toBe(eigene);
  });

  it('ergänzt sie, wo sie fehlt', () => {
    delete (Promise as unknown as { try?: unknown }).try;

    ensurePromiseTry();

    const ergaenzt = (Promise as unknown as { try?: (fn: () => unknown) => Promise<unknown> }).try;
    expect(typeof ergaenzt).toBe('function');
  });

  it('verhält sich wie die Spezifikation', async () => {
    delete (Promise as unknown as { try?: unknown }).try;
    ensurePromiseTry();
    const versuch = (
      Promise as unknown as { try: (fn: (...args: never[]) => unknown, ...args: never[]) => Promise<unknown> }
    ).try;

    await expect(versuch(() => 42)).resolves.toBe(42);
    await expect(versuch(() => Promise.resolve('x'))).resolves.toBe('x');
    // Ein synchroner Wurf wird zur abgelehnten Zusage, nicht zur Ausnahme.
    await expect(
      versuch(() => {
        throw new Error('kaputt');
      }),
    ).rejects.toThrow('kaputt');
  });

  it('reicht die zusätzlichen Argumente durch', async () => {
    /*
      Der Fehler, den dieser Test gefunden hat: Die erste Fassung rief nur
      `fn()` auf. pdf.js ruft `Promise.try(handler, docParams)` – der Handler
      bekam `undefined` und brach mit „Cannot destructure property 'docId'“
      ab, und zwar erst beim **zweiten** Dokument, weil das erste noch mit
      der nativen Fassung lief. Genau so entgeht einem so etwas.
    */
    delete (Promise as unknown as { try?: unknown }).try;
    ensurePromiseTry();
    const versuch = (
      Promise as unknown as {
        try: (fn: (...args: never[]) => unknown, ...args: unknown[]) => Promise<unknown>;
      }
    ).try;

    await expect(
      versuch(((a: number, b: number) => a + b) as never, 2, 3),
    ).resolves.toBe(5);
  });

  it('lässt zwei Dokumente nacheinander zu', async () => {
    // Die Wirkungsprobe zum Test darüber – ohne durchgereichte Argumente rot.
    delete (Promise as unknown as { try?: unknown }).try;

    const erstes = await extractPdfText(bytesOf('text-sample.pdf'));
    const zweites = await extractPdfText(bytesOf('text-sample.pdf'));

    expect(erstes.kind).toBe('text');
    expect(zweites.kind).toBe('text');
  }, 60_000);

  it('steht bereit, bevor pdf.js geladen wird', async () => {
    /*
      Nachweis über die Wirkung: Ohne `Promise.try` bricht pdf.js beim
      Auswerten seines Moduls ab. Läuft die Extraktion durch, war die
      Ergänzung rechtzeitig da – der Aufruf steht synchron vor den
      `import()`-Ausdrücken in `loadPdfjs`.
    */
    delete (Promise as unknown as { try?: unknown }).try;

    const result = await extractPdfText(bytesOf('text-sample.pdf'));

    expect(result.kind).toBe('text');
  }, 60_000);
});

describe('Zeilen aus Textstücken', () => {
  /** So sieht ein Textstück aus, wie pdf.js es liefert. */
  const item = (str: string, x: number, y: number, width = 0, height = 0) => ({
    str,
    transform: [1, 0, 0, 1, x, y],
    width,
    height,
  });

  it('fasst zusammen, was auf derselben Grundlinie steht', () => {
    expect(linesFromItems([item('to ', 72, 700), item('apologise', 90, 700)])).toEqual([
      'to apologise',
    ]);
  });

  it('sortiert von oben nach unten und von links nach rechts', () => {
    // In PDF wächst y nach oben – die höhere Zahl gehört nach vorn.
    const lines = linesFromItems([
      item('zweite', 72, 680),
      item('Zeile,', 40, 700),
      item('erste', 20, 700),
    ]);
    expect(lines).toEqual(['erste Zeile,', 'zweite']);
  });

  it('setzt ein Leerzeichen, wo die PDF nur eine Lücke lässt', () => {
    /*
      Der häufigere der beiden Fälle: Der Erzeuger schreibt kein Leerzeichen,
      sondern setzt das nächste Stück weiter rechts ab. Ohne Lückenmessung
      stünde hier „ersteZeile“.
    */
    expect(linesFromItems([item('erste', 20, 700, 24, 10), item('Zeile', 50, 700, 22, 10)])).toEqual(
      ['erste Zeile'],
    );
  });

  it('verdoppelt den Abstand nicht, wo schon ein Leerzeichen steht', () => {
    // „to “ endet bei 20 + 12 = 32, „apologise“ beginnt bei 33: keine Lücke.
    expect(
      linesFromItems([item('to ', 20, 700, 12, 10), item('apologise', 33, 700, 40, 10)]),
    ).toEqual(['to apologise']);
  });

  it('klebt zusammen, was unmittelbar aneinander anschließt', () => {
    // Zwei Stücke desselben Wortes – etwa bei einem Schriftwechsel mittendrin.
    expect(linesFromItems([item('Vokabel', 20, 700, 30, 10), item('heft', 50, 700, 16, 10)])).toEqual(
      ['Vokabelheft'],
    );
  });

  it('duldet winzige Abweichungen derselben Zeile', () => {
    // Wechselt die Schriftgröße, weicht die Grundlinie um Bruchteile ab.
    expect(linesFromItems([item('a', 10, 700.2), item('b', 20, 699.8)])).toHaveLength(1);
  });

  it('ignoriert Leerstücke und Fremdobjekte', () => {
    expect(linesFromItems([item('', 10, 700), null, 42, { kein: 'item' }])).toEqual([]);
  });
});

describe('Eine PDF mit auswählbarem Text', () => {
  it('liest sie zeilenweise', async () => {
    const result = await extractPdfText(bytesOf('text-sample.pdf'));
    expect(result.kind).toBe('text');
    if (result.kind !== 'text') return;

    expect(result.pages).toBe(1);
    const lines = result.text.split('\n');
    expect(lines[0]).toBe('to coin a phrase / term');
    expect(lines[1]).toContain('context/example:');
    expect(lines[2]).toContain('translation:');
  }, 60_000);

  it('meldet den Fortschritt je Seite', async () => {
    const seen: number[] = [];
    await extractPdfText(bytesOf('text-sample.pdf'), {
      onProgress: (progress) => seen.push(progress.page),
    });
    expect(seen).toEqual([1]);
  }, 60_000);
});

describe('Eine gescannte PDF ohne Textebene', () => {
  it('wird ehrlich abgelehnt, statt so zu tun als ginge es', async () => {
    /*
      Kein OCR, keine Behauptung davon. Der Satz nennt beides: was fehlt und
      was stattdessen hilft.
    */
    const result = await extractPdfText(bytesOf('scanned-sample.pdf'));
    expect(result.kind).toBe('no-text');
    expect(NO_TEXT_MESSAGE).toContain('kein auswählbarer Text');
    expect(NO_TEXT_MESSAGE).toContain('OCR');
  }, 60_000);
});

describe('Grenzen und Abbruch', () => {
  it('lehnt eine zu große Datei ab, ohne sie zu öffnen', async () => {
    const result = await extractPdfText(new ArrayBuffer(MAX_PDF_BYTES + 1));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('größer als');
  });

  it('lehnt zu viele Seiten mit einer verständlichen Meldung ab', async () => {
    const result = await extractPdfText(bytesOf('text-sample.pdf'), { maxPages: 0 });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('Seiten');
  }, 60_000);

  it('bricht ab, wenn das Signal es sagt', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await extractPdfText(bytesOf('text-sample.pdf'), { signal: controller.signal });
    expect(result.kind).toBe('cancelled');
  }, 60_000);

  it('macht aus einer kaputten Datei ein Ergebnis, keinen Absturz', async () => {
    const result = await extractPdfText(new TextEncoder().encode('kein PDF').buffer as ArrayBuffer);
    expect(result.kind).toBe('error');
  }, 60_000);
});
