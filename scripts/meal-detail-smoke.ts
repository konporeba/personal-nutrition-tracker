// Smoke test for the meal detail view (S-07) — proves against the deployed
// backend the two claims a manual pass can't cheaply cover:
//
//   * editing an entry's name/macros/food_category via `updateMealEntry`
//     leaves `source` unchanged — a hand-corrected label-scan entry must
//     still read as `label_scan`, never `manual`
//   * `softDeleteMealEntry` removes the entry from `listMealEntriesForDay`'s
//     result, the same read path the detail screen and the day list share
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same repo seam the detail screen's Save/Delete actions drive —
// the `day-view-smoke.ts` / `saved-meals-smoke.ts` pattern, one slice up.
//
// Run: `npm run smoke:meal-detail` (bundles + runs via scripts/run-meal-detail-smoke.mjs).
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

  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  const today = new Date();
  const entryIds: string[] = [];

  try {
    // 1. A real entry, committed as a label scan (a non-manual source).
    const committed = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'lunch',
      source: 'label_scan',
      name: 'smoke: meal-detail edit',
      calories: 250,
      protein_g: 15,
      carbs_g: 20,
      fat_g: 8,
      food_category: 'smoke-test-food',
    });
    entryIds.push(committed.id);
    assert(committed.source === 'label_scan', `committed source was ${committed.source}, want label_scan`);
    console.log(`✓ committed ${committed.id} with source label_scan`);

    // 2. Edit its macros/name/category — the detail screen's Save patch never
    //    includes `source`, so this must leave it exactly as it was.
    const edited = await updateMealEntry(committed.id, {
      name: 'smoke: meal-detail edit (corrected)',
      calories: 300,
      protein_g: 20,
      carbs_g: 25,
      fat_g: 10,
      food_category: 'smoke-test-food-corrected',
    });
    assert(edited.calories === 300, `edited calories were ${edited.calories}, want 300`);
    assert(
      edited.source === 'label_scan',
      `editing macros changed source to ${edited.source} — a manual correction must not overwrite the original capture method`,
    );
    console.log('✓ editing name/macros/category left source as label_scan — the confidence marker is preserved');

    // 3. Delete it and confirm it drops from the day read (the same seam the
    //    detail screen's Delete button and the day list both rely on).
    await softDeleteMealEntry(committed.id);
    const dayAfterDelete = await listMealEntriesForDay(today);
    assert(
      !dayAfterDelete.some((entry) => entry.id === committed.id),
      'soft-deleted entry still appeared in listMealEntriesForDay',
    );
    console.log('✓ softDeleteMealEntry removed the entry from listMealEntriesForDay');

    console.log('\nMEAL-DETAIL SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created (soft-deleted rows still
    // exist in the table, so this is not redundant with step 3 above).
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    if (entryIds.length) {
      console.log(`(cleanup) hard-deleted ${entryIds.length} entry(ies)`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nMEAL-DETAIL SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
