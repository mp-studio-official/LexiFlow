/**
 * Wie groß ein Tippziel ist – und was überhaupt eines ist.
 *
 * ## Der Befund, der diese Datei nötig gemacht hat
 *
 * Der erste vollständige Mac-Lauf meldete unter anderem
 * `input.visually-hidden 1×1`. Das ist kein Tippziel: Ein visuell verstecktes
 * Dateifeld wird nie angetippt. Angetippt wird sein Label.
 *
 * Die Klasse `.visually-hidden` hart auszunehmen wäre die falsche Antwort
 * gewesen – sie prüfte einen Namen, nicht einen Sachverhalt. Ein anders
 * benanntes verstecktes Feld rutschte weiter durch, und ein verstecktes Feld
 * **ohne** brauchbaren Auslöser – ein echter Bedienfehler – bliebe unsichtbar.
 *
 * ## Die Regel
 *
 * Ein Bedienelement ist entweder **wahrnehmbar** oder **nur technisch da**:
 *
 * | Zustand | woran erkennbar | was geprüft wird |
 * | --- | --- | --- |
 * | gar nicht gerendert | keine Rechtecke, `display:none`, `visibility:hidden` | nichts – es gibt es für niemanden |
 * | nur technisch da | `opacity:0`, `clip`, `clip-path`, Kante ≤ 4 px, aus dem Bild geschoben | **sein sichtbarer Auslöser** |
 * | wahrnehmbar | alles andere | **es selbst** |
 *
 * Der Auslöser ist das, was die Bedienung wirklich anfasst: ein `label[for]`,
 * ein umschließendes `label`, oder was `aria-labelledby` benennt. Findet sich
 * keiner, ist das ein eigener Befund – nicht etwa ein Freifahrtschein.
 *
 * ## Warum diese Funktion so geschrieben ist, wie sie geschrieben ist
 *
 * Sie hat **keine** Abhängigkeiten außerhalb ihrer selbst. Damit kann
 * Playwright sie in die Seite hineinreichen (`page.evaluate`) und Vitest sie
 * unter jsdom direkt aufrufen. Ohne das wäre die Regel nur durch einen echten
 * Browserlauf prüfbar – also praktisch nie.
 */

export interface Tippzielbefunde {
  /** Wahrnehmbare Ziele unter dem Maß – und zu kleine Auslöser. */
  zuKlein: string[];
  /** Versteckte Bedienelemente, zu denen sich nichts Sichtbares findet. */
  ohneAusloeser: string[];
  /** Wie viele Ziele überhaupt gemessen wurden – gegen eine leere Prüfung. */
  gemessen: number;
}

export const TIPPZIELAUSWAHL =
  'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]';

/**
 * Die Messung selbst. Läuft im Browser **und** unter jsdom.
 *
 * `mass` ist 44 px: die Zahl aus WCAG 2.5.5 und aus Apples Richtlinie, nicht
 * eine gerundete Schätzung.
 */
export function tippzielbefunde(
  { mass = 44, auswahl = TIPPZIELAUSWAHL }: { mass?: number; auswahl?: string } = {},
): Tippzielbefunde {
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

    return kandidaten.find((kandidat) => gerendert(kandidat) && !nurTechnischDa(kandidat));
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

  return { zuKlein: zuKlein.slice(0, 12), ohneAusloeser: ohneAusloeser.slice(0, 12), gemessen };
}
