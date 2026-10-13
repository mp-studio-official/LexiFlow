/*
  Persönlicher Lerncoach-Zugang — Migration 17.

  Die Tabelle und die Versiegelung existieren bereits. Geändert wird genau
  eine Grenze: Eine lernende Person darf eine **eigene** KI-Verbindung
  anlegen. Der Klartextschlüssel geht weiterhin ausschließlich an die Edge
  Function, wird dort mit AES-GCM versiegelt und ist für `authenticated`
  nicht lesbar.

  Diese Regel gibt weder fremde Verbindungen noch die Siegelspalten frei.
  Welche Aufträge Lernende mit ihrer Verbindung ausführen dürfen, entscheidet
  zusätzlich `ai-gateway/core.ts`: ausschließlich die vier fest benannten
  Lerncoach-Aufträge, niemals ein freier Chat.
*/

drop policy ai_verbindungen_eigene on ai_connections;
create policy ai_verbindungen_eigene on ai_connections
  for all to authenticated
  using (owner_id = auth.uid() and app_account_is_active())
  with check (
    owner_id = auth.uid()
    and app_account_is_active()
    and app_my_role() in ('student', 'teacher', 'admin')
  );

comment on policy ai_verbindungen_eigene on ai_connections is
  'Jede aktive Person verwaltet ausschließlich ihre eigenen versiegelten '
  'Verbindungen. Lernende dürfen serverseitig nur feste Lerncoach-Aufträge '
  'ausführen; diese engere Grenze liegt in ai-gateway.';
