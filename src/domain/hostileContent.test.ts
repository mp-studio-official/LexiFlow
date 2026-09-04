import { describe, expect, it } from 'vitest';

import { packToCsv, neutralizeFormula } from './vocabTable';
import { parseCsv } from '../import/csv';
import { toLearningAreaFile, parseLearningArea } from './learningArea';
import { serializePack, parsePackFile } from './vocabpack';
import { encodeEmbeddedJson, readEmbeddedJson } from '../portable/studentExport';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from './schema';

/**
 * Feindselige Inhalte in einer Vokabelliste.
 *
 * ## Warum diese Datei existiert
 *
 * Zwei Wege führen aus diesem Programm heraus, und beide nehmen Text, den
 * jemand eingetippt oder eingefügt hat:
 *
 * 1. Die **Lerndatei**: eine HTML-Datei, in der die Vokabeln in einem
 *    `<script type="application/json">` stehen. Bricht ein Vokabeltext daraus
 *    aus, steht auf dem Gerät einer lernenden Person ausführbarer Code.
 * 2. Die **Tabellendatei**: eine `.csv`, die in Excel geöffnet wird. Eine
 *    Zelle, die mit `=` beginnt, ist dort keine Zeichenkette, sondern eine
 *    Rechnung.
 *
 * Der Weg dorthin braucht keinen Angreifer. Eine Lehrkraft fügt einen Text
 * aus dem Netz ein, prüft die Vokabeln, speichert – und gibt die Datei an
 * achtundzwanzig Personen weiter.
 *
 * ## Was hier geprüft wird
 *
 * Dieselben vier Werte durch **jeden** Ausgabeweg, und zwar bis zum
 * Wiedereinlesen: Was hineingeht, muss unversehrt herauskommen, und dabei darf
 * an keiner Stelle etwas entstehen, das ein Programm als Anweisung liest.
 *
 * Die Prüfungen stehen bewusst zusammen und nicht verteilt bei den einzelnen
 * Bausteinen. Eine Lücke entsteht nicht in einem Baustein, sondern zwischen
 * zweien – und eine Liste, die alle Wege nebeneinander durchgeht, ist die
 * einzige Stelle, an der ein vergessener Weg auffällt.
 */

/** Die Werte, um die es geht – einmal benannt, überall dieselben. */
const FEINDSELIG = {
  scriptAusbruch: '</script><script>alert(1)</script>',
  htmlTag: '<img src=x onerror=alert(1)>',
  anfuehrungUndUmbruch: 'Er sagte "halt" –\nund ging',
  formelGleich: '=1+1',
  formelPlus: '+A1',
  formelMinus: '-2+3',
  formelAt: '@SUM(A1:A9)',
  formelBefehl: '=cmd|\' /C calc\'!A0',
} as const;

function hostilePack(): VocabPack {
  return {
    meta: makeMeta({
      id: 'pack-feindselig',
      title: `Unit ${FEINDSELIG.scriptAusbruch}`,
      topic: FEINDSELIG.htmlTag,
      description: FEINDSELIG.anfuehrungUndUmbruch,
    }),
    entries: [
      makeEntry({
        id: 'e1',
        english: FEINDSELIG.scriptAusbruch,
        germanAnswers: [FEINDSELIG.htmlTag],
        exampleSentences: [
          { english: FEINDSELIG.anfuehrungUndUmbruch, german: FEINDSELIG.formelBefehl },
        ],
      }),
      makeEntry({ id: 'e2', english: FEINDSELIG.formelGleich, germanAnswers: [FEINDSELIG.formelAt] }),
      makeEntry({ id: 'e3', english: FEINDSELIG.formelPlus, germanAnswers: [FEINDSELIG.formelMinus] }),
    ],
  };
}

/* ========================================== Die eingebettete Lerndatei */

describe('Die HTML-Einbettung lässt sich nicht beenden', () => {
  it('enthält nach dem Kodieren kein einziges spitzes Klammerzeichen', () => {
    /*
      Der entscheidende Nachweis, und er ist absichtlich absolut formuliert:
      Ohne `<` kann kein Vokabeltext ein Element beginnen oder beenden. Eine
      Prüfung auf „enthält nicht `</script>`" wäre schwächer – sie ließe sich
      mit `</SCRIPT >` oder `</script\\n>` umgehen, beides gültiges HTML.
    */
    const kodiert = encodeEmbeddedJson(toLearningAreaFile({ id: 'b', title: 'B' }, [hostilePack()]));

    expect(kodiert).not.toContain('<');
    expect(kodiert).not.toContain('>');
    expect(kodiert).not.toContain('&');
  });

  it('enthält keine Zeilentrenner, die JavaScript als Zeilenende liest', () => {
    // U+2028 und U+2029 beenden in JavaScript eine Zeile, in JSON nicht.
    const mitTrennern = toLearningAreaFile({ id: 'b', title: 'B' }, [
      {
        meta: makeMeta({ id: 'p', title: 'Zeilen trenner' }),
        entries: [makeEntry({ id: 'e', english: 'a b' })],
      },
    ]);
    const kodiert = encodeEmbeddedJson(mitTrennern);

    expect(kodiert).not.toContain(' ');
    expect(kodiert).not.toContain(' ');
  });

  it('gibt alles unversehrt zurück – Zeichen für Zeichen', () => {
    /*
      Sicherheit, die den Inhalt beschädigt, ist keine. Ein Beispielsatz mit
      Anführungszeichen und Umbruch ist ein ganz normaler Beispielsatz.
    */
    const original = hostilePack();
    const gelesen = readEmbeddedJson(
      encodeEmbeddedJson(toLearningAreaFile({ id: 'b', title: 'B' }, [original])),
    );

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    const [drin] = gelesen.area.packs;
    expect(drin?.entries[0]?.english).toBe(FEINDSELIG.scriptAusbruch);
    expect(drin?.entries[0]?.germanAnswers[0]).toBe(FEINDSELIG.htmlTag);
    expect(drin?.entries[0]?.exampleSentences[0]?.english).toBe(FEINDSELIG.anfuehrungUndUmbruch);
    expect(drin?.entries[0]?.exampleSentences[0]?.german).toBe(FEINDSELIG.formelBefehl);
    expect(drin?.meta.title).toContain('script');
  });

  it('lässt auch den Bereichstitel nicht ausbrechen', () => {
    // Er steht als Einziges **zweimal** in der Datei: im JSON und im <title>.
    const kodiert = encodeEmbeddedJson(
      toLearningAreaFile({ id: 'b', title: FEINDSELIG.scriptAusbruch }, [hostilePack()]),
    );
    expect(kodiert).not.toContain('<');
  });
});

/* ================================================ Die Paketdatei (JSON) */

describe('Die Paketdatei übersteht dieselben Werte', () => {
  it('liest zurück, was geschrieben wurde', () => {
    const original = hostilePack();
    const gelesen = parsePackFile(serializePack(original));

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    expect(gelesen.pack.entries[0]?.english).toBe(FEINDSELIG.scriptAusbruch);
    expect(gelesen.pack.entries[0]?.exampleSentences[0]?.english).toBe(
      FEINDSELIG.anfuehrungUndUmbruch,
    );
  });

  it('kommt auch durch den Lernbereich unverändert wieder heraus', () => {
    const area = toLearningAreaFile({ id: 'b', title: 'B' }, [hostilePack()]);
    const gelesen = parseLearningArea(JSON.stringify(area));

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    expect(gelesen.area.packs[0]?.entries[0]?.english).toBe(FEINDSELIG.scriptAusbruch);
  });
});

/* ============================================= Die Tabellendatei (.csv) */

describe('Die Tabellendatei erzeugt keine Formeln', () => {
  /** Die Zellen einer erzeugten `.csv`, so wie eine Tabellenkalkulation sie sieht. */
  function zellen(pack: VocabPack): string[][] {
    return parseCsv(packToCsv(pack));
  }

  /** Der rohe Text der Datei – vor jedem Wiedereinlesen. */
  function roh(pack: VocabPack): string {
    return packToCsv(pack);
  }

  it('stellt jeder Formelzelle ein Apostroph voran', () => {
    /*
      Anführungszeichen schützen **nicht**: Sie gehören zur CSV-Syntax und sind
      beim Öffnen in Excel längst weg. `"=1+1"` wird dort zu `2`.
    */
    const text = roh(hostilePack());

    expect(text).toContain(`"'${FEINDSELIG.formelGleich}"`);
    expect(text).toContain(`"'${FEINDSELIG.formelPlus}"`);
    expect(text).toContain(`"'${FEINDSELIG.formelMinus}"`);
    expect(text).toContain(`"'${FEINDSELIG.formelAt}"`);
  });

  it('lässt keine Zelle mit einem Formelzeichen beginnen', () => {
    /*
      Die allgemeine Fassung derselben Zusage: Nicht „diese vier Werte sind
      entschärft", sondern „**keine** Zelle fängt so an". Eine neue Spalte, die
      jemand später hinzufügt, fällt damit auf.

      Geprüft am **Rohtext** und nicht an `parseCsv`: Der eigene Leser nimmt
      das Apostroph absichtlich wieder weg (sonst wüchse bei jedem Umlauf eines
      dazu). Was Excel sieht, ist die Datei – und nur die zählt hier.
    */
    const anfaenge = [...roh(hostilePack()).matchAll(/(?:^|;)"(.?)/gm)].map((treffer) => treffer[1]);

    expect(anfaenge.length).toBeGreaterThan(10);
    for (const zeichen of anfaenge) {
      expect(['=', '+', '-', '@', '\t', '\r'], `Zellenanfang „${zeichen}"`).not.toContain(zeichen);
    }
  });

  it('lässt einen harmlosen Wert unangetastet', () => {
    // Eine Regel, die alles verändert, verändert auch das, was in Ordnung war.
    expect(neutralizeFormula('die Erosion')).toBe('die Erosion');
    expect(neutralizeFormula('to depend on sb./sth.')).toBe('to depend on sb./sth.');
    expect(neutralizeFormula("'ne Menge")).toBe("'ne Menge");
  });

  it('nimmt das Apostroph beim Wiedereinlesen zurück', () => {
    /*
      Sonst wüchse bei jedem Aus- und Wiedereinlesen eines dazu: aus `-los`
      würde `'-los`, dann `''-los`.
    */
    const einmal = parseCsv(packToCsv(hostilePack()));
    const werte = einmal.flat();

    expect(werte).toContain(FEINDSELIG.formelGleich);
    expect(werte).toContain(FEINDSELIG.formelAt);
    expect(werte).not.toContain(`'${FEINDSELIG.formelGleich}`);
  });

  it('lässt ein echtes Apostroph am Wortanfang stehen', () => {
    const rows = parseCsv(`"'ne Menge";"zwei"`);
    expect(rows[0]?.[0]).toBe("'ne Menge");
  });

  it('behält Anführungszeichen und Umbrüche im Beispielsatz', () => {
    /*
      Beide sind in einer Vokabelliste normal – und beide beenden in einer
      naiven CSV-Erzeugung das Feld beziehungsweise die Zeile.
    */
    const text = roh(hostilePack());
    // Ein `"` im Inhalt steht nach RFC 4180 doppelt.
    expect(text).toContain('Er sagte ""halt""');

    const gelesen = parseCsv(text).flat().join('\n');
    expect(gelesen).toContain('Er sagte "halt"');
  });

  it('lässt kein `</script>` und kein Tag zur Formel werden', () => {
    // Sie sind in der `.csv` harmlos – aber sie müssen unversehrt ankommen.
    const werte = zellen(hostilePack()).flat();
    expect(werte).toContain(FEINDSELIG.scriptAusbruch);
    expect(werte).toContain(FEINDSELIG.htmlTag);
  });
});

/* =========================================== Der Weg durch beide Formate */

describe('Ein Wert, der durch alles hindurchgeht', () => {
  it('überlebt Paketdatei, Lernbereich, Einbettung und Tabelle', () => {
    /*
      Der Test, der eine Lücke **zwischen** den Bausteinen fände: derselbe Wert
      durch jede Ausgabe, und am Ende steht überall dasselbe.
    */
    const original = hostilePack();
    const wort = FEINDSELIG.scriptAusbruch;

    const ausPaketdatei = parsePackFile(serializePack(original));
    expect(ausPaketdatei.ok && ausPaketdatei.pack.entries[0]?.english).toBe(wort);

    const ausEinbettung = readEmbeddedJson(
      encodeEmbeddedJson(toLearningAreaFile({ id: 'b', title: 'B' }, [original])),
    );
    expect(ausEinbettung.ok && ausEinbettung.area.packs[0]?.entries[0]?.english).toBe(wort);

    expect(parseCsv(packToCsv(original)).flat()).toContain(wort);
  });
});
