// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Die Konfiguration der Serverfunktionen, geprüft als Text.
 *
 * ## Warum das geprüft gehört
 *
 * Bis September 2026 gab es keine `supabase/config.toml`. Damit hing das
 * Verhalten beim Deployen am Plattformstandard – und was heute voreingestellt
 * ist, kann morgen anders voreingestellt sein, ohne dass jemand im Repository
 * etwas geändert hätte.
 *
 * Beide Funktionen brauchen `verify_jwt = false`. Für `learner-auth` ist das
 * die Voraussetzung dafür, dass sie überhaupt erreichbar ist: Wer dort anruft,
 * hat noch kein Konto. Für `ai-gateway` ist es die Entscheidung, die Prüfung
 * im eigenen Code zu behalten, wo sie die richtige Frage stellt.
 *
 * Fiele eine dieser Zeilen weg, meldete sich der Fehler als „401" beim ersten
 * echten Aufruf – also nach dem Deployen, bei einer lernenden Person.
 *
 * ## Warum als Text und nicht als TOML
 *
 * Weil die Frage „steht diese Zeile da?" lautet. Ein TOML-Parser wäre eine
 * Abhängigkeit mehr für eine Frage, die eine Zeichenkette beantwortet –
 * dieselbe Überlegung wie in `scripts/ci.test.mjs`.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const konfiguration = readFileSync(resolve(wurzel, 'supabase/config.toml'), 'utf8');

/** Der Text ohne Kommentarzeilen – sonst prüft die Wache ihre Begründung mit. */
const ohneKommentare = konfiguration
  .split('\n')
  .filter((zeile) => !zeile.trimStart().startsWith('#'))
  .join('\n');

describe('supabase/config.toml', () => {
  for (const funktion of ['learner-auth', 'ai-gateway']) {
    it(`setzt \`verify_jwt = false\` für \`${funktion}\``, () => {
      const abschnitt = new RegExp(
        `\\[functions\\.${funktion}\\][^\\[]*verify_jwt\\s*=\\s*false`,
        's',
      );
      expect(abschnitt.test(ohneKommentare)).toBe(true);
    });
  }

  it('setzt es nirgends auf `true`', () => {
    // Eine Zeile, die aus Versehen stehen bleibt, ist schlimmer als keine.
    expect(ohneKommentare).not.toMatch(/verify_jwt\s*=\s*true/);
  });

  it('nennt beide Funktionen und keine dritte', () => {
    /*
      Kommt eine Funktion dazu, fällt dieser Test auf – und jemand muss
      entscheiden, ob sie eine Nutzersitzung braucht. Genau die Entscheidung
      war bisher nirgends notiert.
    */
    const abschnitte = [...ohneKommentare.matchAll(/\[functions\.([a-z0-9-]+)\]/g)].map(
      (treffer) => treffer[1],
    );
    expect(abschnitte.sort()).toEqual(['ai-gateway', 'learner-auth']);
  });

  it('enthält keinen Projektbezug und keinen Schlüssel', () => {
    /*
      Diese Datei liegt im Repository. Ein Projekt-Ref, eine URL oder ein
      Schlüssel darin wäre ein Wert, der dort nicht hingehört – und der beim
      nächsten Projektwechsel still falsch würde.
    */
    expect(konfiguration).not.toMatch(/supabase\.co/);
    expect(konfiguration).not.toMatch(/sb_(publishable|secret)_[A-Za-z0-9_-]{8,}/);
    expect(konfiguration).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });
});
