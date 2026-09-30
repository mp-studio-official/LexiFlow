/**
 * Zwei Fragen, die bisher eine waren.
 *
 * ## Der Befund
 *
 * Die alte Prüfung drückte einmal Tab und verlangte, dass danach etwas den
 * Fokus hat. Unter Chromium ging das immer auf, unter WebKit fiel sie 28-mal
 * durch. Der Grund ist keine Schwäche der Oberfläche: **Safari auf macOS
 * springt mit Tab standardmäßig nur Formularfelder an, keine Verweise und
 * Schaltflächen** („Tabulatortaste bewegt den Fokus zwischen allen
 * Steuerelementen" ist eine Systemeinstellung und meist aus).
 *
 * Die Prüfung vermischte damit zwei Aussagen:
 *
 * 1. **Ist der Fokus zu sehen?** – eine Frage an die Gestaltung.
 * 2. **Kommt man mit der Tastatur hin?** – eine Frage an die Reihenfolge, und
 *    eine, deren Antwort von der Engine und einer Systemeinstellung abhängt.
 *
 * Diese Datei trennt sie. Frage 1 wird engineneutral beantwortet, indem ein
 * sichtbares, fokussierbares Element **gezielt** fokussiert und der gerenderte
 * Indikator davor und danach verglichen wird – ohne Tab. Frage 2 steht in
 * `tastaturErreichbarkeit` und bildet die macOS-Besonderheit ausdrücklich ab.
 *
 * ## Warum davor und danach und nicht „hat einen Umriss"
 *
 * Weil ein Element einen dauerhaften Rahmen haben kann. Geprüft gehört, dass
 * sich beim Fokussieren etwas **ändert** – das ist die Aussage, um die es
 * geht.
 */

/** Die Eigenschaften, in denen sich ein Fokusindikator zeigen kann. */
export interface Fokusstil {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  borderColor: string;
  borderWidth: string;
  backgroundColor: string;
  color: string;
  textDecorationLine: string;
}

export interface Fokusbefund {
  /** Wie das geprüfte Element heißt. */
  name: string;
  /** Wurde überhaupt ein sichtbares, fokussierbares Element gefunden? */
  gefunden: boolean;
  /** Hat es den Fokus wirklich angenommen? */
  fokussiert: boolean;
  /** Wertet die Engine diesen Fokus als sichtbar (`:focus-visible`)? */
  alsSichtbarGewertet: boolean;
  /** Ein Textfeld – dort sagt die Spezifikation den Fall zu. */
  istTextfeld: boolean;
  vorher: Fokusstil | null;
  nachher: Fokusstil | null;
  /** Falls nichts gerendert werden konnte: Gibt es wenigstens eine Regel? */
  regelGefunden: boolean;
  regelText: string;
}

/**
 * Ändert sich der Indikator?
 *
 * Reine Funktion, damit die Gegenprobe „Indikator entfernt → rot" ohne
 * Browser läuft.
 */
export function indikatorAendertSich(vorher: Fokusstil | null, nachher: Fokusstil | null): boolean {
  if (!vorher || !nachher) return false;
  return (Object.keys(vorher) as (keyof Fokusstil)[]).some((feld) => vorher[feld] !== nachher[feld]);
}

/**
 * Das Ganze im Dokument – von Playwright hineingereicht, von jsdom direkt
 * aufgerufen.
 *
 * Bevorzugt wird ein **Textfeld**: Für Textfelder schreibt die Spezifikation
 * vor, dass `:focus-visible` auch bei einem Fokus aus dem Skript greift. Erst
 * danach kommen Schaltflächen und Verweise – dort hängt es an der Engine, und
 * genau deshalb gibt es den Rückfall auf die Regelprüfung.
 */
export function fokusIndikatorMessen(einstellungen?: { auswahl?: string }): Fokusbefund {
  /*
    Vorgabe als Literal im Rumpf. Playwright serialisiert diese Funktion; ein
    Vorgabewert im Parameterkopf, der etwas außerhalb benennt, überlebt das
    nicht – genau daran sind in einem Lauf 32 Messungen gescheitert.
  */
  const auswahl =
    einstellungen?.auswahl ?? 'a[href], button, input:not([type=hidden]), select, textarea';
  const leer: Fokusbefund = {
    name: '—',
    gefunden: false,
    fokussiert: false,
    alsSichtbarGewertet: false,
    istTextfeld: false,
    vorher: null,
    nachher: null,
    regelGefunden: false,
    regelText: '',
  };

  const benenne = (el: Element): string => {
    const kennung = el.id ? `#${el.id}` : '';
    const klassen =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
  };

  const wahrnehmbar = (el: Element): boolean => {
    if (el.getClientRects().length === 0) return false;
    const stil = getComputedStyle(el);
    if (stil.display === 'none' || stil.visibility === 'hidden') return false;
    if (Number.parseFloat(stil.opacity || '1') === 0) return false;
    if (stil.clip && stil.clip !== 'auto') return false;
    if (stil.clipPath && stil.clipPath !== 'none') return false;
    const kasten = el.getBoundingClientRect();
    return kasten.width > 4 && kasten.height > 4;
  };

  const istTextfeld = (el: Element): boolean => {
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    const art = (el.getAttribute('type') ?? 'text').toLowerCase();
    return ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(art);
  };

  const schnappschuss = (el: Element): Fokusstil => {
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset,
      boxShadow: s.boxShadow,
      borderColor: s.borderColor,
      borderWidth: s.borderWidth,
      backgroundColor: s.backgroundColor,
      color: s.color,
      textDecorationLine: s.textDecorationLine,
    };
  };

  /**
   * Gibt es in den **eigenen** Stylesheets eine `:focus-visible`-Regel, die
   * auf dieses Element passt – und beschreibt sie einen sichtbaren Ring?
   *
   * Der Rückfall für den Fall, dass die Engine einen Fokus aus dem Skript
   * nicht als sichtbar wertet. Er prüft weiterhin die Gestaltung der
   * Anwendung, nicht etwas Eigenes.
   */
  const regelFuer = (el: Element): { gefunden: boolean; text: string } => {
    for (const blatt of Array.from(document.styleSheets)) {
      let regeln: CSSRule[];
      try {
        regeln = Array.from(blatt.cssRules);
      } catch {
        continue; // fremdes Blatt – nicht lesbar, nicht unseres
      }
      for (const regel of regeln) {
        const stilregel = regel as CSSStyleRule;
        const wahl = stilregel.selectorText;
        if (!wahl || !wahl.includes(':focus-visible')) continue;
        /*
          `:focus-visible` allein ist die wichtigste Regel dieser Anwendung –
          der Ring, der überall gilt (`global.css`). Streicht man das Pseudo,
          bleibt eine leere Auswahl übrig, und die passt nicht auf „nichts",
          sondern auf **alles**. Diese Unterscheidung hat die Gegenprobe
          gefunden; ohne sie lief der Rückfall genau an der Regel vorbei, für
          die es ihn gibt.
        */
        const ohnePseudo = wahl.split(',').map((teil) => teil.replace(/:focus-visible/g, '').trim());
        const passt = ohnePseudo.some((teil) => {
          if (teil.length === 0) return true;
          try {
            return el.matches(teil);
          } catch {
            return false;
          }
        });
        if (!passt) continue;
        const umriss = stilregel.style.outline || stilregel.style.outlineWidth;
        const schatten = stilregel.style.boxShadow;
        if ((umriss && umriss !== 'none') || (schatten && schatten !== 'none')) {
          return { gefunden: true, text: `${wahl} { ${stilregel.style.cssText} }` };
        }
      }
    }
    return { gefunden: false, text: '' };
  };

  const alle = Array.from(document.querySelectorAll(auswahl)).filter(wahrnehmbar);
  const ziel = alle.find(istTextfeld) ?? alle[0];
  if (!ziel) return leer;

  const vorher = schnappschuss(ziel);
  (ziel as HTMLElement).focus();
  const fokussiert = document.activeElement === ziel;
  const nachher = schnappschuss(ziel);

  let alsSichtbarGewertet = false;
  try {
    alsSichtbarGewertet = ziel.matches(':focus-visible');
  } catch {
    alsSichtbarGewertet = false;
  }

  const regel = regelFuer(ziel);

  return {
    name: benenne(ziel),
    gefunden: true,
    fokussiert,
    alsSichtbarGewertet,
    istTextfeld: istTextfeld(ziel),
    vorher,
    nachher,
    regelGefunden: regel.gefunden,
    regelText: regel.text,
  };
}
