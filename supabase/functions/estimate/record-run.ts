// Records one immutable `estimation_runs` row under the caller's RLS. Mirrors
// the client-side `createEstimationRun` repo (src/data/estimation-runs.repo.ts):
// `owner_id` has no DB default, so it is set explicitly to the authenticated
// owner's id — which must equal `auth.uid()` for the RLS insert policy to pass.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { EntrySource } from './types.ts';

export type NewRun = {
  source: EntrySource;
  input_summary: string | null;
  raw_result: unknown;
};

/** Insert one estimation run and return its id. Throws on insert failure. */
export async function recordEstimationRun(
  supabase: SupabaseClient,
  ownerId: string,
  run: NewRun,
): Promise<string> {
  const { data, error } = await supabase
    .from('estimation_runs')
    .insert({
      owner_id: ownerId,
      source: run.source,
      input_summary: run.input_summary,
      raw_result: run.raw_result,
    })
    .select('id')
    .single();

  if (error) throw new Error(`record estimation_run failed: ${error.message}`);
  return (data as { id: string }).id;
}
