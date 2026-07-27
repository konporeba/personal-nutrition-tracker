// The single reusable data seam over `supabase` for saved meals (S-08). All
// query logic for saved meals lives here — screens, the smoke script, and
// later slices go through these functions and never touch the client directly.
import { newId } from '@/lib/new-id';
import { supabase } from '@/lib/supabase';
import type { NewSavedMeal, SavedMeal, SavedMealPatch } from '@/data/types';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Create a saved meal. Generates the UUID client-side (expo-crypto) so callers
 * can insert optimistically; the column still defaults to `gen_random_uuid()`
 * server-side if `id` is omitted upstream.
 */
export async function createSavedMeal(input: NewSavedMeal): Promise<SavedMeal> {
  const owner_id = await requireOwnerId();
  const row = {
    id: input.id ?? newId(),
    owner_id,
    name: input.name,
    calories: input.calories ?? null,
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fat_g: input.fat_g ?? null,
    food_category: input.food_category ?? null,
  };
  const { data, error } = await supabase.from('saved_meals').insert(row).select().single();
  if (error) throw error;
  return data as SavedMeal;
}

/** List every saved meal, alphabetically — a browsed/scanned library, not a chronological log. */
export async function listSavedMeals(): Promise<SavedMeal[]> {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SavedMeal[];
}

/** Update mutable fields. `updated_at` is advanced by the server trigger, not here. */
export async function updateSavedMeal(id: string, patch: SavedMealPatch): Promise<SavedMeal> {
  const { data, error } = await supabase
    .from('saved_meals')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data as SavedMeal;
}

/**
 * Soft-delete: set `deleted_at` so the row drops from every read path but
 * remains in the table. This is what lets a delete propagate across clients
 * without the row resurrecting from a stale cache.
 */
export async function softDeleteSavedMeal(id: string): Promise<void> {
  const { error } = await supabase
    .from('saved_meals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw error;
}
