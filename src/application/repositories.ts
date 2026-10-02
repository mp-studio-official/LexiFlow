import type { AnswerVerdict } from '../domain/answerCheck';
import type { EntryProgress, PackProgress, TaskDirection, VocabPack } from '../domain/schema';

/**
 * Die Verträge zwischen Oberfläche und Speicher.
 *
 * ## Warum es diese Schicht gibt
 *
 * Bis Sprint 5A rief eine Ansicht `packRepo` auf, und `packRepo` war Dexie.
 * Das war richtig, solange es genau einen Speicher gab. Ab jetzt gibt es zwei –
 * IndexedDB im Browser und Postgres hinter Supabase –, und beide sollen
 * dieselben Ansichten bedienen.
 *
 * Ein Vertrag dazwischen leistet dreierlei, und das dritte ist das, weswegen
 * er hier steht:
 *
 * 1. Ansichten lassen sich ohne Netz und ohne Datenbank prüfen.
 * 2. Lokal und Cloud sind austauschbar, ohne die Ansicht anzufassen.
 * 3. **Im portablen Modus wird die Cloudfassung nirgends importiert.** Kein
 *    `if`, kein Schalter – sie kommt im Bündel schlicht nicht vor. Genau das
 *    macht die Zusage „diese Datei kann nicht ins Netz" prüfbar.
 *
 * ## Was hier bewusst fehlt
 *
 * Keine Methode gibt Lernstände **anderer** Personen heraus. Das ist keine
 * Vergesslichkeit: Es gibt in diesem Produkt keinen Anwendungsfall dafür, und
 * ein Vertrag, der die Möglichkeit gar nicht erst beschreibt, lässt sie auch
 * nicht versehentlich entstehen. Die Datenbank setzt dieselbe Grenze noch
 * einmal mit eigenen Mitteln durch – eine Zusage, die nur in TypeScript steht,
 * ist keine.
 */

/* ------------------------------------------------------------------ Rollen */

export const ROLES = ['admin', 'teacher', 'student'] as const;
export type Role = (typeof ROLES)[number];

export interface Profile {
  /** Die dauerhafte Kennung der Person. */
  id: string;
  /** Anzeigename – bei Lernenden ein selbst gewähltes Pseudonym. */
  displayName: string;
  /**
   * Die kurze neutrale Kennung, die Lehrkräfte neben dem Namen sehen.
   *
   * Zwei Lernende dürfen sich „Fuchs" nennen; ohne ein zweites Merkmal wäre
   * beim Entfernen aus einem Kurs nicht mehr entscheidbar, wer gemeint ist.
   * Sie ist bewusst kurz und ohne Bedeutung – kein Namensbestandteil, kein
   * Geburtsjahr, nichts, was jemanden beschreibt.
   */
  shortCode: string;
  role: Role;
  createdAt: string;
}

/* ------------------------------------------------------------- Anmeldung */

export interface Session {
  userId: string;
  role: Role;
  /** Ablauf als ISO-Zeichenkette – die Oberfläche zeigt „Sitzung abgelaufen". */
  expiresAt?: string;
}

export interface AuthRepository {
  /** Die laufende Sitzung, falls es eine gibt. Fragt nie nach Zugangsdaten. */
  currentSession(): Promise<Session | undefined>;
  /** Lehrkräfte und Administration: Anmeldung mit E-Mail. */
  signInWithEmail(email: string, password: string): Promise<Session>;
  /** Lernende: Anmeldung mit Lern-ID – niemals mit einer E-Mail-Adresse. */
  signInWithLearnerId(learnerId: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Meldet Änderungen der Sitzung, etwa nach Ablauf. Gibt den Abmelder zurück. */
  onSessionChange(listener: (session: Session | undefined) => void): () => void;

  /**
   * Lehrkräfte und Verwaltung: einen Wiederherstellungsverweis anfordern.
   *
   * Gibt **immer** nichts zurück und wirft nur bei einem Netzfehler – nie
   * deswegen, weil es die Adresse nicht gäbe. Eine Antwort, die das
   * unterscheidet, ist ein Verzeichnis aller Konten, und in einer Schule ist
   * das eine Personenliste.
   */
  requestEmailRecovery(email: string): Promise<void>;

  /**
   * Lernende: Wiederherstellung mit dem eigenen Code.
   *
   * Kein Weg über eine Lehrkraft (ADR-5). Wer ein fremdes Kennwort setzen
   * könnte, könnte sich anmelden – und sähe damit einen Lernstand, den zu
   * sehen niemandem zusteht. Der Code gehört der lernenden Person und wird
   * beim Anlegen des Kontos einmal bestätigt.
   */
  redeemRecoveryCode(input: {
    learnerId: string;
    recoveryCode: string;
    newPassword: string;
  }): Promise<Session>;

  /** Ein neues Kennwort setzen – für die laufende, bereits geprüfte Sitzung. */
  setPassword(newPassword: string): Promise<void>;

  /**
   * Ein Lernkonto anlegen – mit einem Einladungscode als Eintrittskarte.
   *
   * Ohne Code kein Konto: Ein offenes Portal wäre ein Einladungsdienst für
   * jeden im Netz, und LexiFlow hat nichts, was einen anonymen Zugang
   * rechtfertigte.
   *
   * Die Lern-ID vergibt der Server; der Wiederherstellungscode kommt genau
   * **einmal** zurück und ist danach nur noch als Hash vorhanden.
   */
  registerWithInviteCode(input: {
    inviteCode: string;
    displayName: string;
    password: string;
  }): Promise<{ session: Session; learnerId: string; recoveryCode: string }>;

  /**
   * Bestätigen, den Wiederherstellungscode zu haben.
   *
   * Der Schritt, ohne den ADR-11 nicht trägt: Ein Code, den niemand
   * aufgeschrieben hat, ist keine Wiederherstellung, sondern eine Zeile auf
   * einem Bildschirm, den jemand weggeklickt hat.
   */
  confirmRecoveryCode(code: string): Promise<boolean>;
}

export interface ProfileRepository {
  /** Das eigene Profil. Es gibt keine Methode für fremde Profile. */
  myProfile(): Promise<Profile | undefined>;
  updateDisplayName(displayName: string): Promise<Profile>;
}

/* ----------------------------------------------------------------- Kurse */

export interface Course {
  id: string;
  title: string;
  description?: string;
  /** Schuljahr als Freitext, etwa „2026/27" – kein Datum, keine Rechnerei. */
  schoolYear?: string;
  archived: boolean;
  createdAt: string;
}

export interface CourseMember {
  userId: string;
  displayName: string;
  shortCode: string;
  role: Role;
  joinedAt: string;
}

export interface CourseRepository {
  /** Für Lehrkräfte: eigene Kurse. Für Lernende: Kurse mit Mitgliedschaft. */
  myCourses(): Promise<Course[]>;
  getCourse(courseId: string): Promise<Course | undefined>;
  createCourse(input: Pick<Course, 'title' | 'description' | 'schoolYear'>): Promise<Course>;
  updateCourse(courseId: string, changes: Partial<Pick<Course, 'title' | 'description' | 'schoolYear'>>): Promise<Course>;
  setArchived(courseId: string, archived: boolean): Promise<Course>;
  deleteCourse(courseId: string): Promise<void>;
  /** Nur für Lehrkräfte des Kurses – und nur Name, Kennung, Rolle, Beitritt. */
  members(courseId: string): Promise<CourseMember[]>;
  removeMember(courseId: string, userId: string): Promise<void>;
}

/* ----------------------------------------------------------- Einladungen */

export interface CourseInvite {
  id: string;
  courseId: string;
  /** Die sichtbare Kurzkennung – **nicht** der Code selbst, der ist gehasht. */
  label: string;
  expiresAt?: string;
  maxUses?: number;
  usedCount: number;
  revoked: boolean;
  createdAt: string;
}

export interface InvitationRepository {
  listForCourse(courseId: string): Promise<CourseInvite[]>;
  /**
   * Erzeugt einen Code. Der Klartext kommt **einmal** zurück und wird nirgends
   * gespeichert – in der Datenbank liegt nur sein Hash.
   */
  createInvite(courseId: string, options: { expiresAt?: string; maxUses?: number }): Promise<{ invite: CourseInvite; code: string }>;
  revokeInvite(inviteId: string): Promise<CourseInvite>;
  /** Beitritt einer bereits angemeldeten lernenden Person zu einem Kurs. */
  redeemCode(code: string): Promise<Course>;
}

/* ---------------------------------------------------------------- Pakete */

export type PublicationState = 'draft' | 'published' | 'withdrawn';

export interface PackSummary {
  id: string;
  title: string;
  grade: string;
  entryCount: number;
  /** Die zuletzt veröffentlichte Revision, falls es eine gibt. */
  publishedRevision?: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
}

export interface PackRevision {
  packId: string;
  revision: number;
  /** Das vollständige, validierte Paket – dieselbe Gestalt wie in der Datei. */
  pack: VocabPack;
  publishedAt: string;
}

export interface PackRepository {
  list(): Promise<PackSummary[]>;
  getDraft(packId: string): Promise<VocabPack | undefined>;
  saveDraft(pack: VocabPack): Promise<PackSummary>;
  deletePack(packId: string): Promise<void>;
  /** Bestehendes lokales Paket in das Cloudkonto übernehmen. Wiederholbar. */
  importFromLocal(pack: VocabPack): Promise<PackSummary>;
}

export interface PublicationRepository {
  /** Friert den aktuellen Entwurf als unveränderliche Revision ein. */
  publish(packId: string): Promise<PackRevision>;
  withdraw(packId: string, revision: number): Promise<void>;
  revisions(packId: string): Promise<Omit<PackRevision, 'pack'>[]>;
  assignToCourse(courseId: string, packId: string, revision: number, position: number): Promise<void>;
  removeFromCourse(courseId: string, packId: string): Promise<void>;
  /** Was Lernende in einem Kurs sehen: nur veröffentlichte, zugewiesene Stände. */
  publishedForCourse(courseId: string): Promise<PackRevision[]>;
}

/* ------------------------------------------------------------ Lernstand */

/**
 * Der Leitner-Stand einer Vokabel in einer Richtung – ohne ihre Kennungen.
 *
 * Abgeleitet aus `EntryProgress` und nicht danebengeschrieben: Käme ein Feld
 * dazu, fiele es hier von selbst mit an. Was fehlt, sind `key`, `packId`,
 * `entryId` und `direction` – die stehen schon im Ereignis, und zweimal
 * dasselbe hieße, dass beides auseinanderlaufen kann.
 */
export type EntryState = Pick<
  EntryProgress,
  'box' | 'correctCount' | 'wrongCount' | 'streak' | 'dueAt'
>;

/**
 * Eine Lernstandsänderung – mit einer Kennung, die der Client vergibt.
 *
 * Die `eventId` ist der ganze Trick an der Idempotenz: Der Server merkt sich,
 * welche Kennungen er verarbeitet hat, und verwirft eine Wiederholung. Eine
 * Antwort, die unterwegs verlorengeht, kann damit gefahrlos erneut gesendet
 * werden – sonst zählte ein Wackler im WLAN eine Vokabel zweimal.
 */
export interface ProgressEvent {
  eventId: string;
  /**
   * In welchem Kurs – oder `LOCAL_SCOPE`, wenn es keinen gibt.
   *
   * Eine portable Datei kennt keine Kurse, und ein optionales Feld hieße, an
   * jeder Verwendungsstelle beide Fälle zu behandeln. Ein benannter Wert sagt
   * dasselbe an einer Stelle.
   */
  courseId: string;
  packId: string;
  entryId: string;
  direction: TaskDirection;
  /** Was die lernende Person getan hat – nicht, was sie getippt hat. */
  outcome: AnswerVerdict;
  occurredAt: string;
  /**
   * Der Stand **nach** dieser Antwort, gerechnet auf dem Gerät.
   *
   * ## Warum der Client rechnet und nicht der Server
   *
   * Welche Box eine Vokabel bekommt und wann sie wieder fällig ist, rechnet
   * `src/domain/leitner.ts` – seit Sprint 1, mit eigenen Prüfungen, und
   * dieselbe Rechnung läuft in jeder portablen Datei ohne Server. Dieselbe
   * Rechnung zusätzlich in SQL hieße, zwei Wahrheiten zu pflegen. Sie würden
   * auseinanderlaufen, und zwar unbemerkt: Wer abwechselnd im Portal und in
   * einer Lerndatei übt, bekäme zwei verschiedene Vorstellungen davon, was er
   * kann.
   *
   * Die Folge, offen gesagt: Wer will, kann seinen **eigenen** Lernstand
   * beschönigen. Das ist hinnehmbar – er ist seiner, niemand sonst sieht ihn
   * (ADR-1), und aus ihm folgt nichts als die Auswahl der nächsten Vokabel.
   *
   * Gebaut wird dieses Feld an genau einer Stelle: `progressEvents.ts`.
   */
  entryState: EntryState;
  /**
   * Von welcher Fassung des gespeicherten Lernstands dieses Gerät ausging.
   *
   * `0` heißt: Für diese Vokabel und Richtung gab es noch nichts. Der Server
   * übernimmt den Stand **nur**, wenn seine eigene Fassung noch genau diese
   * ist – sonst hat inzwischen ein anderes Gerät geschrieben, und er lehnt ab
   * (`ProgressConflict`).
   *
   * ## Warum die Fassung entscheidet und nicht der Zeitstempel
   *
   * `occurredAt` kommt von einer Geräteuhr. Sie kann falsch gehen, und
   * niemand kann das nachprüfen. Entschiede sie, wessen Schreibvorgang gilt,
   * dann gewänne dauerhaft das Gerät mit der am weitesten vorgestellten Uhr –
   * und zwar unbemerkt.
   *
   * ## Warum auch nicht „der bessere Stand gewinnt"
   *
   * Weil es keinen besseren gibt. Fach 5 nach einer falschen Antwort auf
   * Fach 1 ist ein **richtiges** Ergebnis, und ein Riegel, der die Fachnummer
   * ansähe, würde genau das verwerfen: Die Vokabel bliebe in Fach 5, obwohl
   * die Person sie gerade nicht konnte. Verworfen wird ausschließlich ein
   * **veralteter** Schreibvorgang – unabhängig davon, ob er besser oder
   * schlechter aussieht.
   */
  baseRev: number;
}

/**
 * Ein Schreibvorgang, der auf einer überholten Fassung beruhte.
 *
 * Das Ereignis selbst ist trotzdem angekommen und gezählt – geübt wurde ja.
 * Offen ist nur der abgeleitete Lernstand: Das Gerät lädt `currentRev` samt
 * Stand neu, rechnet seine Bewertung mit derselben Domainfunktion erneut und
 * sendet **dasselbe** Ereignis noch einmal. Dass es dabei nicht doppelt
 * zählt, sichert die `eventId`.
 */
export interface ProgressConflict {
  eventId: string;
  entryId: string;
  direction: TaskDirection;
  /** Die Fassung, die der Server jetzt hat. */
  currentRev: number;
}

/**
 * Der Geltungsbereich ohne Kurs.
 *
 * In beiden portablen Gestalten gibt es genau einen Speicher auf genau einem
 * Gerät. Die lokalen Adapter ignorieren den Kursparameter deshalb – aber sie
 * ignorieren ihn *sichtbar*, weil der Aufruf diesen Wert nennt.
 */
export const LOCAL_SCOPE = 'lokal';

export interface ProgressRepository {
  /** Nur der eigene Lernstand. Es gibt keinen Parameter für fremde Personen. */
  myPackProgress(courseId: string, packId: string): Promise<PackProgress | undefined>;
  myEntryProgress(courseId: string, packId: string): Promise<EntryProgress[]>;
  /** Zählt eine begonnene Übungsrunde – mehr wird über Runden nicht geführt. */
  beginSession(courseId: string, packId: string): Promise<void>;
  /**
   * Ereignisse einreichen.
   *
   * Idempotent: Dieselbe `eventId` zählt genau einmal – egal wie oft sie
   * ankommt und egal, ob der Lernstand dabei übernommen wurde.
   *
   * Zurück kommt, was **nicht** übernommen werden konnte, weil ein anderes
   * Gerät schneller war. Eine leere Liste heißt: alles angekommen.
   */
  recordEvents(events: readonly ProgressEvent[]): Promise<ProgressConflict[]>;
  /** Der eigene Lernstand, zurückgesetzt – nach ausdrücklicher Bestätigung. */
  resetMyProgress(courseId: string, packId: string): Promise<void>;
}

/* ------------------------------------------- Kursübergreifender Lernstand */

/**
 * Fällige und bearbeitete Vokabeln eines Pakets – über alle Kurse hinweg.
 *
 * Eine Zeile je Kurs und Paket, in dem die Person etwas hat. Es gibt keine
 * Zeile für ein Paket, das ihr zwar zugewiesen ist, das sie aber noch nie
 * geöffnet hat: Diese Übersicht beschreibt den Lernstand, nicht die Zuweisung.
 */
export interface DueOverview {
  courseId: string;
  packId: string;
  /** Wie viele Vokabeln jetzt fällig sind. */
  dueCount: number;
  /** Wie viele Vokabeln überhaupt einen Lernstand haben. */
  entryCount: number;
  lastPracticedAt?: string;
}

/**
 * Der eigene Lernstand über alle Kurse – in **einer** Abfrage.
 *
 * ## Warum das einen eigenen Vertrag bekommt
 *
 * `ProgressRepository` fragt je Kurs und Paket. Eine Seite, die „was ist
 * heute dran?" beantworten will, müsste das für jedes zugewiesene Paket
 * wiederholen: Die Zahl der Abfragen wüchse mit den Kursen, und zwar bei
 * jedem Öffnen. Diese Schnittstelle gibt es, damit diese Kaskade gar nicht
 * erst entsteht.
 *
 * ## Warum nicht als Methode auf `ProgressRepository`
 *
 * Weil die portablen Gestalten ihn dann erfüllen müssten. Eine Lerndatei hat
 * genau ein Paket und keine Kurse; „über alle Kurse" ist dort keine Frage,
 * und eine Antwort darauf wäre toter Code in einer Datei, die per E-Mail
 * verschickt wird. Optional in `Repositories` sagt dasselbe ehrlicher.
 *
 * Es gibt keinen Parameter für eine andere Person – hier so wenig wie in der
 * Datenbank.
 */
export interface ProgressOverviewRepository {
  /**
   * Keine Parameter – weder eine Person noch ein Zeitpunkt.
   *
   * Der Vergleichszeitpunkt für die Fälligkeit ist die **Uhr der Datenbank**,
   * und er ist von außen nicht beeinflussbar (E28). Ein optionaler Zeitpunkt
   * „nur für Tests" stünde hier im öffentlichen Vertrag, reichte durch
   * Gateway und RPC durch, und irgendwann schriebe jemand an einer
   * Aufrufstelle `new Date().toISOString()` hinein – eine Geräteuhr, die
   * niemand nachprüfen kann. Ein Prüfstand legt seine Daten stattdessen
   * relativ zu `now()` an.
   *
   * `src/application/keineTestuhr.test.ts` hält das fest.
   */
  myDueOverview(): Promise<DueOverview[]>;
}

/* ------------------------------------------------- Lernendeneinstellungen */

/**
 * Was eine lernende Person über sich selbst festlegt.
 *
 * Ein fehlendes Feld heißt **nicht gesetzt**, und das ist bei beiden der
 * Anfangszustand: keine bestätigte Zeitzone, kein Wochenziel. Ein leeres
 * Objekt ist deshalb eine vollständige, gültige Antwort – nicht ein Fehler
 * und nicht ein „noch nicht geladen".
 */
export interface LearnerSettings {
  /**
   * Ein IANA-Name, **von der Person bestätigt** (E27).
   *
   * Fehlt das Feld, ist die Zeitzone unbestätigt. Dann steht hier nicht
   * ersatzweise, was der Browser meint: Der Vorschlag lebt in
   * `src/domain/zeitzone.ts` und kommt nie hierher, ohne dass jemand
   * `confirmTimeZone` aufgerufen hat.
   */
  timeZone?: string;
  /** Lerntage je Woche, 1 bis 7 (E26). Fehlt das Feld, gibt es kein Ziel. */
  weeklyGoalDays?: number;
}

/**
 * Die eigenen Einstellungen lesen und ändern. Nur die eigenen.
 *
 * Es gibt keine Methode, die eine Personenkennung entgegennimmt – auch nicht
 * für eine Lehrkraft der eigenen Kurse. Das ist dieselbe Zusage wie bei
 * `ProgressRepository`, und sie steht hier aus demselben Grund im Zuschnitt
 * statt in einer Prüfung: Was es nicht gibt, kann niemand falsch aufrufen.
 *
 * ## Warum es kein `saveSettings(alles)` gibt
 *
 * E27 trennt Vorschlag und Bestätigung. Eine Methode, die beide Felder
 * hinschreibt, machte aus dieser Trennung eine Frage der Disziplin an jeder
 * Aufrufstelle. Drei Methoden mit sprechenden Namen machen sie zu einer
 * Eigenschaft des Vertrags.
 */
export interface LearnerSettingsRepository {
  /** Die eigenen Einstellungen. Ein leeres Objekt heißt: noch nichts gesetzt. */
  mySettings(): Promise<LearnerSettings>;
  /**
   * Eine Zeitzone **bestätigen**. Der einzige Weg, wie eine hineinkommt.
   *
   * Eine unbekannte Zeichenkette lehnt die Datenbank ab (Prüfung gegen
   * `pg_timezone_names`); der Fehler kommt hier als Ausnahme an.
   */
  confirmTimeZone(timeZone: string): Promise<LearnerSettings>;
  /** Die bestätigte Zeitzone wieder entfernen – zurück auf „unbestätigt". */
  forgetTimeZone(): Promise<LearnerSettings>;
  /** Das Wochenziel setzen, oder mit `undefined` abschalten (E3, E26). */
  setWeeklyGoalDays(days: number | undefined): Promise<LearnerSettings>;
}

/* ------------------------------------------------------------------ Konto */

export interface AccountRepository {
  /** Die eigenen Daten als Datei – Auskunft ohne Umweg über jemanden. */
  exportMyData(): Promise<Blob>;
  /** Das eigene Konto löschen. Löscht keine Kursinhalte anderer. */
  deleteMyAccount(): Promise<void>;
}

/* --------------------------------------------------------------------- KI */

export interface AiConnectionSummary {
  id: string;
  label: string;
  adapter: string;
  model: string;
  /** Der Schlüssel erscheint nur maskiert – der Klartext kommt nie zurück. */
  maskedSecret: string;
  capabilities: readonly string[];
  active: boolean;
  lastCheckedAt?: string;
}

export interface AiGateway {
  listConnections(): Promise<AiConnectionSummary[]>;
  /** Der Klartext geht hin und kommt nie wieder – siehe `docs`, Phase 7. */
  saveConnection(input: {
    id?: string;
    label: string;
    adapter: string;
    baseUrl: string;
    model: string;
    secret: string;
  }): Promise<AiConnectionSummary>;
  deleteConnection(id: string): Promise<void>;
  testConnection(id: string): Promise<{ ok: boolean; message: string }>;
  /** Der einzige Weg zu einem Anbieter. Nur Lehrkräfte, nur auf Klick. */
  invoke(input: { connectionId: string; capability: string; payload: unknown }): Promise<unknown>;
}

/* ------------------------------------------------------------- Die Menge */

/**
 * Alles zusammen.
 *
 * Optional, weil nicht jeder Modus alles hat: Eine Lerndatei hat keine Kurse
 * und keine KI. Wer eine Ansicht baut, die `courses` braucht, fragt danach –
 * und `useRepository` sagt deutlich, wenn es sie in diesem Modus nicht gibt,
 * statt `undefined` weiterzureichen und drei Ebenen später abzustürzen.
 */
export interface Repositories {
  auth?: AuthRepository;
  profile?: ProfileRepository;
  courses?: CourseRepository;
  invitations?: InvitationRepository;
  packs?: PackRepository;
  publication?: PublicationRepository;
  progress?: ProgressRepository;
  /*
    Beide nur in der Cloudfassung: Eine Lerndatei kennt weder mehrere Kurse
    noch ein Konto, an dem eine Einstellung hinge.
  */
  progressOverview?: ProgressOverviewRepository;
  learnerSettings?: LearnerSettingsRepository;
  account?: AccountRepository;
  ai?: AiGateway;
}

export type RepositoryName = keyof Repositories;
