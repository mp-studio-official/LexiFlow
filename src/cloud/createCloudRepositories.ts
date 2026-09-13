import type { SupabaseClient } from '@supabase/supabase-js';
import { callbackUrl } from '../runtime/entryUrls';
import { createFetchTransport, createLearnerAuth } from './learnerAuth';
import { createSupabaseAuthRepository, type SupabaseAuthSlice } from './supabaseAuthRepository';
import {
  createRoleLoader,
  createSupabaseProfileRepository,
  type ProfilZeile,
  type ProfileQueries,
} from './supabaseProfileRepository';
import { createSqlCourseRepositories } from './courseGateway';
import { createSqlPackRepositories } from './packGateway';
import { createSupabaseCourseGateway } from './supabaseCourseGateway';
import { createSupabasePackGateway } from './supabasePackGateway';
import { createSupabaseClient } from './supabaseClient';
import type { HostedConfig } from '../runtime/hostedConfig';
import type { Repositories } from '../application/repositories';

/**
 * Die Cloudfassung der Verträge – so weit sie in Phase 3 reicht.
 *
 * ## Was hier absichtlich fehlt
 *
 * `progress`, `account`, `ai`. Sie kommen in den Phasen 6 und 7. Bis dahin sind sie **nicht vorhanden**, und das ist besser
 * als eine Fassung, die Fehler wirft: Die Oberfläche fragt mit
 * `useOptionalRepository` und sagt dann ehrlich, dass es das in dieser Fassung
 * noch nicht gibt, statt einen Knopf anzubieten, der in einen Absturz führt.
 *
 * ## Die Rückkehradresse
 *
 * Sie wird aus `location.origin` und `import.meta.env.BASE_URL` gerechnet und
 * steht nirgends fest geschrieben. Auf GitHub Pages ist der Grundpfad
 * `/LexiFlow/portal/`; eine feste Adresse hieße, dass die Wiederherstellung
 * genau in der Umgebung scheitert, in der sie gebraucht wird. Siehe
 * `src/runtime/entryUrls.ts`.
 */

/** Die Route, auf der nach einem Wiederherstellungsverweis gelandet wird. */
export const KENNWORT_NEU_ROUTE = '/kennwort-neu';

/** Die Abfragen auf `profiles`, über den Supabase-Client. */
function profileQueries(client: SupabaseClient): ProfileQueries {
  return {
    async readMyProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, short_code, role, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error('Das Profil konnte nicht geladen werden.');
      return (data as ProfilZeile | null) ?? undefined;
    },
    async updateDisplayName(userId, displayName) {
      const { data, error } = await client
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId)
        .select('id, display_name, short_code, role, created_at')
        .single();
      if (error || !data) throw new Error('Der Anzeigename wurde nicht übernommen.');
      return data as ProfilZeile;
    },
  };
}

export function createCloudRepositories(input: {
  config: HostedConfig;
  /** Der Ursprung der laufenden Seite – im Test ein erfundener. */
  origin: string;
  /** Der Grundpfad dieses Builds (`import.meta.env.BASE_URL`). */
  base: string;
  /** Für Tests: ein fertiger Client statt eines neuen. */
  client?: SupabaseClient;
}): Repositories {
  const client = input.client ?? createSupabaseClient(input.config);
  const queries = profileQueries(client);

  const auth = createSupabaseAuthRepository({
    /*
      Der Ausschnitt passt zur Bibliothek, aber TypeScript sieht das nicht von
      selbst: `SupabaseClient['auth']` hat Dutzende Methoden mit breiteren
      Typen. Die Umdeutung ist die Stelle, an der das behauptet wird – und sie
      steht genau einmal, statt sich durch die Anmeldung zu ziehen.
    */
    auth: client.auth as unknown as SupabaseAuthSlice,
    ladeRolle: createRoleLoader(queries),
    learner: createLearnerAuth({
      supabaseUrl: input.config.supabaseUrl,
      transport: createFetchTransport(input.config.supabasePublishableKey),
    }),
    async bestaetigeCode(code) {
      const { data, error } = await client.rpc('confirm_recovery_code', { p_code: code });
      return !error && data === true;
    },
    recoveryRedirect: callbackUrl(input.origin, input.base, KENNWORT_NEU_ROUTE),
  });

  const profile = createSupabaseProfileRepository({
    queries,
    async currentUserId() {
      return (await auth.currentSession())?.userId;
    },
  });

  const { courses, invitations } = createSqlCourseRepositories(
    createSupabaseCourseGateway(client),
  );

  const { packs, publication } = createSqlPackRepositories(createSupabasePackGateway(client));

  return { auth, profile, courses, invitations, packs, publication };
}
