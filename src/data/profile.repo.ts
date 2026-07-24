// The single reusable data seam over `supabase` for the owner profile. All
// query logic for the profile row lives here — screens, the smoke script, and
// later slices go through these functions and never touch the client directly.
//
// The profile is a single row keyed by `owner_id` (PK). Reads filter
// `deleted_at IS NULL`; writes upsert on the PK so "save profile" is one call
// whether or not a row exists yet.
import { supabase } from '@/lib/supabase';
import type { Profile, ProfilePatch } from '@/data/types';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Fetch the single profile row, or `null` if none exists yet (or it was
 * soft-deleted). Owner scoping is enforced by RLS. `maybeSingle` returns null
 * rather than erroring on zero rows.
 */
export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profile')
    .select('*')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

/**
 * Insert-or-update the profile on its `owner_id` PK. Only the fields present in
 * `patch` are written; overrides passed as `null` reset that target to derived.
 * `updated_at` is advanced by the server trigger, not here.
 */
export async function upsertProfile(patch: ProfilePatch): Promise<Profile> {
  const owner_id = await requireOwnerId();
  const { data, error } = await supabase
    .from('profile')
    .upsert({ owner_id, ...patch }, { onConflict: 'owner_id' })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
