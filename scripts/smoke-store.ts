// Smoke test for the synced data backbone (US-07 proof, automated portion).
//
// Authenticates as the owner (creds from the git-ignored .env.local) and drives
// the real repo against the real Supabase project through the full lifecycle:
// create -> list -> update (asserts updated_at advanced = last-write-wins) ->
// soft-delete (asserts it drops from the list but the row persists with
// deleted_at) -> RLS proof (an anonymous client sees nothing). Exits non-zero on
// any failed assertion. Doubles as living documentation of the repo contract.
//
// Run: `npm run smoke` (bundles + runs via scripts/run-smoke.mjs with --env-file).
import { createClient } from '@supabase/supabase-js';

import {
  createMealEntry,
  listMealEntriesForDay,
  softDeleteMealEntry,
  updateMealEntry,
} from '@/data/meal-entries.repo';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 1. Authenticate as the owner.
  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  const today = new Date();
  let createdId: string | undefined;

  try {
    // 2. Create.
    const created = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'lunch',
      source: 'manual',
      name: 'smoke-test meal',
      calories: 500,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 20,
    });
    createdId = created.id;
    assert(created.owner_id === ownerId, 'created row owner_id != owner');
    assert(created.deleted_at === null, 'created row should not be soft-deleted');
    console.log(`✓ created meal_entry ${created.id}`);

    // 3. List for the day — the row must be present.
    const dayList = await listMealEntriesForDay(today);
    assert(
      dayList.some((e) => e.id === created.id),
      'created row not returned by listMealEntriesForDay',
    );
    console.log(`✓ listed day (${dayList.length} row(s)); created row present`);

    // 4. RLS proof — an anonymous client must not see the owner's row.
    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonRead = await anon.from('meal_entries').select('id').limit(5);
    assert(
      (anonRead.data ?? []).length === 0,
      `anon read returned ${anonRead.data?.length} row(s); RLS not enforcing`,
    );
    console.log('✓ RLS: anonymous client sees 0 rows');

    // 5. Update — updated_at must advance (last-write-wins ordering).
    const updated = await updateMealEntry(created.id, { calories: 650 });
    assert(updated.calories === 650, 'update did not persist calories');
    assert(
      new Date(updated.updated_at).getTime() > new Date(created.updated_at).getTime(),
      'updated_at did not advance after update',
    );
    console.log(`✓ updated; updated_at advanced ${created.updated_at} -> ${updated.updated_at}`);

    // 6. Soft-delete — drops from the list, but the row persists with deleted_at.
    await softDeleteMealEntry(created.id);
    const afterDelete = await listMealEntriesForDay(today);
    assert(
      !afterDelete.some((e) => e.id === created.id),
      'soft-deleted row still returned by listMealEntriesForDay',
    );
    const raw = await supabase
      .from('meal_entries')
      .select('id, deleted_at')
      .eq('id', created.id)
      .single();
    assert(!raw.error && raw.data, 'soft-deleted row missing from table (was hard-deleted?)');
    assert(raw.data.deleted_at !== null, 'soft-deleted row has null deleted_at');
    console.log('✓ soft-delete: dropped from list; row retained with deleted_at');

    console.log('\nSMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete the test row so the store does not accumulate junk.
    if (createdId) {
      await supabase.from('meal_entries').delete().eq('id', createdId);
      console.log(`(cleanup) hard-deleted test row ${createdId}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nSMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
