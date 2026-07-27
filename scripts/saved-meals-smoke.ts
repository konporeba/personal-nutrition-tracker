// Smoke test for the saved-meals library (S-08) — proves the slice's core
// claim against the deployed backend, not a mock: editing or deleting a saved
// meal never retroactively changes an entry already logged from it.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same seams the review screen and library screen drive — the
// `day-view-smoke.ts` pattern, one slice up.
//
// The claims it protects:
//   * createSavedMeal round-trips through listSavedMeals
//   * re-logging (createMealEntry with source: 'saved_meal' and the saved
//     meal's copied fields) creates a meal_entries row with
//     estimation_run_id: null and matching macros
//   * the copy-on-log claim — after re-logging, editing the saved meal's
//     calories does NOT change the already-created meal_entries row
//   * softDeleteSavedMeal removes the saved meal from listSavedMeals and does
//     not affect the previously-logged entry
import { createMealEntry, listMealEntriesForDay } from '@/data/meal-entries.repo';
import {
  createSavedMeal,
  listSavedMeals,
  softDeleteSavedMeal,
  updateSavedMeal,
} from '@/data/saved-meals.repo';
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
  const savedMealIds: string[] = [];
  const entryIds: string[] = [];

  try {
    // 1. Save a meal to the library, and confirm it round-trips.
    const saved = await createSavedMeal({
      name: 'smoke: saved-meals library',
      calories: 400,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 10,
      food_category: 'smoke-test-food',
    });
    savedMealIds.push(saved.id);

    const library = await listSavedMeals();
    assert(
      library.some((meal) => meal.id === saved.id),
      'newly created saved meal did not appear in listSavedMeals',
    );
    console.log(`✓ saved meal ${saved.id} round-trips through listSavedMeals`);

    // 2. Re-log it — the exact write path library.tsx's tap-to-relog drives.
    const relogged = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'lunch',
      source: 'saved_meal',
      name: saved.name,
      calories: saved.calories,
      protein_g: saved.protein_g,
      carbs_g: saved.carbs_g,
      fat_g: saved.fat_g,
      food_category: saved.food_category,
      estimation_run_id: null,
    });
    entryIds.push(relogged.id);
    assert(relogged.source === 'saved_meal', `re-logged entry source was ${relogged.source}, want saved_meal`);
    assert(relogged.estimation_run_id === null, 'a re-log must not link an estimation run');
    assert(relogged.calories === 400, `re-logged calories were ${relogged.calories}, want 400`);
    console.log(`✓ re-logged ${saved.id} -> meal_entries ${relogged.id}, source saved_meal, no estimation run`);

    // 3. The copy-on-log claim: edit the saved meal after the fact...
    const updated = await updateSavedMeal(saved.id, { calories: 999 });
    assert(updated.calories === 999, `updated saved meal calories were ${updated.calories}, want 999`);

    // ...and confirm the entry already logged from it is untouched.
    const dayAfterEdit = await listMealEntriesForDay(today);
    const untouched = dayAfterEdit.find((entry) => entry.id === relogged.id);
    assert(untouched, 'previously re-logged entry disappeared from the day read');
    assert(
      untouched.calories === 400,
      `previously re-logged entry's calories were ${untouched.calories} after editing the saved meal, want the original 400 (copy-on-log violated)`,
    );
    console.log('✓ editing the saved meal (400 -> 999 kcal) left the already-logged entry at 400 kcal — copy-on-log holds');

    // 4. Delete the saved meal and confirm the logged entry is still untouched.
    await softDeleteSavedMeal(saved.id);
    const libraryAfterDelete = await listSavedMeals();
    assert(
      !libraryAfterDelete.some((meal) => meal.id === saved.id),
      'soft-deleted saved meal still appeared in listSavedMeals',
    );

    const dayAfterDelete = await listMealEntriesForDay(today);
    const stillThere = dayAfterDelete.find((entry) => entry.id === relogged.id);
    assert(stillThere, 'deleting the saved meal removed the previously-logged entry too');
    assert(stillThere.calories === 400, "deleting the saved meal must not change the logged entry's values");
    console.log('✓ deleting the saved meal removed it from the library and left the logged entry untouched');

    console.log('\nSAVED-MEALS SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created.
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    for (const id of savedMealIds) {
      await supabase.from('saved_meals').delete().eq('id', id);
    }
    if (entryIds.length || savedMealIds.length) {
      console.log(
        `(cleanup) hard-deleted ${entryIds.length} entry(ies), ${savedMealIds.length} saved meal(s)`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nSAVED-MEALS SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
