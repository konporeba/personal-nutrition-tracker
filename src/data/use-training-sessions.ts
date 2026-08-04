// The React-facing seam over `training-sessions.repo.ts`. Screens import from
// here and never from the repo directly, mirroring use-meal-entries.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ensureDailyTarget } from '@/data/daily-targets.repo';
import {
  createTrainingSession,
  listAllTrainingSessions,
  listTrainingSessionsForDay,
  softDeleteTrainingSession,
  updateTrainingSession,
} from '@/data/training-sessions.repo';
import { queryKeys } from '@/data/query-keys';
import type { NewTrainingSession, TrainingSession, TrainingSessionPatch } from '@/data/types';
import type { Targets } from '@/lib/derive-targets';

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

/** The full session history, most-recent first — the Training tab's list. */
export function useAllTrainingSessions() {
  return useQuery({
    queryKey: queryKeys.trainingSessions.all(),
    queryFn: () => listAllTrainingSessions(),
  });
}

/**
 * Log a new session. Invalidates the whole `training-sessions` prefix — which
 * covers both the all-time history list and any day-specific query, since
 * every `.day(...)` key is nested under `.all()` — rather than just the day it
 * landed in, matching `useCreateMealEntry`'s pattern but broadened for the
 * history list.
 *
 * `targets` mirrors `useCreateMealEntry`'s forward-path daily-target snapshot
 * capture (S-11) — see that function's doc comment for the full rationale.
 */
export function useCreateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { input: NewTrainingSession; targets: Targets | null }) =>
      createTrainingSession(variables.input),
    onSuccess: (session, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingSessions.all() });
      // A session is "something logged" too, so it can extend the streak on a
      // day with no meals on it — see `use-streak.ts`.
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
      if (variables.targets) {
        ensureDailyTarget(new Date(session.logged_at), variables.targets).catch((err) => {
          console.error('[use-training-sessions] ensureDailyTarget failed:', err);
        });
      }
    },
  });
}

/** Edit a committed session's fields. Same broad-invalidate pattern. */
export function useUpdateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Pick<TrainingSession, 'id' | 'logged_at'> & { patch: TrainingSessionPatch }) =>
      updateTrainingSession(input.id, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingSessions.all() });
      // An edited burn moves the day's net, so the rail and the charts are as
      // stale as the session list is.
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}

/** Soft-delete a session. Same broad-invalidate pattern. */
export function useDeleteTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: Pick<TrainingSession, 'id' | 'logged_at'>) => {
      await softDeleteTrainingSession(session.id);
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingSessions.all() });
      // Deleting the only thing logged on a day can shorten the streak.
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}
