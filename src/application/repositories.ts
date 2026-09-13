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
  /** Idempotent: dieselbe `eventId` zweimal zu senden ändert nichts. */
  recordEvents(events: readonly ProgressEvent[]): Promise<void>;
  /** Der eigene Lernstand, zurückgesetzt – nach ausdrücklicher Bestätigung. */
  resetMyProgress(courseId: string, packId: string): Promise<void>;
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
  account?: AccountRepository;
  ai?: AiGateway;
}

export type RepositoryName = keyof Repositories;
