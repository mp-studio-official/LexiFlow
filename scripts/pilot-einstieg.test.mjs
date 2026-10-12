// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hauptdomainWirdPortal, serviceWorkerRuhestand } from './pilot-einstieg.mjs';

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
});
