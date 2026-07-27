// The React-facing seam over `saved-meals.repo.ts`. Screens import from here and
// never from the repo directly, which keeps the "UI never touches supabase" rule
// intact one layer up and puts every cache invalidation in a single file.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createSavedMeal,
  listSavedMeals,
  softDeleteSavedMeal,
  updateSavedMeal,
} from '@/data/saved-meals.repo';
import { queryKeys } from '@/data/query-keys';
import type { NewSavedMeal, SavedMeal, SavedMealPatch } from '@/data/types';

/** The full saved-meals library, alphabetical. Behind the shared 5-minute `staleTime`. */
export function useSavedMeals() {
  return useQuery({
    queryKey: queryKeys.savedMeals.all(),
    queryFn: () => listSavedMeals(),
  });
}

/** Save a meal to the library. */
export function useCreateSavedMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewSavedMeal) => createSavedMeal(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals.all() });
    },
  });
}

/** Edit a saved meal's fields. Never touches any entry already logged from it. */
export function useUpdateSavedMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; patch: SavedMealPatch }) =>
      updateSavedMeal(input.id, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals.all() });
    },
  });
}

/**
 * Soft-delete a saved meal. Takes the whole entity rather than an id, matching
 * `useDeleteMealEntry`'s convention (there's no per-entity cache key here to
 * derive, but the shape stays consistent with the rest of the data layer).
 */
export function useDeleteSavedMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (savedMeal: Pick<SavedMeal, 'id'>) => {
      await softDeleteSavedMeal(savedMeal.id);
      return savedMeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals.all() });
    },
  });
}
