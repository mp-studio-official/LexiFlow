import type { FullConfig } from '@playwright/test';

import { zielZu, type Breitenziel } from './adressen';

/**
 * Die Türprüfung: Bedient dieser Port wirklich diese Anwendung?
 *
 * ## Warum vor dem ersten Browser
 *
 * Als auf Port 4173 ein fremder Server antwortete, meldete sich der Fehler
 * 48-mal als „element(s) not found" nach je sieben Sekunden. Das ist die
 * teuerste und unbrauchbarste Form, einen 404 zu melden: Sie zeigt, was fehlt,
 * und verschweigt, warum.
 *
 * Diese Prüfung läuft einmal je Suite, ohne Browser, über `fetch`. Stimmt
 * etwas nicht, bricht der Lauf in unter einer Sekunde ab – mit dem Port, dem
 * erwarteten und dem tatsächlichen Pfad und dem Namen des fehlenden Bündels.
 *
 * ## Warum nicht nur „antwortet der Server"
 *
 * Weil der fremde Server geantwortet hat. Mit 200. Mit gültigem HTML. Was
 * fehlte, war alles dahinter. Geprüft wird deshalb die Kette:
 *
 * 1. Die Adresse antwortet.
 * 2. Sie antwortet **unter dem erwarteten Pfad** – ohne Umleitung woandershin.
 * 3. Im HTML steht eine React-Wurzel.
 * 4. Im HTML stehen Skripte und Stile.
 * 5. **Jedes einzelne davon ist abrufbar.**
 *
 * Punkt 5 ist der, der gefehlt hat.
 */

/** Was im HTML als Bündel verwiesen wird. */
function verwieseneBuendel(html: string): { skripte: string[]; stile: string[] } {
  const treffer = [...html.matchAll(/(?:src|href)="([^"]+?\.(?:js|css))(?:\?[^"]*)?"/g)].map(
    (fund) => fund[1] ?? '',
  );
  return {
    skripte: [...new Set(treffer.filter((pfad) => pfad.endsWith('.js')))],
    stile: [...new Set(treffer.filter((pfad) => pfad.endsWith('.css')))],
  };
}

function fehler(ziel: Breitenziel, satz: string): Error {
  return new Error(
    `Prüfbank (${ziel.name}, Port ${ziel.port}): ${satz}\n` +
      `Erwartet wird ein eigener Server unter ${ziel.baseURL} mit der Anwendung ` +
      `unter ${ziel.grundpfad}. Antwortet dort etwas anderes, ist auf dem Port ` +
      `ein fremder Server – die Breitensuite verwendet ihn absichtlich nicht ` +
      `weiter (reuseExistingServer: false).`,
  );
}

/**
 * Die Prüfung selbst – ohne Playwright, damit sie prüfbar ist.
 *
 * `scripts/breitenaufbau.test.mjs` ruft genau diese Funktion gegen kleine
 * eigene Server auf: einen richtigen, einen mit falschem Grundpfad, einen mit
 * fehlendem Bündel, einen ohne Wurzel. Eine Prüfung, die nur als
 * `globalSetup` existiert, ließe sich nur durch einen echten Fehlschlag
 * prüfen – also nie.
 */
export async function pruefeAuslieferung(
  ziel: Breitenziel,
  { wartenMs = 0 }: { wartenMs?: number } = {},
): Promise<void> {
  const adresse = new URL(ziel.probe, ziel.baseURL);

  /*
    Nur auf das **Hochkommen** wird gewartet, und nur auf einen
    Verbindungsfehler hin. Playwright startet den Server und dieses Skript in
    einer Reihenfolge, die sich zwischen Fassungen geändert hat; darauf soll
    die Prüfung nicht angewiesen sein. Jede andere Abweichung – falscher Pfad,
    fehlendes Bündel – bricht sofort ab, denn Warten ändert daran nichts.
  */
  const frist = Date.now() + wartenMs;
  let antwort: Response;
  for (;;) {
    try {
      antwort = await fetch(adresse, { redirect: 'follow' });
      break;
    } catch (ursache) {
      if (Date.now() >= frist) {
        throw fehler(ziel, `${adresse} ist nicht erreichbar (${String(ursache)}).`);
      }
      await new Promise((weiter) => setTimeout(weiter, 250));
    }
  }

  if (!antwort.ok) {
    throw fehler(ziel, `${adresse} antwortet mit HTTP ${antwort.status}.`);
  }

  const endpfad = new URL(antwort.url).pathname;
  if (endpfad !== ziel.grundpfad) {
    throw fehler(
      ziel,
      `${adresse} landet auf ${endpfad} statt auf ${ziel.grundpfad}. ` +
        `Genau so sah der Fehlgriff auf Port 4173 aus.`,
    );
  }

  const html = await antwort.text();
  if (!/id=["']root["']/.test(html)) {
    throw fehler(ziel, `im ausgelieferten HTML steht keine React-Wurzel (#root).`);
  }

  const { skripte, stile } = verwieseneBuendel(html);
  if (skripte.length === 0) {
    throw fehler(
      ziel,
      `das ausgelieferte HTML verweist auf kein JavaScript. ` +
        `Eine leere Wurzel wäre die Folge – und kein Layout zu prüfen.`,
    );
  }
  if (stile.length === 0) {
    throw fehler(
      ziel,
      `das ausgelieferte HTML verweist auf kein Stylesheet. ` +
        `Ohne Stile ist jede Breitenaussage wertlos.`,
    );
  }

  const fehlende: string[] = [];
  await Promise.all(
    [...skripte, ...stile].map(async (pfad) => {
      const buendel = new URL(pfad, antwort.url);
      try {
        const da = await fetch(buendel, { method: 'GET', redirect: 'follow' });
        if (!da.ok) {
          fehlende.push(`${pfad} → HTTP ${da.status}`);
          return;
        }
        /*
          Der Fall, den die Gegenprobe gefunden hat – und den eine reine
          Statusprüfung nicht sieht.

          `vite preview` beantwortet jede unbekannte Adresse mit der
          `index.html`. Ein fehlendes Bündel kommt deshalb nicht als 404
          zurück, sondern als **200 mit HTML**. Der Browser bekommt dann eine
          Seite, wo er ein Modul erwartet, bricht still ab, und die Wurzel
          bleibt leer: genau das Bild, das auf dem Mac 48-mal als
          „element(s) not found" erschien.

          Geprüft wird deshalb nicht, ob geantwortet wurde, sondern **womit**.
        */
        const art = (da.headers.get('content-type') ?? '').toLowerCase();
        const erwartet = pfad.endsWith('.js')
          ? /javascript|ecmascript/
          : /text\/css/;
        if (!erwartet.test(art)) {
          fehlende.push(`${pfad} → HTTP ${da.status}, aber als „${art || 'ohne Typ'}"`);
        }
      } catch (ursache) {
        fehlende.push(`${pfad} → ${String(ursache)}`);
      }
    }),
  );

  if (fehlende.length > 0) {
    throw fehler(
      ziel,
      `${fehlende.length} von ${skripte.length + stile.length} Bündeln sind nicht ` +
        `so abrufbar, wie der Browser sie braucht:\n  ${fehlende.sort().join('\n  ')}`,
    );
  }
}

/**
 * Der Einstieg für Playwright.
 *
 * Welche der beiden Suiten läuft, steht nicht in einer Umgebungsvariablen,
 * sondern in der Grundadresse der Konfiguration – die Konfiguration sagt also
 * selbst, was geprüft werden soll.
 */
export default async function aufbauPruefen(konfiguration: FullConfig): Promise<void> {
  const baseURL = konfiguration.projects[0]?.use?.baseURL;
  const ziel = zielZu(baseURL);
  if (!ziel) {
    throw new Error(
      `Prüfbank: zu der Grundadresse ${String(baseURL)} gibt es kein Ziel in ` +
        `e2e/adressen.ts. Wer hier einen Port ändert, ändert ihn dort.`,
    );
  }
  await pruefeAuslieferung(ziel, { wartenMs: 90_000 });
}
