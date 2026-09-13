import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Was in einer portablen Datei **nicht** landen darf.
 *
 * ## Warum das ein Quelltexttest ist und kein Laufzeittest
 *
 * Die Zusage lautet nicht „die Datei ruft Supabase nicht auf“, sondern „die
 * Datei *kann* es nicht“. Ein Laufzeittest kann nur zeigen, dass ein bestimmter
 * Ablauf nichts getan hat. Ob der Code trotzdem im Bündel liegt – eine
 * Bedingung entfernt, und er wird ausgeführt –, sagt nur der Importgraph.
 *
 * Der Graph wird hier aus dem Quelltext gelesen und nicht aus einem Build:
 * So läuft die Prüfung in `npm run test` mit, also bei jeder Änderung, und
 * nicht erst in `verify:portable`. Der gebaute Beweis kommt zusätzlich in
 * Phase 8 dazu – er ist stärker, aber langsamer, und beides zusammen ist
 * besser als eines davon.
 *
 * ## Grenzen dieser Prüfung, offen gesagt
 *
 * Sie liest statische und dynamische Importe per regulärem Ausdruck. Ein
 * Import, der über eine berechnete Zeichenkette liefe, entginge ihr. In diesem
 * Projekt gibt es keinen solchen – und die Regel „keine berechneten Importe“
 * ist leichter einzuhalten als nachzuweisen.
 */

const root = resolve(import.meta.dirname, '../..');

/*
  Zwei Ausdrücke statt eines. Der eine für `… from '…'`, der andere für
  `import('…')`.

  Ein gemeinsamer Ausdruck `(?:from|import)\s*\(?\s*['"]…` sah kürzer aus und
  war falsch: Er traf das Wort `import` auch mitten in einer Zeichenkette –
  `path="material/import"` –, und weil der Inhalt Zeilenumbrüche zuließ,
  verschluckte er von dort aus den halben Rest der Datei. Deshalb steht in
  beiden Ausdrücken `[^'"\n]` und in einem eine verpflichtende Klammer.

  Der Rückblick `(?<![\w'"$.])` kam danach dazu: Die Stoppwortlisten in
  `src/domain/stopwords.ts` enthalten `'from', 'by', …` – also ein `from`,
  dem ein Anführungszeichen folgt. Ein Schlüsselwort steht nie direkt hinter
  einem Anführungszeichen, einem Punkt oder einem Wortzeichen; genau das sagt
  der Rückblick. `Array.from('…')` fällt damit ebenfalls heraus.
*/
const STATISCH = /(?<![\w'"$.])from\s*['"]([^'"\n]+)['"]/g;
const DYNAMISCH = /(?<![\w'"$.])import\s*\(\s*['"]([^'"\n]+)['"]/g;

function aufloesen(spezifizierer: string, von: string): string | undefined {
  if (!spezifizierer.startsWith('.')) return undefined;
  const basis = resolve(dirname(von), spezifizierer);
  for (const kandidat of [
    basis,
    `${basis}.ts`,
    `${basis}.tsx`,
    `${basis}/index.ts`,
    `${basis}/index.tsx`,
  ]) {
    if (existsSync(kandidat) && !kandidat.endsWith('/')) {
      // Ein Verzeichnis ohne `index` ist kein Modul.
      try {
        readFileSync(kandidat, 'utf8');
        return kandidat;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

interface Graph {
  /** Alle erreichbaren Dateien, relativ zum Projektwurzelverzeichnis. */
  dateien: Set<string>;
  /** Alle Paketnamen, die irgendwo darin importiert werden. */
  pakete: Set<string>;
}

function graphAb(einstieg: string): Graph {
  const dateien = new Set<string>();
  const pakete = new Set<string>();
  const offen = [resolve(root, einstieg)];

  while (offen.length > 0) {
    const datei = offen.pop()!;
    const kurz = relative(root, datei);
    if (dateien.has(kurz)) continue;
    dateien.add(kurz);

    const quelle = readFileSync(datei, 'utf8');
    const treffer = [...quelle.matchAll(STATISCH), ...quelle.matchAll(DYNAMISCH)];
    for (const gefunden of treffer) {
      const spezifizierer = gefunden[1]!;
      if (spezifizierer.startsWith('.')) {
        const ziel = aufloesen(spezifizierer, datei);
        if (ziel) offen.push(ziel);
        continue;
      }
      // Nur der Paketname, nicht der Unterpfad: `zod/v4` ist `zod`.
      const name = spezifizierer.startsWith('@')
        ? spezifizierer.split('/').slice(0, 2).join('/')
        : spezifizierer.split('/')[0]!;
      pakete.add(name);
    }
  }

  return { dateien, pakete };
}

/**
 * Die drei Einstiegspunkte.
 *
 * `src/main.tsx` trägt zwei Auslieferungen: die kontofreie PWA unter
 * `<base>/` und – über dieselbe `index.html` – die portable Lehrkraftdatei.
 * Beide haben kein Backend, also gilt für sie dieselbe Prüfung.
 */
const LEHRKRAFT = graphAb('src/main.tsx');
const LERNDATEI = graphAb('src/student-main.tsx');
const PORTAL = graphAb('src/portal-main.tsx');

describe('der Importgraph lässt sich überhaupt lesen', () => {
  it('findet aus beiden Einstiegen erkennbar viele Dateien', () => {
    // Ohne diese Prüfung wäre ein kaputter Auflöser ein *bestandener* Test:
    // Ein leerer Graph enthält garantiert kein Supabase.
    expect(LEHRKRAFT.dateien.size).toBeGreaterThan(50);
    expect(LERNDATEI.dateien.size).toBeGreaterThan(20);
  });

  it('findet die erwarteten Ankerdateien', () => {
    expect(LEHRKRAFT.dateien).toContain('src/App.tsx');
    expect(LERNDATEI.dateien).toContain('src/StudentApp.tsx');
    expect(PORTAL.dateien).toContain('src/hosted/HostedApp.tsx');
  });

  it('sammelt nur Dinge, die wie Paketnamen aussehen', () => {
    /*
      Die Wache über den Ausdruck selbst. Eine frühere Fassung verschluckte ab
      einem `import` **innerhalb einer Zeichenkette** den halben Rest der Datei
      und legte das Ergebnis als „Paket“ ab. Die Prüfungen darunter waren
      trotzdem grün – sie suchen nach `supabase`, und Unsinn enthält kein
      `supabase`. Ein Test, der bei kaputtem Werkzeug besteht, prüft nichts.
    */
    const name = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
    for (const graph of [LEHRKRAFT, LERNDATEI, PORTAL]) {
      for (const paket of graph.pakete) {
        // `virtual:lexiflow-student-runtime` ist der eine erlaubte Sonderfall.
        if (paket.startsWith('virtual:')) continue;
        expect(paket, `unplausibler Paketname: ${JSON.stringify(paket.slice(0, 40))}`).toMatch(name);
      }
    }
  });
});

describe('kein Backend in portablen Dateien', () => {
  const graphen: ReadonlyArray<[string, Graph]> = [
    ['die Lehrkraftdatei', LEHRKRAFT],
    ['die Lerndatei', LERNDATEI],
  ];

  for (const [name, graph] of graphen) {
    it(`${name} erreicht keinen Supabase-Client`, () => {
      const verdaechtig = [...graph.pakete].filter((paket) => /supabase/i.test(paket));
      expect(verdaechtig).toEqual([]);
    });

    it(`${name} erreicht keine Datei des Portals`, () => {
      const verdaechtig = [...graph.dateien].filter((datei) => datei.startsWith('src/hosted/'));
      expect(verdaechtig).toEqual([]);
    });

    it(`${name} erreicht die kontrollierte Cloudfassung nicht`, () => {
      // Sie ist eine Entwicklungshilfe. In einer weitergegebenen Datei wären
      // ihre Testkonten schlicht Unsinn, der nach Funktion aussieht.
      expect(graph.dateien).not.toContain('src/application/fakeCloudRepositories.ts');
    });
  }
});

describe('das Portal', () => {
  it('erreicht den Cloudzweig – sonst wäre es keines', () => {
    /*
      Die Gegenprobe zu allem darüber. Ohne sie könnten die Prüfungen oben
      auch dann bestehen, wenn es den Cloudzweig gar nicht gäbe – und dann
      prüften sie nichts.
    */
    expect(PORTAL.dateien).toContain('src/hosted/SessionContext.tsx');
    expect(PORTAL.dateien).toContain('src/application/repositories.ts');
  });

  it('erreicht das Wörterbuch nicht', () => {
    /*
      Genau hier ist etwas durchgerutscht: Das Portal band anfangs die
      Datenschutzseite der kontofreien Anwendung ein, und an der hing über
      die Lizenztafel der Wiktionary-Datensatz – 6,3 MB in einem Bündel, das
      ohne ihn 261 kB groß ist. Aufgefallen ist es an der Bündelgröße. Seitdem
      steht die Frage hier.
    */
    const verdaechtig = [...PORTAL.dateien].filter((datei) => datei.startsWith('src/dictionary/'));
    expect(verdaechtig).toEqual([]);
  });

  it('erreicht den PDF-Zweig nicht', () => {
    // Der PDF-Import ist eine Werkstattfunktion der Lehrkraftdatei. Kommt sie
    // später ins Portal, ist das eine Entscheidung – und diese Zeile der Ort,
    // an dem sie getroffen wird.
    expect([...PORTAL.pakete]).not.toContain('pdfjs-dist');
  });

  it('trägt die Lernlaufzeit nicht mit sich', () => {
    // Das Erzeugen von Lerndateien setzt die eingebettete Laufzeit voraus,
    // und die gibt es nur in der portablen Lehrkraftdatei.
    expect([...PORTAL.pakete]).not.toContain('virtual:lexiflow-student-runtime');
  });
});

describe('die Lerndatei bleibt eine Lerndatei', () => {
  it('erreicht keine Lehrkraftansicht', () => {
    const verdaechtig = [...LERNDATEI.dateien].filter((datei) =>
      datei.startsWith('src/routes/teacher/'),
    );
    expect(verdaechtig).toEqual([]);
  });

  it('erreicht den Gemini-Zweig nicht – weder Anbieter noch Adresse', () => {
    const verdaechtig = [...LERNDATEI.dateien].filter((datei) => datei.startsWith('src/ai/gemini/'));
    expect(verdaechtig).toEqual([]);
  });

  it('erreicht das Wörterbuch nicht', () => {
    // Sechs Megabyte, die niemand braucht, der nur übt – und die Schranke von
    // 1024 KiB für die Lernlaufzeit wäre damit ohnehin gerissen.
    const verdaechtig = [...LERNDATEI.dateien].filter((datei) =>
      datei.startsWith('src/dictionary/'),
    );
    expect(verdaechtig).toEqual([]);
  });
});
