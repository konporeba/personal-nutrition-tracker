// Smoke test for Profile & Derived Targets (S-02) — the derivation, the override
// contract, the weight series, and RLS, machine-checked rather than only clicked.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and drives
// the real repos + pure derivation against the **deployed** backend. The claims
// it protects:
//   * deriveTargets matches hand-computed values across goals (incl. the worked
//     example) — the same pure code the UI and Today run
//   * upsertProfile -> getProfile round-trips the stats
//   * an override survives an unrelated stat change: effectiveTargets keeps the
//     overridden field while the others re-derive (the roadmap's named risk)
//   * "reset to derived" (null override) returns the computed number
//   * the latest live body_weights reading drives derivation, and a soft-deleted
//     reading drops from the list while the latest falls back to the prior one
//   * an anonymous client sees zero rows from both tables (RLS)
//
// Non-destructive: the owner's real profile is saved up front and restored in the
// finally block; every test weight it inserts is hard-deleted afterwards.
//
// Run: `npm run smoke:profile` (bundles + runs via scripts/run-profile-smoke.mjs).
import { createClient } from '@supabase/supabase-js';

import {
  createBodyWeight,
  latestBodyWeight,
  listBodyWeights,
  softDeleteBodyWeight,
} from '@/data/body-weights.repo';
import { getProfile, upsertProfile } from '@/data/profile.repo';
import type { Profile, ProfilePatch } from '@/data/types';
import { deriveTargets, type Targets } from '@/lib/derive-targets';
import { effectiveTargets, overriddenTargetFields } from '@/lib/effective-targets';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function assertTargets(got: Targets, want: Targets, label: string): void {
  assert(
    got.calories === want.calories &&
      got.protein_g === want.protein_g &&
      got.carbs_g === want.carbs_g &&
      got.fat_g === want.fat_g,
    `${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
  );
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

/**
 * Hand-computed derivation cases. Each `want` was worked out by hand from the
 * formula in the plan's "Critical Implementation Details" — the smoke fails if
 * the code and the arithmetic ever disagree.
 */
const DERIVE_CASES: { label: string; input: Parameters<typeof deriveTargets>[0]; want: Targets }[] = [
  {
    label: 'worked example (male/180/80kg/30/maintain)',
    input: { height_cm: 180, age: 30, sex: 'male', goal: 'maintain', weight_kg: 80 },
    want: { calories: 2136, protein_g: 144, carbs_g: 244, fat_g: 65 },
  },
  {
    label: 'female/165/60kg/40/lose',
    input: { height_cm: 165, age: 40, sex: 'female', goal: 'lose', weight_kg: 60 },
    want: { calories: 1296, protein_g: 120, carbs_g: 114, fat_g: 40 },
  },
  {
    label: 'male/175/90kg/25/gain',
    input: { height_cm: 175, age: 25, sex: 'male', goal: 'gain', weight_kg: 90 },
    want: { calories: 2473, protein_g: 144, carbs_g: 303, fat_g: 76 },
  },
];

// The repo's upsert builds an INSERT tuple before ON CONFLICT resolves, so every
// write must carry all NOT NULL stat columns (the UI always resends them). These
// are the five stats; overrides are layered on per test.
const BASE_STATS: ProfilePatch = {
  height_cm: 180,
  age: 30,
  sex: 'male',
  activity_level: 'sedentary',
  goal: 'maintain',
};
/** A full new-row payload: the stats plus every override explicitly cleared. */
const FULL_NEW: ProfilePatch = {
  ...BASE_STATS,
  calorie_target_override: null,
  protein_target_override: null,
  carb_target_override: null,
  fat_target_override: null,
};
const TEST_WEIGHT_KG = 80;

// Derivation inputs matching BASE_STATS at each age the override test walks
// through — used to assert effective == derived on the non-overridden fields.
const DERIVE_AGE30 = { height_cm: 180, age: 30, sex: 'male', goal: 'maintain', weight_kg: TEST_WEIGHT_KG } as const;
const DERIVE_AGE40 = { ...DERIVE_AGE30, age: 40 } as const;

/** Rebuild a full patch from a saved row so the finally block can restore it. */
function patchFromProfile(p: Profile): ProfilePatch {
  return {
    height_cm: p.height_cm,
    age: p.age,
    sex: p.sex,
    activity_level: p.activity_level,
    goal: p.goal,
    calorie_target_override: p.calorie_target_override,
    protein_target_override: p.protein_target_override,
    carb_target_override: p.carb_target_override,
    fat_target_override: p.fat_target_override,
  };
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 0. Derivation is pure — check it before touching the network.
  for (const { label, input, want } of DERIVE_CASES) {
    assertTargets(deriveTargets(input), want, `deriveTargets ${label}`);
  }
  console.log(`✓ deriveTargets: ${DERIVE_CASES.length} hand-computed cases, all correct`);

  // 1. Authenticate as the owner. Every repo call relies on this session.
  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  // Save the owner's real profile so the finally block can put it back.
  const original = await getProfile();
  const testWeightIds: string[] = [];

  try {
    // 2. Round-trip: upsert full stats, read them back, derive from the read row.
    const saved = await upsertProfile(FULL_NEW);
    assert(saved.owner_id === ownerId, 'saved profile is not owner-scoped');
    const readBack = await getProfile();
    assert(readBack, 'getProfile returned null right after upsert');
    assert(
      readBack.height_cm === 180 &&
        readBack.age === 30 &&
        readBack.sex === 'male' &&
        readBack.goal === 'maintain' &&
        readBack.activity_level === 'sedentary',
      'round-tripped stats do not match what was written',
    );
    assertTargets(
      effectiveTargets(readBack, TEST_WEIGHT_KG),
      DERIVE_CASES[0].want,
      'effectiveTargets from round-tripped stats (no overrides)',
    );
    console.log('✓ upsertProfile -> getProfile round-trips stats; effective == derived');

    // 3. Set a calorie override (a full save carrying it, as the form does).
    const OVERRIDE = 2000;
    const withOverride = await upsertProfile({ ...FULL_NEW, calorie_target_override: OVERRIDE });
    assert(
      withOverride.calorie_target_override === OVERRIDE,
      'calorie override did not persist',
    );
    assert(
      overriddenTargetFields(withOverride).has('calories') &&
        overriddenTargetFields(withOverride).size === 1,
      'overriddenTargetFields should report exactly {calories}',
    );
    {
      const eff = effectiveTargets(withOverride, TEST_WEIGHT_KG);
      const derived = deriveTargets(DERIVE_AGE30);
      assert(eff.calories === OVERRIDE, `effective calories ${eff.calories}, want override ${OVERRIDE}`);
      assert(
        eff.protein_g === derived.protein_g &&
          eff.carbs_g === derived.carbs_g &&
          eff.fat_g === derived.fat_g,
        'non-overridden macros should equal derived',
      );
    }
    console.log(`✓ override persists; effective calories == ${OVERRIDE}, macros == derived`);

    // Change only the stats (age 40), NOT touching the override columns — exactly
    // a "save your stats" that omits the override fields. The override must
    // survive untouched while the other three re-derive to the new age. This is
    // the structural proof of the named risk: derived values are never written,
    // so a stat save cannot clobber an override.
    const olderStats = await upsertProfile({ ...BASE_STATS, age: 40 });
    assert(olderStats.age === 40, 'age change did not persist');
    assert(
      olderStats.calorie_target_override === OVERRIDE,
      'the override was clobbered by an unrelated stat change (THE named risk)',
    );
    assertTargets(
      effectiveTargets(olderStats, TEST_WEIGHT_KG),
      { calories: OVERRIDE, protein_g: 144, carbs_g: 233, fat_g: 63 },
      'effectiveTargets after age->40 with a calorie override',
    );
    console.log('✓ override intact after a stat-only save; the other three re-derived');

    // 4. Reset to derived: a full save with the override nulled returns derived.
    const cleared = await upsertProfile({ ...BASE_STATS, age: 40, calorie_target_override: null });
    assert(cleared.calorie_target_override === null, 'reset did not null the override');
    assert(
      overriddenTargetFields(cleared).size === 0,
      'no fields should be overridden after reset',
    );
    // Derived calories at age 40 (maintain): BMR 1730 x1.2 = 2076.
    assert(
      effectiveTargets(cleared, TEST_WEIGHT_KG).calories === deriveTargets(DERIVE_AGE40).calories &&
        effectiveTargets(cleared, TEST_WEIGHT_KG).calories === 2076,
      'effective calories should return to the derived 2076 after reset',
    );
    console.log('✓ reset to derived: effective calories back to the computed 2076');

    // 5. Weight series drives derivation; soft-delete falls back to the prior
    //    reading. Timestamps are pushed past "now" so these two are the latest
    //    regardless of any real readings already in the series.
    const base = Date.now();
    const w1 = await createBodyWeight({
      weight_kg: 80,
      measured_at: new Date(base + 1000).toISOString(),
    });
    testWeightIds.push(w1.id);
    let latest = await latestBodyWeight();
    assert(latest?.id === w1.id && latest.weight_kg === 80, 'latest should be the 80kg reading');

    const w2 = await createBodyWeight({
      weight_kg: 85,
      measured_at: new Date(base + 2000).toISOString(),
    });
    testWeightIds.push(w2.id);
    latest = await latestBodyWeight();
    assert(latest?.id === w2.id && latest.weight_kg === 85, 'latest should now be the 85kg reading');
    assert(
      effectiveTargets(cleared, latest.weight_kg).protein_g ===
        deriveTargets({ ...DERIVE_AGE40, weight_kg: 85 }).protein_g,
      'derivation should follow the latest weight (85kg)',
    );
    console.log('✓ latest weight (85kg) drives derivation');

    await softDeleteBodyWeight(w2.id);
    const afterDelete = await listBodyWeights();
    assert(!afterDelete.some((w) => w.id === w2.id), 'soft-deleted reading still listed');
    latest = await latestBodyWeight();
    assert(
      latest?.id === w1.id && latest.weight_kg === 80,
      'latest should fall back to the prior 80kg reading after soft-delete',
    );
    console.log('✓ soft-deleted reading drops from the list; latest falls back to 80kg');

    // 6. RLS proof — an anonymous client sees nothing from either table.
    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonProfile = await anon.from('profile').select('owner_id').limit(5);
    const anonWeights = await anon.from('body_weights').select('id').limit(5);
    assert(
      (anonProfile.data ?? []).length === 0,
      `anon read of profile returned ${anonProfile.data?.length} row(s); RLS not enforcing`,
    );
    assert(
      (anonWeights.data ?? []).length === 0,
      `anon read of body_weights returned ${anonWeights.data?.length} row(s); RLS not enforcing`,
    );
    console.log('✓ RLS: anonymous client sees 0 rows from profile and body_weights');

    console.log('\nPROFILE SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete every test weight, then restore the owner's real
    // profile (or clear the row if there was none) so re-runs start clean.
    for (const id of testWeightIds) {
      await supabase.from('body_weights').delete().eq('id', id);
    }
    if (original) {
      await upsertProfile(patchFromProfile(original));
      console.log(
        `(cleanup) removed ${testWeightIds.length} test weight(s); restored the original profile`,
      );
    } else {
      await supabase.from('profile').delete().eq('owner_id', ownerId);
      console.log(
        `(cleanup) removed ${testWeightIds.length} test weight(s); cleared the test profile (none existed before)`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const detail =
      err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error(`\nPROFILE SMOKE FAILED ❌\n${detail}`);
    process.exit(1);
  });
