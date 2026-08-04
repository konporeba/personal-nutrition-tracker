// The React-facing seam over the two whole-history timestamp reads that feed
// the logging streak. Screens import from here and never from the repos
// directly, matching every other `use-*.ts` seam in this codebase.
import { useQuery } from '@tanstack/react-query';

import { listMealEntryTimestamps } from '@/data/meal-entries.repo';
import { queryKeys } from '@/data/query-keys';
import { listTrainingSessionTimestamps } from '@/data/training-sessions.repo';
import { computeLoggingStreak } from '@/lib/streak';

/**
 * How many days in a row the owner has logged something. Both reads are
 * whole-history and therefore the app's widest queries, so they are folded
 * into one query key with the shared 5-minute `staleTime` behind them — the
 * streak is a motivational number, not a live counter, and it is invalidated
 * explicitly by the writes that can move it.
 *
 * `today` is re-derived on every render, the convention this codebase follows
 * for anything day-scoped (see `useDayEntries`): a session held open across
 * midnight must see the streak roll forward rather than keep answering for
 * yesterday.
 */
export function useLoggingStreak() {
  const query = useQuery({
    queryKey: queryKeys.streak(),
    queryFn: async () => {
      const [meals, sessions] = await Promise.all([
        listMealEntryTimestamps(),
        listTrainingSessionTimestamps(),
      ]);
      return [...meals, ...sessions];
    },
  });

  return {
    days: computeLoggingStreak(query.data ?? [], new Date()),
    isPending: query.isPending,
    isError: query.isError,
  };
}
