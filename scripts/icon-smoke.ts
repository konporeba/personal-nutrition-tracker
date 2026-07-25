// Smoke test for the food icon system (S-05) — the mapping and the persistence,
// machine-checked rather than only clicked.
//
// Two claims:
//   * emojiForFood / iconForEntry map labels and names correctly and stably,
//     including the specificity-ordering cases and the generic fallback — the
//     same pure code MealEntryRow renders (checked first, no network)
//   * food_category round-trips through the real store: a committed entry carries
//     its category, and iconForEntry on the row read back matches the expected
//     emoji; a null-category entry falls back to a name-derived icon
//
// Non-destructive: every test entry it creates is hard-deleted in the finally
// block (the smoke-store.ts cleanup pattern).
//
// Run: `npm run smoke:icon` (bundles + runs via scripts/run-icon-smoke.mjs).
import {
  createMealEntry,
  listMealEntriesForDay,
} from '@/data/meal-entries.repo';
import { supabase } from '@/lib/supabase';
import { emojiForFood, iconForEntry, GENERIC_FOOD } from '@/lib/food-emoji';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

/**
 * Representative mapping cases, including the specificity-ordering pins
 * ("grilled chicken" vs "chicken", "ice cream" vs bare "cream") and the generic
 * fallback. Each was worked out by hand from the ordered table in food-emoji.ts.
 */
const EMOJI_CASES: { text: string; want: string }[] = [
  { text: 'scrambled eggs', want: '🥚' },
  { text: 'grilled chicken breast', want: '🍗' },
  { text: 'grilled chicken', want: '🍗' },
  { text: 'chicken', want: '🍗' },
  { text: 'pepperoni pizza', want: '🍕' },
  { text: 'ice cream', want: '🍨' },
  { text: 'cream', want: GENERIC_FOOD },
  { text: 'spaghetti bolognese', want: '🍝' },
  { text: 'hamburger', want: '🍔' },
  { text: 'greek yogurt', want: '🥛' },
  { text: 'latte', want: '☕' },
  { text: 'banana', want: '🍌' },
  { text: 'zxqw plnk', want: GENERIC_FOOD },
  { text: '', want: GENERIC_FOOD },
];

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 0. The mapping is pure — check it before touching the network.
  for (const { text, want } of EMOJI_CASES) {
    const got = emojiForFood(text);
    assert(got === want, `emojiForFood(${JSON.stringify(text)}) = ${got}, want ${want}`);
  }
  // iconForEntry: stored category wins; name is the fallback; generic is last.
  assert(
    iconForEntry({ food_category: 'pizza', name: 'mystery dish' }) === '🍕',
    'iconForEntry should prefer a specific food_category',
  );
  assert(
    iconForEntry({ food_category: null, name: 'two scrambled eggs' }) === '🥚',
    'iconForEntry should fall back to a name-derived icon when category is null',
  );
  assert(
    iconForEntry({ food_category: null, name: 'zxqw' }) === GENERIC_FOOD,
    'iconForEntry should be generic when neither category nor name matches',
  );
  console.log(`✓ mapping: ${EMOJI_CASES.length} emojiForFood cases + iconForEntry precedence, all correct`);

  // 1. Authenticate as the owner. The round-trip relies on this session.
  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  const today = new Date();
  const createdIds: string[] = [];

  try {
    // 2. A committed entry carries its food_category, and the row read back
    //    resolves to the expected specific emoji.
    const withCategory = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'lunch',
      source: 'manual',
      name: 'smoke: category pizza',
      calories: 700,
      food_category: 'pizza',
    });
    createdIds.push(withCategory.id);
    assert(withCategory.food_category === 'pizza', 'food_category not persisted on insert');

    const dayList = await listMealEntriesForDay(today);
    const readBack = dayList.find((e) => e.id === withCategory.id);
    assert(readBack, 'committed entry not returned by listMealEntriesForDay');
    assert(readBack.food_category === 'pizza', `day read lost food_category (${readBack.food_category})`);
    assert(
      iconForEntry(readBack) === '🍕',
      `iconForEntry on the read-back row = ${iconForEntry(readBack)}, want 🍕`,
    );
    console.log('✓ food_category round-trips; iconForEntry(row) === 🍕');

    // 3. A null-category entry falls back to a name-derived icon on read.
    const nullCategory = await createMealEntry({
      logged_at: today.toISOString(),
      section: 'lunch',
      source: 'manual',
      name: 'two scrambled eggs',
      calories: 180,
      food_category: null,
    });
    createdIds.push(nullCategory.id);

    const dayList2 = await listMealEntriesForDay(today);
    const readBack2 = dayList2.find((e) => e.id === nullCategory.id);
    assert(readBack2, 'null-category entry not returned by listMealEntriesForDay');
    assert(readBack2.food_category === null, 'null food_category should stay null, not coerced');
    assert(
      iconForEntry(readBack2) === '🥚',
      `name-derived icon on the read-back row = ${iconForEntry(readBack2)}, want 🥚`,
    );
    console.log('✓ null-category entry falls back to a name-derived icon (🥚)');

    console.log('\nICON SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete the test rows so the store does not accumulate junk.
    for (const id of createdIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    if (createdIds.length) {
      console.log(`(cleanup) hard-deleted ${createdIds.length} test entry(ies)`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const detail =
      err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error(`\nICON SMOKE FAILED ❌\n${detail}`);
    process.exit(1);
  });
