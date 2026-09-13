import { isRole } from '../runtime/access';
import type { Profile, ProfileRepository, Role } from '../application/repositories';

/**
 * Das eigene Profil, gelesen aus `profiles`.
 *
 * ## Es gibt hier keine Methode für ein fremdes Profil
 *
 * Nicht, weil die Zugriffsregeln sie ohnehin stoppen würden – das tun sie –,
 * sondern weil eine Schnittstelle, die den Fall nicht beschreibt, ihn auch
 * nicht versehentlich bekommt. Die Mitgliederliste eines Kurses kommt ab
 * Phase 4 über `CourseRepository.members`, und die gibt Namen, Kennung, Rolle
 * und Beitrittsdatum heraus – nichts sonst.
 *
 * ## Der schmale Ausschnitt
 *
 * Wie bei der Anmeldung: Diese Datei beschreibt, was sie von der Datenbank
 * braucht, und nicht mehr. Ein Test erfüllt das in zehn Zeilen, ohne Netz und
 * ohne Bibliothek.
 */

/** Eine Zeile aus `profiles`, so wie PostgREST sie liefert. */
export interface ProfilZeile {
  id: string;
  display_name: string;
  short_code: string;
  role: string;
  created_at: string;
}

export interface ProfileQueries {
  /** Das eigene Profil. Die Zugriffsregeln beschränken das auf die eigene Zeile. */
  readMyProfile(userId: string): Promise<ProfilZeile | undefined>;
  updateDisplayName(userId: string, displayName: string): Promise<ProfilZeile>;
}

export function alsProfil(zeile: ProfilZeile): Profile {
  return {
    id: zeile.id,
    displayName: zeile.display_name,
    shortCode: zeile.short_code,
    // Eine unbekannte Rollenangabe zählt als die engste – nie als die weiteste.
    role: isRole(zeile.role) ? (zeile.role as Role) : 'student',
    createdAt: zeile.created_at,
  };
}

export function createSupabaseProfileRepository(deps: {
  queries: ProfileQueries;
  /** Wessen Profil – aus der laufenden Sitzung. */
  currentUserId(): Promise<string | undefined>;
}): ProfileRepository {
  return {
    async myProfile() {
      const userId = await deps.currentUserId();
      if (!userId) return undefined;
      const zeile = await deps.queries.readMyProfile(userId);
      return zeile ? alsProfil(zeile) : undefined;
    },

    async updateDisplayName(displayName) {
      const userId = await deps.currentUserId();
      if (!userId) throw new Error('Nicht angemeldet.');
      const sauber = displayName.trim();
      if (sauber.length < 1 || sauber.length > 60) {
        /*
          Dieselbe Grenze wie in der Datenbank (`check` auf `display_name`).
          Die dort ist die verbindliche; die hier erspart einen Umlauf und eine
          englische Fehlermeldung.
        */
        throw new Error('Der Anzeigename braucht zwischen 1 und 60 Zeichen.');
      }
      return alsProfil(await deps.queries.updateDisplayName(userId, sauber));
    },
  };
}

/** Die Rolle allein – für die Anmeldung, die nicht das ganze Profil braucht. */
export function createRoleLoader(queries: ProfileQueries) {
  return async (userId: string): Promise<Role | undefined> => {
    const zeile = await queries.readMyProfile(userId);
    return zeile ? alsProfil(zeile).role : undefined;
  };
}
