// The single reusable data seam over `supabase` for daily-target snapshots
// (S-11). All query logic for `daily_targets` lives here — screens, the
// smoke script, and later slices go through these functions and never touch
// the client directly.
import { supabase } from '@/lib/supabase';
import type { Targets } from '@/lib/derive-targets';
import type { DailyTarget } from '@/data/types';
import { localDayKey } from '@/data/query-keys';

/** The owner uid for RLS-checked writes; read from the persisted session (no network). */
async function requireOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('No authenticated owner session');
  return uid;
}

/**
 * Every snapshot in the inclusive `[startDay, endDay]` local-calendar range.
 * Unlike `listMealEntriesForDay`'s `[start, end)` instant range, `day` is
 * already a plain calendar date, so the bounds compare directly as
 * `YYYY-MM-DD` strings — inclusive on both ends, not half-open.
 */
export async function getDailyTargetsForRange(
  startDay: Date,
  endDay: Date,
): Promise<DailyTarget[]> {
  const { data, error } = await supabase
    .from('daily_targets')
    .select('*')
    .gte('day', localDayKey(startDay))
    .lte('day', localDayKey(endDay))
    .is('deleted_at', null)
    .order('day', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailyTarget[];
}

/**
 * Insert-if-absent, never-update: writes a snapshot for `day` only if one
 * doesn't already exist, then re-selects so the return value is always the
 * *stored* row — the first-ever snapshot for that day, never silently the
 * caller's input when a row already existed. `ignoreDuplicates` relies on the
 * `(owner_id, day)` unique index being a plain (non-partial) index — see the
 * migration's comment for why a partial index would break `ON CONFLICT`
 * inference here.
 */
export async function ensureDailyTarget(day: Date, targets: Targets): Promise<DailyTarget> {
  const owner_id = await requireOwnerId();
  const dayKey = localDayKey(day);

  const { error: upsertError } = await supabase.from('daily_targets').upsert(
    {
      owner_id,
      day: dayKey,
      calories: targets.calories,
      protein_g: targets.protein_g,
      carbs_g: targets.carbs_g,
      fat_g: targets.fat_g,
    },
    { onConflict: 'owner_id,day', ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;

  const { data, error } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('day', dayKey)
    .is('deleted_at', null)
    .single();
  if (error) throw error;
  return data as DailyTarget;
}
