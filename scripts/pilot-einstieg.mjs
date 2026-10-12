#!/usr/bin/env node
/**
 * Macht in der Pilotauslieferung das Kontoportal zum Einstieg der Hauptdomain.
 *
 * Der normale Build bleibt zweigeteilt: die kontofreie Anwendung unter `/`
 * und das Kontoportal unter `/portal/`. Auf `lexiflow.info` wäre diese
 * technische Reihenfolge jedoch eine falsche Produktaussage — ein Aufruf der
 * Hauptadresse landete ohne Anmeldung in der Lehrkraftwerkstatt.
 *
 * Für den Pilot wird deshalb die bereits gebaute Portalhülle zusätzlich als
 * `dist/index.html` eingesetzt. Ihr Bündel bleibt unter `/portal/assets/`;
 * es wird weder kopiert noch ein zweites Mal gebaut. `/portal/` bleibt für
 * bestehende Wiederherstellungs- und Weiterleitungsadressen erhalten.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function hauptdomainWirdPortal(portalHtml) {
  if (!portalHtml.includes('<div id="root"></div>')) {
    throw new Error('Die gebaute Portalhülle enthält keine React-Wurzel.');
  }
  if (!/src="\/portal\/assets\/[^"']+\.js"/.test(portalHtml)) {
    throw new Error('Die gebaute Portalhülle verweist nicht auf ihr Portalbündel.');
  }

  const ohneSperre = portalHtml
    .replace(/\s*<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/?>\s*/i, '\n')
    .replace(/<title>[^<]*<\/title>/i, '<title>LexiFlow – Anmelden</title>');

  const webMetadaten = `
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="de_DE" />
    <meta property="og:site_name" content="LexiFlow" />
    <meta property="og:title" content="LexiFlow – Vokabeln lernen" />
    <meta property="og:url" content="https://lexiflow.info/" />
    <meta property="og:image" content="https://lexiflow.info/icons/icon-512.png" />
    <link rel="canonical" href="https://lexiflow.info/" />
    <script>
      if (!window.location.hash) window.location.replace('/#/anmelden');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrierungen) => {
          for (const registrierung of registrierungen) registrierung.unregister();
        });
      }
    </script>`;

  return ohneSperre.replace('</head>', `${webMetadaten}\n  </head>`);
}

export const serviceWorkerRuhestand = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    const fenster = await self.clients.matchAll({ type: 'window' });
    for (const client of fenster) await client.navigate(client.url);
  })());
});
`;

export function pilotEinstiegSchreiben(wurzel = resolve(import.meta.dirname, '..')) {
  const dist = resolve(wurzel, 'dist');
  const portal = readFileSync(resolve(dist, 'portal', 'index.html'), 'utf8');
  writeFileSync(resolve(dist, 'index.html'), hauptdomainWirdPortal(portal), 'utf8');
  /*
   * Wer die frühere PWA schon geöffnet hatte, besitzt noch einen Service
   * Worker mit Geltung für `/`. Seine nächste Aktualisierung entfernt Cache
   * und Registrierung; sonst könnte er die alte Lehrkraftansicht weiter aus
   * seinem Speicher liefern, obwohl auf dem Server längst das Portal liegt.
   */
  writeFileSync(resolve(dist, 'sw.js'), serviceWorkerRuhestand.trimStart(), 'utf8');
}

const direktGestartet = process.argv[1]
  ? import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href
  : false;

if (direktGestartet) pilotEinstiegSchreiben();
