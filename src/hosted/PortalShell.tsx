import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../application/RepositoryContext';
import { Copyright } from '../ui/Copyright';
import { Logo } from '../ui/Logo';
import { Huelle, type Huellenaktion, type Navigationsziel } from '../ui/Huelle';
import { HOME_PER_ROLE } from '../runtime/access';
import { beschriftung, type Groesse, type Profil } from '../ui/navigation';
import { soloUrlFrom } from '../runtime/entryUrls';
import { aktivesZiel, laeuftUebungsrunde, sichtbareZiele } from './navigationsziele';
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
  if (status === 'angemeldet' && role) return HOME_PER_ROLE[role];
  return '/';
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
function useAbmelden(): Huellenaktion | undefined {
  const auth = useOptionalRepository('auth');
  const { status } = useSession();
  const navigate = useNavigate();
  if (status !== 'angemeldet' || !auth) return undefined;
  return {
    label: 'Abmelden',
    zeichen: 'abmelden',
    ausloesen: () => {
      void auth.signOut().then(() => navigate('/', { replace: true }));
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
}: {
  profil: Profil;
  hinweis: string;
  kopfAktionen?: React.ReactNode;
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
          <p style={{ margin: 0 }}>{hinweis}</p>
          <p style={{ margin: 0 }}>
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

/**
 * Die Hülle für Lernende.
 *
 * Kein Verweis auf die Werkstatt — nicht weil er versteckt wäre, sondern weil
 * das Profil `lernende` ihn nicht kennt und das lazy geladene
 * Lehrkraftbündel hier nie angefordert wird.
 */
export function LearnerShell() {
  return (
    <Rahmen
      profil="lernende"
      hinweis="Dein Lernstand gehört dir. Lehrkräfte sehen nicht, wie oft du geübt hast."
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
export function TeacherShell() {
  return (
    <Rahmen
      profil="lehrkraft"
      hinweis="Du siehst, wer in deinen Kursen ist – nicht, wie viel jemand geübt hat."
      kopfAktionen={
        <Link className="btn btn--quiet" to="/lernen">
          Als Lernende ansehen
        </Link>
      }
    />
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
      markePfad="/"
      fusszeile={
        <>
          <p style={{ margin: 0 }}>
            Freiwillige Lernhilfe. Lehrkräfte sehen keine individuellen Lernstände.
          </p>
          <p style={{ margin: 0 }}>
            <a href={soloUrlFrom(import.meta.env.BASE_URL)}>LexiFlow ohne Konto</a> läuft
            vollständig im Browser – ohne Anmeldung und ohne Server.
          </p>
          <p style={{ margin: 0 }}>
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

