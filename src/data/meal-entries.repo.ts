// The single reusable data seam over `supabase` for the core log. All query
// logic for meal entries lives here — screens, the smoke script, and later
// slices go through these functions and never touch the client directly.
import { newId } from '@/lib/new-id';
import { supabase } from '@/lib/supabase';
import type { MealEntry, MealEntryPatch, NewMealEntry } from '@/data/types';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Create a meal entry. Generates the UUID client-side (expo-crypto) so callers
 * can insert optimistically; the column still defaults to `gen_random_uuid()`
 * server-side if `id` is omitted upstream.
 */
export async function createMealEntry(input: NewMealEntry): Promise<MealEntry> {
  const owner_id = await requireOwnerId();
  const row = {
    id: input.id ?? newId(),
    owner_id,
    logged_at: input.logged_at,
    section: input.section,
    source: input.source,
    name: input.name,
    calories: input.calories ?? null,
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fat_g: input.fat_g ?? null,
    food_category: input.food_category ?? null,
    estimation_run_id: input.estimation_run_id ?? null,
  };
  const { data, error } = await supabase.from('meal_entries').insert(row).select().single();
  if (error) throw error;
  return data as MealEntry;
}

/**
 * List a day's entries. Converts a local calendar `date` into a `[start, end)`
 * UTC range in the owner's local timezone (the device tz), per the Phase 1
 * day-boundary convention, then filters that range and `deleted_at IS NULL`.
 * Owner scoping is enforced by RLS, so no explicit owner_id filter is needed.
 */
export async function listMealEntriesForDay(date: Date): Promise<MealEntry[]> {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const { data, error } = await supabase
    .from('meal_entries')
    .select('*')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MealEntry[];
}

/**
 * List every entry across a whole date range in one query, rather than one
 * query per day. Same `[start, end)` local-tz half-open convention as
 * `listMealEntriesForDay`, applied once to the range's two edges: local-day
 * start of `startDate` to local-day start of the day *after* `endDate`.
 */
export async function listMealEntriesForRange(
  startDate: Date,
  endDate: Date,
): Promise<MealEntry[]> {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);
  const { data, error } = await supabase
    .from('meal_entries')
    .select('*')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MealEntry[];
}

/**
 * Every live entry's `logged_at`, and nothing else. This is the one read that
 * has to span the owner's entire history — the logging streak (FR-030) can be
 * arbitrarily long, so it cannot be bounded by a rolling window the way
 * `listMealEntriesForRange` is. Selecting a single column keeps that
 * affordable: it is one timestamp per entry, not a full row.
 */
export async function listMealEntryTimestamps(): Promise<string[]> {
  const { data, error } = await supabase
    .from('meal_entries')
    .select('logged_at')
    .is('deleted_at', null)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.logged_at as string);
}

/** Update mutable fields. `updated_at` is advanced by the server trigger, not here. */
export async function updateMealEntry(id: string, patch: MealEntryPatch): Promise<MealEntry> {
  const { data, error } = await supabase
    .from('meal_entries')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data as MealEntry;
}

/**
 * Soft-delete: set `deleted_at` so the row drops from every read path but
 * remains in the table. This is what lets a delete propagate across clients
 * without the row resurrecting from a stale cache.
 */
export async function softDeleteMealEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('meal_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw error;
}
