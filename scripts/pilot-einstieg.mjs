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

export function metadatenFuerAnmeldefreieFassung(html) {
  return html
    .replace(
      'content="https://lexiflow.info/icons/icon-512.png"',
      'content="https://lexiflow.info/ohne-konto/icons/icon-512.png"',
    )
    .replaceAll('content="https://lexiflow.info/"', 'content="https://lexiflow.info/ohne-konto/"')
    .replace(
      'href="https://lexiflow.info/"',
      'href="https://lexiflow.info/ohne-konto/"',
    );
}

/**
 * Der zweite Einstieg muss ein **eigener Build** sein. Eine Kopie der früheren
 * Startseite verwiese weiterhin auf `/assets/` und registrierte den Service
 * Worker für `/` – damit könnte sie das Kontoportal erneut übernehmen.
 */
export function pruefeAnmeldefreieFassung(html) {
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('Die kontofreie Fassung enthält keine React-Wurzel.');
  }
  for (const spur of [
    '/ohne-konto/assets/',
    'href="/ohne-konto/manifest.webmanifest"',
    'src="/ohne-konto/registerSW.js"',
    'href="https://lexiflow.info/ohne-konto/"',
  ]) {
    if (!html.includes(spur)) {
      throw new Error(`Die kontofreie Fassung ist nicht auf /ohne-konto/ begrenzt (${spur}).`);
    }
  }
  if (html.includes('/portal/assets/')) {
    throw new Error('Die kontofreie Fassung lädt versehentlich das Portalbündel.');
  }
}

/**
 * Die HTML-Datei kann auf die richtigen PWA-Dateien zeigen, während deren
 * Inhalt weiterhin den früheren Wurzelpfad beansprucht. Dann würde ein Besuch
 * unter `/ohne-konto/` wieder das Kontoportal unter `/` kontrollieren. Darum
 * wird der tatsächlich gebaute Vertrag separat geprüft.
 */
export function pruefeAnmeldefreiePwa(registrierung, manifestText, serviceWorker) {
  if (!registrierung.includes("register('/ohne-konto/sw.js'")) {
    throw new Error('Die kontofreie Fassung registriert nicht ihren eigenen Service Worker.');
  }
  if (!registrierung.includes("scope: '/ohne-konto/'")) {
    throw new Error('Der Service Worker der kontofreien Fassung hat nicht ihren eigenen Geltungsbereich.');
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('Das Manifest der kontofreien Fassung ist kein gültiges JSON.');
  }
  if (manifest.start_url !== '/ohne-konto/' || manifest.scope !== '/ohne-konto/') {
    throw new Error('Das Manifest der kontofreien Fassung verlässt ihren Grundpfad.');
  }
  if (!serviceWorker.includes('/ohne-konto/index.html')) {
    throw new Error('Der Service Worker fällt nicht auf den Einstieg der kontofreien Fassung zurück.');
  }
}

export function pilotEinstiegSchreiben(wurzel = resolve(import.meta.dirname, '..')) {
  const dist = resolve(wurzel, 'dist');
  const portal = readFileSync(resolve(dist, 'portal', 'index.html'), 'utf8');
  const solo = readFileSync(resolve(dist, 'ohne-konto', 'index.html'), 'utf8');
  pruefeAnmeldefreieFassung(solo);
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
