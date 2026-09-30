/**
 * Wie groß ein **aktuell wahrnehmbares** Tippziel ist – und wie viele
 * Formularfelder eine Ansicht wirklich hat.
 *
 * ## Was diese Prüfung ist, und was sie ausdrücklich nicht ist
 *
 * Sie misst Touchflächen, die es **jetzt gerade** gibt. Sie ist keine Prüfung
 * der Bedienbarkeit und trifft über Elemente, die man nicht sehen kann, keine
 * Aussage.
 *
 * Zwei Fehlalarme aus dem vierten Mac-Lauf haben das erzwungen:
 *
 * - **Der Skip-Link.** Er liegt absichtlich über dem Bild (`top: -3rem`) und
 *   kommt erst bei `:focus` herein. Dass er keinen sichtbaren Auslöser hat,
 *   ist sein Zweck, nicht sein Mangel. Er gehört zur Fokus- und
 *   Tastaturprüfung – dort steht er jetzt auch.
 * - **Die versteckten Dateifelder.** `TeacherHomePage` und `StudentHomePage`
 *   lösen sie über sichtbare, beschriftete Schaltflächen aus
 *   (`onClick={() => fileInput.current?.click()}`). Sie sind bedienbar; die
 *   Beziehung steht nur nicht im DOM. „Die kann niemand antippen" war
 *   sachlich falsch.
 *
 * Daraus folgt eine Grenze, die diese Datei einhält: **Aus dem Fehlen einer
 * deklarativen Beziehung folgt nichts.** Ob ein programmgesteuerter Auslöser
 * existiert und funktioniert, ist eine Funktionsfrage und gehört in einen
 * eigenen Test – nicht in eine Größenmessung, und schon gar nicht in ein
 * Erraten von `onClick`-Beziehungen aus dem DOM.
 *
 * ## Die Regel
 *
 * | Zustand | woran erkennbar | was geprüft wird |
 * | --- | --- | --- |
 * | gar nicht gerendert | keine Rechtecke, `display:none`, `visibility:hidden` | nichts |
 * | nur technisch da / außerhalb des Bildes | `opacity:0`, `clip`, `clip-path`, Kante ≤ 4 px, aus dem Bild geschoben | **nur** sein Auslöser, **falls** deklarativ erkennbar |
 * | wahrnehmbar | alles andere | es selbst |
 *
 * Deklarativ erkennbar heißt: `label[for]`, ein umschließendes `label`,
 * `aria-labelledby` – oder `data-tippziel-fuer="<id>"` an einem sichtbaren
 * Element. Das Attribut ist der bewusste Weg für programmgesteuerte Auslöser:
 * Wer eine solche Beziehung geprüft haben will, schreibt sie hin. Heute steht
 * es noch nirgends im Markup; das wäre eine Produktivänderung und ist nicht
 * freigegeben.
 *
 * ## Warum diese Funktion so geschrieben ist, wie sie geschrieben ist
 *
 * Playwright **serialisiert** sie und führt ihren Quelltext in der Seite aus.
 * Deshalb: keine freie Benennung, auch nicht in einem Vorgabewert.
 * `scripts/serialisierung.test.mjs` führt den Quelltext in einem eigenen Realm
 * ohne Modulumgebung aus – ein direkter Aufruf kann diesen Fehler nicht finden.
 */

export interface Tippzielbefunde {
  /** Wahrnehmbare Ziele unter dem Maß – und zu kleine deklarierte Auslöser. */
  zuKlein: string[];
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
export function tippzielbefunde(einstellungen?: {
  mass?: number;
  auswahl?: string;
}): Tippzielbefunde {
  /* Alle Vorgaben als Literale im Rumpf – siehe der Dateikopf. */
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
   * Nur technisch da: gerendert, aber jetzt nicht wahrnehmbar.
   *
   * Die Muster, mit denen Bedienelemente versteckt oder geparkt werden –
   * keines davon an einen Klassennamen gebunden. Der Skip-Link fällt über die
   * letzte Zeile hierher: Er steht mit `top: -3rem` über dem Bild.
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

  /**
   * Ein Auslöser, **falls er im Markup steht**.
   *
   * Findet sich keiner, gibt diese Funktion nichts zurück – und daraus folgt
   * nichts. Sie rät nicht.
   */
  const ausloeserZu = (el: Element): Element | undefined => {
    const kandidaten: Element[] = [];

    const kennung = el.getAttribute('id');
    if (kennung) {
      const sicher =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(kennung)
          : kennung.replace(/["\\]/g, '\\$&');
      kandidaten.push(...Array.from(document.querySelectorAll(`label[for="${sicher}"]`)));
      /*
        Der bewusste Weg für programmgesteuerte Auslöser: Ein sichtbares
        Element erklärt sich zum Tippziel eines versteckten Bedienelements.
        Geraten wird nichts – wer die Beziehung geprüft haben will, schreibt
        sie hin.
      */
      kandidaten.push(
        ...Array.from(document.querySelectorAll(`[data-tippziel-fuer="${sicher}"]`)),
      );
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
  /* Ein Auslöser kann mehrere versteckte Felder bedienen – er zählt einmal. */
  const schonGenannt = new Set<Element>();
  let gemessen = 0;

  const miss = (el: Element, zusatz = ''): void => {
    if (schonGenannt.has(el)) return;
    schonGenannt.add(el);
    gemessen += 1;
    if (zuKleinFuer(el)) zuKlein.push(`${benenne(el)} ${masse(el)}${zusatz}`);
  };

  const zuPruefen = Array.from(document.querySelectorAll(auswahl)).filter((el) => {
    if (!gerendert(el)) return false;
    if (el.hasAttribute('disabled')) return false;
    // Ein Verweis mitten im Satz kann nicht 44 px hoch sein, ohne den Satz zu
    // zerreißen; WCAG nimmt ihn ausdrücklich aus.
    return !el.closest('[data-fliesstext]');
  });

  /*
    Erst die versteckten Bedienelemente, dann die sichtbaren – und das ist
    keine Kosmetik. Ein Auslöser ist häufig selbst ein sichtbares Tippziel.
    Käme er zuerst an die Reihe, stünde im Befund nur seine Größe; so steht
    dort auch, wofür er der Auslöser ist. Gemessen wird er in beiden Fällen
    genau einmal.
  */
  for (const el of zuPruefen) {
    if (!nurTechnischDa(el)) continue;
    /*
      Kein Touchziel – jetzt nicht. Steht ein Auslöser im Markup, wird
      **dessen** Fläche gemessen. Steht keiner da, endet diese Prüfung hier:
      Über etwas, das sie nicht sehen kann, sagt sie nichts.
    */
    const ausloeser = ausloeserZu(el);
    if (ausloeser) miss(ausloeser, ` (Auslöser für ${benenne(el)})`);
  }

  for (const el of zuPruefen) {
    if (nurTechnischDa(el)) continue;
    miss(el);
  }

  /*
    Dieselbe Regel, andere Frage: Wie viele Formularfelder kann eine Person
    wirklich sehen? Ein verstecktes Dateifeld ist keines – und darf deshalb
    unter WebKit nicht die Erwartung auslösen, dass Tab es erreicht.
  */
  const sichtbareFormularfelder = Array.from(document.querySelectorAll(formularauswahl)).filter(
    (el) => wahrnehmbar(el) && !el.hasAttribute('disabled'),
  ).length;

  return { zuKlein: zuKlein.slice(0, 20), gemessen, sichtbareFormularfelder };
}
