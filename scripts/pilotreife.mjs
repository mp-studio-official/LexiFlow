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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
  'Der Auslieferungsweg für den Pilotzweig ist bereit',
  () => {
    /*
      Nicht mehr „`src/hosted` liegt auf `main`". Marc hat entschieden:
      eigener Pilotzweig, getrennte Adresse, `main` unangetastet. Die alte
      Prüfung wäre damit eine geworden, die grün werden soll, indem man genau
      das tut, was untersagt ist.

      Geprüft wird, was sich ohne Deployment prüfen lässt: dass es den Ablauf
      gibt, dass er **nicht** von selbst startet, und dass der Weg
      beschrieben ist. Ob wirklich etwas im Netz steht, steht im
      Abnahmeprotokoll – siehe Prüfung 10.
    */
    const ablauf = lies('.github', 'workflows', 'pilot.yml');
    if (ablauf === null) return '`.github/workflows/pilot.yml` fehlt';
    if (!/workflow_dispatch/.test(ablauf)) return 'kein Zuruf-Auslöser';
    if (/^on:[\s\S]*?^\s{2}push:/m.test(ablauf)) return 'startet bei `push` – das soll er nicht';
    if (lies('docs', 'pilot-auslieferung.md') === null) return '`docs/pilot-auslieferung.md` fehlt';
    return true;
  },
  '`.github/workflows/pilot.yml` (nur `workflow_dispatch`) und `docs/pilot-auslieferung.md`.',
);

/* ------------------------------------------------------------------ 2 */

pruefung(
  2,
  'Der Rollenriegel liegt bereit (Migration 14)',
  () => {
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
  'Eine additive Migration, die `profiles_insert_self` auf die Lernendenrolle festlegt.',
);

/* ------------------------------------------------------------------ 3 */

pruefung(
  3,
  'Der Sperrweg liegt bereit (Migration 15)',
  () => {
    const ordner = join(wurzel, 'supabase', 'migrations');
    if (!existsSync(ordner)) return 'Migrationsordner fehlt';
    const dateien = readdirSync(ordner).map((datei) => readFileSync(join(ordner, datei), 'utf8'));
    const spalte = dateien.some((inhalt) => /add column disabled_at/.test(inhalt));
    if (!spalte) return 'kein Sperrzustand auf dem Profil';
    /*
      Eine Spalte allein sperrt nichts. Gefragt ist, ob sie auch ausgewertet
      wird – sonst stünde hier eine Zahl in einer Tabelle, und alle hielten
      das Konto für gesperrt.
    */
    const schalter = dateien.some((inhalt) => /app_account_is_active/.test(inhalt));
    if (!schalter) return 'der Sperrzustand wird nirgends ausgewertet';
    return true;
  },
  'Eine additive Migration mit `disabled_at` und einer Regel, die ihn auswertet.',
);

/* ------------------------------------------------------------------ 4 */

pruefung(
  4,
  'Die Migrationen 14 und 15 sind einzeln und in dieser Reihenfolge angewandt',
  () => {
    /*
      Die Protokolle sagen es selbst. Sie tragen, solange nichts gelaufen
      ist, „NOCH NICHT AUSGEFÜHRT" im Kopf – und das wird beim Eintragen der
      gemessenen Werte geändert, nicht nebenbei.

      Die **Reihenfolge** steht hier mit drin, und das ist kein Formalismus:
      `db push` kennt keine Zielfassung und wendet jede ausstehende Fassung
      an. Steht 15 als angewandt da und 14 nicht, kann nur eines von beiden
      passiert sein – entweder wurde 14 nie abgenommen, oder beide liefen
      zusammen und Abschnitt B von 14 hat nie jemand geprüft. In beiden
      Fällen fehlt der Nachweis, und grün wäre hier eine Behauptung.
    */
    const stand = (datei) => {
      const inhalt = lies('docs', 'abnahme', datei);
      if (inhalt === null) return 'fehlt';
      return /NOCH NICHT AUSGEF/i.test(inhalt) ? 'offen' : 'angewandt';
    };
    const vierzehn = stand('migration-14.sql');
    const fuenfzehn = stand('migration-15.sql');

    if (fuenfzehn === 'angewandt' && vierzehn !== 'angewandt') {
      return '15 gilt als angewandt, 14 nicht – die Reihenfolge stimmt nicht';
    }
    const offen = [];
    if (vierzehn !== 'angewandt') offen.push(`14: ${vierzehn === 'fehlt' ? 'Protokoll fehlt' : 'nicht angewandt'}`);
    if (fuenfzehn !== 'angewandt') offen.push(`15: ${fuenfzehn === 'fehlt' ? 'Protokoll fehlt' : 'nicht angewandt'}`);
    if (offen.length > 0) return offen.join(' · ');
    return true;
  },
  'Erst Folge A (Migration 14, SQL Editor + Historie nachtragen), dann Folge B (Migration 15, `db push`) – docs/pilot-abnahme.md Teil A.',
);

/* ------------------------------------------------------------------ 5 */

pruefung(
  5,
  'Der Happy-Path 6.7 bis 6.10 ist im Staging belegt',
  () => {
    const doku = lies('docs', 'inbetriebnahme-staging.md');
    if (doku === null) return 'inbetriebnahme-staging.md fehlt';
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
  'Den Durchlauf am echten Staging gehen und §0.5 berichtigen.',
);

/* ------------------------------------------------------------------ 6 */

pruefung(
  6,
  'Die Anwendung trägt eine Pilotkennzeichnung',
  () => {
    const pilot = lies('src', 'hosted', 'pilot.ts');
    if (pilot === null) return '`src/hosted/pilot.ts` fehlt';
    if (!/IST_PILOT = true/.test(pilot)) return '`IST_PILOT` steht nicht auf true';
    /*
      Das Band sitzt über dem Router, dort, wo auch das Testband sitzt – in
      `HostedApp`, nicht in `PortalShell`. Die erste Fassung dieser Prüfung
      verlangte `PortalShell`; sie beschrieb damit eine Stelle, an der es
      nicht hingehört, und wäre nur grün geworden, wenn jemand es dorthin
      verschoben hätte.
    */
    const anwendung = lies('src', 'hosted', 'HostedApp.tsx');
    if (anwendung === null) return 'HostedApp.tsx fehlt';
    /*
      Ohne das Schlüsselwort davor: Die Abhängigkeitswache liest jede
      Importzeile dieser Datei und hielt den Ausdruck hier für einen Import
      eines unbekannten Pakets. Sie hatte recht, so wie sie gebaut ist – und
      zweimal hintereinander, weil auch diese Erklärung ihn erst wörtlich
      enthielt. Deshalb steht hier jetzt weder im Code noch im Kommentar
      eine Zeile, die wie ein Import aussieht.
    */
    return anwendung.includes("'./pilot'") && /Pilotband/.test(anwendung);
  },
  '`src/hosted/pilot.ts` mit `IST_PILOT`, benutzt als Band in `HostedApp.tsx`.',
);

/* ------------------------------------------------------------------ 7 */

pruefung(
  7,
  'KI ist bestimmt gesperrt, nicht zufällig aus',
  () => {
    const pilot = lies('src', 'hosted', 'pilot.ts');
    if (pilot === null) return '`src/hosted/pilot.ts` fehlt';
    if (!/KI_IM_PILOT.*'gesperrt'/.test(pilot)) return '`KI_IM_PILOT` steht nicht auf gesperrt';
    /*
      Zwei Stellen, und beide sind nötig: Die Anwendung nimmt den Zugang aus
      dem Speicherverbund (das ist die Sperre), die Seite erklärt es (das ist
      der Unterschied zwischen „gesperrt" und „kaputt").
    */
    const anwendung = lies('src', 'hosted', 'HostedApp.tsx');
    const seite = lies('src', 'hosted', 'teacher', 'AiPage.tsx');
    if (anwendung === null || seite === null) return 'Dateien fehlen';
    if (!/ohneGesperrteKi/.test(anwendung)) return 'der Zugang wird nicht entfernt';
    return /KI_IM_PILOT/.test(seite);
  },
  '`KI_IM_PILOT` auf `gesperrt`, `ohneGesperrteKi` in `HostedApp.tsx`, Erklärung in `AiPage.tsx`.',
);

/* ------------------------------------------------------------------ 8 */

pruefung(
  8,
  'Jede Ansicht, die Daten holt, kennt den Verbindungsfehler',
  () => {
    /*
      Eine Wache und keine Verhaltensprüfung – die steht in
      `src/hosted/verbindung.test.tsx`. Hier geht es um die **nächste**
      Ansicht: Wer eine baut, die lädt, soll an dieser Stelle gestoppt
      werden, bevor sie in den Pilot kommt.

      Die Ausnahmen stehen namentlich da. Eine Ausnahmeliste, die man lesen
      kann, ist ehrlicher als eine Heuristik, die stillschweigend Dateien
      überspringt.
    */
    const AUSNAHMEN = {
      'SessionContext.tsx': 'keine Ansicht – die Sitzung, ohne eigene Darstellung',
      'LocalImportPanel.tsx': 'nimmt eine Datei entgegen, holt nichts',
      'NewPasswordPage.tsx': 'ein Formular; der Fehler steht am Absenden',
      'AiPage.tsx': 'im Pilot gesperrt, lädt nichts',
    };
    const ordner = join(wurzel, 'src', 'hosted');
    if (!existsSync(ordner)) return 'src/hosted fehlt';

    const fehlend = [];
    const suche = (pfad) => {
      for (const eintrag of readdirSync(pfad)) {
        const voll = join(pfad, eintrag);
        if (statSync(voll).isDirectory()) {
          suche(voll);
          continue;
        }
        if (!eintrag.endsWith('.tsx') || eintrag.endsWith('.test.tsx')) continue;
        if (eintrag in AUSNAHMEN) continue;
        const inhalt = readFileSync(voll, 'utf8');
        const holt = /useOptionalRepository|useRepository/.test(inhalt) && /useEffect/.test(inhalt);
        if (!holt) continue;
        if (!/Verbindungsfehler|ErrorState/.test(inhalt)) fehlend.push(eintrag);
      }
    };
    suche(ordner);
    if (fehlend.length > 0) return `ohne Fehlerzustand: ${fehlend.join(', ')}`;
    return true;
  },
  'In der betroffenen Ansicht `Verbindungsfehler` benutzen – oder sie begründet in die Ausnahmeliste eintragen.',
);

/* ------------------------------------------------------------------ 9 */

pruefung(
  9,
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

/* ----------------------------------------------------------------- 10 */

pruefung(
  10,
  'Das Pilot-Abnahmeprotokoll ist abgearbeitet',
  () => {
    const doku = lies('docs', 'pilot-abnahme.md');
    if (doku === null) return '`docs/pilot-abnahme.md` fehlt';
    /*
      Offene Kästchen zählen. Ein Protokoll, dessen Punkte alle noch offen
      sind, ist eine Anleitung – und eine Anleitung ist kein Nachweis.
    */
    const offen = (doku.match(/^\s*- \[ \]/gm) ?? []).length;
    if (offen > 0) return `${offen} Punkte noch offen`;
    return true;
  },
  'Das Protokoll am echten System abarbeiten und die gemessenen Werte eintragen.',
);

/* ----------------------------------------------------------------- 11 */

pruefung(
  11,
  'Für das Stagingprojekt ist ein Sicherungsverfahren belegt',
  () => {
    /*
      Am 06.10.2026 im Dashboard abgelesen: Das Projekt läuft im
      kostenfreien Tarif, und der enthält **keine** Projektsicherungen.
      Planmäßige Sicherungen über sieben Tage gibt es erst im Pro-Tarif.
      Es gibt damit weder ein Intervall noch eine Aufbewahrungsdauer.

      Warum das eine eigene Prüfung bekommt und nicht nur ein offenes
      Kästchen in Teil E: Weil es der einzige Punkt ist, der nicht den
      Pilot aufhält, sondern die **echten Daten** darin. Ein Kästchen unter
      dreiunddreißig anderen wird mitgehakt; eine rote Zeile in dieser
      Liste nicht.

      Grün wird sie nicht durch einen Satz, sondern durch eine Zeile mit
      gemessenen Werten – deshalb die wörtliche Marke.
    */
    const doku = lies('docs', 'pilot-abnahme.md');
    if (doku === null) return '`docs/pilot-abnahme.md` fehlt';
    const marke = doku.match(/SICHERUNG BELEGT:\s*(.+)/);
    if (marke === null) return 'kein Intervall, keine Aufbewahrungsdauer – nur künstliche Testdaten';
    if (marke[1].trim().length < 10) return 'die Marke steht da, aber ohne Werte';
    return true;
  },
  'Entweder Pro-Tarif (dann Intervall und Aufbewahrung eintragen) oder ein beschriebenes und getestetes eigenes Verfahren – in Teil E4 als Zeile „SICHERUNG BELEGT: …".',
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
