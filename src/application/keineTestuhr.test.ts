// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Zwei Wachen am Quelltext, beide aus einem korrigierten Fehler entstanden.
 *
 * ## 1. Keine Testuhr im öffentlichen Vertrag
 *
 * `my_due_overview` hatte am 02.10.2026 kurzzeitig ein
 * `p_now timestamptz default now()` – gedacht als Erleichterung für Tests.
 * Der Parameter reichte von SQL über RPC und Gateway bis in
 * `ProgressOverviewRepository`, also bis in den Vertrag, an dem später die
 * Seite „Heute" hängt. Dort wäre früher oder später ein
 * `new Date().toISOString()` hineingeschrieben worden – eine Geräteuhr, die
 * niemand nachprüfen kann, als Grundlage für Fälligkeit, Tag und Serie.
 * Genau das schließt E28 aus.
 *
 * Die Wache prüft den **Zuschnitt**, nicht das Verhalten: Was es nicht gibt,
 * kann niemand falsch aufrufen. Ein Prüfstand, der einen Zeitpunkt braucht,
 * legt seine Daten relativ zu `now()` an.
 *
 * ## 2. Kein nacktes `supabase` in der eingecheckten Anleitung
 *
 * Auf dem Arbeitsrechner gibt es kein global installiertes `supabase`. Eine
 * Anleitung, die mit `supabase db push` beginnt, scheitert dort an der
 * ersten Zeile – und sie scheitert still, weil `command not found` wie ein
 * Umgebungsproblem aussieht und nicht wie ein Fehler im Dokument.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '../..');

function lies(pfad: string): string {
  return readFileSync(resolve(wurzel, pfad), 'utf8');
}

/** Der Rumpf einer `interface`-Deklaration, ohne den Rest der Datei. */
function schnittstelle(quelltext: string, name: string): string {
  const beginn = quelltext.indexOf(`export interface ${name} {`);
  expect(beginn, `${name} nicht gefunden`).toBeGreaterThan(-1);
  const ende = quelltext.indexOf('\n}', beginn);
  expect(ende, `${name} nicht geschlossen`).toBeGreaterThan(beginn);
  return quelltext.slice(beginn, ende);
}

/*
  Wörter, die eine Uhr benennen. Absichtlich breit: Die Wache soll auch bei
  `clock`, `zeitpunkt` oder `stand` anschlagen, nicht nur beim Namen, der
  einmal dastand.
*/
const UHRWOERTER = /\b(now|jetzt|zeitpunkt|clock|time|timestamp|datum|date)\b/i;

describe('Kein Vergleichszeitpunkt im öffentlichen Vertrag', () => {
  it('`myDueOverview` nimmt nichts entgegen', () => {
    const vertrag = schnittstelle(lies('src/application/repositories.ts'), 'ProgressOverviewRepository');
    expect(vertrag).toContain('myDueOverview(): Promise<DueOverview[]>;');
    /*
      Und kein anderer Methodenkopf in diesem Vertrag nimmt eine Uhr. Die
      Prüfung sieht die ganze Schnittstelle an, nicht nur die eine Zeile –
      sonst stünde die Uhr morgen in einer zweiten Methode daneben.
    */
    for (const kopf of vertrag.matchAll(/^\s{2}(\w+)\(([^)]*)\)/gm)) {
      expect(kopf[2], `${kopf[1]} nimmt \`${kopf[2]}\` entgegen`).not.toMatch(UHRWOERTER);
    }
  });

  it('`rpcDueOverview` nimmt nichts entgegen', () => {
    const gateway = schnittstelle(lies('src/cloud/progressGateway.ts'), 'ProgressGateway');
    expect(gateway).toContain('rpcDueOverview(): Promise<DueOverviewRow[]>;');
    const kopf = /rpcDueOverview\(([^)]*)\)/.exec(gateway);
    expect(kopf?.[1]).toBe('');
  });

  it('die SQL-Funktion hat keine Parameterliste', () => {
    const migration = lies('supabase/migrations/20261002090000_lernendeneinstellungen.sql');
    expect(migration).toContain('create or replace function my_due_overview()');
    /*
      Und `p_now` kommt in keiner Anweisung mehr vor. Im Kommentar darüber
      steht es sehr wohl – deshalb werden hier nur die Zeilen angesehen, die
      nicht zu einem Kommentarblock gehören.
    */
    for (const anweisung of ohneKommentare(migration).split(';')) {
      expect(anweisung, 'p_now steht wieder in einer Anweisung').not.toMatch(/\bp_now\b/);
    }
  });

  it('die Lerntagsfunktionen haben ebenfalls keine Parameterliste', () => {
    /*
      Migration 13. Hier wäre die Versuchung am größten gewesen: Ein
      `p_zone` oder `p_heute` spart beim Prüfen eine Zeile – und reicht die
      Tagesgrenze an die aufrufende Seite durch. Dann entschiede am Ende die
      Geräteuhr, welcher Tag ein Lerntag ist (E28).
    */
    const migration = lies('supabase/migrations/20261003090000_lokale_lerntage.sql');
    expect(migration).toContain('create or replace function my_local_today()');
    expect(migration).toContain('create or replace function my_learning_days()');
    for (const anweisung of ohneKommentare(migration).split(';')) {
      expect(anweisung, 'ein Parameter steht wieder in einer Anweisung').not.toMatch(
        /\bp_(now|zone|time_zone|day|date|today|user|person)\b/,
      );
    }
    // Und die Tagesgrenze kommt aus der gespeicherten Zeitzone, nicht aus UTC.
    expect(migration).toContain('at time zone s.time_zone');
  });

  it('`LearningDaysRepository` nimmt nichts entgegen', () => {
    const vertrag = schnittstelle(lies('src/application/repositories.ts'), 'LearningDaysRepository');
    expect(vertrag).toContain('myCalendar(): Promise<Kalenderstand>;');
    expect(vertrag).toContain('myLearningDays(): Promise<Tageszaehlung[]>;');
    for (const kopf of vertrag.matchAll(/^\s{2}(\w+)\(([^)]*)\)/gm)) {
      expect(kopf[2], `${kopf[1]} nimmt \`${kopf[2]}\` entgegen`).not.toMatch(UHRWOERTER);
    }
  });

  it('die Serienlogik ruft überhaupt keine Uhr', () => {
    /*
      Das Modul bekommt den heutigen Tag vom Server. Ein `new Date()` darin
      wäre kein Schönheitsfehler, sondern die Stelle, an der eine verstellte
      Geräteuhr eine Serie verlängert.

      `new Date(nummer * 86_400_000)` und `Date.UTC(…)` sind erlaubt und
      stehen ausdrücklich hier: Beide rechnen mit einem **übergebenen**
      Kalendertag und fragen keine Uhr. Gesucht wird deshalb nach den
      Formen, die eine Uhr lesen.
    */
    const quelle = ohneKommentare(lies('src/domain/lernserie.ts'));
    expect(quelle).not.toMatch(/Date\.now\(\)/);
    expect(quelle).not.toMatch(/new Date\(\)/);
    expect(quelle).not.toMatch(/Intl\.DateTimeFormat/);
  });

  it('die Anbindung der Lerntage schickt keine Argumente mit', () => {
    const anbindung = lies('src/cloud/supabaseLearningDaysGateway.ts');
    expect(anbindung).toContain("client.rpc('my_local_today')");
    expect(anbindung).toContain("client.rpc('my_learning_days')");
    expect(anbindung).not.toMatch(/new Date|Date\.now/);
  });

  it('die Anbindung setzt keine eigene Uhr ein', () => {
    /*
      Der Weg, auf dem eine Geräteuhr trotz parameterlosem Vertrag
      hineinkäme: Die Anbindung erfindet sie selbst und schickt sie mit.
    */
    const anbindung = lies('src/cloud/supabaseProgressGateway.ts');
    const aufruf = anbindung.slice(
      anbindung.indexOf('async rpcDueOverview'),
      anbindung.indexOf('async rpcReset'),
    );
    expect(aufruf.length).toBeGreaterThan(0);
    expect(aufruf).not.toMatch(/new Date|Date\.now|p_now/);
    expect(aufruf).toContain("client.rpc('my_due_overview')");
  });

  it('die Fälschung nimmt den Zeitpunkt auch nicht entgegen', () => {
    // Sonst prüfte der Vertrag gegen die Fälschung etwas anderes als gegen SQL.
    const faelschung = lies('src/application/fakeCloudRepositories.ts');
    expect(faelschung).toContain('async myDueOverview() {');
  });
});

/**
 * Entfernt Kommentare – `/* … *\/`-Blöcke, `--`-Zeilen (SQL) und
 * `//`-Zeilen (TypeScript).
 *
 * Nötig, weil die Wachen nach Zeichenfolgen suchen, die in den Kommentaren
 * **vorkommen sollen**: Dort steht, warum `Date.now()` hier nichts zu suchen
 * hat. Eine Wache, die ihre eigene Begründung anstreicht, zwänge dazu, die
 * Begründung zu entfernen.
 */
function ohneKommentare(quelltext: string): string {
  return quelltext
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/* ------------------------------------------------------- Die Anleitungen */

/** Jede Datei unter `docs/`, rekursiv. */
function dokumente(ordner: string): string[] {
  const gefunden: string[] = [];
  for (const name of readdirSync(resolve(wurzel, ordner))) {
    const pfad = join(ordner, name);
    if (statSync(resolve(wurzel, pfad)).isDirectory()) gefunden.push(...dokumente(pfad));
    else if (/\.(md|sql|sh)$/.test(name)) gefunden.push(pfad);
  }
  return gefunden;
}

/*
  Die Unterbefehle, an denen ein CLI-Aufruf erkennbar ist. Keine Liste aller
  Vorkommen des Wortes „supabase": Das steht in diesen Dokumenten überall –
  als Produktname, als Schemaname, als `supabase/migrations/…`.
*/
const CLI_AUFRUF = /\bsupabase\s+(migration|db|link|login|projects|functions|secrets|start|stop|status|gen)\b/;

describe('Eingecheckte Anleitungen rufen die CLI über npx auf', () => {
  /*
    Die Wache gilt für `docs/abnahme/` – die Anleitungen, die jemand
    **ausführen** soll. Nicht für `docs/` insgesamt, und das ist eine
    bewusste Grenze, keine Bequemlichkeit:

    `docs/migrationshistorie-audit.md` hält fest, welche Befehle am
    29.09. und 02.10.2026 tatsächlich gelaufen sind – dort steht
    `npx supabase migration repair …`, ohne `--yes` und ohne `@latest`.
    Diese Zeilen nachträglich umzuschreiben hiesse, ein Protokoll zu
    fälschen. `docs/inbetriebnahme-staging.md` und
    `docs/portal-uebergabe.md` erwähnen `supabase db push` im Fliesstext,
    um zu erklären, warum er damals **nicht** benutzt wurde.

    Beides bleibt stehen. Was neu dazukommt und ausgeführt werden soll,
    liegt unter `docs/abnahme/` und hält sich an die Regel.
  */
  it('nennt in `docs/abnahme/` nirgends ein nacktes `supabase`-Kommando', () => {
    /*
      Angesehen werden nur Zeilen, die jemand **ausführt** – also Zeilen in
      einem Codeblock und jede Zeile einer `.sql`-Datei. Eine Erwähnung im
      Fliesstext (`supabase db push` in Rückstrichen, in einem Satz darüber,
      warum es so nicht geht) ist kein Kommando, und eine Wache, die sie
      anstrich, zwänge dazu, die Begründung aus dem Dokument zu nehmen.
    */
    const verstoesse: string[] = [];
    for (const datei of dokumente('docs/abnahme')) {
      const zeilen = lies(datei).split('\n');
      let imBlock = datei.endsWith('.sql');
      zeilen.forEach((zeile, i) => {
        if (datei.endsWith('.md') && zeile.trimStart().startsWith('```')) {
          imBlock = !imBlock;
          return;
        }
        if (!imBlock) return;
        if (!CLI_AUFRUF.test(zeile)) return;
        verstoesse.push(`${datei}:${i + 1}: ${zeile.trim()}`);
      });
    }
    expect(verstoesse).toEqual([]);
  });

  it('erkennt ein nacktes Kommando auch wirklich', () => {
    /*
      Die Wache an sich selbst geprüft – sonst wäre sie eine leere Schleife.

      Die erwünschte Form fällt schon durch das Muster: Nach `supabase`
      kommt dort `@latest`, kein Leerzeichen. Das ist Absicht und nicht
      Zufall – ein Muster, das beide Formen träfe, bräuchte eine zweite
      Regel, um sie wieder auseinanderzuhalten.
    */
    expect(CLI_AUFRUF.test('supabase db push --linked')).toBe(true);
    expect(CLI_AUFRUF.test('  supabase migration list --linked')).toBe(true);
    expect(CLI_AUFRUF.test('npx --yes supabase@latest db push --linked')).toBe(false);
    // Und das hier ist kein Kommando, sondern ein Pfad:
    expect(CLI_AUFRUF.test('supabase/migrations/20261002090000_x.sql')).toBe(false);
  });

  /*
    Die zweite Wache an denselben Anleitungen, und sie hat einen konkreten
    Anlass: `db push` kennt **keine Zielfassung**. Die Hilfe der CLI 2.119.0
    nennt `--dry-run`, `--include-all`, `--linked`, `--db-url`, `--password`
    – mehr nicht. Ein Aufruf wendet also jede ausstehende Fassung an.

    Als 14 und 15 beide ausstanden, hätte ein schlichtes `db push` beide
    angewandt, und Abschnitt B von Migration 14 wäre nie prüfbar gewesen: Er
    erwartet 101 Spalten und 39 Funktionen, mit 15 stünden dort 102 und 40.
    Marc hat das gesehen, bevor jemand den Befehl getippt hat.

    Geprüft werden nur **Aufrufe** – Zeilen mit `supabase@latest db push`.
    Der Fliesstext spricht an vielen Stellen über `db push`, und zwar
    gerade, um zu erklären, warum er so nicht benutzt wird.
  */
  const PUSH_AUFRUF = /supabase@latest\s+db\s+push/;

  function anleitungen(): string[] {
    return [...dokumente('docs/abnahme'), 'docs/pilot-abnahme.md'];
  }

  /** Die Zeilen, die jemand ausführt: Codeblöcke in `.md`, alles in `.sql`. */
  function ausfuehrbareZeilen(datei: string): string[] {
    const zeilen = lies(datei).split('\n');
    const gefunden: string[] = [];
    let imBlock = datei.endsWith('.sql');
    for (const zeile of zeilen) {
      if (datei.endsWith('.md') && zeile.trimStart().startsWith('```')) {
        imBlock = !imBlock;
        continue;
      }
      if (imBlock) gefunden.push(zeile);
    }
    return gefunden;
  }

  it('nennt `--include-all` in keinem einzigen Aufruf', () => {
    /*
      Diese Option nimmt ausdrücklich alles mit, was in der Historie fehlt –
      das genaue Gegenteil dessen, was hier gebraucht wird.
    */
    const verstoesse: string[] = [];
    for (const datei of anleitungen()) {
      for (const zeile of ausfuehrbareZeilen(datei)) {
        if (PUSH_AUFRUF.test(zeile) && zeile.includes('--include-all')) {
          verstoesse.push(`${datei}: ${zeile.trim()}`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('nennt bei jedem Aufruf ausdrücklich das Ziel', () => {
    /*
      `--linked` oder `--db-url`. Ohne beides entscheidet die CLI selbst,
      wohin – und „wohin" ist bei einem Schreibbefehl keine Kleinigkeit.
    */
    const verstoesse: string[] = [];
    for (const datei of anleitungen()) {
      for (const zeile of ausfuehrbareZeilen(datei)) {
        if (!PUSH_AUFRUF.test(zeile)) continue;
        if (!zeile.includes('--linked') && !zeile.includes('--db-url')) {
          verstoesse.push(`${datei}: ${zeile.trim()}`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('lässt keinen anwendenden Aufruf ohne vorherigen Trockenlauf stehen', () => {
    /*
      Was angewandt wird, sieht man vorher an. Geprüft wird die Reihenfolge
      **innerhalb einer Datei**: Vor jedem `db push` ohne `--dry-run` muss
      weiter oben einer mit `--dry-run` stehen.
    */
    const verstoesse: string[] = [];
    for (const datei of anleitungen()) {
      let trockenlaufGesehen = false;
      for (const zeile of ausfuehrbareZeilen(datei)) {
        if (!PUSH_AUFRUF.test(zeile)) continue;
        if (zeile.includes('--dry-run')) {
          trockenlaufGesehen = true;
          continue;
        }
        if (!trockenlaufGesehen) verstoesse.push(`${datei}: ${zeile.trim()}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('erkennt einen Aufruf überhaupt – und eine Erwähnung nicht', () => {
    expect(PUSH_AUFRUF.test('npx --yes supabase@latest db push --linked --dry-run')).toBe(true);
    // Fliesstext über den Befehl, kein Befehl:
    expect(PUSH_AUFRUF.test('`db push` kennt keine Zielfassung.')).toBe(false);
    expect(PUSH_AUFRUF.test('Ein `supabase db push` wendet alles an.')).toBe(false);
  });

  it('findet in den Anleitungen überhaupt Aufrufe – sonst prüfte das nichts', () => {
    const alle = anleitungen().flatMap((datei) => ausfuehrbareZeilen(datei));
    const aufrufe = alle.filter((zeile) => PUSH_AUFRUF.test(zeile));
    expect(aufrufe.length).toBeGreaterThan(2);
    expect(aufrufe.some((zeile) => zeile.includes('--dry-run'))).toBe(true);
    expect(aufrufe.some((zeile) => !zeile.includes('--dry-run'))).toBe(true);
  });

  it('findet überhaupt Dokumente – sonst prüfte die Schleife nichts', () => {
    const gefunden = dokumente('docs/abnahme');
    expect(gefunden.length).toBeGreaterThan(1);
    expect(gefunden.some((pfad) => pfad.endsWith('.sql'))).toBe(true);
    expect(gefunden.some((pfad) => pfad.endsWith('.md'))).toBe(true);
  });

  it('und die Anleitung ruft die CLI auch wirklich auf', () => {
    // Sonst bestünde sie die Prüfung oben, indem sie gar nichts aufriefe.
    const anleitung = lies('docs/abnahme/migration-12.md');
    for (const befehl of ['migration list --linked', 'db push --linked']) {
      expect(anleitung).toContain(`npx --yes supabase@latest ${befehl}`);
    }
  });
});
