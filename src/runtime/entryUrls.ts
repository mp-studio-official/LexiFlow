/**
 * Adressen zwischen den beiden Web-Einstiegen – und die Rückkehradresse nach
 * einer Anmeldung.
 *
 * ## Warum das gerechnet und nicht geschrieben wird
 *
 * LexiFlow liegt auf GitHub Pages unter einem **Unterpfad**:
 * `https://…github.io/LexiFlow/`. Ein fest geschriebenes `/portal/` führte
 * dort auf `https://…github.io/portal/` – eine Adresse, die einem anderen
 * Projekt gehört oder gar keinem. Solche Fehler fallen lokal nie auf, weil
 * lokal alles unter `/` liegt; sie fallen nach dem Deployment auf, und dann
 * bei allen gleichzeitig.
 *
 * Deshalb kommt der Grundpfad aus `import.meta.env.BASE_URL` – ein Wert, den
 * Vite je Build setzt – und alles Weitere wird daraus abgeleitet. Die
 * Funktionen hier nehmen ihn als Parameter entgegen, damit sie sich mit jedem
 * denkbaren Grundpfad prüfen lassen, ohne einen Build zu bemühen.
 *
 * ## Die beiden Grundpfade
 *
 * | Auslieferung | `BASE_URL` |
 * | --- | --- |
 * | kontofreie PWA | `/LexiFlow/` |
 * | Portal | `/LexiFlow/portal/` |
 *
 * Lokal ist beides `/` beziehungsweise `/portal/`; die Funktionen müssen mit
 * beidem zurechtkommen.
 */

/** Der Ordnername des Portals unterhalb des gemeinsamen Grundpfads. */
export const PORTAL_SEGMENT = 'portal/';

function mitSchraegstrich(pfad: string): string {
  const roh = pfad.trim() === '' ? '/' : pfad.trim();
  return roh.endsWith('/') ? roh : `${roh}/`;
}

/**
 * Von der kontofreien Anwendung zum Portal.
 *
 * Aufzurufen mit dem eigenen `BASE_URL`. Aus `/LexiFlow/` wird
 * `/LexiFlow/portal/`, aus `/` wird `/portal/`.
 */
export function portalUrlFrom(base: string): string {
  const grund = mitSchraegstrich(base);
  // Schon im Portal? Dann bleibt es dabei – sonst entstünde `portal/portal/`.
  if (grund.endsWith(`/${PORTAL_SEGMENT}`)) return grund;
  return `${grund}${PORTAL_SEGMENT}`;
}

/**
 * Vom Portal zurück zur kontofreien Anwendung.
 *
 * Aus `/LexiFlow/portal/` wird `/LexiFlow/`. Kein `../`: Ein relativer Sprung
 * hinge davon ab, auf welcher Unterseite jemand gerade steht, und mit
 * `HashRouter` steht er fast nie auf der Wurzel.
 */
export function soloUrlFrom(base: string): string {
  const grund = mitSchraegstrich(base);
  if (!grund.endsWith(`/${PORTAL_SEGMENT}`)) return grund;
  return grund.slice(0, grund.length - PORTAL_SEGMENT.length);
}

/**
 * Die Adresse, an die ein Anmeldedienst zurückschicken soll.
 *
 * ## Warum hier kein Rauteteil steht
 *
 * Das Portal benutzt `HashRouter`: Der Weg innerhalb der Anwendung steht
 * hinter `#`. Ein Anmeldedienst, der seine Antwort **ebenfalls** hinter `#`
 * hängt – so macht es der implizite Ablauf von OAuth –, überschriebe damit
 * genau den Teil, der die Route trägt. Die Anwendung landete auf einer
 * unbekannten Seite, und das Zugangstoken stünde in der Adresszeile und im
 * Verlauf.
 *
 * LexiFlow benutzt deshalb den PKCE-Ablauf. Dessen Antwort kommt als
 * **Abfrageparameter** `?code=…` zurück, und der verträgt sich mit einer
 * Route hinter `#`. Diese Funktion baut die Adresse entsprechend: Grundpfad,
 * dann optional die Route hinter der Raute – und nichts, was der Dienst
 * überschreiben müsste.
 */
export function callbackUrl(origin: string, base: string, hashRoute = '/'): string {
  const grund = mitSchraegstrich(base);
  const route = hashRoute.startsWith('/') ? hashRoute : `/${hashRoute}`;
  const raute = route === '/' ? '' : `#${route}`;
  return `${origin.replace(/\/+$/, '')}${grund}${raute}`;
}

/**
 * Steckt in dieser Adresse ein PKCE-Code?
 *
 * Bewusst eine eigene kleine Funktion: Der Parameter wird an zwei Stellen
 * gebraucht (beim Laden der Seite und beim Aufräumen danach), und zweimal
 * denselben `URLSearchParams`-Ausdruck zu schreiben ist zweimal die
 * Gelegenheit, ihn verschieden zu schreiben.
 */
export function authCodeFrom(search: string): string | undefined {
  const code = new URLSearchParams(search).get('code');
  return code && code.length > 0 ? code : undefined;
}

/**
 * Dieselbe Adresse ohne die Anmeldeparameter.
 *
 * Nach dem Eintausch des Codes soll er aus der Adresszeile verschwinden: Er
 * ist verbraucht, und was in der Adresszeile steht, landet im Verlauf, in
 * jedem geteilten Screenshot und im `Referer` der nächsten Anfrage.
 */
export function withoutAuthParams(url: string): string {
  const adresse = new URL(url);
  for (const name of ['code', 'state', 'error', 'error_description']) {
    adresse.searchParams.delete(name);
  }
  return adresse.toString();
}
