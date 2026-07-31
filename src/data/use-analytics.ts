// The React-facing seam composing the ranged repo reads, the daily-targets
// backfill, and the day-grouping into one hook per rolling window (S-11).
// Screens read from here and never touch the range repos or `ensureDailyTarget`
// directly, mirroring every other `use-*.ts` seam in this codebase.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ensureDailyTarget, getDailyTargetsForRange } from '@/data/daily-targets.repo';
import { listMealEntriesForRange } from '@/data/meal-entries.repo';
import { localDayKey, queryKeys } from '@/data/query-keys';
import { listTrainingSessionsForRange } from '@/data/training-sessions.repo';
import type { DailyTarget } from '@/data/types';
import { useTargets } from '@/data/use-profile';
import { computeDayLedger, type DayLedger } from '@/lib/day-ledger';
import { groupByLocalDay } from '@/lib/group-by-local-day';

/** One day's ledger, plus the calendar day it answers for. */
export type AnalyticsDay = DayLedger & { day: Date };

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

/** Every local calendar day from `startDay` to `endDay`, inclusive. */
function daysInRange(startDay: Date, endDay: Date): Date[] {
  const days: Date[] = [];
  for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * One rolling window (7 or 30 trailing days, inclusive of today) of combined
 * intake/expenditure/target data, one entry per day, gap-free.
 *
 * `endDay` — the window's trailing edge — is resolved fresh on every render,
 * the same re-derive-per-render convention `useDayEntries`/`useDaySessions`
 * follow (see `context/foundation/lessons.md`): a session held open across
 * midnight must see the window roll forward, not keep observing yesterday's
 * range.
 *
 * Days missing a `daily_targets` snapshot (pre-existing days from before this
 * feature shipped) are backfilled lazily, once per render where they're still
 * missing, using the *current* effective target as a best-effort stand-in —
 * the only data available, since there's no profile version history. This is
 * the second of `ensureDailyTarget`'s two write paths; the first is the
 * forward-path capture in `useCreateMealEntry`/`useCreateTrainingSession`.
 */
export function useAnalyticsRange(windowDays: 7 | 30) {
  const endDay = new Date();
  const startDay = addDays(endDay, -(windowDays - 1));
  const days = daysInRange(startDay, endDay);

  const { targets: currentTargets } = useTargets();

  const query = useQuery({
    queryKey: queryKeys.analytics.range(windowDays, startDay, endDay),
    queryFn: async () => {
      const [entries, sessions, snapshots] = await Promise.all([
        listMealEntriesForRange(startDay, endDay),
        listTrainingSessionsForRange(startDay, endDay),
        getDailyTargetsForRange(startDay, endDay),
      ]);
      return { entries, sessions, snapshots };
    },
  });

  const entryBuckets = groupByLocalDay(
    query.data?.entries ?? [],
    (entry) => new Date(entry.logged_at),
    days,
  );
  const sessionBuckets = groupByLocalDay(
    query.data?.sessions ?? [],
    (session) => new Date(session.logged_at),
    days,
  );
  const snapshotByDay = new Map<string, DailyTarget>(
    (query.data?.snapshots ?? []).map((snapshot) => [snapshot.day, snapshot]),
  );

  const missingDays = days.filter((day) => !snapshotByDay.has(localDayKey(day)));
  const missingDaysKey = missingDays.map((day) => localDayKey(day)).join(',');
  const targetsKey = currentTargets ? JSON.stringify(currentTargets) : '';

  // Fire-and-forget: a snapshot write here never blocks or alters this
  // render — the fallback below already uses `currentTargets`, the same
  // value being persisted, so there is nothing to wait on.
  useEffect(() => {
    if (!currentTargets || missingDays.length === 0 || !query.isSuccess) return;
    for (const day of missingDays) {
      ensureDailyTarget(day, currentTargets).catch((err) => {
        console.error('[use-analytics] ensureDailyTarget backfill failed:', err);
      });
    }
    // Re-derived primitives, not the array/object references, are the real
    // dependencies — `missingDays`/`currentTargets` get a new identity every
    // render even when unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDaysKey, targetsKey, query.isSuccess]);

  const analyticsDays: AnalyticsDay[] = days.map((day, index) => {
    const snapshot = snapshotByDay.get(localDayKey(day));
    const target = snapshot ? snapshot.calories : (currentTargets?.calories ?? null);
    return { day, ...computeDayLedger(entryBuckets[index], sessionBuckets[index], target) };
  });

  return {
    days: analyticsDays,
    endDay,
    isPending: query.isPending,
    isError: query.isError,
  };
}
