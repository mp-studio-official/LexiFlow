/**
 * Wie groß ein Tippziel ist, was überhaupt eines ist – und wie viele
 * Formularfelder eine Ansicht wirklich hat.
 *
 * ## Der Befund, der diese Datei nötig gemacht hat
 *
 * Der erste vollständige Mac-Lauf meldete `input.visually-hidden 1×1`. Das ist
 * kein Tippziel: Ein visuell verstecktes Dateifeld wird nie angetippt.
 * Angetippt wird sein Label.
 *
 * Die Klasse hart auszunehmen wäre die falsche Antwort gewesen – das prüfte
 * einen Namen, nicht einen Sachverhalt.
 *
 * ## Die Regel
 *
 * | Zustand | woran erkennbar | was geprüft wird |
 * | --- | --- | --- |
 * | gar nicht gerendert | keine Rechtecke, `display:none`, `visibility:hidden` | nichts – es gibt es für niemanden |
 * | nur technisch da | `opacity:0`, `clip`, `clip-path`, Kante ≤ 4 px, aus dem Bild geschoben | **sein sichtbarer Auslöser** |
 * | wahrnehmbar | alles andere | **es selbst** |
 *
 * Findet sich zu einem versteckten Bedienelement kein sichtbarer Auslöser, ist
 * das ein eigener Befund – kein Freifahrtschein.
 *
 * ## Warum auch die Formularfelder hier gezählt werden
 *
 * Der zweite Mac-Lauf zeigte, dass die Tastaturprüfung eine **andere**
 * Sichtbarkeit benutzte als diese Regel: Sie zählte das versteckte Dateifeld
 * als Formularfeld und verlangte deshalb unter WebKit, dass Tab es erreicht.
 * Zwei Definitionen von „sichtbar" in einer Prüfbank sind eine zu viel.
 * Deshalb kommt die Zahl aus derselben Funktion und damit aus derselben Regel.
 *
 * ## Warum diese Funktion so geschrieben ist, wie sie geschrieben ist
 *
 * Playwright **serialisiert** sie und führt ihren Quelltext in der Seite aus.
 * Alles, was sie von außen benennt, ist dort nicht vorhanden. Der erste
 * Versuch hatte `auswahl = TIPPZIELAUSWAHL` als Vorgabewert – eine
 * Modulvariable. Unter jsdom lief das, weil der direkte Aufruf das Modul
 * dabei hat; in der Seite scheiterten alle 32 schmalen Messungen mit
 * `TIPPZIELAUSWAHL is not defined`, und die Prüfung maß nichts.
 *
 * Deshalb: **keine freie Benennung, auch nicht in einem Vorgabewert.** Alle
 * Vorgaben stehen als Literale im Rumpf. `scripts/tippziele.test.mjs` führt
 * den Quelltext in einem eigenen Realm ohne Modulumgebung aus – ein direkter
 * Aufruf kann diesen Fehler nicht finden.
 */

export interface Tippzielbefunde {
  /** Wahrnehmbare Ziele unter dem Maß – und zu kleine Auslöser. */
  zuKlein: string[];
  /** Versteckte Bedienelemente, zu denen sich nichts Sichtbares findet. */
  ohneAusloeser: string[];
  /** Wie viele Ziele überhaupt gemessen wurden – gegen eine leere Prüfung. */
  gemessen: number;
  /** Formularfelder, die wirklich wahrnehmbar sind – für die Tastaturfrage. */
  sichtbareFormularfelder: number;
}

/**
 * Die Messung. Läuft serialisiert im Browser und direkt unter jsdom.
 *
 * `mass` ist 44 px: die Zahl aus WCAG 2.5.5 und aus Apples Richtlinie.
 */
export function tippzielbefunde(
  einstellungen?: { mass?: number; auswahl?: string },
): Tippzielbefunde {
  /*
    Alle Vorgaben als Literale im Rumpf – siehe der Dateikopf. Ein
    Vorgabewert im Parameterkopf, der etwas außerhalb benennt, überlebt die
    Serialisierung nicht.
  */
  const mass = einstellungen?.mass ?? 44;
  const auswahl =
    einstellungen?.auswahl ??
    'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]';
  const formularauswahl = 'input:not([type=hidden]), select, textarea';

  const benenne = (el: Element): string => {
    const kennung = el.id ? `#${el.id}` : '';
    const klassen =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
  };

  /** Gerendert – also für irgendjemanden vorhanden. */
  const gerendert = (el: Element): boolean => {
    if (el.getClientRects().length === 0) return false;
    const stil = getComputedStyle(el);
    return stil.display !== 'none' && stil.visibility !== 'hidden';
  };

  /**
   * Nur technisch da: gerendert, aber ohne wahrnehmbare Fläche.
   *
   * Die vier Muster, mit denen Bedienelemente absichtlich versteckt werden –
   * keines davon an einen Klassennamen gebunden.
   */
  const nurTechnischDa = (el: Element): boolean => {
    const stil = getComputedStyle(el);
    if (Number.parseFloat(stil.opacity || '1') === 0) return true;
    if (stil.clip && stil.clip !== 'auto') return true;
    if (stil.clipPath && stil.clipPath !== 'none') return true;

    const kasten = el.getBoundingClientRect();
    if (kasten.width <= 4 || kasten.height <= 4) return true;
    if (kasten.right <= 0 || kasten.bottom <= 0) return true;
    return false;
  };

  const wahrnehmbar = (el: Element): boolean => gerendert(el) && !nurTechnischDa(el);

  /** Was die Bedienung statt des versteckten Elements wirklich anfasst. */
  const ausloeserZu = (el: Element): Element | undefined => {
    const kandidaten: Element[] = [];

    const kennung = el.getAttribute('id');
    if (kennung) {
      const sicher =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(kennung)
          : kennung.replace(/["\\]/g, '\\$&');
      kandidaten.push(...Array.from(document.querySelectorAll(`label[for="${sicher}"]`)));
    }

    const umschliessend = el.closest('label');
    if (umschliessend) kandidaten.push(umschliessend);

    const beschriftetVon = el.getAttribute('aria-labelledby');
    if (beschriftetVon) {
      for (const teil of beschriftetVon.split(/\s+/)) {
        const gefunden = document.getElementById(teil);
        if (gefunden) kandidaten.push(gefunden);
      }
    }

    return kandidaten.find(wahrnehmbar);
  };

  const masse = (el: Element): string => {
    const kasten = el.getBoundingClientRect();
    return `${Math.round(kasten.width)}×${Math.round(kasten.height)}`;
  };

  const zuKleinFuer = (el: Element): boolean => {
    const kasten = el.getBoundingClientRect();
    return Math.ceil(kasten.width) < mass || Math.ceil(kasten.height) < mass;
  };

  const zuKlein: string[] = [];
  const ohneAusloeser: string[] = [];
  /* Ein Auslöser kann mehrere versteckte Felder bedienen – er zählt einmal. */
  const schonGenannt = new Set<Element>();
  let gemessen = 0;

  for (const el of Array.from(document.querySelectorAll(auswahl))) {
    if (!gerendert(el)) continue;
    if (el.hasAttribute('disabled')) continue;
    // Ein Verweis mitten im Satz kann nicht 44 px hoch sein, ohne den Satz zu
    // zerreißen; WCAG nimmt ihn ausdrücklich aus.
    if (el.closest('[data-fliesstext]')) continue;

    if (nurTechnischDa(el)) {
      const ausloeser = ausloeserZu(el);
      if (!ausloeser) {
        ohneAusloeser.push(benenne(el));
        continue;
      }
      if (schonGenannt.has(ausloeser)) continue;
      schonGenannt.add(ausloeser);
      gemessen += 1;
      if (zuKleinFuer(ausloeser)) {
        zuKlein.push(`${benenne(ausloeser)} ${masse(ausloeser)} (Auslöser für ${benenne(el)})`);
      }
      continue;
    }

    if (schonGenannt.has(el)) continue;
    schonGenannt.add(el);
    gemessen += 1;
    if (zuKleinFuer(el)) zuKlein.push(`${benenne(el)} ${masse(el)}`);
  }

  /*
    Dieselbe Regel, andere Frage: Wie viele Formularfelder kann eine Person
    wirklich sehen? Ein verstecktes Dateifeld ist keines – und darf deshalb
    unter WebKit nicht die Erwartung auslösen, dass Tab es erreicht.
  */
  const sichtbareFormularfelder = Array.from(document.querySelectorAll(formularauswahl)).filter(
    (el) => wahrnehmbar(el) && !el.hasAttribute('disabled'),
  ).length;

  return {
    zuKlein: zuKlein.slice(0, 12),
    ohneAusloeser: ohneAusloeser.slice(0, 12),
    gemessen,
    sichtbareFormularfelder,
  };
}
