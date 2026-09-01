import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- jsdom bringt keine eigenen Typen mit; hier reicht der Konstruktor.
import { JSDOM } from 'jsdom';
import { buildStudentHtml, readEmbeddedJson, studentFileName } from './studentExport';
import { readEmbeddedPackFromDocument } from './embedded';
import type { VocabPack } from '../domain/schema';

/**
 * Prüfungen an der **gebauten** Schülerlaufzeit.
 *
 * Diese Datei läuft nicht in `npm run test`, sondern in `npm run verify:portable`
 * – sie setzt `npm run build:portable` voraus. Geprüft wird nicht die Absicht
 * des Codes, sondern das Ergebnis: eine echte Schülerdatei, erzeugt aus der
 * echten Laufzeit, wieder eingelesen.
 */

const root = resolve(import.meta.dirname, '../..');
const runtime = readFileSync(resolve(root, 'dist-portable/LexiFlow-Schuelerlaufzeit.html'), 'utf8');

function entry(id: string, english: string, german: string) {
  return {
    id,
    english,
    germanAnswers: [german],
    acceptedEnglishAnswers: [],
    exampleSentences: [],
    topicTags: [],
    sourceType: 'manual' as const,
  };
}

const pack: VocabPack = {
  meta: {
    id: 'pack-portable',
    title: 'Unit 3 – City life',
    topic: 'City',
    grade: '8',
    cefrLevel: 'A2+',
    cefrLevelOverridden: false,
    direction: 'both',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
  entries: [entry('e1', 'crowded', 'überfüllt'), entry('e2', 'litter', 'Müll')],
};

function build(input: VocabPack = pack): string {
  const result = buildStudentHtml(runtime, input);
  if (!result.ok) throw new Error(result.errors.join(' · '));
  return result.html;
}

function embedded(html: string) {
  const dom = new JSDOM(html);
  return readEmbeddedPackFromDocument(dom.window.document);
}

describe('Gebaute Schülerdatei', () => {
  it('enthält genau das eine Paket und lässt sich wieder einlesen', () => {
    const result = embedded(build());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.meta.id).toBe('pack-portable');
    expect(result.pack.entries.map((item) => item.english)).toEqual(['crowded', 'litter']);
  });

  it('enthält kein zweites Paket und keinen Lernstand', () => {
    const html = build();

    // Die Laufzeit selbst darf keine Paketdaten mitbringen.
    expect(html.split('id="lexiflow-pack"')).toHaveLength(2);
    // Felder, die es nur in Lernstands- oder Entwurfsdaten gibt.
    for (const forbidden of [
      'directionProgress',
      'packProgress',
      'lastAnsweredAt',
      'dueAt',
      'sessionCount',
    ]) {
      expect(html.includes(`"${forbidden}"`), forbidden).toBe(false);
    }
  });

  it('trägt keine KI-Prompts und keine Providerdaten', () => {
    const html = build();
    for (const forbidden of ['LanguageModel', 'Translator.create', 'promptTemplate', 'systemPrompt']) {
      expect(html.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('übersteht Unicode, Anführungszeichen und `</script>`', () => {
    const nasty: VocabPack = {
      ...pack,
      meta: { ...pack.meta, title: '</script><script>alert(1)</script> «Größe» 🇬🇧' },
      entries: [
        entry('e1', '</script><img src=x onerror=alert(1)>', 'Angriff "mit" \'Zeichen\''),
        entry('e2', 'naïve — dash', 'Zeilen\numbruch & Ampersand'),
      ],
    };
    const html = build(nasty);

    /*
      Der entscheidende Nachweis: Im eingebetteten JSON steht **kein einziges**
      spitzes Klammerzeichen. Ohne `<` kann kein Vokabeltext ein Element
      beginnen oder beenden – der Text `onerror=alert(1)` darf ruhig dastehen,
      er ist dann Zeichenkette und kein Attribut.
    */
    const payload = html.slice(
      html.indexOf('>', html.indexOf('id="lexiflow-pack"')) + 1,
      html.indexOf('</script>', html.indexOf('id="lexiflow-pack"')),
    );
    expect(payload).not.toContain('<');
    expect(payload).not.toContain('>');
    expect(payload).not.toContain('&');
    expect(html.split('id="lexiflow-pack"')).toHaveLength(2);
    expect(html.includes('<script>alert(1)</script>')).toBe(false);
    // … und der Titel im <title> ist entschärft.
    const title = html.slice(html.indexOf('<title>') + 7, html.indexOf('</title>'));
    expect(title).not.toContain('<');
    expect(title).toContain('Größe');

    // Trotzdem kommt inhaltlich alles unverändert an.
    const result = embedded(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.entries[0]?.english).toBe('</script><img src=x onerror=alert(1)>');
    expect(result.pack.entries[1]?.germanAnswers[0]).toBe('Zeilen\numbruch & Ampersand');
    expect(result.pack.meta.title).toContain('🇬🇧');
  });

  it('meldet beschädigte Daten verständlich', () => {
    expect(readEmbeddedJson('{kein json')).toMatchObject({ ok: false });
    expect(readEmbeddedJson('')).toMatchObject({ ok: false });
    expect(readEmbeddedJson('"__LEXIFLOW_PACK__"')).toMatchObject({ ok: false });
  });

  it('weist eine zu neue Paketversion ab, statt sie zu raten', () => {
    const future = JSON.stringify({
      kind: 'lexiflow.vocabpack',
      formatVersion: 99,
      app: { name: 'LexiFlow', version: '9.9.9' },
      meta: pack.meta,
      entries: pack.entries,
    });
    const result = readEmbeddedJson(future);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/Version/i);
  });

  it('erzeugt denselben Inhalt bei gleichen Daten', () => {
    expect(build()).toBe(build());
  });

  it('erzeugt einen sicheren Dateinamen', () => {
    expect(studentFileName({ title: 'Unit 3 – City life', grade: '8' })).toBe(
      'unit-3-city-life-8-lexiflow.html',
    );
    expect(studentFileName({ title: '../../etc/passwd', grade: 'EF' })).toBe(
      'etc-passwd-ef-lexiflow.html',
    );
    expect(studentFileName({ title: 'Größe & Übung', grade: '5' })).toBe(
      'groesse-uebung-5-lexiflow.html',
    );
    expect(studentFileName({ title: '🇬🇧🇬🇧', grade: '6' })).toBe('vokabelpaket-6-lexiflow.html');
  });

  it('verweist auf nichts außerhalb der Datei', () => {
    const html = build();
    const refs = [...html.matchAll(/\s(?:src|href)\s*=\s*"([^"]*)"/gi)]
      .map((match) => match[1] ?? '')
      .filter((target) => target && !target.startsWith('data:') && !target.startsWith('#'));

    expect(refs).toEqual([]);
  });

  /*
    Sprint 4A.1c: Die Marke muss die Datei überleben.

    Eine Schülerdatei liegt irgendwo auf einem fremden Rechner, womöglich ohne
    Netz. Alles Sichtbare muss also *in* ihr stecken: die Schrift, das Zeichen,
    die Farben. Der Test oben („verweist auf nichts außerhalb der Datei“) prüft
    `src` und `href` im Markup – die Schriften und Bilder stehen aber in CSS,
    in `url(...)`, und wären dort bisher unbemerkt durchgerutscht.
  */
  it('trägt Schriften und Bilder in sich, nicht als Verweis', () => {
    const html = build();

    /*
      Gesucht wird ausschließlich in den Stilblöcken. Ein `url(` im ganzen
      Dokument zu suchen war der erste Versuch und lieferte lauter Fundstücke
      aus dem mitgelieferten JavaScript (`new URL(e, window.origin)` und
      Ähnliches) – richtige Treffer für den Ausdruck, falsche für die Frage.
    */
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(
      (match) => match[1] ?? '',
    );
    expect(styles.length, 'eingebettete Stilblöcke').toBeGreaterThan(0);

    const urls = styles.flatMap((css) =>
      [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map((match) => match[2] ?? ''),
    );

    const auswaerts = urls.filter((target) => !target.startsWith('data:'));
    expect(auswaerts, 'CSS-Verweise nach draußen').toEqual([]);

    // Und die Schrift ist wirklich dabei, nicht bloß nicht verlinkt.
    expect(urls.some((target) => target.startsWith('data:font'))).toBe(true);
    expect(styles.join('')).toContain('@font-face');
  });

  it('bringt das Markenzeichen als Vektor mit', () => {
    const html = build();

    // Das Signet ist Code: vier Flächen in den Markenfarben, keine Bitmap.
    expect(html).toContain('#3B0F3F');
    expect(html).toContain('#E63946');
    expect(html).not.toContain('data:image/png');
    expect(html).not.toContain('data:image/jpeg');
    // Der Name steht als Text daneben und ist damit auch vorlesbar.
    expect(html).toContain('LexiFlow');
  });

  /*
    Sprint 4A.2: Das Wörterbuch gehört in die Lehrkraftdatei – und nur dorthin.

    Eine Schülerdatei wird an eine ganze Klasse weitergegeben. Sechs Megabyte
    Wörterbuch mitzuschicken, das dort niemand benutzen kann, wäre eine Zumutung
    für jede Mailbox und jedes Datenvolumen.
  */
  it('trägt das Wörterbuch nicht in die Schülerlaufzeit', () => {
    const marker = '4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006';
    expect(runtime).not.toContain(marker);
    expect(runtime).not.toContain('Offline-Wörterbuch');
    // Und auch nicht in die fertige Schülerdatei.
    const html = build();
    expect(html).not.toContain(marker);
    expect(html).not.toContain('Offline-Wörterbuch');
  });

  it('hält die Schülerdatei in der bisherigen Größenordnung', () => {
    /*
      Vor Sprint 4A.2 war die Schülerlaufzeit 620,7 KiB groß. Sie darf durch das
      Wörterbuch nicht wachsen – der einzige zulässige Zuwachs ist das bisschen
      CSS für die Vorschlagsanzeige im Lehrkraftbereich. Die Schranke liegt
      bewusst knapp darüber: Sie soll anschlagen, sobald jemand versehentlich
      Wörterbuchdaten in den Schülerpfad zieht.
    */
    const kiB = Buffer.byteLength(runtime, 'utf8') / 1024;
    expect(kiB).toBeLessThan(700);
  });

  it('trägt das Wörterbuch samt Quelle und Lizenz in der Lehrkraftdatei', () => {
    const teacher = readFileSync(resolve(root, 'dist-portable/LexiFlow-Lehrkraft.html'), 'utf8');
    expect(teacher).toContain('4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006');
    expect(teacher).toContain('CC BY-SA 4.0');
    expect(teacher).toContain('en.wiktionary.org');
    expect(teacher).toContain('wiktextract');
  });

  it('legt eine Beispieldatei zum Nachsehen ab', () => {
    // Kein Test im engeren Sinn, sondern ein Nebenprodukt: Die Datei landet in
    // `dist-portable/` und kann von Hand geöffnet werden.
    const big: VocabPack = {
      ...pack,
      meta: { ...pack.meta, title: 'Beispiel – 100 Vokabeln' },
      entries: Array.from({ length: 100 }, (_, index) =>
        entry(`e${index + 1}`, `word${index + 1}`, `Wort${index + 1}`),
      ),
    };
    writeFileSync(resolve(root, 'dist-portable/Beispiel-klein.html'), build(), 'utf8');
    writeFileSync(resolve(root, 'dist-portable/Beispiel-100-Vokabeln.html'), build(big), 'utf8');
    expect(true).toBe(true);
  });
});
