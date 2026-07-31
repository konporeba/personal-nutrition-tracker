// The one place TanStack Query cache keys are constructed. Keys built ad-hoc at
// each call site drift, and a drifted key is the classic cause of a day total
// that doesn't move after a write — the invalidation targets a key nothing reads.
// Every hook in `src/data/use-*.ts` builds its keys from here.

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

export const queryKeys = {
  mealEntries: {
    /** Prefix covering every meal-entry query — invalidate to refresh them all. */
    all: () => ['meal-entries'] as const,
    day: (date: Date) => ['meal-entries', 'day', localDayKey(date)] as const,
  },
  /**
   * The single owner profile row (stats + overrides). Targets are derived from
   * this plus the latest weight, so a weight write invalidates this key too.
   */
  profile: () => ['profile'] as const,
  bodyWeights: {
    /** Prefix covering every weight query — invalidate to refresh them all. */
    all: () => ['body-weights'] as const,
    /** The latest reading — the "current weight" that feeds derivation. */
    latest: () => ['body-weights', 'latest'] as const,
  },
  savedMeals: {
    /** The full saved-meals library — a flat list, no day bucketing. */
    all: () => ['saved-meals'] as const,
  },
  trainingSessions: {
    /** Prefix covering every training-session query — invalidate to refresh them all. */
    all: () => ['training-sessions'] as const,
    day: (date: Date) => ['training-sessions', 'day', localDayKey(date)] as const,
  },
  analytics: {
    /** One rolling window's combined range read (S-11) — entries, sessions, and target snapshots. */
    range: (windowDays: number, startDay: Date, endDay: Date) =>
      ['analytics', 'range', windowDays, localDayKey(startDay), localDayKey(endDay)] as const,
  },
  /**
   * A staged estimate, seeded by the composer and read by the review screen.
   * Keyed by the recorded `runId`, so the review route is only reachable with a
   * real run behind it.
   */
  estimate: (runId: string) => ['estimate', runId] as const,
  /**
   * The captured evidence photo — label scan (S-03) or plate photo (S-04) —
   * staged alongside its estimate so review can upload it after commit
   * without the bytes travelling through the URL.
   */
  capturedPhoto: (runId: string) => ['captured-photo', runId] as const,
} as const;
