// The per-day target projection (S-11 / historical-targets fix): the one
// place that decides whether a given calendar day reads its target live from
// the profile or frozen from its `daily_targets` snapshot. `DayView` is the
// only caller — it renders both today and arbitrary past days through the
// same component, and those two need different answers to "what's the
// target": today tracks the profile's live effective target (so a Profile
// edit is visible today, not just from tomorrow — see `useTargets`'s upsert
// side effect), while a past day is judged against whatever was frozen for
// it, never against whatever the profile says now.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ensureDailyTarget, getDailyTargetForDay } from '@/data/daily-targets.repo';
import { queryKeys } from '@/data/query-keys';
import { useTargets } from '@/data/use-profile';
import type { Targets } from '@/lib/derive-targets';
import { isSameLocalDay } from '@/lib/local-day';

export type DayTargetsView = {
  /** The target in force for `date` — today's live target, or the day's frozen snapshot. */
  targets: Targets | null;
  isPending: boolean;
};

/**
 * The effective targets for one specific calendar day, past or present.
 *
 * Today never reads `daily_targets` at all — it returns `useTargets()`
 * directly, the same live value the Profile screen shows, so an override
 * saved a minute ago is reflected immediately.
 *
 * A past day reads its frozen snapshot. A day that predates this feature (or
 * was never touched while it was still "today") has no snapshot yet; this
 * backfills it, same fallback `useAnalyticsRange` already makes — the current
 * live target stands in as the best-effort historical value, since there is
 * no profile version history to recover the real one. While that snapshot is
 * loading or missing, the live target is returned as a placeholder so the day
 * doesn't flash a "no target" state.
 */
export function useDayTargets(date: Date): DayTargetsView {
  const { targets: currentTargets, isPending: currentPending } = useTargets();
  const isToday = isSameLocalDay(date, new Date());

  const snapshotQuery = useQuery({
    queryKey: queryKeys.dailyTargets.day(date),
    queryFn: () => getDailyTargetForDay(date),
    enabled: !isToday,
  });

  const snapshot = isToday ? null : (snapshotQuery.data ?? null);
  const dateKey = queryKeys.dailyTargets.day(date).join(',');
  const targetsKey = currentTargets ? JSON.stringify(currentTargets) : '';

  useEffect(() => {
    if (isToday || !currentTargets || !snapshotQuery.isSuccess || snapshotQuery.data) return;
    ensureDailyTarget(date, currentTargets).catch((err) => {
      console.error('[use-day-targets] ensureDailyTarget backfill failed:', err);
    });
    // Re-derived primitives, not the `date`/`currentTargets` object identities,
    // are the real dependencies — both get a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, dateKey, snapshotQuery.isSuccess, targetsKey]);

  if (isToday) {
    return { targets: currentTargets, isPending: currentPending };
  }

  if (snapshot) {
    return {
      targets: {
        calories: snapshot.calories,
        protein_g: snapshot.protein_g,
        carbs_g: snapshot.carbs_g,
        fat_g: snapshot.fat_g,
      },
      isPending: false,
    };
  }

  return { targets: currentTargets, isPending: snapshotQuery.isPending || currentPending };
}
