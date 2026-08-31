import { describe, expect, it } from 'vitest';
import {
  PACK_PLACEHOLDER,
  TITLE_PLACEHOLDER,
  buildStudentHtml,
  encodeEmbeddedJson,
  readEmbeddedJson,
  studentDocumentTitle,
  studentFileName,
  toStudentPayload,
} from './studentExport';
import { studentDatabaseName } from './embedded';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from '../domain/schema';

/**
 * Sprint 4A.1: Die Erzeugung der Schülerdatei – ohne Browser und ohne Build.
 *
 * Hier steht die Fachlogik: Was kommt in die Datei, was auf keinen Fall, und
 * was passiert mit Vokabeln, die aussehen wie HTML. Die Prüfungen an der
 * **gebauten** Datei stehen daneben in `portable.artifact.test.ts` und laufen
 * mit `npm run verify:portable`.
 */

/** Eine Laufzeit-Attrappe mit denselben Markierungen wie die echte. */
const RUNTIME = [
  '<!doctype html><html lang="de"><head>',
  `<title>${TITLE_PLACEHOLDER}</title>`,
  `<script id="lexiflow-pack" type="application/json">${PACK_PLACEHOLDER}</script>`,
  '</head><body><div id="root"></div><script type="module">/*app*/</script></body></html>',
].join('');

function packWith(overrides: Partial<VocabPack['meta']> = {}, entries = [makeEntry()]): VocabPack {
  return { meta: makeMeta({ id: 'pack-1', ...overrides }), entries };
}

describe('Sichere Einbettung', () => {
  it('lässt kein spitzes Klammerzeichen im JSON stehen', () => {
    const encoded = encodeEmbeddedJson({ text: '</script><script>alert(1)</script>' });

    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('>');
    expect(encoded).not.toContain('&');
    // Der Inhalt bleibt dabei vollständig erhalten.
    expect(JSON.parse(encoded)).toEqual({ text: '</script><script>alert(1)</script>' });
  });

  it('maskiert die JavaScript-Zeilentrenner U+2028 und U+2029', () => {
    const encoded = encodeEmbeddedJson({ text: 'a b c' });

    expect(encoded).not.toContain(' ');
    expect(encoded).not.toContain(' ');
    expect(JSON.parse(encoded)).toEqual({ text: 'a b c' });
  });

  it('trägt Unicode unverändert durch', () => {
    const text = 'naïve — Größe 🇬🇧 日本語';
    expect(JSON.parse(encodeEmbeddedJson({ text }))).toEqual({ text });
  });
});

describe('Schülerdatei erzeugen', () => {
  it('setzt genau ein Paket und den Titel ein', () => {
    const result = buildStudentHtml(RUNTIME, packWith({ title: 'Unit 3' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).not.toContain(PACK_PLACEHOLDER);
    expect(result.html).not.toContain(TITLE_PLACEHOLDER);
    expect(result.html).toContain('<title>Unit 3 – LexiFlow</title>');
    expect(result.html.split('id="lexiflow-pack"')).toHaveLength(2);
  });

  it('nimmt nur das mit, was auch in einer .vocabpack.json steht', () => {
    const payload = toStudentPayload(packWith());

    expect(Object.keys(payload).sort()).toEqual(['app', 'entries', 'formatVersion', 'kind', 'meta']);
    // Lernstände haben in dieser Struktur schlicht keinen Platz.
    expect(JSON.stringify(payload)).not.toContain('dueAt');
    expect(JSON.stringify(payload)).not.toContain('box');
  });

  it('lehnt ein ungültiges Paket ab, statt es auszuliefern', () => {
    const broken = { meta: { ...makeMeta(), grade: 'Klasse 13' }, entries: [] } as unknown as VocabPack;
    const result = buildStudentHtml(RUNTIME, broken);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('lehnt eine Laufzeit ohne Einsetzstelle ab', () => {
    const result = buildStudentHtml('<html>ohne Markierung</html>', packWith());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Build/);
  });

  it('erzeugt bei gleichen Daten dieselbe Datei', () => {
    const pack = packWith();
    const a = buildStudentHtml(RUNTIME, pack);
    const b = buildStudentHtml(RUNTIME, pack);

    expect(a).toEqual(b);
  });
});

describe('Dateiname und Fenstertitel', () => {
  it('schreibt Umlaute aus und bleibt bei ASCII', () => {
    expect(studentFileName({ title: 'Größe & Übung', grade: '5' })).toBe(
      'groesse-uebung-5-lexiflow.html',
    );
  });

  it('kann keinen Pfad und keine Endung erzeugen', () => {
    expect(studentFileName({ title: '../../etc/passwd', grade: '9' })).toBe(
      'etc-passwd-9-lexiflow.html',
    );
    expect(studentFileName({ title: 'a\\b:c*d?e"f<g>h|i', grade: 'Q1' })).toBe(
      'a-b-c-d-e-f-g-h-i-q1-lexiflow.html',
    );
  });

  it('fällt auf einen sprechenden Namen zurück', () => {
    expect(studentFileName({ title: '🇬🇧', grade: '7' })).toBe('vokabelpaket-7-lexiflow.html');
  });

  it('entschärft den Fenstertitel', () => {
    expect(studentDocumentTitle({ title: '<script>x</script>' })).toBe('script x /script – LexiFlow');
    expect(studentDocumentTitle({ title: '   ' })).toBe('Vokabelpaket – LexiFlow');
  });
});

describe('Eingebettetes Paket wieder lesen', () => {
  it('liest ein erzeugtes Paket zurück', () => {
    const pack = packWith({ title: 'Halong Bay' });
    const result = buildStudentHtml(RUNTIME, pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const json = result.html.slice(
      result.html.indexOf('>', result.html.indexOf('id="lexiflow-pack"')) + 1,
      result.html.indexOf('</script>'),
    );
    const back = readEmbeddedJson(json);

    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.pack.meta.title).toBe('Halong Bay');
  });

  it('meldet eine leere, unveränderte oder beschädigte Datei verständlich', () => {
    for (const input of ['', '   ', 'null', PACK_PLACEHOLDER, '{kaputt']) {
      const result = readEmbeddedJson(input);
      expect(result.ok, input).toBe(false);
      if (!result.ok) expect(result.errors[0]?.length).toBeGreaterThan(10);
    }
  });
});

describe('Datenbankname der Schülerdatei', () => {
  it('trennt sie von der Lehrkraftdatei und von anderen Schülerdateien', () => {
    expect(studentDatabaseName('pack-1')).toBe('lexiflow-schueler-pack-1');
    expect(studentDatabaseName('pack-2')).not.toBe(studentDatabaseName('pack-1'));
    expect(studentDatabaseName('pack-1')).not.toBe('lexiflow');
  });

  it('verträgt ungewöhnliche Paket-Ids', () => {
    expect(studentDatabaseName('../böse/id')).toBe('lexiflow-schueler-bseid');
    expect(studentDatabaseName('')).toBe('lexiflow-schueler-paket');
  });
});
