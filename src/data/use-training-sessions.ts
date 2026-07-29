// The React-facing seam over `training-sessions.repo.ts`. Screens import from
// here and never from the repo directly, mirroring use-meal-entries.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTrainingSession,
  listTrainingSessionsForDay,
  softDeleteTrainingSession,
  updateTrainingSession,
} from '@/data/training-sessions.repo';
import { queryKeys } from '@/data/query-keys';
import type { NewTrainingSession, TrainingSession, TrainingSessionPatch } from '@/data/types';

/**
 * The sessions for one local calendar day, default today. Returns the resolved
 * `day` alongside the query, same re-derive-per-render rationale as
 * `useDayEntries` — the instant is re-derived on every render rather than
 * captured once, so a session held open across midnight doesn't keep
 * observing yesterday's key.
 */
export function useDaySessions(date?: Date) {
  const day = date ?? new Date();

  const query = useQuery({
    queryKey: queryKeys.trainingSessions.day(day),
    queryFn: () => listTrainingSessionsForDay(day),
  });

  return { query, day };
}

/**
 * Log a new session. Invalidates the day it actually landed in (from
 * `logged_at`), not "today", matching `useCreateMealEntry`'s pattern.
 */
export function useCreateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewTrainingSession) => createTrainingSession(input),
    onSuccess: (session) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingSessions.day(new Date(session.logged_at)),
      });
    },
  });
}

/** Edit a committed session's fields. Same invalidate-by-`logged_at` pattern. */
export function useUpdateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Pick<TrainingSession, 'id' | 'logged_at'> & { patch: TrainingSessionPatch }) =>
      updateTrainingSession(input.id, input.patch),
    onSuccess: (session) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingSessions.day(new Date(session.logged_at)),
      });
    },
  });
}

/**
 * Soft-delete a session. Takes the whole session rather than an id so the day
 * key to invalidate is derivable without a second read.
 */
export function useDeleteTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: Pick<TrainingSession, 'id' | 'logged_at'>) => {
      await softDeleteTrainingSession(session.id);
      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingSessions.day(new Date(session.logged_at)),
      });
    },
  });
}
