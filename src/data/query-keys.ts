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
   * A staged estimate, seeded by the composer and read by the review screen.
   * Keyed by the recorded `runId`, so the review route is only reachable with a
   * real run behind it.
   */
  estimate: (runId: string) => ['estimate', runId] as const,
} as const;
