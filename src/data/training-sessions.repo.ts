// The single reusable data seam over `supabase` for training sessions (S-09).
// All query logic for training sessions lives here — screens, the smoke
// script, and later slices go through these functions and never touch the
// client directly. Mirrors meal-entries.repo.ts exactly.
import { newId } from '@/lib/new-id';
import { supabase } from '@/lib/supabase';
import type { NewTrainingSession, TrainingSession, TrainingSessionPatch } from '@/data/types';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Create a training session. Generates the UUID client-side (expo-crypto) so
 * callers can insert optimistically; the column still defaults to
 * `gen_random_uuid()` server-side if `id` is omitted upstream.
 */
export async function createTrainingSession(
  input: NewTrainingSession,
): Promise<TrainingSession> {
  const owner_id = await requireOwnerId();
  const row = {
    id: input.id ?? newId(),
    owner_id,
    logged_at: input.logged_at,
    session_type: input.session_type,
    intensity: input.intensity,
    duration_minutes: input.duration_minutes,
    burn_kcal: input.burn_kcal,
  };
  const { data, error } = await supabase
    .from('training_sessions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

/**
 * List a day's sessions. Converts a local calendar `date` into a `[start, end)`
 * UTC range in the owner's local timezone (the device tz), identical to
 * `listMealEntriesForDay`'s convention, then filters that range and
 * `deleted_at IS NULL`. Owner scoping is enforced by RLS, so no explicit
 * owner_id filter is needed.
 */
export async function listTrainingSessionsForDay(date: Date): Promise<TrainingSession[]> {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TrainingSession[];
}

/**
 * List every session across a whole date range in one query, rather than one
 * query per day. Same `[start, end)` local-tz half-open convention as
 * `listTrainingSessionsForDay`, applied once to the range's two edges.
 */
export async function listTrainingSessionsForRange(
  startDate: Date,
  endDate: Date,
): Promise<TrainingSession[]> {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TrainingSession[];
}

/** Update mutable fields. `updated_at` is advanced by the server trigger, not here. */
export async function updateTrainingSession(
  id: string,
  patch: TrainingSessionPatch,
): Promise<TrainingSession> {
  const { data, error } = await supabase
    .from('training_sessions')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

/**
 * Soft-delete: set `deleted_at` so the row drops from every read path but
 * remains in the table. This is what lets a delete propagate across clients
 * without the row resurrecting from a stale cache.
 */
export async function softDeleteTrainingSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('training_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw error;
}
