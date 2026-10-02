/*
  Lokale Lerntage: der Kalender der lernenden Person — die dreizehnte Migration.

  ## Wofür

  Serie und Wochenaktivität (E1, E2) sind Aussagen über **Tage**. Ein Tag
  beginnt dort, wo die lernende Person wohnt, und nirgends sonst. Migration 12
  hat die bestätigte Zeitzone abgelegt; hier wird sie zum ersten Mal benutzt.

  Diese Migration legt **nichts** ab. Sie liest, gruppiert und gibt zurück.

  ## Warum das der Server rechnet und nicht der Browser

  Weil der Browser auf einer Uhr steht, die niemand nachprüfen kann (E28).
  Wer seine Gerätezeit vorstellt, bekäme sonst einen Lerntag geschenkt — und
  zwar unbemerkt, weil die Serie danach aussieht wie jede andere.

  Der Tag entsteht deshalb aus `progress_events.recorded_at`, einem
  Zeitstempel der Datenbank, umgerechnet in die **gespeicherte** Zeitzone.
  Beides liest der Server selbst. Es gibt in dieser Migration keinen
  Parameter: keine Personenkennung, keine Zeitzone, kein Datum, keine Uhr.

  ## Die offene Folge, ausgesprochen

  Wer offline übt und drei Tage später synchronisiert, bekommt die Aufgaben
  auf dem **Tag der Synchronisierung** gutgeschrieben, nicht auf den Tag, an
  dem er sie bearbeitet hat (E28). Das ist bewusst so und nicht schön. Die
  Alternative wäre, `occurredAt` vom Gerät zu glauben — und damit jeder Uhr,
  die jemand verstellt. Eine Serie, die man sich stellen kann, ist keine.
*/

-- ------------------------------------------------ Der heutige lokale Tag

/*
  Warum es diese Funktion gibt, obwohl der Browser ein Datum kennt.

  Weil der Browser ein **anderes** Datum kennen kann als die Tagesgrenze, die
  für die Serie gilt — zur Reisezeit, bei falsch gestellter Uhr, und jeden
  Abend zwischen Mitternacht in der einen und Mitternacht in der anderen
  Zeitzone. Wer die Woche auf dem Gerätedatum aufbaut und die Lerntage auf
  der gespeicherten Zeitzone, baut zwei Kalender nebeneinander, die meistens
  übereinstimmen. Meistens ist hier nicht gut genug.

  **Es kommt immer genau eine Zeile zurück**, auch wenn nichts eingestellt
  und nichts geübt wurde. Ohne bestätigte Zeitzone stehen `local_day` und
  `week_start` auf `null` – das ist die wahrheitsgemäße Antwort „dafür fehlt
  die Tagesgrenze", und die Seite zeigt dann keine Serie (E27), funktioniert
  aber vollständig weiter.

  `date_trunc('week', …)` beginnt in PostgreSQL am **Montag**. Das ist die
  Kalenderwoche, von der E2 spricht.
*/
create or replace function my_local_today()
returns table (
  time_zone text,
  local_day date,
  week_start date
)
language sql
stable
set search_path = public, pg_temp
as $$
  with zone as (
    /*
      Eine skalare Unterabfrage, kein `from learner_settings`. Der
      Unterschied ist der ganze Punkt: Ohne Zeile käme aus einem `from`
      **keine** Zeile zurück, und die aufrufende Seite müsste „keine Zeile"
      von „Fehler" unterscheiden. So kommt immer eine.
    */
    select (select ls.time_zone from learner_settings ls where ls.user_id = auth.uid()) as zone
  )
  select
    zone.zone,
    case when zone.zone is null then null::date
         else (now() at time zone zone.zone)::date end,
    case when zone.zone is null then null::date
         else (date_trunc('week', now() at time zone zone.zone))::date end
  from zone;
$$;

comment on function my_local_today() is
  'Der heutige Kalendertag und der Wochenbeginn in der bestätigten Zeitzone '
  'der angemeldeten Person. Immer genau eine Zeile; ohne bestätigte Zeitzone '
  'beide Daten null (E27). Keine Parameter (E28).';

-- --------------------------------------------------- Die lokalen Lerntage

/*
  Eine Zeile je lokalem Tag, an dem überhaupt etwas gezählt wurde.

  Gezählt werden **Zeilen in `progress_events`**. Jede steht für genau eine
  bewertete Aufgabe, und ihre Kennung ist der Primärschlüssel: Dasselbe
  Ereignis zweimal einzuspielen legt keine zweite Zeile an. Die Zusage „doppelt
  eingespielte Ereignisse zählen nicht doppelt" (E1) steht damit im
  Datenmodell und nicht in einer Abfrage, die jemand später ändern könnte.

  Die Schwelle von zehn Aufgaben steht **nicht** hier. Sie ist eine
  Produktregel und gehört in `src/domain/lernserie.ts`, zusammen mit den
  Ruhetagen — eine Zahl in SQL und dieselbe Zahl in TypeScript wären zwei
  Wahrheiten. Hier kommt die Zählung, dort die Bedeutung.

  Ohne bestätigte Zeitzone kommen **keine** Zeilen: Es gibt dann keine
  Tagesgrenze, und ein Tag in UTC wäre eine erfundene Antwort, keine
  vorsichtige.

  **Kein Zeitfenster.** Hier stand eine Weile `recorded_at >= now() -
  interval '400 days'`, und die Zahl war erfunden: Sie hätte eine Serie, die
  länger als gut ein Jahr läuft, still abgeschnitten — und die längste
  bisherige Serie (§ 4.5) gleich mit. Eine Grenze, die niemand begründen
  kann, gehört nicht in eine Funktion, deren Ergebnis eine Aussage über die
  ganze Lerngeschichte ist.

  Teuer wird es dadurch nicht. Die Abfrage gibt **je lokalem Tag eine Zeile**
  zurück, nicht je Ereignis; die Zahl der Zeilen wächst mit den Tagen, an
  denen jemand gelernt hat, und ein Schuljahr hat davon etwa zweihundert.
  Gelesen wird über `progress_events_user_idx` auf `(user_id)`, und die
  Zugriffsregel schneidet ohnehin auf die eigene Person zu.
*/
create or replace function my_learning_days()
returns table (
  local_day date,
  task_count integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    (e.recorded_at at time zone s.time_zone)::date as local_day,
    count(*)::integer                              as task_count
  from progress_events e
  join learner_settings s on s.user_id = e.user_id
  where e.user_id = auth.uid()
    and s.time_zone is not null
  group by 1
  order by 1;
$$;

comment on function my_learning_days() is
  'Aufgaben je lokalem Kalendertag, nur die eigenen, nur aus '
  'progress_events.recorded_at (E28). Ohne bestätigte Zeitzone leer. '
  'Keine Parameter.';

-- ----------------------------------------------------------- Die Rechte

/*
  Beide laufen mit den Rechten der **aufrufenden** Person.

  Kein `security definer`, und das ist hier wichtiger als sonst: Diese
  Funktionen lesen `progress_events` und `learner_settings` – die beiden
  Tabellen, auf denen die Zusage des ganzen Produkts steht. Mit
  Eigentümerrechten müssten sie jede Zugriffsregel selbst nachbauen, und der
  Nachbau wäre der Ort, an dem eines Tages eine Zeile fehlt.

  Seit Migration 10 ist eine neue Funktion von sich aus für niemanden
  ausführbar. Die `revoke`-Zeilen stehen trotzdem da: Sie machen aus einer
  Eigenschaft der Umgebung eine Aussage dieser Migration.

  `service_role` bekommt sie nicht. Unter dem Secret Key ist `auth.uid()`
  leer, die Funktionen gäben nichts zurück – aber nutzlos und nicht vergeben
  sind zwei verschiedene Dinge, und nur das zweite bleibt richtig.
*/
revoke all on function my_local_today() from public, anon, service_role;
revoke all on function my_learning_days() from public, anon, service_role;
grant execute on function my_local_today() to authenticated;
grant execute on function my_learning_days() to authenticated;
