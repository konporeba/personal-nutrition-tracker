// What `logged_at` does a record aimed at a given day get?
//
// One answer, in one place. Before this, three commit sites each hardcoded
// `new Date()` (`review.tsx`, `library.tsx`'s `relog`, the training sheet) and
// a fourth — `library.tsx`'s `logToDay` — built its own "picked day at the
// current clock time", which is the construction that puts a supper at 00:05.
//
// The rule both functions share: **today is never approximated.** A record
// logged into the current day keeps the true instant it was logged at, exactly
// as it always has. Only a day other than today needs a time invented for it,
// and only then does `timeOfDay` come into play.
import { isSameLocalDay } from '@/lib/local-day';
import type { TimeOfDay } from '@/lib/time-for-section';

/**
 * The `logged_at` for a new record targeting `day`.
 *
 * Today → `now` verbatim. Any other day → that calendar day at `timeOfDay`,
 * which callers derive from whatever they have: `timeForSection(section)` for a
 * meal, the current wall clock for a training session (which has no section,
 * and nothing downstream reads a session's time-of-day).
 *
 * `day`'s own time component is ignored — only its calendar date is read — so
 * callers may pass a midnight-anchored picker value or a live `Date` alike.
 */
export function loggedAtForDay(
  day: Date,
  timeOfDay: TimeOfDay,
  now: Date = new Date()
): string {
  if (isSameLocalDay(day, now)) return now.toISOString();

  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    timeOfDay.hours,
    timeOfDay.minutes
  ).toISOString();
}

/**
 * Move an *existing* record's `logged_at` onto `day`, keeping its time of day.
 *
 * The repair half of the feature: a meal that landed on the wrong side of
 * midnight is dragged back without its timestamp being rewritten into something
 * the owner never entered. Preserving seconds and milliseconds too keeps the
 * ledger's ordering stable among entries that share a minute.
 */
export function moveToDay(loggedAt: string, day: Date): string {
  const original = new Date(loggedAt);

  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds()
  ).toISOString();
}
