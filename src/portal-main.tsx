import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostedApp } from './hosted/HostedApp';
import './styles/global.css';

/**
 * Einstiegspunkt des Portals – die zweite Web-Auslieferung.
 *
 * ## Warum es diesen Einstieg gibt und nicht eine Weiche in `main.tsx`
 *
 * Eine Weiche zur Laufzeit („ist jemand angemeldet? dann Portal") sähe
 * bequemer aus und hätte einen Preis, den man erst später sieht: Beide Zweige
 * lägen in **einem** Bündel. Die Zusage „diese Auslieferung hat kein Backend"
 * hinge dann an einer Bedingung statt an einem Import – und wäre nicht mehr am
 * Bündel prüfbar, sondern nur noch behauptbar.
 *
 * Zwei Einstiege, zwei Vite-Konfigurationen, zwei Bündel. Die kontofreie PWA
 * unter `/LexiFlow/` enthält keinen Supabase-Code; das Portal unter
 * `/LexiFlow/portal/` enthält ihn. `src/runtime/portableIsolation.test.ts`
 * prüft das am Importgraph, für jeden Einstieg einzeln.
 *
 * ## Kein Service Worker
 *
 * Die kontofreie PWA ist offlinefähig, weil sie alles bei sich hat. Das Portal
 * ist es ausdrücklich nicht (ADR-7): Eine halbe Synchronisation ist schlimmer
 * als keine – sie erzeugt Vertrauen in Ergebnisse, die nie ankamen. Wer
 * offline üben will, nimmt die portable Datei; die funktioniert ohne alles.
 */

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement #root nicht gefunden.');

createRoot(container).render(
  <StrictMode>
    <HostedApp />
  </StrictMode>,
);
