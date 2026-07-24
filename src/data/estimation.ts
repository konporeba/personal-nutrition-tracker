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
 */
export type EstimateErrorKind = 'network' | 'quota' | 'server';

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
 */
function classify(error: unknown): EstimateErrorKind {
  if (error instanceof FunctionsFetchError) return 'network';
  if (error instanceof FunctionsHttpError) return statusOf(error) === 429 ? 'quota' : 'server';
  if (error instanceof FunctionsRelayError) return 'server';
  return 'server';
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
 * supabase-js from the persisted session; without one the function answers 401,
 * which surfaces here as `server`.
 *
 * Never throws — every failure is returned as `{ ok: false }`.
 */
export async function estimateMeal(input: EstimateInput): Promise<EstimateResult> {
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
