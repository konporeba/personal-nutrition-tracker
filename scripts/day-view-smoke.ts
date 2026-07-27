// Smoke test for the structured day view (S-06) — machine-checked coverage
// for what a single manual pass can't easily prove: the grouping helper is
// total over all five sections regardless of which have entries, its
// subtotals match the existing sum-calories/sum-macros math, and a live
// section move round-trips through the deployed backend without touching the
// day's total.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same seams the Today screen and the move sheet drive, against
// the **deployed** backend — the `log-smoke.ts` pattern, one slice up.
//
// The claims it protects:
//   * groupEntriesBySection always returns all 5 sections, in FR-056 order,
//     even when some (or all) have zero matching entries
//   * each section's subtotal matches sumCalories/sumMacros over just that
//     section's entries, not the whole day's
//   * updateMealEntry can move a real committed entry's section, the day
//     read reflects the entry under its new section and not its old one,
//     and the day's total calories are unchanged by the move
//
// Run: `npm run smoke:day-view` (bundles + runs via scripts/run-day-view-smoke.mjs).
import {
  createMealEntry,
  listMealEntriesForDay,
  updateMealEntry,
} from '@/data/meal-entries.repo';
import type { MealEntry, Section } from '@/data/types';
import { groupEntriesBySection, SECTION_ORDER } from '@/lib/group-by-section';
import { sumCalories } from '@/lib/sum-calories';
import { sumMacros } from '@/lib/sum-macros';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

/** A fixture entry with sensible defaults, minus whichever fields a case overrides. */
function fixtureEntry(overrides: Partial<MealEntry> & { section: Section }): MealEntry {
  return {
    id: `fixture-${Math.random().toString(36).slice(2)}`,
    owner_id: 'fixture-owner',
    logged_at: new Date().toISOString(),
    source: 'manual',
    name: 'fixture',
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    food_category: null,
    estimation_run_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 0. groupEntriesBySection is pure — check it before touching the network.

  // 0a. All 5 sections, in fixed order, even when entries only populate some.
  const sparse = [
    fixtureEntry({ section: 'lunch', calories: 400 }),
    fixtureEntry({ section: 'breakfast', calories: 200 }),
  ];
  const sparseGroups = groupEntriesBySection(sparse);
  assert(
    sparseGroups.length === 5,
    `groupEntriesBySection returned ${sparseGroups.length} groups, want 5`,
  );
  assert(
    sparseGroups.map((g) => g.section).join(',') === SECTION_ORDER.join(','),
    `section order was ${sparseGroups.map((g) => g.section).join(',')}, want ${SECTION_ORDER.join(',')}`,
  );
  for (const group of sparseGroups) {
    const expectedCount = group.section === 'lunch' || group.section === 'breakfast' ? 1 : 0;
    assert(
      group.entries.length === expectedCount,
      `section ${group.section} has ${group.entries.length} entries, want ${expectedCount}`,
    );
  }
  console.log('✓ groupEntriesBySection: all 5 sections present in order, empty sections included');

  // 0b. Entirely empty day — still 5 groups, all zeroed, none dropped.
  const emptyGroups = groupEntriesBySection([]);
  assert(emptyGroups.length === 5, `empty day produced ${emptyGroups.length} groups, want 5`);
  assert(
    emptyGroups.every((g) => g.entries.length === 0 && g.calories === 0),
    'an empty day did not zero every section',
  );
  console.log('✓ groupEntriesBySection: an entirely empty day still yields 5 zeroed sections');

  // 0c. Per-section subtotals match sum-calories/sum-macros over just that
  //     section's entries — not the whole day's.
  const mixed = [
    fixtureEntry({ section: 'breakfast', calories: 300, protein_g: 20, carbs_g: 30, fat_g: 10 }),
    fixtureEntry({ section: 'breakfast', calories: 150, protein_g: 5, carbs_g: 10, fat_g: 5 }),
    fixtureEntry({ section: 'supper', calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 }),
  ];
  const mixedGroups = groupEntriesBySection(mixed);
  const breakfast = mixedGroups.find((g) => g.section === 'breakfast');
  const supper = mixedGroups.find((g) => g.section === 'supper');
  assert(breakfast, 'no breakfast group returned');
  assert(supper, 'no supper group returned');
  const breakfastEntries = mixed.filter((e) => e.section === 'breakfast');
  assert(
    breakfast.calories === sumCalories(breakfastEntries),
    `breakfast subtotal was ${breakfast.calories}, want ${sumCalories(breakfastEntries)}`,
  );
  const breakfastMacros = sumMacros(breakfastEntries);
  assert(
    breakfast.macros.protein_g === breakfastMacros.protein_g &&
      breakfast.macros.carbs_g === breakfastMacros.carbs_g &&
      breakfast.macros.fat_g === breakfastMacros.fat_g,
    'breakfast macro subtotal did not match sumMacros over just its own entries',
  );
  assert(
    supper.calories === 600 && breakfast.calories === 450,
    `cross-section leakage: breakfast ${breakfast.calories}, supper ${supper.calories}`,
  );
  console.log('✓ groupEntriesBySection: per-section subtotals match sumCalories/sumMacros, no cross-section leakage');

  // 1. Authenticate as the owner. The live round trip below relies on this session.
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
    const baseline = sumCalories(await listMealEntriesForDay(today));

    // 2. A real entry, committed to breakfast, then moved to supper.
    const committed = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'breakfast',
      source: 'manual',
      name: 'smoke: day-view move',
      calories: 250,
      protein_g: 15,
      carbs_g: 20,
      fat_g: 8,
    });
    entryIds.push(committed.id);
    assert(committed.section === 'breakfast', `committed section was ${committed.section}, want breakfast`);

    const afterCreate = await listMealEntriesForDay(today);
    const beforeMove = groupEntriesBySection(afterCreate);
    const breakfastBefore = beforeMove.find((g) => g.section === 'breakfast');
    assert(breakfastBefore, 'no breakfast group after create');
    assert(
      breakfastBefore.entries.some((e) => e.id === committed.id),
      'newly committed entry did not appear under breakfast',
    );
    console.log(`✓ committed ${committed.id} to breakfast`);

    // 3. Move it — the first live exercise of updateMealEntry's section patch.
    const moved = await updateMealEntry(committed.id, { section: 'supper' });
    assert(moved.section === 'supper', `moved entry section was ${moved.section}, want supper`);
    assert(moved.calories === 250, "move changed the entry's calories — it must not");

    const afterMove = await listMealEntriesForDay(today);
    const afterMoveGroups = groupEntriesBySection(afterMove);
    const breakfastAfter = afterMoveGroups.find((g) => g.section === 'breakfast');
    const supperAfter = afterMoveGroups.find((g) => g.section === 'supper');
    assert(breakfastAfter, 'no breakfast group after move');
    assert(supperAfter, 'no supper group after move');
    assert(
      !breakfastAfter.entries.some((e) => e.id === committed.id),
      'moved entry is still listed under breakfast',
    );
    assert(
      supperAfter.entries.some((e) => e.id === committed.id),
      'moved entry did not appear under supper',
    );
    console.log(`✓ moved ${committed.id}: breakfast -> supper, day read reflects the new section only`);

    // 4. The day's total is unaffected — only the section assignment changed.
    const afterMoveTotal = sumCalories(afterMove);
    assert(
      afterMoveTotal === baseline + 250,
      `day total after move was ${afterMoveTotal}, want ${baseline + 250} (unaffected by the move)`,
    );
    console.log(`✓ day total unaffected by the move: ${baseline} -> ${afterMoveTotal} kcal`);

    console.log('\nDAY-VIEW SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created.
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
    console.error(`\nDAY-VIEW SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
