// The single reusable data seam over `supabase` for the body-weight series
// (FR-023). All query logic for weight readings lives here — screens, the smoke
// script, and later slices go through these functions and never touch the
// client directly. The latest live reading is the source of truth for "current
// weight" and feeds target derivation.
import { newId } from '@/lib/new-id';
import { supabase } from '@/lib/supabase';
import type { BodyWeight, NewBodyWeight } from '@/data/types';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Create a body-weight reading. Generates the UUID client-side (expo-crypto) so
 * callers can insert optimistically; the column still defaults to
 * `gen_random_uuid()` server-side if `id` is omitted upstream.
 */
export async function createBodyWeight(input: NewBodyWeight): Promise<BodyWeight> {
  const owner_id = await requireOwnerId();
  const row = {
    id: input.id ?? newId(),
    owner_id,
    weight_kg: input.weight_kg,
    measured_at: input.measured_at,
  };
  const { data, error } = await supabase.from('body_weights').insert(row).select().single();
  if (error) throw error;
  return data as BodyWeight;
}

/**
 * List the weight series, most-recent first, over live rows. Owner scoping is
 * enforced by RLS.
 */
export async function listBodyWeights(): Promise<BodyWeight[]> {
  const { data, error } = await supabase
    .from('body_weights')
    .select('*')
    .is('deleted_at', null)
    .order('measured_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BodyWeight[];
}

/**
 * The latest live reading (highest `measured_at`), or `null` if none exists.
 * This is the "current weight" that feeds derivation.
 */
export async function latestBodyWeight(): Promise<BodyWeight | null> {
  const { data, error } = await supabase
    .from('body_weights')
    .select('*')
    .is('deleted_at', null)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as BodyWeight | null) ?? null;
}

/**
 * Soft-delete: set `deleted_at` so the reading drops from every read path but
 * remains in the table. This is what lets a delete propagate across clients
 * without the row resurrecting from a stale cache.
 */
export async function softDeleteBodyWeight(id: string): Promise<void> {
  const { error } = await supabase
    .from('body_weights')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw error;
}
