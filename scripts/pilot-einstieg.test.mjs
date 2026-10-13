// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  hauptdomainWirdPortal,
  metadatenFuerAnmeldefreieFassung,
  serviceWorkerRuhestand,
  pruefeAnmeldefreieFassung,
  pruefeAnmeldefreiePwa,
} from './pilot-einstieg.mjs';

const portal = `<!doctype html><html><head>
  <meta name="description" content="LexiFlow-Portal" />
  <meta name="robots" content="noindex, nofollow" />
  <title>LexiFlow – Portal</title>
</head><body><div id="root"></div>
<script type="module" src="/portal/assets/portal-abc.js"></script></body></html>`;

describe('die Hauptdomain der Pilotauslieferung', () => {
  it('liefert das Kontoportal und führt ohne Hash zur Anmeldung', () => {
    const html = hauptdomainWirdPortal(portal);

    expect(html).toContain('src="/portal/assets/portal-abc.js"');
    expect(html).toContain("window.location.replace('/#/anmelden')");
    expect(html).not.toContain('noindex, nofollow');
    expect(html).toContain('<link rel="canonical" href="https://lexiflow.info/" />');
  });

  it('lässt einen ausdrücklich aufgerufenen Portalweg unangetastet', () => {
    const html = hauptdomainWirdPortal(portal);

    expect(html).toContain('if (!window.location.hash)');
    expect(html).not.toContain('location.hash =');
  });

  it('verweigert eine andere oder unvollständige Bauausgabe', () => {
    expect(() => hauptdomainWirdPortal('<div id="root"></div>')).toThrow(/Portalbündel/);
    expect(() =>
      hauptdomainWirdPortal('<script src="/portal/assets/x.js"></script>'),
    ).toThrow(/React-Wurzel/);
  });
});

describe('der frühere Offline-Einstieg', () => {
  it('entfernt Registrierung und Cache, statt eine zweite Anwendung auszuliefern', () => {
    expect(serviceWorkerRuhestand).toContain('caches.keys()');
    expect(serviceWorkerRuhestand).toContain('caches.delete(name)');
    expect(serviceWorkerRuhestand).toContain('registration.unregister()');
    expect(serviceWorkerRuhestand).toContain('client.navigate(client.url)');
  });

  it('bleibt als eigene PWA unter /ohne-konto/ erreichbar', () => {
    const html = `<!doctype html><html><head>
      <link rel="canonical" href="https://lexiflow.info/ohne-konto/">
      <link rel="manifest" href="/ohne-konto/manifest.webmanifest">
      <script id="vite-plugin-pwa:register-sw" src="/ohne-konto/registerSW.js"></script>
    </head><body><div id="root"></div>
      <script type="module" src="/ohne-konto/assets/index-abc.js"></script>
    </body></html>`;

    expect(() => pruefeAnmeldefreieFassung(html)).not.toThrow();
    expect(() => pruefeAnmeldefreieFassung(html.replaceAll('/ohne-konto/', '/'))).toThrow(
      /ohne-konto/,
    );
    expect(() => pruefeAnmeldefreieFassung(portal)).toThrow(/kontofreie/);
  });

  it('nennt als kanonische Adresse nicht das Kontoportal', () => {
    const rootMetadaten = `<head>
      <meta property="og:url" content="https://lexiflow.info/" />
      <meta property="og:image" content="https://lexiflow.info/icons/icon-512.png" />
      <link rel="canonical" href="https://lexiflow.info/" />
    </head>`;
    const html = metadatenFuerAnmeldefreieFassung(rootMetadaten);

    expect(html).toContain('content="https://lexiflow.info/ohne-konto/"');
    expect(html).toContain('content="https://lexiflow.info/ohne-konto/icons/icon-512.png"');
    expect(html).toContain('href="https://lexiflow.info/ohne-konto/"');
    expect(html).not.toContain('<link rel="canonical" href="https://lexiflow.info/"');
  });

  it('begrenzt Manifest und Service Worker auf den eigenen Pfad', () => {
    const registrierung = "register('/ohne-konto/sw.js', { scope: '/ohne-konto/' })";
    const manifest = JSON.stringify({ start_url: '/ohne-konto/', scope: '/ohne-konto/' });
    const serviceWorker = 'navigateFallback: "/ohne-konto/index.html"';

    expect(() => pruefeAnmeldefreiePwa(registrierung, manifest, serviceWorker)).not.toThrow();
    expect(() =>
      pruefeAnmeldefreiePwa(registrierung.replace("scope: '/ohne-konto/'", "scope: '/'"), manifest, serviceWorker),
    ).toThrow(/Geltungsbereich/);
    expect(() =>
      pruefeAnmeldefreiePwa(registrierung, JSON.stringify({ start_url: '/', scope: '/' }), serviceWorker),
    ).toThrow(/Grundpfad/);
    expect(() =>
      pruefeAnmeldefreiePwa(registrierung, manifest, 'navigateFallback: "/index.html"'),
    ).toThrow(/Einstieg/);
  });
});
