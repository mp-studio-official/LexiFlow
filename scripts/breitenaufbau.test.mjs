// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';

import { pruefeAuslieferung } from '../e2e/auslieferung';

/**
 * Die Gegenprobe zur Türprüfung – mit echten kleinen Servern.
 *
 * ## Warum das hier prüfbar sein muss
 *
 * `e2e/auslieferung.ts` ist die Stelle, an der der Lauf abbricht, wenn auf dem
 * Port die falsche Anwendung antwortet. Genau dieser Fall ist auf dem Mac
 * eingetreten und **nicht** aufgefallen: Playwright hat den fremden Server
 * übernommen, 48 Prüfungen sind nach je sieben Sekunden an der Folge
 * gescheitert, und keine einzige Layoutaussage wurde je getroffen.
 *
 * Eine Prüfung, die nur als `globalSetup` existiert, ließe sich ausschließlich
 * durch einen echten Fehlschlag prüfen – also nie. Deshalb ist sie eine
 * gewöhnliche Funktion, und hier stehen die vier Fälle, für die es sie gibt.
 *
 * ## Warum echte Server und keine Attrappe von `fetch`
 *
 * Weil die Fälle Serververhalten sind: eine Umleitung, ein 404, ein leeres
 * HTML. Eine Attrappe prüfte meine Vorstellung davon.
 */

const SEITE = (zusatz = '') => `<!doctype html>
<html lang="de"><head>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
${zusatz}
</head><body><div id="root"></div></body></html>`;

const laufende = [];

afterEach(async () => {
  while (laufende.length > 0) {
    const server = laufende.pop();
    server.close();
    await once(server, 'close').catch(() => {});
  }
});

/** Ein Server auf einem freien Port, plus das dazu passende Ziel. */
async function serverMit(behandle) {
  const server = createServer(behandle);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  laufende.push(server);
  const { port } = server.address();
  return {
    name: 'Prüfling',
    port,
    baseURL: `http://127.0.0.1:${port}/`,
    grundpfad: '/',
    probe: './',
  };
}

/** Der Normalfall: ein Server, der die Anwendung wirklich ausliefert. */
function echteAuslieferung(anfrage, antwort) {
  if (anfrage.url === '/') {
    antwort.writeHead(200, { 'content-type': 'text/html' });
    antwort.end(SEITE());
    return;
  }
  if (anfrage.url === '/assets/index-abc.js') {
    antwort.writeHead(200, { 'content-type': 'text/javascript' });
    antwort.end('export const da = true;');
    return;
  }
  if (anfrage.url === '/assets/index-abc.css') {
    antwort.writeHead(200, { 'content-type': 'text/css' });
    antwort.end(':root { color: black; }');
    return;
  }
  antwort.writeHead(404).end('nicht da');
}

describe('die Türprüfung lässt die richtige Auslieferung durch', () => {
  it('besteht, wenn Pfad, Wurzel und alle Bündel stimmen', async () => {
    const ziel = await serverMit(echteAuslieferung);
    await expect(pruefeAuslieferung(ziel)).resolves.toBeUndefined();
  });
});

describe('und bricht ab, wo der Mac-Lauf weitergelaufen ist', () => {
  it('falscher Grundpfad: die Anwendung liegt woanders', async () => {
    /*
      Der Fall vom Mac, nachgestellt: Auf dem Port antwortet die Auslieferung
      unter `/LexiFlow/`. Vorher lief die Suite dann weiter und maß nichts.
    */
    const ziel = await serverMit((anfrage, antwort) => {
      if (anfrage.url === '/') {
        antwort.writeHead(302, { location: '/LexiFlow/' }).end();
        return;
      }
      if (anfrage.url === '/LexiFlow/') {
        antwort.writeHead(200, { 'content-type': 'text/html' });
        antwort.end(SEITE());
        return;
      }
      echteAuslieferung(anfrage, antwort);
    });

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(/landet auf \/LexiFlow\/ statt auf \//);
  });

  it('fehlendes Bündel: das JavaScript kommt als 404 zurück', async () => {
    const ziel = await serverMit((anfrage, antwort) => {
      if (anfrage.url === '/') {
        antwort.writeHead(200, { 'content-type': 'text/html' });
        antwort.end(SEITE());
        return;
      }
      if (anfrage.url === '/assets/index-abc.css') {
        antwort.writeHead(200, { 'content-type': 'text/css' }).end('');
        return;
      }
      antwort.writeHead(404).end('nicht da');
    });

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(/index-abc\.js → HTTP 404/);
  });

  it('SPA-Rückfall: das Bündel antwortet mit 200 – und liefert HTML', async () => {
    /*
      Der Fall, den die erste Fassung dieser Prüfung durchgelassen hat, und
      der Grund, warum die Gegenprobe nicht optional ist.

      `vite preview` beantwortet jede unbekannte Adresse mit der
      `index.html`. Ein fehlendes Bündel kommt deshalb nicht als 404 zurück,
      sondern als 200 mit `text/html`. Die reine Statusprüfung war damit
      zufrieden – der Browser nicht: Er bekam eine Seite statt eines Moduls
      und startete nie.
    */
    const ziel = await serverMit((anfrage, antwort) => {
      if (anfrage.url === '/assets/index-abc.css') {
        antwort.writeHead(200, { 'content-type': 'text/css' }).end('');
        return;
      }
      // Alles andere – auch das fehlende Skript – bekommt die Seite.
      antwort.writeHead(200, { 'content-type': 'text/html' });
      antwort.end(SEITE());
    });

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(
      /index-abc\.js → HTTP 200, aber als „text\/html/,
    );
  });

  it('keine React-Wurzel: da wird nie etwas erscheinen', async () => {
    const ziel = await serverMit((anfrage, antwort) => {
      if (anfrage.url === '/') {
        antwort.writeHead(200, { 'content-type': 'text/html' });
        antwort.end('<!doctype html><html><body><p>fremde Seite</p></body></html>');
        return;
      }
      echteAuslieferung(anfrage, antwort);
    });

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(/keine React-Wurzel/);
  });

  it('kein Stylesheet: jede Breitenaussage wäre wertlos', async () => {
    const ziel = await serverMit((anfrage, antwort) => {
      if (anfrage.url === '/') {
        antwort.writeHead(200, { 'content-type': 'text/html' });
        antwort.end(
          '<!doctype html><html><head><script type="module" src="/assets/index-abc.js"></script>' +
            '</head><body><div id="root"></div></body></html>',
        );
        return;
      }
      echteAuslieferung(anfrage, antwort);
    });

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(/kein Stylesheet/);
  });

  it('gar kein Server: die Meldung nennt Port und erwartete Adresse', async () => {
    const ziel = await serverMit(echteAuslieferung);
    // Denselben Port wieder freigeben – jetzt hört dort niemand mehr.
    const server = laufende.pop();
    server.close();
    await once(server, 'close');

    await expect(pruefeAuslieferung(ziel)).rejects.toThrow(
      new RegExp(`Port ${ziel.port}.*nicht erreichbar`, 's'),
    );
  });
});
