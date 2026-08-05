// The React-facing seam over `estimateMeal`, and the one place a fresh estimate
// is staged for the review screen.
//
// The trap this file exists to close: `estimateMeal` *resolves* `{ ok: false }`
// instead of throwing, so a naive `mutationFn` would report every network and
// server failure as a success and push an empty review screen. The failure union
// is converted into a thrown `EstimateFailedError` here, which is what makes
// `mutation.isError` mean what it looks like it means.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { estimateMeal, type EstimateErrorKind } from '@/data/estimation';
import type { EstimateInput } from '@/data/estimation-types';
import { queryKeys } from '@/data/query-keys';

/** A failed estimation, carrying the kind so the UI can word the message. */
export class EstimateFailedError extends Error {
  readonly kind: EstimateErrorKind;

  constructor(kind: EstimateErrorKind) {
    super(`Estimation failed (${kind})`);
    this.name = 'EstimateFailedError';
    this.kind = kind;
  }
}

/**
 * What to tell the owner. Every kind is recoverable by retrying *except*
 * `auth`, whose copy points at the one thing that does work — see
 * `isSessionExpired`.
 */
export function estimateErrorMessage(error: unknown): string {
  const kind = error instanceof EstimateFailedError ? error.kind : 'server';
  switch (kind) {
    case 'network':
      return "Couldn't reach the estimator. Check your connection.";
    case 'quota':
      return 'Too many requests right now. Try again in a moment.';
    case 'auth':
      return 'Your session has expired. Unlock with your PIN to sign back in — nothing you have logged is affected.';
    default:
      return "The estimator couldn't answer. Try again.";
  }
}

/**
 * Whether the failure was a lapsed session rather than anything to do with the
 * estimator. The one failure kind with an action attached instead of a retry:
 * the PIN gate can mint a fresh session from the credentials sealed under the
 * PIN, so locking is a repair here, not a punishment.
 */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof EstimateFailedError && error.kind === 'auth';
}

/**
 * Estimate a meal — free-text (S-01), a photographed label (S-03), or a
 * photographed plate (S-04).
 *
 * Note `recognized: false` is *not* an error — it is a successful estimate with
 * null macros, and the review screen turns it into the manual-entry form (FR-008).
 * Only transport and server failures reject.
 *
 * Mutations don't inherit the query `retry` default, so one submit is exactly one
 * AI call and Retry is always the owner's own decision.
 */
export function useEstimateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: EstimateInput) => {
      const result = await estimateMeal(input);
      if (!result.ok) throw new EstimateFailedError(result.error);
      return result;
    },
    // Stage the estimate under its run id so the review screen can read it
    // without a large object travelling through the URL.
    onSuccess: ({ runId, estimate }) => {
      queryClient.setQueryData(queryKeys.estimate(runId), estimate);
    },
  });
}
