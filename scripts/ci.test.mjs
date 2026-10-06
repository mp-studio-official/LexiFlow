// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Die Werkstatt prüft sich selbst.
 *
 * ## Warum das keine Spielerei ist
 *
 * Eine Prüfkette ist genau so viel wert wie das, was sie aufruft. Fällt ein
 * Schritt heraus – weil jemand ihn beim Umbauen vergisst, weil ein Auftrag
 * umbenannt wird –, dann wird weiterhin alles grün, und niemand merkt, dass
 * ein ganzer Bereich nicht mehr geprüft wird. Das ist der unangenehmste
 * Fehler, den eine Werkstatt haben kann: Sie meldet Erfolg.
 *
 * Diese Datei liest die Arbeitsabläufe als Text und fragt, ob sie aufrufen,
 * was es zu prüfen gibt. Grob, aber an der richtigen Stelle.
 *
 * ## Warum als Text und nicht als YAML
 *
 * Weil die Frage „steht dieser Befehl da?" lautet und nicht „wie ist die
 * Datei aufgebaut?". Ein YAML-Parser wäre eine Abhängigkeit mehr für eine
 * Frage, die eine Zeichenkette beantwortet.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function lies(pfad) {
  return readFileSync(resolve(wurzel, pfad), 'utf8');
}

const ci = lies('.github/workflows/ci.yml');
const deploy = lies('.github/workflows/deploy.yml');
const pilot = lies('.github/workflows/pilot.yml');
const paket = JSON.parse(lies('package.json'));

/**
 * Was in **jeder** Kette vorkommen muss – mit dem Grund daneben.
 *
 * Kommt ein Bereich hinzu, gehört er hierher. Fällt einer weg, fällt dieser
 * Test auf, und jemand muss aufschreiben, warum.
 */
const PFLICHT = {
  'npm run typecheck': 'TypeScript im strengen Modus',
  'npm test': 'alle Prüfungen – auch gegen PostgreSQL und die Serverfunktionen',
  'npm run e2e': 'die kontofreie Anwendung',
  'npm run e2e:portable': 'die portablen Dateien',
  'npm run e2e:portal': 'das Portal unter dem Unterpfad',
  'npm run build:portable': 'die portablen Dateien bauen',
  'npm run verify:portable': 'die Größenwacht',
};

describe('die Prüfkette ruft auf, was es zu prüfen gibt', () => {
  const ketten = [
    ['ci.yml', `${ci}`],
    ['deploy.yml', `${deploy}`],
    ['pilot.yml', `${pilot}`],
  ];

  for (const [name, inhalt] of ketten) {
    for (const [befehl, grund] of Object.entries(PFLICHT)) {
      it(`${name} ruft \`${befehl}\` auf (${grund})`, () => {
        expect(inhalt).toContain(befehl);
      });
    }
  }
});

describe('jeder aufgerufene Befehl existiert auch', () => {
  it('in package.json steht jedes `npm run …` aus den Abläufen', () => {
    /*
      Die Gegenrichtung. Ein Tippfehler in einem Ablauf wäre sonst ein
      Schritt, der mit „missing script" abbricht – und zwar erst in der
      Werkstatt, nicht hier.
    */
    const aufgerufen = new Set();
    for (const inhalt of [ci, deploy, pilot]) {
      for (const treffer of inhalt.matchAll(/npm run ([a-z0-9:]+)/g)) {
        aufgerufen.add(treffer[1]);
      }
    }
    const unbekannt = [...aufgerufen].filter((name) => !(name in paket.scripts));
    expect(unbekannt).toEqual([]);
  });
});

describe('das Deployment hat seinen Riegel', () => {
  it('prüft das gebaute Verzeichnis, bevor es hochlädt', () => {
    const vorRiegel = deploy.indexOf('npm run verify:deploy');
    const vorUpload = deploy.indexOf('upload-pages-artifact');

    expect(vorRiegel, '`verify:deploy` fehlt im Deployment').toBeGreaterThan(-1);
    expect(vorRiegel, 'der Riegel steht nach dem Hochladen').toBeLessThan(vorUpload);
  });

  it('lädt nichts hoch, bevor die Prüfkette durch ist', () => {
    // `needs:` ist das, was aus zwei Aufträgen eine Reihenfolge macht.
    expect(deploy).toMatch(/deploy:\s*\n(?:.*\n)*?\s*needs: pruefen/);
  });

  it('baut die Auslieferung frisch und nimmt kein Artefakt aus dem Prüflauf', () => {
    /*
      Der Prüflauf baut mit `VITE_LEXIFLOW_FAKE_CLOUD=1` – erfundene Konten,
      Kennwort im Quelltext. Ein Artefakt von dort im Deployment wäre der
      Fehler, gegen den die ganze Datei geschrieben ist.
    */
    expect(deploy).not.toContain('download-artifact');
  });

  it('setzt die Fahne für die Fälschung nicht', () => {
    const zeilen = deploy
      .split('\n')
      .filter((zeile) => zeile.includes('VITE_LEXIFLOW_FAKE_CLOUD'));
    // Erwähnt werden darf sie – aber nur im Kommentar, der sagt, dass sie fehlt.
    for (const zeile of zeilen) {
      expect(zeile.trimStart().startsWith('#'), zeile).toBe(true);
    }
  });
});

describe('im CI wird kein echtes Modell geholt und kein Anbieter angerufen', () => {
  it('beide Abläufe setzen die Werkstattfahne', () => {
    for (const [name, inhalt] of [
      ['ci.yml', ci],
      ['deploy.yml', deploy],
      ['pilot.yml', pilot],
    ]) {
      expect(inhalt, name).toMatch(/LEXIFLOW_CI:\s*'1'/);
    }
  });

  it('und keiner lädt ein Browsermodell herunter', () => {
    for (const inhalt of [ci, deploy, pilot]) {
      expect(inhalt).not.toMatch(/gemma|llama|onnx|transformers|model.*download/i);
    }
  });

  it('und keiner trägt einen Schlüssel im Klartext', () => {
    /*
      Was in einem Ablauf steht, steht im Repository. Ein Wert gehört in
      Secrets oder Variables – also in `${{ secrets.… }}` oder `${{ vars.… }}`
      und nirgendwo sonst.
    */
    for (const inhalt of [ci, deploy, pilot]) {
      expect(inhalt).not.toMatch(/sb_secret_[A-Za-z0-9_-]{12,}/);
      expect(inhalt).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
      expect(inhalt).not.toMatch(/LEXIFLOW_AI_MASTER_KEY_V\d+:\s*[^$\s]/);
    }
  });
});
