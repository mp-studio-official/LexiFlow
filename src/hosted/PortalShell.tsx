import { createContext, useContext, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../application/RepositoryContext';
import { Copyright } from '../ui/Copyright';
import { Logo } from '../ui/Logo';
import { Huelle, type Huellenaktion, type Navigationsziel } from '../ui/Huelle';
import { HOME_PER_ROLE } from '../runtime/access';
import type { Role } from '../application/repositories';
import { beschriftung, type Groesse, type Profil } from '../ui/navigation';
import { soloUrlFrom } from '../runtime/entryUrls';
import { aktivesZiel, laeuftUebungsrunde, sichtbareZiele } from './navigationsziele';
import { gehenWenn, useDarfVerlassen } from './VerlassenSchutz';
import { useSession } from './SessionContext';

/**
 * Die Hüllen des Portals — jetzt dünne Adapter auf `Huelle`.
 *
 * ## Was hier geblieben ist und was gegangen
 *
 * Geblieben ist alles, was eine Entscheidung ist: Welche Rolle welches
 * Navigationsprofil bekommt, wer die Verwaltung sehen darf, wohin die Marke
 * führt, was beim Abmelden passiert, welche Zusage in der Fußzeile steht.
 *
 * Gegangen sind die vier handgeschriebenen Navigationslisten. Sie kommen
 * jetzt aus `navigationsziele.ts`, und zwar nur die, die wirklich auflösen —
 * geplante Ziele erreichen die Hülle gar nicht. Eine zweite Liste hier wäre
 * genau die Dopplung, die E23 schon einmal auseinanderlaufen ließ.
 *
 * ## Warum die Hülle nichts davon weiß
 *
 * Sie liegt in `src/ui/` und darf in jedem Bündel landen — auch im portablen,
 * das kein Konto kennt. Rolle, Berechtigung, Sitzung und Router bleiben
 * deshalb hier; sie bekommt Daten und Rückrufe.
 */

/** Die Marke, auf beiden Größen dieselbe. */
function Marke() {
  return <Logo tone="brand" size={26} />;
}

/**
 * Wohin die Marke führt.
 *
 * **Nicht blind auf die Landungsseite.** Wer angemeldet ist, landet dort auf
 * einer Seite, die ihm erklärt, dass es LexiFlow gibt — und muss sich
 * zurückklicken. Der Rollenstart kommt aus `HOME_PER_ROLE`, derselben Quelle,
 * die auch die Anmeldung benutzt; zwei Antworten auf „wo fängt diese Rolle
 * an" wären eine zu viel.
 */
function useMarkePfad(): string {
  const { status, role } = useSession();
  /*
    `Huelle` rendert absichtlich einen echten Verweis und kennt den Router
    nicht. Das Portal benutzt aber einen HashRouter. Ohne `#` lädt ein Klick
    die gesamte Adresse neu und verlässt unter `/portal/` sogar die
    Portal-Anwendung.
  */
  if (status === 'angemeldet' && role) return `#${HOME_PER_ROLE[role]}`;
  return '#/';
}

/** Die sichtbaren Ziele eines Profils, in der Form, die die Hülle braucht. */
function zieleFuerHuelle(profil: Profil, groesse: Groesse): Navigationsziel[] {
  return sichtbareZiele(profil, groesse).map((ziel) => {
    const kurz = beschriftung(ziel, groesse);
    return {
      pfad: ziel.pfad,
      label: ziel.label,
      zeichen: ziel.zeichen,
      ...(kurz === ziel.label ? {} : { labelKurz: kurz }),
    };
  });
}

/** „Abmelden" — eine Handlung, kein Ort. Deshalb ein Rückruf, kein Pfad. */
export function useAbmelden(): Huellenaktion | undefined {
  const auth = useOptionalRepository('auth');
  const { status } = useSession();
  const navigate = useNavigate();
  /*
    E14: Abmelden ist ein Ausgang wie jeder andere und benutzt denselben
    Verlustschutz. Ohne diese Zeile gäbe es einen Weg aus der Runde heraus,
    der die angefangene Antwort stillschweigend wegwirft — und zwar den, den
    niemand mit „ich verlasse gerade die Runde" verbindet.

    Die Frage wird **nicht** hier beantwortet: Was verloren ginge, weiß die
    Runde, und sie hat es als Wache angemeldet.
  */
  const darfVerlassen = useDarfVerlassen();
  if (status !== 'angemeldet' || !auth) return undefined;
  return {
    label: 'Abmelden',
    zeichen: 'abmelden',
    ausloesen: () => {
      gehenWenn(darfVerlassen(), () => {
        void auth.signOut().then(() => navigate('/', { replace: true }));
      });
    },
  };
}

/*
  Kein „Konto und Profil" im Fuß der Leiste. Der Entwurf zeigt es, eine Route
  dafür gibt es nicht — und ein Navigationsziel ohne Ziel ist genau das, was
  die progressive Freischaltung verhindern soll. Es kommt, wenn die Seite
  kommt.
*/
function Rahmen({
  profil,
  hinweis,
  kopfAktionen,
  kinder,
}: {
  profil: Profil;
  hinweis: string;
  kopfAktionen?: React.ReactNode;
  /**
   * Was in der Hülle steht, wenn es nicht die Route ist.
   *
   * Der Normalfall bleibt `<Outlet />`: Die Hülle ist eine Layoutroute, und
   * was darin steht, entscheidet der Router. Der eine Fall daneben ist die
   * Zugriffsmeldung — sie gehört in die Hülle der Rolle, die wirklich
   * angemeldet ist, und die kennt der Router an dieser Stelle nicht.
   */
  kinder?: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const abmelden = useAbmelden();
  const markePfad = useMarkePfad();

  /*
    E14: Während einer laufenden Übungsrunde gibt es keine Bereichsnavigation.
    Die Hülle bekommt leere Listen und rendert dann gar kein `<nav>` — kein
    ausgegrautes, kein verstecktes, das eine Vorlesehilfe doch findet.

    Die Fußeinträge bleiben: „Abmelden" ist kein Ausstieg aus Versehen, und
    wer sich mitten in einer Runde abmelden will, darf das.
  */
  const inRunde = laeuftUebungsrunde(pathname);

  return (
    <Huelle
      zieleSchreibtisch={inRunde ? [] : zieleFuerHuelle(profil, 'schreibtisch')}
      zieleTelefon={inRunde ? [] : zieleFuerHuelle(profil, 'telefon')}
      {...(aktivesZiel(pathname, 'schreibtisch')
        ? { aktiverPfadSchreibtisch: aktivesZiel(pathname, 'schreibtisch') as string }
        : {})}
      {...(aktivesZiel(pathname, 'telefon')
        ? { aktiverPfadTelefon: aktivesZiel(pathname, 'telefon') as string }
        : {})}
      marke={<Marke />}
      markePfad={markePfad}
      {...(kopfAktionen ? { kopfAktionen } : {})}
      {...(abmelden ? { fussAktionen: [abmelden] } : {})}
      fusszeile={
        <>
          <p>{hinweis}</p>
          <p>
            <Link to="/datenschutz">Datenschutz</Link>
          </p>
          <Copyright />
        </>
      }
    >
      <HuelleVorhanden.Provider value>{kinder ?? <Outlet />}</HuelleVorhanden.Provider>
    </Huelle>
  );
}

/**
 * Steht schon eine Hülle um diese Stelle?
 *
 * ## Wozu
 *
 * Der Riegel `RequireArea` steht an zwei verschiedenen Plätzen: **um** eine
 * Hülle herum (Lern- und Lehrkraftbereich) und **in** einer Hülle drin (die
 * Verwaltung, die enger ist als der Lehrkraftbereich um sie). Die
 * Zugriffsmeldung muss im ersten Fall selbst eine Hülle mitbringen und darf
 * es im zweiten auf keinen Fall — sonst stünde die Navigation zweimal
 * untereinander, mit zwei `aria-current` und zwei Marken.
 *
 * Ein Prop am Riegel hätte dieselbe Wirkung und einen Fehler mehr: Es wäre
 * von Hand gesetzt, an fünf Stellen, und beim nächsten Riegel vergessen.
 * Die Hülle weiß selbst, dass sie da ist; sie sagt es weiter.
 */
export const HuelleVorhanden = createContext(false);

/** Steht um diese Stelle schon eine Portalhülle? */
export function useInHuelle(): boolean {
  return useContext(HuelleVorhanden);
}

/**
 * Die Hülle für Lernende.
 *
 * Kein Verweis auf die Werkstatt — nicht weil er versteckt wäre, sondern weil
 * das Profil `lernende` ihn nicht kennt und das lazy geladene
 * Lehrkraftbündel hier nie angefordert wird.
 */
export function LearnerShell({ kinder }: { kinder?: ReactNode } = {}) {
  return (
    <Rahmen
      profil="lernende"
      hinweis="Dein Lernstand gehört dir. Lehrkräfte sehen nicht, wie oft du geübt hast."
      {...(kinder ? { kinder } : {})}
    />
  );
}

/**
 * Die Hülle für Lehrkräfte.
 *
 * „Als Lernende ansehen" steht im Kopf und nicht in der Navigation (E12): Es
 * ist eine Handlung, kein Ort. Vorher war es ein Navigationspunkt „Lernen";
 * E23 kennt ihn für Lehrkräfte nicht mehr, und ohne diesen Verweis wäre der
 * Weg in den Lernbereich für Lehrkräfte verschwunden.
 */
export function TeacherShell({ kinder }: { kinder?: ReactNode } = {}) {
  return (
    <Rahmen
      profil="lehrkraft"
      hinweis="Du siehst, wer in deinen Kursen ist – nicht, wie viel jemand geübt hat."
      kopfAktionen={
        <Link className="btn btn--quiet" to="/lernen">
          Als Lernende ansehen
        </Link>
      }
      {...(kinder ? { kinder } : {})}
    />
  );
}

/**
 * Die Hülle, die zu einer Rolle gehört — eine Antwort, nicht zwei.
 *
 * `admin` bekommt die Lehrkrafthülle, und das ist keine Nachlässigkeit: Die
 * Verwaltung liegt im Lehrkraftbündel und unter dessen Layoutroute, eine
 * angemeldete Administration sieht dort also ohnehin genau diese Hülle. Eine
 * dritte Hülle für eine Rolle, die dieselben Ziele hat, wäre eine zweite
 * Wahrheit über dieselbe Navigation.
 */
export function HuelleDerRolle({ rolle, children }: { rolle: Role; children: ReactNode }) {
  return rolle === 'student' ? (
    <LearnerShell kinder={children} />
  ) : (
    <TeacherShell kinder={children} />
  );
}

/**
 * Die Hülle vor der Anmeldung — **ohne Bereichsnavigation**.
 *
 * Vor der Anmeldung gibt es nichts zu navigieren. Die Hülle bekommt deshalb
 * leere Ziellisten und rendert dann gar kein `<nav>`: Ein leeres mit Namen
 * stünde im Accessibility-Baum und verspräche eine Navigation, die es nicht
 * gibt.
 *
 * Der eine Verweis, der hierhergehört, führt hinaus — zur Fassung ohne Konto.
 */
export function PublicShell() {
  return (
    <Huelle
      zieleSchreibtisch={[]}
      zieleTelefon={[]}
      marke={<Marke />}
      markePfad="#/"
      fusszeile={
        <>
          <p>
            Freiwillige Lernhilfe. Lehrkräfte sehen keine individuellen Lernstände.
          </p>
          <p>
            <a
              href={soloUrlFrom(
                import.meta.env.BASE_URL,
                import.meta.env['VITE_LEXIFLOW_SOLO_URL'],
              )}
            >
              LexiFlow ohne Konto
            </a>{' '}
            läuft
            vollständig im Browser – ohne Anmeldung und ohne Server.
          </p>
          <p>
            <Link to="/datenschutz">Datenschutz</Link>
          </p>
          <Copyright />
        </>
      }
    >
      <Outlet />
    </Huelle>
  );
}
