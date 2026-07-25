// The React-facing seam over `body-weights.repo.ts`. Screens import from here and
// never from the repo directly. Every weight mutation invalidates BOTH the weight
// keys and the profile key: the latest weight is an input to target derivation, so
// a new or deleted reading changes the derived targets the Profile/Today screens show.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createBodyWeight,
  latestBodyWeight,
  listBodyWeights,
  softDeleteBodyWeight,
} from '@/data/body-weights.repo';
import { queryKeys } from '@/data/query-keys';
import type { BodyWeight, NewBodyWeight } from '@/data/types';

/** The full weight series, most-recent first. */
export function useBodyWeights() {
  return useQuery({
    queryKey: queryKeys.bodyWeights.all(),
    queryFn: () => listBodyWeights(),
  });
}

/** The latest reading — the current weight that feeds derivation, or null. */
export function useLatestBodyWeight() {
  return useQuery({
    queryKey: queryKeys.bodyWeights.latest(),
    queryFn: () => latestBodyWeight(),
  });
}

/** Invalidate every read a weight change can move: the list, the latest, and targets. */
function invalidateWeightAndTargets(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.bodyWeights.all() });
  queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
}

/** Log a new reading; re-derives targets by invalidating the profile key. */
export function useCreateBodyWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewBodyWeight) => createBodyWeight(input),
    onSuccess: () => invalidateWeightAndTargets(queryClient),
  });
}

/** Soft-delete a reading; the latest may fall back to a prior one, so re-derive. */
export function useDeleteBodyWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (weight: Pick<BodyWeight, 'id'>) => {
      await softDeleteBodyWeight(weight.id);
      return weight;
    },
    onSuccess: () => invalidateWeightAndTargets(queryClient),
  });
}
