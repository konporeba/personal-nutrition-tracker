// The React-facing seam over `meal-entries.repo.ts`. Screens import from here and
// never from the repo directly, which keeps the "UI never touches supabase" rule
// intact one layer up and puts every cache invalidation in a single file.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMealEntry,
  listMealEntriesForDay,
  softDeleteMealEntry,
  updateMealEntry,
} from '@/data/meal-entries.repo';
import { queryKeys } from '@/data/query-keys';
import type { MealEntry, MealEntryPatch, NewMealEntry, Section } from '@/data/types';

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
 */
export function useCreateMealEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewMealEntry) => createMealEntry(input),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
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
    },
  });
}

/**
 * Move an entry into a different section (FR-064). Same invalidation pattern
 * as `useDeleteMealEntry` — the day key comes from the entry's own
 * `logged_at`, so the move is reflected wherever it actually landed.
 */
export function useUpdateMealEntrySection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Pick<MealEntry, 'id' | 'logged_at'> & { section: Section }) =>
      updateMealEntry(input.id, { section: input.section }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
    },
  });
}

/**
 * Edit a committed entry's fields (S-07) — name, macros, food_category, or
 * any other `MealEntryPatch` field. Same invalidate-by-`logged_at` pattern as
 * `useUpdateMealEntrySection`. Callers must never include `source` in the
 * patch: editing a value never erases how the entry was originally captured.
 */
export function useUpdateMealEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Pick<MealEntry, 'id' | 'logged_at'> & { patch: MealEntryPatch }) =>
      updateMealEntry(input.id, input.patch),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
    },
  });
}
