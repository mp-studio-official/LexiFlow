#!/usr/bin/env node
/**
 * Der Abstand zum Pilot 0.1 – acht Prüfungen, heute alle rot.
 *
 * ## Warum es sie gibt
 *
 * Zwischen „alle Tests grün" und „eine Lehrkraft kann damit am Montag
 * unterrichten" liegt kein Test, sondern eine Liste. Die Liste steht in
 * `docs/pilot-0.1-readiness.md`; dieses Skript misst sie, damit sie nicht
 * zu einem Dokument wird, das jemand einmal gelesen hat.
 *
 * ## Warum kein Vitest und nicht in `npm run verify`
 *
 * Weil sie **rot sein darf**. Eine Prüfung, die den Abstand zu einem noch
 * nicht entschiedenen Ziel misst, gehört nicht in die Suite, die sagt „der
 * Quelltext ist in Ordnung" – dort bräche sie die Auslieferung für einen
 * Zustand, der gar kein Defekt ist. Sie wird einzeln aufgerufen:
 * `npm run pilot:pruefen`.
 *
 * ## Was jede Prüfung schuldet
 *
 * Eine **Grünbedingung**, die benennbar ist. „Pilot ist vorbereitet" wäre
 * keine Prüfung, sondern eine Meinung. Jede Zeile unten sagt deshalb, welche
 * Datei, welcher Eintrag oder welche Zeile sie grün macht – und ist damit
 * zugleich ihre eigene Gegenprobe: Wer die genannte Stelle schafft, sieht
 * die Zeile umspringen; wer sie wieder entfernt, sieht sie zurückspringen.
 *
 * ## Was es ausdrücklich *nicht* tut
 *
 * Es fragt kein Supabase, keine GitHub-API und kein Netz. Zwei der offenen
 * Punkte – ob die Registrierung per E-Mail eingeschaltet ist und wie der
 * Stand ins Netz gelangt – sind **Entscheidungen**, keine Messwerte. Das
 * Skript kann nur sehen, ob ihre Folge im Projekt angekommen ist.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Dateiinhalt oder `null`, wenn es die Datei nicht gibt. */
function lies(...teile) {
  const pfad = join(wurzel, ...teile);
  return existsSync(pfad) ? readFileSync(pfad, 'utf8') : null;
}

const ergebnisse = [];

/**
 * @param nummer   Die Nummer aus Abschnitt 3 des Bereitschaftsplans.
 * @param titel    Was geprüft wird.
 * @param pruefen  Gibt `true` zurück, wenn es da ist.
 * @param gruenBei Die Stelle, die den Punkt grün macht.
 */
function pruefung(nummer, titel, pruefen, gruenBei) {
  let gruen = false;
  let bemerkung = '';
  try {
    const ergebnis = pruefen();
    gruen = ergebnis === true;
    if (typeof ergebnis === 'string') bemerkung = ergebnis;
  } catch (fehler) {
    bemerkung = `nicht messbar: ${fehler.message}`;
  }
  ergebnisse.push({ nummer, titel, gruen, bemerkung, gruenBei });
}

/* ------------------------------------------------------------------ 1 */

pruefung(
  1,
  'Der Auslieferungszweig trägt das Portal',
  () => {
    /*
      `deploy.yml` läuft auf `main`. Liegt `src/hosted` dort nicht, liefert
      ein Lauf die kontofreie Anwendung aus – und niemand bemerkt es am
      grünen Haken.
    */
    const ausgabe = execFileSync('git', ['ls-tree', '-r', '--name-only', 'main', '--', 'src/hosted'], {
      cwd: wurzel,
      encoding: 'utf8',
    });
    return ausgabe.trim().length > 0;
  },
  'Entscheidung 6.1: der beschlossene Weg ins Netz, danach `src/hosted` auf dem Auslieferungszweig.',
);

/* ------------------------------------------------------------------ 2 */

pruefung(
  2,
  '„Verwaltung" ist kein Platzhalter mehr',
  () => {
    const quelle = lies('src', 'hosted', 'teacher', 'TeacherArea.tsx');
    if (quelle === null) return 'TeacherArea.tsx fehlt';
    /*
      Der Platzhalter ist kein Text, sondern ein Eintrag: `verwaltung` mit
      einer `phase`. Solange er dort steht, zeigt `/verwaltung` eine Meldung
      „Kommt in …" und keinen Bildschirm. Nach dem Text zu suchen ginge
      daneben – er steht nirgends wörtlich, sondern wird zusammengesetzt.
    */
    const eintrag = /verwaltung:\s*\{[^}]*\bphase:/m.test(quelle);
    return !eintrag;
  },
  'Ein echter Bildschirm unter `/verwaltung` in `src/hosted/teacher/TeacherArea.tsx`.',
);

/* ------------------------------------------------------------------ 3 */

pruefung(
  3,
  'Es gibt einen Weg, ein Konto stillzulegen',
  () => {
    /*
      Gesucht wird in den Migrationen, nicht im Browser: Ein Sperren, das nur
      eine Schaltfläche ist, sperrt nichts. Ein Zustand in der Datenbank plus
      eine Zugriffsregel darauf sperrt.
    */
    const ordner = join(wurzel, 'supabase', 'migrations');
    if (!existsSync(ordner)) return 'Migrationsordner fehlt';
    const begriffe = ['disabled_at', 'blocked_at', 'suspended_at', 'gesperrt_seit'];
    for (const datei of readdirSync(ordner)) {
      const inhalt = readFileSync(join(ordner, datei), 'utf8');
      if (begriffe.some((begriff) => inhalt.includes(begriff))) return true;
    }
    return false;
  },
  'Eine neue additive Migration mit einem Sperrzustand und einer Regel, die ihn auswertet.',
);

/* ------------------------------------------------------------------ 4 */

pruefung(
  4,
  '`profiles_insert_self` schränkt die Rolle ein',
  () => {
    /*
      Die **letzte** Fassung der Regel zählt: Eine spätere Migration darf sie
      ablegen und neu anlegen, und dann ist die frühere ohne Belang. Deshalb
      über alle Migrationen in Namensreihenfolge und das letzte Vorkommen.
    */
    const ordner = join(wurzel, 'supabase', 'migrations');
    if (!existsSync(ordner)) return 'Migrationsordner fehlt';
    let letzte = null;
    for (const datei of readdirSync(ordner).sort()) {
      const inhalt = readFileSync(join(ordner, datei), 'utf8');
      const treffer = inhalt.match(/create policy profiles_insert_self[\s\S]*?;/g);
      if (treffer) letzte = treffer[treffer.length - 1];
    }
    if (letzte === null) return 'Regel `profiles_insert_self` nicht gefunden';
    return /with check[\s\S]*\brole\b/.test(letzte);
  },
  'Migration 14 (additiv) – **nur**, wenn Entscheidung 6.2 ergibt, dass die Registrierung offen ist.',
);

/* ------------------------------------------------------------------ 5 */

pruefung(
  5,
  'Der Happy-Path 6.7 bis 6.10 ist im Staging belegt',
  () => {
    const doku = lies('docs', 'inbetriebnahme-staging.md');
    if (doku === null) return 'inbetriebnahme-staging.md fehlt';
    /*
      Gelesen wird die Standtabelle in §0.5. Eine Zeile zählt als belegt,
      wenn sie einen der vier Abschnitte nennt und **nicht** „offen" sagt.
      Keine Zeile zu finden ist rot, nicht grün – eine verschwundene Tabelle
      ist kein Nachweis.
    */
    const zeilen = doku.split('\n').filter((zeile) => zeile.startsWith('|'));
    const gesucht = ['6.7', '6.8', '6.9', '6.10'];
    const offen = [];
    for (const abschnitt of gesucht) {
      /*
        Die Nummer als eigenständige Angabe suchen, nicht als Zeichenkette:
        `6.1` steckt in `6.10`, und eine Zeile nennt zwei Abschnitte auf
        einmal („(6.8, 6.9)"). Ein schlichtes `includes` verfehlte 6.9 und
        hielte den Punkt für immer rot – eine Prüfung, die nie grün werden
        kann, prüft nichts.
      */
      const nummer = new RegExp(`(?<![\\d.])${abschnitt.replace('.', '\\.')}(?![\\d])`);
      const zeile = zeilen.find((kandidat) => nummer.test(kandidat));
      if (zeile === undefined || zeile.includes('offen')) offen.push(abschnitt);
    }
    if (offen.length > 0) return `offen: ${offen.join(', ')}`;
    return true;
  },
  'Ein Abnahmeprotokoll mit gemessenen Zahlen und die berichtigte Standtabelle in §0.5.',
);

/* ------------------------------------------------------------------ 6 */

pruefung(
  6,
  'Die Hülle trägt eine Pilotkennzeichnung',
  () => {
    const pilot = lies('src', 'hosted', 'pilot.ts');
    if (pilot === null) return '`src/hosted/pilot.ts` fehlt';
    const huelle = lies('src', 'hosted', 'PortalShell.tsx');
    if (huelle === null) return 'PortalShell.tsx fehlt';
    return huelle.includes("from './pilot'") || huelle.includes('from "./pilot"');
  },
  '`src/hosted/pilot.ts` mit der Kennzeichnung, benutzt in `PortalShell.tsx`.',
);

/* ------------------------------------------------------------------ 7 */

pruefung(
  7,
  'Es gibt Anleitungen für das Portal – für beide Seiten',
  () => {
    /*
      `docs/PILOT-ANLEITUNG.md` zählt hier **nicht**: Sie beschreibt die
      portable Lerndatei („keine Installation, kein Konto, keine Anmeldung")
      und damit ein anderes Produkt.
    */
    const fehlend = ['anleitung-portal-lehrkraft.md', 'anleitung-portal-lernende.md'].filter(
      (datei) => lies('docs', datei) === null,
    );
    if (fehlend.length > 0) return `fehlt: ${fehlend.join(', ')}`;
    return true;
  },
  '`docs/anleitung-portal-lehrkraft.md` und `docs/anleitung-portal-lernende.md`.',
);

/* ------------------------------------------------------------------ 8 */

pruefung(
  8,
  'Der KI-Zustand im Pilot ist im Produkt verankert',
  () => {
    const pilot = lies('src', 'hosted', 'pilot.ts');
    if (pilot === null) return '`src/hosted/pilot.ts` fehlt';
    if (!/KI_IM_PILOT/.test(pilot)) return '`KI_IM_PILOT` nicht gesetzt';
    const seite = lies('src', 'hosted', 'teacher', 'AiPage.tsx');
    if (seite === null) return 'AiPage.tsx fehlt';
    return /KI_IM_PILOT/.test(seite);
  },
  'Entscheidung 6.3, danach `KI_IM_PILOT` in `src/hosted/pilot.ts` und ausgewertet in `AiPage.tsx`.',
);

/* --------------------------------------------------------------- Bericht */

const breite = Math.max(...ergebnisse.map((e) => e.titel.length));
console.log('\nPilot 0.1 – Bereitschaft (docs/pilot-0.1-readiness.md, Abschnitt 3)\n');
for (const e of ergebnisse) {
  const marke = e.gruen ? 'GRÜN' : 'ROT ';
  const zusatz = e.bemerkung === '' ? '' : `  — ${e.bemerkung}`;
  console.log(`  ${marke}  ${String(e.nummer)}. ${e.titel.padEnd(breite)}${zusatz}`);
}

const rote = ergebnisse.filter((e) => !e.gruen);
if (rote.length === 0) {
  console.log('\nAlle acht Punkte stehen. Das ist keine Freigabe – es ist die Voraussetzung dafür.\n');
  process.exit(0);
}

console.log(`\n${rote.length} von ${ergebnisse.length} offen. Grün wird jeder Punkt so:\n`);
for (const e of rote) console.log(`  ${String(e.nummer)}. ${e.gruenBei}`);
console.log(
  '\nRot ist hier der erwartete Zustand, solange die Pilotgrenze nicht entschieden ist.\n' +
    'Deshalb ist diese Prüfung nicht Teil von `npm run verify`.\n',
);
process.exit(1);
