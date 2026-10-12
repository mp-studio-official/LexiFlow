select jsonb_build_object(
  'auth.users',       (select count(*) from auth.users),
  'profiles',         (select count(*) from public.profiles),
  'learner_accounts', (select count(*) from public.learner_accounts),
  'learner_settings', (select count(*) from public.learner_settings),
  'courses',          (select count(*) from public.courses),
  'course_members',   (select count(*) from public.course_members),
  'course_invites',   (select count(*) from public.course_invites),
  'packs',            (select count(*) from public.packs),
  'pack_drafts',      (select count(*) from public.pack_drafts),
  'pack_revisions',   (select count(*) from public.pack_revisions),
  'course_packs',     (select count(*) from public.course_packs),
  'pack_progress',    (select count(*) from public.pack_progress),
  'entry_progress',   (select count(*) from public.entry_progress),
  'progress_events',  (select count(*) from public.progress_events),
  'ai_allowed_hosts', (select count(*) from public.ai_allowed_hosts),
  'ai_connections',   (select count(*) from public.ai_connections),
  'auth_rate_limit',  (select count(*) from public.auth_rate_limit)
);
