// The React-facing seam over `meal-entries.repo.ts`. Screens import from here and
// never from the repo directly, which keeps the "UI never touches supabase" rule
// intact one layer up and puts every cache invalidation in a single file.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ensureDailyTarget } from '@/data/daily-targets.repo';
import {
  createMealEntry,
  listMealEntriesForDay,
  softDeleteMealEntry,
  updateMealEntry,
} from '@/data/meal-entries.repo';
import { queryKeys } from '@/data/query-keys';
import type { MealEntry, MealEntryPatch, NewMealEntry } from '@/data/types';
import type { Targets } from '@/lib/derive-targets';

/**
 * The entries for one local calendar day, default today. Behind the shared
 * 5-minute `staleTime` plus fetch-on-focus, so the list catches up with the
 * other client without Realtime.
 *
 * Returns the resolved `day` alongside the query so callers render the day they
 * are actually observing. That pairing is the point: the instant is re-derived
 * on every render rather than captured once, because apps are resumed rather
 * than relaunched. A session held open across midnight would otherwise keep
 * observing yesterday's key — and since a write invalidates the key derived from
 * its own `logged_at`, a meal logged after midnight would invalidate the new
 * day while this screen watched the old one, and never appear at all.
 */
export function useDayEntries(date?: Date) {
  const day = date ?? new Date();

  const query = useQuery({
    queryKey: queryKeys.mealEntries.day(day),
    queryFn: () => listMealEntriesForDay(day),
  });

  return { query, day };
}

/**
 * Commit a reviewed estimate. Invalidates the day the entry actually landed in
 * (from `logged_at`), not "today", so the list and the total move together even
 * if the write straddles midnight.
 *
 * `targets` is the caller's current `useTargets().targets` (or `null` when
 * none can be derived yet) — passed in as a mutation variable rather than
 * read here because `onSuccess` is a plain callback, not a render context, so
 * it cannot call the `useTargets()` hook itself. When present, it captures a
 * `daily_targets` snapshot (S-11) for the day the entry landed in, using
 * whatever the target was *at the moment of this write* — the forward half of
 * `ensureDailyTarget`'s insert-if-absent immutability contract (the other
 * half is `useAnalyticsRange`'s lazy backfill for pre-existing days). Fire-
 * and-forget: a snapshot failure must never block or surface on the entry
 * write itself.
 */
export function useCreateMealEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { input: NewMealEntry; targets: Targets | null }) =>
      createMealEntry(variables.input),
    onSuccess: (entry, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
      // The first entry on a fresh day extends the logging streak; nothing
      // else this hook invalidates would tell the header's streak pill.
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
      if (variables.targets) {
        const day = new Date(entry.logged_at);
        // `setQueryData` too, not just the write — otherwise `useDayTargets`'
        // own query cache for this exact day keeps serving its pre-write
        // result (up to the 5-minute staleTime) instead of the snapshot that
        // now actually exists server-side.
        ensureDailyTarget(day, variables.targets)
          .then((frozen) => queryClient.setQueryData(queryKeys.dailyTargets.day(day), frozen))
          .catch((err) => {
            console.error('[use-meal-entries] ensureDailyTarget failed:', err);
          });
      }
    },
  });
}

/**
 * Soft-delete an entry. Takes the whole entry rather than an id so the day key
 * to invalidate is derivable without a second read.
 */
export function useDeleteMealEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Pick<MealEntry, 'id' | 'logged_at'>) => {
      await softDeleteMealEntry(entry.id);
      return entry;
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
      // Deleting the only thing logged on a day can shorten the streak.
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}

/**
 * Edit a committed entry's fields (S-07) — name, macros, `section`, `logged_at`,
 * or any other `MealEntryPatch` field. Re-sectioning used to have its own hook;
 * it folded into this one when the detail popup started saving the section
 * alongside everything else, since the patch always carried it.
 *
 * Callers must never include `source` in the patch: editing a value never
 * erases how the entry was originally captured.
 */
export function useUpdateMealEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Pick<MealEntry, 'id' | 'logged_at'> & { patch: MealEntryPatch }) =>
      updateMealEntry(input.id, input.patch),
    onSuccess: (entry, input) => {
      // *Both* days, because the patch may carry a `logged_at` that moves the
      // entry across a day boundary (the midnight repair). Invalidating only
      // the response row's day — which is all this did while an entry could
      // never change days — leaves the day it *left* holding a cached copy, so
      // the entry reads as existing on both days until the next refocus.
      // Same key twice when the day didn't change; TanStack dedupes that.
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(input.logged_at)),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
      // Moving the only entry off a day shortens the streak; moving one into a
      // gap lengthens it. Neither was possible before `logged_at` became
      // editable, which is why this hook alone used not to invalidate it.
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      // An edited calorie figure moves the day's totals, so the week rail's
      // rings and the Analytics charts are as stale as the day list is.
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}
