/**
 * Verständliche Formulierung eines Fälligkeitstermins.
 *
 * Lernende sollen nicht ISO-Zeitstempel lesen müssen. Die Ausgabe bleibt
 * bewusst schlicht und ohne Countdown-Dramaturgie.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Ganze Kalendertage zwischen `now` und `date` (0 = heute, 1 = morgen). */
export function calendarDaysUntil(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

/**
 * Beispiele: „heute um 14:30“, „morgen um 09:00“, „in 3 Tagen (Freitag, 6.3.)“,
 * „am 12. Juni 2026“.
 */
export function formatDueDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'zu einem unbekannten Zeitpunkt';

  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const days = calendarDaysUntil(date, now);

  if (days <= 0) return `heute um ${time}`;
  if (days === 1) return `morgen um ${time}`;
  if (days <= 7) {
    const weekday = date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
    return `in ${days} Tagen (${weekday})`;
  }
  return `am ${date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
