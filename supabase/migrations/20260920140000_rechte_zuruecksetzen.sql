-- LexiFlow – die Rechte einmal auf null stellen und neu aufbauen.
--
-- ## Warum Migration 9 nicht gereicht hat
--
-- Migration 9 hat `grant` geschrieben. `grant` **ergänzt**. Es nimmt nichts
-- weg, und es weiß nicht, was vorher da war.
--
-- Vorher da war eine Menge. Im Stagingprojekt waren Vorgaberechte dieser Form
-- wirksam:
--
--     alter default privileges for role postgres in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- Migrationen laufen als `postgres`. Jede Tabelle, die eine Migration anlegt,
-- ist damit **im Moment ihrer Entstehung** bereits für alle drei Rollen
-- freigegeben – mit `select, insert, update, delete, truncate, references,
-- trigger`, bevor in der Migration auch nur ein `grant` steht.
--
-- ## Was belegt ist und was nicht
--
-- **Belegt:** Die Kontrollabfrage im echten Projekt zeigt diese Rechte. Beim
-- Anlegen der Tabellen waren also breite Vorgaberechte für alle drei Rollen
-- wirksam.
--
-- **Nicht belegt:** *warum* sie wirksam waren. Möglich ist eine
-- Projekteinstellung, die nicht gespeichert oder anders gesetzt wurde, ebenso
-- wie ein abweichendes Verhalten der Plattform. Diese Datei entscheidet das
-- nicht und braucht es nicht zu entscheiden.
--
-- > **Anmerkung zur neunten Migration.** Ihr Kopf schreibt, in einem Projekt
-- > mit abgeschalteter Automatik „läuft nichts". Das hat sich nicht bestätigt:
-- > Die Automatik war abgeschaltet, und die Rechte waren da. Migration 9 ist
-- > im Stagingprojekt bereits angewandt und wird deshalb nicht mehr geändert –
-- > diese Zeilen hier sind die Berichtigung.
--
-- **Was folgt:** LexiFlow verlässt sich nicht mehr darauf. Diese Datei entzieht
-- vorhandene Rechte, vergibt die genaue Matrix neu und setzt eigene
-- Vorgaberechte. Danach ist der Rechtestand unabhängig davon, wie ein Projekt
-- erstellt wurde – und die Kontrollabfrage in der Inbetriebnahme sagt in einer
-- Zeile, ob das gelungen ist.
--
-- ## Der Gedanke war schon einmal richtig
--
-- `…120200_zugriffsregeln.sql` kennt dieses Problem und löst es:
--
--     revoke all on all tables in schema public from anon, authenticated;
--
-- Erst abräumen, dann gezielt vergeben. Genau das Richtige – nur an zwei
-- Stellen unvollständig:
--
-- 1. **`service_role` fehlt in der Aufzählung.** Deshalb stand dort alles
--    noch, was die Vorgabe gegeben hatte.
-- 2. **`all tables` heißt „alle, die es jetzt gibt".** Migration 3 läuft als
--    dritte von neun. `learner_accounts` (4), `auth_rate_limit` (5),
--    `ai_connections` und `ai_allowed_hosts` (8) entstehen danach – und
--    behalten ihre Vorgaberechte, auch für `anon` und `authenticated`.
--
-- Was das konkret bedeutet, ist im nachgebildeten Supabase-Zustand gemessen
-- und nicht abgeleitet:
--
-- | Wer | konnte | obwohl |
-- | --- | --- | --- |
-- | eine lernende Person | `select recovery_code_hash from learner_accounts` (eigene Zeile) | `…120300` das Spaltenrecht ausdrücklich zurückhält, „sonst könnte jede lernende Person ihren eigenen Code-Hash lesen und in Ruhe durchprobieren" |
-- | eine Lehrkraft | `secret_ciphertext`, `secret_iv`, `secret_key_version` lesen **und schreiben** (eigene Zeilen) | `…120700` die Spalten einzeln vergibt und die drei Siegelspalten ausdrücklich auslässt |
-- | `anon` | `truncate learner_accounts` | RLS für `truncate` **nicht** gilt |
--
-- Zur letzten Zeile die Einschränkung, die dazugehört: PostgREST kennt kein
-- `truncate`. Über die HTTP-Schnittstelle ist das Recht nicht erreichbar. Es
-- ist ein Recht, das niemand braucht und das niemand vergeben wollte – kein
-- offenes Tor. Die beiden Zeilen darüber sind dagegen über die ganz normale
-- API erreichbar, und sie machen zwei zugesagte Garantien unwahr.
--
-- ## Was diese Datei tut
--
-- Erst abräumen, dann neu aufbauen, dann die Vorgabe abstellen. In dieser
-- Reihenfolge, und für **alle drei** Rollen.
--
-- Der Neuaufbau wiederholt jede Vergabe aus 3, 4, 8 und 9 wörtlich. Das ist
-- die unangenehme Seite dieser Datei: Sie ist eine Abschrift, und eine
-- Abschrift kann Zeilen verlieren. Dagegen steht
-- `scripts/db/rechtestand.test.mjs`, das die entstehende Rechtematrix
-- vollständig gegen eine ausgeschriebene Erwartung hält – nicht stichprobenweise.

-- ═══════════════════════════════════════════════ 1. Alles abräumen ═══

/*
  `revoke all` nimmt Tabellen- **und** Spaltenrechte. Beides muss weg: Ein
  übrig gebliebenes Tabellenrecht macht jedes Spaltenrecht bedeutungslos,
  denn Spaltenrechte schränken nicht ein, sie ergänzen.

  `service_role` steht hier in derselben Zeile wie die Browserrollen. Genau
  das Weglassen war der erste Teil des Fehlers.
*/
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

/*
  Das Schema selbst bleibt nutzbar – ohne `usage` wäre jedes Recht unten
  wirkungslos. Es steht hier noch einmal, weil diese Datei den Zustand
  vollständig herstellen soll und nicht davon abhängen will, was oben
  stehen geblieben ist.
*/
grant usage on schema public to anon, authenticated, service_role;

-- ═══════════════════════════════════ 2. Die Browserrollen neu aufbauen ═══

/*
  Wörtlich aus `…120200_zugriffsregeln.sql`. Die Begründung für jede einzelne
  Zeile steht dort; sie wird hier nicht wiederholt, weil zwei Begründungen
  für dieselbe Entscheidung irgendwann auseinanderlaufen.

  `anon` bekommt **keine einzige Tabelle**. Das war schon vorher so gemeint:
  Migration 3 vergibt ausschließlich an `authenticated`. Sichtbar wurde es
  nie, weil `anon` auf den vier später entstandenen Tabellen alles hatte.
*/
grant select, insert on profiles to authenticated;
grant update (display_name) on profiles to authenticated;
grant select, insert, update, delete on courses to authenticated;
grant select, insert, delete on course_members to authenticated;
grant select, insert, update on course_invites to authenticated;
grant select, insert, update, delete on packs to authenticated;
grant select, insert, update, delete on pack_drafts to authenticated;
grant select, insert, update on pack_revisions to authenticated;
grant select, insert, update, delete on course_packs to authenticated;
grant select, insert, update, delete on pack_progress to authenticated;
grant select, insert, update, delete on entry_progress to authenticated;
grant select, insert on progress_events to authenticated;

/*
  Aus `…120300_anmeldung.sql`. Vier Spalten – `recovery_code_hash` gehört
  ausdrücklich **nicht** dazu. Das ist die Zeile, die im Stagingprojekt
  wirkungslos war.
*/
grant select (user_id, learner_id, recovery_confirmed_at, created_at)
  on learner_accounts to authenticated;

/*
  Aus `…120700_ki.sql`. Die drei Siegelspalten fehlen in allen drei Zeilen,
  und das ist der Riegel unter der Zusage „der Browser sieht den Schlüssel
  nie". Auch er war wirkungslos.
*/
grant select on ai_allowed_hosts to authenticated;
grant insert, update, delete on ai_allowed_hosts to authenticated;
grant select (
  id, owner_id, label, adapter, base_url, model, masked_secret,
  active, last_checked_at, created_at, updated_at
) on ai_connections to authenticated;
grant insert (id, owner_id, label, adapter, base_url, model, active) on ai_connections to authenticated;
grant update (label, model, active) on ai_connections to authenticated;
grant delete on ai_connections to authenticated;

/*
  `auth_rate_limit` bekommt niemand. Die Bremse wird ausschließlich über
  `note_auth_attempt` bedient, und die ist `security definer`. Vorher hatten
  `anon` und `authenticated` dort volle Rechte; dass trotzdem nichts
  passieren konnte, lag allein daran, dass die Tabelle RLS mit **null**
  Regeln hat und damit ohnehin alles abweist. Zwei Riegel, von denen einer
  offen stand – jetzt sind es wieder zwei.
*/

-- ═════════════════════════════════════ 3. Den Dienst neu aufbauen ═══

/*
  Wörtlich aus `…090000_dienstrechte.sql`. Dieselbe Liste, dieselben Gründe –
  nur steht sie jetzt hinter einem `revoke` statt davor, und das ist der
  ganze Unterschied zwischen „auch erlaubt" und „nur erlaubt".
*/
grant select on profiles to service_role;
grant select on learner_accounts to service_role;
grant select, insert, update, delete on ai_connections to service_role;
grant select on ai_allowed_hosts to service_role;

-- ═════════════════════════════ 4. Die Vorgabe für Neues abstellen ═══

/*
  Ohne diesen Block wäre die Korrektur bis zur nächsten Migration haltbar.
  Die erste Tabelle, die jemand danach anlegt, käme wieder mit vollen Rechten
  für alle drei Rollen auf die Welt – und niemand würde es bemerken, weil
  niemand nach etwas sucht, das man nicht geschrieben hat.

  ## Zwei Geltungsbereiche, und beide zählen

  `alter default privileges` kennt eine Vorgabe **mit** Schemabezug und eine
  **ohne**. Es sind zwei getrennte Einträge in `pg_default_acl`, und ein
  `revoke` trifft nur den, dessen Bereich es nennt.

  Eine frühere Fassung dieses Blocks nannte nur `in schema public`. Gegen
  eine schemabezogene Vorgabe wirkt das; gegen eine ohne Schemabezug wirkt es
  **gar nicht** – die neue Tabelle erbt dann weiter alle sieben Rechte, und
  die Kontrollabfrage auf `role_table_grants` sieht davon nichts, weil sie
  bestehende Tabellen prüft und nicht künftige.

  Welche Form das Stagingprojekt hat, ist nicht bekannt. Deshalb stehen hier
  beide. Ein `revoke` auf eine Vorgabe, die es nicht gibt, ist folgenlos –
  die teurere Annahme ist also die harmlose.

  `for role postgres`, weil Migrationen als diese Rolle laufen. Eine Vorgabe
  unter einer anderen Rolle wird hiervon nicht berührt; die Kontrollabfrage
  auf `pg_default_acl` in der Inbetriebnahme deckt genau das auf, weil sie
  Eigentümer **und** Geltungsbereich mit ausgibt.
*/
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres
  revoke all on sequences from anon, authenticated, service_role;

/*
  Und dieselbe Überlegung für Funktionen.

  Postgres gibt **jeder** neuen Funktion `execute` für `public`. Abschnitt 5
  nimmt das den fünf Funktionen ab, die es heute betrifft. Für die nächste,
  die jemand anlegt, gilt es wieder – und dann fängt die Suche von vorn an.

  Diese vier Zeilen drehen die Vorgabe um: Eine neue Funktion ist von sich
  aus für niemanden ausführbar, und wer sie freigeben will, schreibt ein
  `grant`. Das ist ohnehin die Gewohnheit in diesem Schema; neu ist nur, dass
  ein Vergessen jetzt laut scheitert statt still offen zu stehen.
*/
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

-- ═══════════════════════════════ 5. Was PUBLIC noch ausführen darf ═══

/*
  In Postgres bekommt **jede** neue Funktion `execute` für `public`. Die
  Migrationen 3, 5, 6 und 7 nehmen das den heiklen Funktionen wieder ab. Fünf
  sind übrig geblieben – nachgesehen, nicht geraten:

  | Funktion | warum übrig | was jetzt |
  | --- | --- | --- |
  | `app_ai_touch()` | Triggerfunktion, nie von Hand aufgerufen | entzogen |
  | `app_archived_courses_are_closed()` | dito | entzogen |
  | `app_revisions_are_frozen()` | dito | entzogen |
  | `invite_alphabet()` | an `authenticated` vergeben, `public` übersehen | entzogen, an `authenticated` erneut vergeben |
  | `invite_code_hash(text)` | dito | entzogen, an `authenticated` erneut vergeben |

  Die drei Triggerfunktionen verlieren nichts: Postgres prüft `execute` beim
  **Anlegen** des Triggers, nicht bei jedem Auslösen. Die Trigger feuern
  weiter, und `rechtestand.test.mjs` prüft genau das – sonst wäre es eine
  Behauptung über fremdes Verhalten.

  Für die beiden anderen ist `public` der Unterschied zwischen „jede
  angemeldete Person" und „auch jeder Besucher ohne Konto". Gefährlich ist
  keine von beiden; gemeint war trotzdem nur die erste.

  Hier steht **kein** `revoke … from public` über alle Funktionen. Das träfe
  auch die, bei denen `public` gewollt ist, und niemand hätte danach eine
  Liste, was wieder zu vergeben wäre.
*/
revoke all on function app_ai_touch() from public;
revoke all on function app_archived_courses_are_closed() from public;
revoke all on function app_revisions_are_frozen() from public;

revoke all on function invite_alphabet() from public;
revoke all on function invite_code_hash(text) from public;
grant execute on function invite_alphabet() to authenticated;
grant execute on function invite_code_hash(text) to authenticated;

-- ═══════════════════════════════════ 6. Die fünf Dienstfunktionen ═══

/*
  Ebenfalls aus Migration 9 wiederholt. `revoke all on all tables` fasst
  Funktionsrechte nicht an, diese Zeilen wären also nicht nötig – sie stehen
  hier, damit diese Datei allein gelesen werden kann und die vollständige
  Antwort auf „was darf der Dienst?" gibt. Ein `grant` auf ein bereits
  vergebenes Recht ist folgenlos.
*/
grant execute on function note_auth_attempt(text, integer, interval) to service_role;
grant execute on function consume_invite_by_hash(text) to service_role;
grant execute on function release_invite_by_hash(text) to service_role;
grant execute on function create_learner_account(uuid, text, text, text, text, uuid)
  to service_role;
grant execute on function rotate_recovery_code(uuid, text) to service_role;
