import type { ReactNode } from 'react';

import './bausteine.css';

/**
 * Die Bausteine der Variante B — Karten, Fortschritt, leerer Zustand (5B.1).
 *
 * ## Warum sie neben `components.tsx` stehen und nicht darin
 *
 * Dieselbe Trennung wie bei `zustaende.tsx`: `components.tsx` trägt, was das
 * Produkt heute benutzt. Was hier liegt, benutzt noch niemand. Nebeneinander
 * zu legen hält auseinander, was sonst beim Lesen eines Diffs verschwimmt —
 * und macht die Zusage „5B.1 ändert keinen Bildschirm" nachprüfbar statt
 * glaubhaft.
 *
 * ## Warum `LeererZustand` und nicht ein neuer `EmptyState`
 *
 * `EmptyState` ist in sieben Bereichen produktiv. Ihm eine Variante
 * anzubauen — ein zusätzliches Prop, ein zusätzlicher Zweig — hieße, die
 * Datei anzufassen, die sieben Bildschirme tragen, und die Zusicherung aus
 * P2 in dem Moment zu lockern, in dem sie etwas wert wäre.
 *
 * Also ein eigener Baustein. `EmptyState` bleibt Byte für Byte, wie er ist;
 * `LeererZustand` ist die Fassung nach E19, und ein Bildschirm wechselt von
 * dem einen auf den anderen in seinem eigenen Umbau. Zwei Bausteine für
 * dieselbe Frage sind ein Zustand auf Zeit, kein Entwurfsfehler — das Ende
 * dieses Zustands ist der letzte umgebaute Bildschirm.
 *
 * ## Was alle vier gemeinsam haben
 *
 * Kein Glas. Glas trägt schwebende Navigation und kleine Statusflächen; eine
 * Kurskarte ist weder das eine noch das andere, und ein leerer Zustand ist
 * Text, den man lesen können muss.
 */

/** Die vier Aurora-Töne. Fläche, nie Schrift. */
export type Motiv = 'violett' | 'rosa' | 'himmel' | 'pfirsich';

/** Ein Wert mit seiner Bezeichnung, wie er am Fuß einer Karte steht. */
export interface Angabe {
  label: string;
  wert: ReactNode;
}

function Fuss({ angaben }: { angaben: readonly Angabe[] }) {
  return (
    <dl className="karte__fuss">
      {angaben.map((angabe) => (
        <div className="karte__angabe" key={angabe.label}>
          <dt>{angabe.label}</dt>
          <dd>{angabe.wert}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Die Karte einer Lerngruppe.
 *
 * ## Warum die ganze Karte kein Link ist
 *
 * Weil auf ihr mehr als eine Sache steht. Eine Karte, die vollständig
 * klickbar ist, hat für Hilfsmittel einen einzigen, sehr langen Linktext und
 * nimmt jeder zweiten Handlung darin den Platz. Hier führt **eine** deutliche
 * Aktion weiter; alles andere ist Auskunft.
 *
 * ## Warum die Angaben eine Beschreibungsliste sind
 *
 * „12 Lernende" ist ein Wert mit einer Bezeichnung. Als `dl` gelesen bleibt
 * dieser Zusammenhang erhalten; als zwei `span` nebeneinander ist er ein
 * Layout, das man sehen muss, um es zu verstehen.
 */
export function Kurskarte({
  titel,
  eyebrow,
  beschreibung,
  angaben = [],
  aktion,
  motiv = 'himmel',
}: {
  titel: string;
  /** Die Einordnung darüber — Jahrgang, Fach, Zeitraum. */
  eyebrow?: ReactNode;
  beschreibung?: ReactNode;
  angaben?: readonly Angabe[];
  /** Die eine Handlung, die weiterführt. */
  aktion?: ReactNode;
  motiv?: Motiv;
}) {
  return (
    <article className={`karte karte--kurs karte--${motiv}`} data-testid="kurskarte">
      <span className="karte__band" aria-hidden="true" />
      <div className="karte__text">
        {eyebrow ? <p className="karte__eyebrow">{eyebrow}</p> : null}
        <h3 className="karte__titel">{titel}</h3>
        {beschreibung ? <p className="karte__beschreibung">{beschreibung}</p> : null}
      </div>
      {angaben.length > 0 ? <Fuss angaben={angaben} /> : null}
      {aktion ? <div className="karte__aktion">{aktion}</div> : null}
    </article>
  );
}

/**
 * Die Karte eines Lernpakets — mit Titelbildfläche.
 *
 * ## Warum die Fläche auch ohne Bild da ist
 *
 * Weil sonst zwei verschiedene Karten entstünden: eine hohe mit Bild und eine
 * flache ohne, und eine Liste aus beiden sieht kaputt aus. Die Fläche hat
 * immer das Verhältnis aus `--cover-ratio`; liegt kein Bild vor, trägt sie
 * einen Aurora-Verlauf. Das ist kein Platzhalter, sondern der Normalfall für
 * ein Paket, zu dem niemand ein Bild hochgeladen hat — und 5B.8 tauscht
 * später das Bild ein, nicht das Layout.
 *
 * ## Warum auf der Fläche kein Text steht
 *
 * Aurora trägt nie Schrift. Der Kontrast eines Verlaufs schwankt von Pixel zu
 * Pixel; was an der hellen Stelle lesbar ist, ist es an der dunklen nicht.
 * Der Titel steht deshalb darunter, auf Fläche.
 */
export function Paketkarte({
  titel,
  eyebrow,
  beschreibung,
  angaben = [],
  aktion,
  motiv = 'violett',
  titelbild,
}: {
  titel: string;
  eyebrow?: ReactNode;
  beschreibung?: ReactNode;
  angaben?: readonly Angabe[];
  aktion?: ReactNode;
  motiv?: Motiv;
  /**
   * Das Titelbild, wenn es eines gibt.
   *
   * Als `ReactNode` und nicht als Adresse: Welches Bildformat, welche Größen
   * und welcher Fokuspunkt ausgeliefert werden, entscheidet 5B.8. Dieser
   * Baustein entscheidet nur, wo es hängt.
   */
  titelbild?: ReactNode;
}) {
  return (
    <article className={`karte karte--paket karte--${motiv}`} data-testid="paketkarte">
      <div className="karte__cover" data-leer={titelbild ? undefined : 'ja'} aria-hidden={titelbild ? undefined : 'true'}>
        {titelbild}
      </div>
      <div className="karte__text">
        {eyebrow ? <p className="karte__eyebrow">{eyebrow}</p> : null}
        <h3 className="karte__titel">{titel}</h3>
        {beschreibung ? <p className="karte__beschreibung">{beschreibung}</p> : null}
      </div>
      {angaben.length > 0 ? <Fuss angaben={angaben} /> : null}
      {aktion ? <div className="karte__aktion">{aktion}</div> : null}
    </article>
  );
}

/**
 * Wie weit jemand ist.
 *
 * ## Warum die Zahl daneben steht und nicht nur der Balken
 *
 * Ein Balken ist eine Schätzung. „14 von 20" ist eine Auskunft, und sie
 * funktioniert auch für jemanden, der den Balken nicht sieht, nicht
 * unterscheiden kann oder ihn auf einem 390-px-Bildschirm zwei Millimeter
 * breit vor sich hat.
 *
 * ## Warum kein `<progress>`
 *
 * Weil `<progress>` in jedem Browser anders aussieht und sich nur mit einem
 * Stapel herstellerspezifischer Pseudoelemente bändigen lässt. Die Rolle
 * `progressbar` mit `aria-valuenow` sagt Hilfsmitteln dasselbe, und das
 * Aussehen ist dann eines statt fünf.
 *
 * ## Warum Tomato hier auftauchen darf
 *
 * Es ist der gefüllte Teil des Balkens, also Grafik. Als Text erscheint auf
 * dem hellen Grund `--akzent`, die dunkle Ableitung — Tomato selbst erreicht
 * dort nur 3,25 : 1.
 */
export function Fortschritt({
  wert,
  max,
  label,
  einheit,
  ton = 'akzent',
}: {
  wert: number;
  max: number;
  /** Wovon der Fortschritt handelt — steht sichtbar darüber. */
  label: string;
  /** „Wörter", „Aufgaben". Steht hinter der Zahl, wenn angegeben. */
  einheit?: string;
  ton?: 'akzent' | 'gut';
}) {
  const grenze = Math.max(1, max);
  const erreicht = Math.min(Math.max(wert, 0), grenze);
  const anteil = Math.round((erreicht / grenze) * 100);
  const text = einheit ? `${erreicht} von ${grenze} ${einheit}` : `${erreicht} von ${grenze}`;

  return (
    <div className={`fortschritt fortschritt--${ton}`} data-testid="fortschritt">
      <div className="fortschritt__kopf">
        <span className="fortschritt__label">{label}</span>
        <span className="fortschritt__wert">{text}</span>
      </div>
      <div
        className="fortschritt__bahn"
        role="progressbar"
        aria-valuenow={erreicht}
        aria-valuemin={0}
        aria-valuemax={grenze}
        aria-valuetext={text}
        aria-label={label}
      >
        <span className="fortschritt__fuellung" style={{ inlineSize: `${anteil}%` }} />
      </div>
    </div>
  );
}

/**
 * Hier ist noch nichts — und so fängt es an.
 *
 * Die Fassung nach E19. `EmptyState` in `components.tsx` bleibt unverändert,
 * solange ihn Bildschirme benutzen; der Wechsel gehört in deren Umbau.
 */
export function LeererZustand({
  titel,
  children,
  aktion,
}: {
  titel: string;
  /** Was hier stünde, wenn es etwas gäbe — und was dafür zu tun ist. */
  children?: ReactNode;
  aktion?: ReactNode;
}) {
  return (
    <div className="leer" data-testid="leerer-zustand">
      <h3 className="leer__titel">{titel}</h3>
      {children ? <p className="leer__text">{children}</p> : null}
      {aktion ? <div className="leer__aktion">{aktion}</div> : null}
    </div>
  );
}
