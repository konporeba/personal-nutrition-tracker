// Insert seam for `estimation_runs`. The store exists now (Phase 1) so F-02's AI
// estimation proxy can write into it without a schema change; this slice ships no
// estimation logic, only the reusable insert.
import { supabase } from '@/lib/supabase';
import type { EstimationRun, NewEstimationRun } from '@/data/types';

async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/** Record one estimation run (immutable). Returns the persisted row. */
export async function createEstimationRun(input: NewEstimationRun): Promise<EstimationRun> {
  const owner_id = await requireOwnerId();
  const { data, error } = await supabase
    .from('estimation_runs')
    .insert({
      owner_id,
      source: input.source,
      input_summary: input.input_summary ?? null,
      raw_result: input.raw_result ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as EstimationRun;
}
