// The React-facing seam over `profile.repo.ts` plus the derivation. Screens read
// the profile row and the effective targets from here and never touch the repo or
// the derivation directly, so "override ?? derived" is resolved in exactly one
// place (effective-targets.ts) for both the Profile screen and Today.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { upsertDailyTarget } from '@/data/daily-targets.repo';
import { useLatestBodyWeight } from '@/data/use-body-weights';
import { getProfile, upsertProfile } from '@/data/profile.repo';
import { queryKeys } from '@/data/query-keys';
import type { ProfilePatch } from '@/data/types';
import type { Targets } from '@/lib/derive-targets';
import { effectiveTargets, overriddenTargetFields } from '@/lib/effective-targets';

/** The single profile row, or null when it hasn't been created yet. */
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => getProfile(),
  });
}

/** What `useTargets` reports — enough for both the form and Today's fallback. */
export type TargetsView = {
  /** The effective targets, or null when they can't be derived yet. */
  targets: Targets | null;
  /** Which target fields are currently overridden (for the UI's marker). */
  overridden: Set<keyof Targets>;
  /** No profile row exists yet — prompt the owner to set up their stats. */
  needsProfile: boolean;
  /** Profile exists but no weight logged — the recoverable "needs weight" state. */
  needsWeight: boolean;
  isPending: boolean;
  isError: boolean;
};

/**
 * The effective daily targets, composed from the profile row and the latest
 * weight through `effectiveTargets`. Current weight lives in the body_weights
 * series (not the profile), so this reads both and reports which recoverable
 * state it is in when targets can't be derived: no profile, or no weight yet.
 *
 * Also the one place that keeps *today's* `daily_targets` snapshot live-synced
 * (S-11 / historical-targets fix): every time the derived+override targets
 * settle to a new value, it's upserted onto today's row via
 * `upsertDailyTarget` — the true-upsert exception to that table's otherwise
 * immutable, insert-once contract. This is what makes a Profile edit visible
 * on today's dashboard immediately, and what leaves the correct final value
 * behind once the day is over and every other reader (`ensureDailyTarget`)
 * refuses to touch it again.
 */
export function useTargets(): TargetsView {
  const profileQuery = useProfile();
  const latestWeightQuery = useLatestBodyWeight();

  const isPending = profileQuery.isPending || latestWeightQuery.isPending;
  const isError = profileQuery.isError || latestWeightQuery.isError;

  const profile = profileQuery.data ?? null;
  const latestWeight = latestWeightQuery.data ?? null;

  const targets =
    !isPending && !isError && profile && latestWeight
      ? effectiveTargets(profile, latestWeight.weight_kg)
      : null;
  // Deps are the primitive fields, not `targets` itself — a fresh object
  // every render would otherwise fire this on every render, not just on an
  // actual change.
  const targetsKey = targets ? JSON.stringify(targets) : '';

  useEffect(() => {
    if (!targets) return;
    upsertDailyTarget(new Date(), targets).catch((err) => {
      console.error('[use-profile] upsertDailyTarget (today) failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey]);

  if (isPending || isError || !profile) {
    return {
      targets: null,
      overridden: new Set(),
      needsProfile: !isPending && !isError && !profile,
      needsWeight: false,
      isPending,
      isError,
    };
  }

  if (!latestWeight) {
    return {
      targets: null,
      overridden: overriddenTargetFields(profile),
      needsProfile: false,
      needsWeight: true,
      isPending: false,
      isError: false,
    };
  }

  return {
    targets,
    overridden: overriddenTargetFields(profile),
    needsProfile: false,
    needsWeight: false,
    isPending: false,
    isError: false,
  };
}

/** Save the profile (stats + overrides). Invalidates the profile/targets key. */
export function useUpsertProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: ProfilePatch) => upsertProfile(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}
