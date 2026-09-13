import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Das Portal – die zweite Web-Auslieferung, unter `<base>/portal/`.
 *
 * ## Warum eine eigene Konfiguration und kein zweiter Eintrag in `vite.config.ts`
 *
 * `define` gilt für einen ganzen Build, nicht je Einstiegspunkt. Zwei Seiten
 * in einer Konfiguration bekämen also dieselben Fahnen – und damit wäre
 * `__LEXIFLOW_PORTAL__` entweder für beide wahr oder für beide falsch. Die
 * ganze Trennung hinge dann wieder an einer Laufzeitabfrage.
 *
 * Zwei Konfigurationen kosten einen zweiten Build-Durchlauf von knapp zwei
 * Sekunden. Dafür sind die Bündel getrennt, und das ist am Ergebnis prüfbar.
 *
 * ## Der Grundpfad
 *
 * `LEXIFLOW_BASE` ist der gemeinsame Grundpfad beider Auslieferungen – auf
 * GitHub Pages `/LexiFlow/`. Das Portal liegt darunter, also
 * `/LexiFlow/portal/`. Im Quelltext steht nirgends ein fester Pfad; alles
 * leitet sich über `import.meta.env.BASE_URL` daraus ab (siehe
 * `src/runtime/entryUrls.ts`).
 *
 * Im Entwicklungsserver bleibt der Grundpfad `/`, und die Seite ist unter
 * `/portal.html` erreichbar. Das ist die ehrlichere Lösung als eine
 * nachgebaute Pfadumschreibung: Weniger Maschinerie, und der Unterschied zum
 * Build betrifft nur die Adresszeile, nicht das Bündel.
 *
 * ## Warum die Ausgabe `index.html` heißt
 *
 * Die Quelldatei heißt `portal.html`, damit sie neben `index.html` und
 * `student.html` im Projektstamm liegt und nicht ein Verzeichnis erfindet, das
 * halb Quelle und halb Ausgabe wäre. Ausgeliefert werden muss sie aber als
 * `portal/index.html`: Nur dann öffnet `…/LexiFlow/portal/` sie ohne
 * Dateinamen in der Adresse. Das Umbenennen erledigt das Plugin unten – ein
 * nachgelagertes Skript täte dasselbe, liefe aber außerhalb von Vite und
 * würde beim `--watch`-Betrieb vergessen.
 */

const base = process.env['LEXIFLOW_BASE'] ?? '/';

/** Ein eigener Ordner unterhalb von `dist` – der kontofreie Build leert `dist`. */
const outDir = 'dist/portal';

/**
 * Aus `portal.html` wird `index.html` – im Ausgabeordner, nicht in der Quelle.
 *
 * Umbenannt wird auf der Platte und nicht im Bündel. Der erste Versuch tat
 * Letzteres (`generateBundle`, Schlüssel tauschen, `fileName` setzen) und
 * erzeugte gar keine Datei: Rolldown hatte den Namen zu diesem Zeitpunkt
 * bereits festgeschrieben. `closeBundle` läuft, nachdem alles geschrieben ist –
 * dort ist eine Umbenennung eine Umbenennung.
 */
function alsIndexAusliefern(outDir: string): Plugin {
  return {
    name: 'lexiflow-portal-als-index',
    enforce: 'post',
    async closeBundle() {
      const quelle = resolve(outDir, 'portal.html');
      const ziel = resolve(outDir, 'index.html');
      if (!existsSync(quelle)) {
        // Absichtlich hart: Ein Portal, das unter `…/portal/` eine
        // Verzeichnisliste oder einen 404 zeigt, ist kein Portal.
        this.error(`${quelle} wurde nicht erzeugt – die Ausgabe wäre unerreichbar.`);
        return;
      }
      await rename(quelle, ziel);
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `${base}portal/` : '/',
  define: {
    // Keine portable Datei, keine Lerndatei – aber das Portal.
    __LEXIFLOW_PORTABLE__: 'false',
    __LEXIFLOW_LEARNER__: 'false',
    __LEXIFLOW_PORTAL__: 'true',
  },
  plugins: [react(), alsIndexAusliefern(outDir)],
  build: {
    target: 'es2022',
    sourcemap: false,
    /*
      Ein eigener Ordner unterhalb von `dist`, und `emptyOutDir: false`, weil
      der kontofreie Build vorher `dist` leert. Die Reihenfolge steht in
      `package.json`: erst `vite build`, dann dieser hier.
    */
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: 'portal.html',
    },
  },
  server: {
    // Ohne Grundpfad im Entwicklungsbetrieb: `http://localhost:5174/portal.html`.
    port: 5174,
  },
}));
