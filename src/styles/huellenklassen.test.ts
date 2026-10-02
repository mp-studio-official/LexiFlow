import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Wem die alten Hüllenklassen gehören — und warum sie bleiben.
 *
 * ## Der Anlass
 *
 * Nach 5B.2d lag der Gedanke nahe, `.app-*` und `.bottom-nav*` seien „alte
 * Portalregeln" und könnten mit der alten Portalhülle verschwinden. Sie sind
 * es nicht. Dieselben Klassen trägt weiterhin die Fassung ohne Konto
 * (`AppShell`) und die portable Lerndatei (`StudentShell`, `StudentApp`,
 * `student-main`).
 *
 * Nach **E18** fällt eine Regel erst in dem Block, der ihren letzten
 * tatsächlichen Verbraucher umstellt. Diese Datei hält fest, wer die
 * Verbraucher sind, und macht aus der Überlegung eine Wache: Verschwindet
 * eine Regel, die noch jemand rendert, wird dieser Test rot — unabhängig
 * davon, ob gerade jemand an die portable Datei gedacht hat.
 *
 * ## Warum Quelltext und nicht ein gerendertes Bild
 *
 * Die portable Lerndatei lässt sich in jsdom nicht vollständig aufbauen, und
 * ein Screenshot sagt nicht, **welche** Regel fehlte. Die Frage lautet hier
 * „rendert jemand diese Klasse, und gibt es dafür eine Regel?" — und die ist
 * am Quelltext vollständig zu beantworten.
 */

const wurzel = resolve(import.meta.dirname, '../..');
const lies = (pfad: string): string => readFileSync(resolve(wurzel, pfad), 'utf8');

/** Die produktiven Verbraucher — ohne das Portal, das seit 5B.2d die Hülle benutzt. */
const VERBRAUCHER = [
  'src/ui/AppShell.tsx',
  'src/portable/StudentShell.tsx',
  'src/StudentApp.tsx',
  'src/student-main.tsx',
] as const;

/** Nur die wörtlich geschriebenen Klassen dieser beiden Familien. */
const FAMILIEN = /^(app|app-\w[\w-]*|bottom-nav[\w-]*)$/;

function klassenIn(pfad: string): string[] {
  const quelle = lies(pfad);
  const gefunden = new Set<string>();
  for (const treffer of quelle.matchAll(/className="([^"{}]+)"/g)) {
    for (const name of (treffer[1] ?? '').split(/\s+/)) {
      if (FAMILIEN.test(name)) gefunden.add(name);
    }
  }
  return [...gefunden].sort();
}

const GLOBAL = lies('src/styles/global.css');

/** Steht die Klasse irgendwo links von einer geschweiften Klammer? */
function hatRegel(klasse: string): boolean {
  /*
    Wortgrenze mit Blick auf den Bindestrich: `\b` träfe `.app` auch in
    `.app-nav` und machte die Prüfung für jede Elternklasse wertlos.
  */
  return new RegExp(`\\.${klasse}(?![\\w-])`).test(GLOBAL);
}

/*
  Eine Klasse darf ohne eigene Regel dastehen — als reiner Haltepunkt im
  Markup, der seine Gestalt von der Elternregel bekommt. Das ist erlaubt,
  aber es ist eine Ausnahme und steht deshalb namentlich hier. Ohne diese
  Liste müsste die Wache jede Klasse durchwinken, und dann prüfte sie nichts.
*/
const NUR_GERUEST = ['app-nav__label'] as const;

describe('die alten Hüllenklassen haben weiterhin Verbraucher', () => {
  const alle = new Map<string, string[]>();
  for (const datei of VERBRAUCHER) {
    for (const klasse of klassenIn(datei)) {
      alle.set(klasse, [...(alle.get(klasse) ?? []), datei]);
    }
  }

  it('die Erhebung findet überhaupt etwas', () => {
    /*
      Ohne diese Zeile bliebe der Test grün, wenn das Muster eines Tages
      nichts mehr fände — und eine leere Erhebung behauptet nichts.
    */
    expect(alle.size, 'keine Klasse erhoben — das Muster greift nicht mehr').toBeGreaterThanOrEqual(
      15,
    );
    for (const datei of VERBRAUCHER) {
      expect(klassenIn(datei).length, `${datei} rendert keine dieser Klassen mehr`).toBeGreaterThan(
        0,
      );
    }
  });


  it.each([...alle.keys()].sort())('`.%s` hat eine Regel in global.css', (klasse) => {
    if ((NUR_GERUEST as readonly string[]).includes(klasse)) {
      expect(hatRegel(klasse), `.${klasse} hat jetzt doch eine Regel — Liste anpassen`).toBe(false);
      return;
    }
    expect(hatRegel(klasse), `.${klasse} wird gerendert von ${alle.get(klasse)?.join(', ')}`).toBe(
      true,
    );
  });

  it('das Portal gehört nicht mehr dazu', () => {
    /*
      Die Gegenrichtung: Benutzte `PortalShell` diese Klassen wieder, stünde
      neben der gemeinsamen Hülle eine zweite, und der Abbau nach E18 käme nie
      zustande.
    */
    expect(klassenIn('src/hosted/PortalShell.tsx')).toEqual([]);
  });
});
