// The single client seam over the `estimate` Edge Function (F-02). This is the
// client analogue of the `*.repo.ts` repository seam: screens, the smoke script,
// and later capture slices (S-03/S-04) call `estimateMeal` and never touch
// `supabase.functions.invoke` directly.
//
// Its other job is to draw the line the UI cares about. An unrecognized input is
// a *successful* estimate carrying null macros (`recognized: false`) — the cue to
// offer manual entry (FR-008), not an error. Only transport and server failures
// come back as `ok: false`.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Estimate, EstimateInput, EstimateRequest } from '@/data/estimation-types';

/**
 * Why no estimate could be produced. `network` and `quota` are worth retrying;
 * `server` covers a rejected request, a failed AI call, or an unusable response.
 * `auth` is the one kind retrying cannot fix — see `requireSession` below.
 */
export type EstimateErrorKind = 'network' | 'quota' | 'server' | 'auth';

/** Success carries the recorded run id so a committed entry can reference it. */
export type EstimateResult =
  | { ok: true; runId: string; estimate: Estimate }
  | { ok: false; error: EstimateErrorKind };

/** HTTP status of a failed invocation, when the failure carried a response. */
function statusOf(error: unknown): number | undefined {
  const context = (error as { context?: unknown })?.context;
  if (typeof context !== 'object' || context === null) return undefined;
  const status = (context as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Map an invocation failure onto the small set the UI can act on.
 *
 * Note: a provider-side rate limit currently reaches us as the function's own
 * 502 (`estimation_failed`), so it maps to `server`. `quota` is reserved for a
 * 429 raised by the platform in front of the function.
 *
 * 401 is `auth`, not `server`. It is the function's owner check (`getUser()` in
 * supabase/functions/estimate/index.ts) refusing a caller it can't identify, and
 * calling that a server fault told the owner to retry something that could only
 * ever fail again.
 */
function classify(error: unknown): EstimateErrorKind {
  if (error instanceof FunctionsFetchError) return 'network';
  if (error instanceof FunctionsHttpError) {
    const status = statusOf(error);
    if (status === 401) return 'auth';
    return status === 429 ? 'quota' : 'server';
  }
  if (error instanceof FunctionsRelayError) return 'server';
  return 'server';
}

/**
 * Whether there is a live owner session to invoke with.
 *
 * This guard exists because `functions.invoke` does *not* fail without one.
 * supabase-js resolves the bearer token via `_getAccessToken`, which falls back
 * to the public anon key when `getSession()` comes back empty:
 *
 *     return (await this._getSessionToken()) ?? this.supabaseKey;
 *
 * The anon key is a valid JWT, so the platform's `verify_jwt` waves it through
 * and the request reaches the function — which then rejects it 401 as an
 * unidentified caller. The round trip is wasted, and the failure arrives
 * looking like the server's fault rather than a lapsed session.
 *
 * Checking first also *repairs* the common case rather than only reporting it:
 * `getSession()` refreshes an expired access token on the way, so a session
 * that is merely stale comes back valid here and the estimate proceeds
 * normally. Only a session that cannot be refreshed reaches the caller as
 * `auth` — which the PIN gate can fix, since the PIN can mint a new one
 * (see lib/credential-vault.ts).
 */
async function hasLiveSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}

/** Reject a malformed payload rather than letting the UI commit garbage. */
function isEstimateResponse(data: unknown): data is { runId: string; estimate: Estimate } {
  if (typeof data !== 'object' || data === null) return false;
  const { runId, estimate } = data as { runId?: unknown; estimate?: unknown };
  if (typeof runId !== 'string' || runId === '') return false;
  if (typeof estimate !== 'object' || estimate === null) return false;
  const { name, recognized } = estimate as { name?: unknown; recognized?: unknown };
  return typeof name === 'string' && typeof recognized === 'boolean';
}

/**
 * Estimate a meal through the server-side proxy. The owner JWT is attached by
 * supabase-js from the persisted session; without one this returns `auth`
 * rather than spending a round trip on a call that cannot succeed.
 *
 * Never throws — every failure is returned as `{ ok: false }`.
 */
export async function estimateMeal(input: EstimateInput): Promise<EstimateResult> {
  if (!(await hasLiveSession())) return { ok: false, error: 'auth' };

  const body: EstimateRequest = { input };

  // `invoke` reports failures via `error` rather than throwing, but the try/catch
  // is what makes the never-throws guarantee independent of that behaviour.
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke('estimate', { body }));
  } catch (err) {
    return { ok: false, error: classify(err) };
  }

  if (error) return { ok: false, error: classify(error) };
  if (!isEstimateResponse(data)) return { ok: false, error: 'server' };

  return { ok: true, runId: data.runId, estimate: data.estimate };
}
