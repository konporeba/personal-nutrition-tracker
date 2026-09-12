// Local-calendar-day arithmetic: the one place "which day is this instant in"
// is answered, and the one place a day key from *outside* the app is let back
// in.
//
// `localDayKey` moved here from `data/query-keys.ts` so `lib/` can own the whole
// notion of a local day without reaching up into the data layer — the timestamp
// helpers in `logged-at-for-day.ts` are pure and have no business importing a
// query-key module. The old home re-exports it, so every existing import site
// (`week-rail.tsx`, `daily-targets.repo.ts`, `use-analytics.ts`) is untouched.

/**
 * A day is a *local calendar day*, matching `listMealEntriesForDay`'s bucketing.
 * Keying on `YYYY-MM-DD` in the device tz (never an ISO instant) means every
 * render during the same day resolves to one cache entry.
 */
export function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of `date`'s own day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * `date` shifted by whole local days, anchored to midnight.
 *
 * Midnight-anchored rather than time-preserving on purpose: every caller is a
 * day *picker*, and carrying a time component through a DST boundary is how a
 * "minus one day" step lands 23 hours earlier and reads as the same day.
 */
export function addLocalDays(date: Date, delta: number): Date {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + delta);
  return next;
}

/** Same local calendar day? Compared through the key, so the tz rule is stated once. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b);
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Read a `YYYY-MM-DD` day key back into a local-midnight `Date`, or `undefined`
 * when it isn't one.
 *
 * This is the app's trust boundary for a day arriving from outside — a route
 * param, a deep link, a hand-edited URL — and it enforces the one rule the rest
 * of the feature relies on: **a day is never in the future**. A future key is
 * clamped back to today rather than rejected, so a stale or edited link still
 * lands somewhere sensible instead of dropping the owner on an error.
 *
 * Two traps it exists to close:
 *
 * - `new Date('2026-09-10')` parses as UTC midnight, which resolves to the
 *   *previous* local day anywhere west of Greenwich. The parts are split and
 *   fed to the local `Date(y, m, d)` constructor instead, never to `Date.parse`.
 * - `new Date(2026, 1, 31)` doesn't fail on an impossible date, it silently
 *   rolls forward to March 3. The only way to detect that is to ask what came
 *   back, so the result is round-tripped through `localDayKey` and compared.
 */
export function parseLocalDayKey(
  key: string | undefined,
  now: Date = new Date()
): Date | undefined {
  if (!key) return undefined;

  const match = DAY_KEY.exec(key);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (localDayKey(parsed) !== key) return undefined;

  const today = startOfLocalDay(now);
  return parsed.getTime() > today.getTime() ? today : parsed;
}
