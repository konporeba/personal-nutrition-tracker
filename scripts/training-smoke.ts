// Smoke test for the training-sessions data layer and day ledger (S-09) —
// machine-checked coverage for what a single manual pass can't easily prove:
// the ledger math is correct and never clamps a negative net, and a real
// training_sessions row round-trips (create/update/soft-delete) through the
// deployed backend with the day read reflecting each change.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same seams the Today screen and session-composer/-detail screens
// drive, against the **deployed** backend — the `day-view-smoke.ts` pattern,
// one slice up.
//
// The claims it protects:
//   * computeDayLedger/sumTrainingBurn are correct, including a day where
//     burned exceeds consumed (net goes negative, never clamped to zero)
//   * createTrainingSession + listTrainingSessionsForDay round-trip a real row
//   * updateTrainingSession's burn_kcal change is reflected in the next
//     day-ledger computation
//   * softDeleteTrainingSession removes the session from the day read
//
// Run: `npm run smoke:training` (bundles + runs via scripts/run-training-smoke.mjs).
import {
  createTrainingSession,
  listTrainingSessionsForDay,
  softDeleteTrainingSession,
  updateTrainingSession,
} from '@/data/training-sessions.repo';
import type { TrainingSession } from '@/data/types';
import { computeDayLedger } from '@/lib/day-ledger';
import { sumTrainingBurn } from '@/lib/sum-training-burn';
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

  // 0. Pure math first — check it before touching the network.

  // 0a. An entirely empty day nets to zero, with a null target passed through.
  const empty = computeDayLedger([], [], null);
  assert(
    empty.consumed === 0 && empty.burned === 0 && empty.net === 0 && empty.target === null,
    `empty-day ledger was ${JSON.stringify(empty)}, want all-zero with a null target`,
  );
  console.log('✓ computeDayLedger: empty day nets to zero with a null target');

  // 0b. Null calorie values are skipped (sumCalories' convention); burn values
  //     are always summed (burn_kcal is a required column, no null to skip).
  const mixed = computeDayLedger(
    [{ calories: 300 }, { calories: null }],
    [{ burn_kcal: 100 }, { burn_kcal: 50 }],
    2000,
  );
  assert(
    mixed.consumed === 300 && mixed.burned === 150 && mixed.net === 150 && mixed.target === 2000,
    `mixed-day ledger was ${JSON.stringify(mixed)}, want consumed 300 / burned 150 / net 150 / target 2000`,
  );
  console.log('✓ computeDayLedger: null calories skipped, burns summed, target passed through');

  // 0c. A day where burned exceeds consumed nets negative — never clamped.
  const overBudget = computeDayLedger([{ calories: 100 }], [{ burn_kcal: 500 }], 1800);
  assert(
    overBudget.net === -400,
    `over-budget day net was ${overBudget.net}, want -400 (unclamped)`,
  );
  console.log('✓ computeDayLedger: burned > consumed nets negative, not clamped to zero');

  // 0d. sumTrainingBurn alone, on an empty list.
  assert(sumTrainingBurn([]) === 0, 'sumTrainingBurn([]) was not 0');
  console.log('✓ sumTrainingBurn: empty list sums to zero');

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
  const sessionIds: string[] = [];

  try {
    const baselineBurned = sumTrainingBurn(await listTrainingSessionsForDay(today));

    // 2. A real session, committed with an initial burn.
    const committed = await createTrainingSession({
      logged_at: today.toISOString(),
      session_type: 'smoke: run',
      intensity: 'moderate',
      duration_minutes: 45,
      burn_kcal: 300,
    });
    sessionIds.push(committed.id);
    assert(committed.burn_kcal === 300, `committed burn_kcal was ${committed.burn_kcal}, want 300`);

    const afterCreate = await listTrainingSessionsForDay(today);
    assert(
      afterCreate.some((s: TrainingSession) => s.id === committed.id),
      'newly committed session did not appear in the day read',
    );
    const burnedAfterCreate = sumTrainingBurn(afterCreate);
    assert(
      burnedAfterCreate === baselineBurned + 300,
      `burned after create was ${burnedAfterCreate}, want ${baselineBurned + 300}`,
    );
    console.log(`✓ committed session ${committed.id}, day burn total updated`);

    // 3. Edit its burn — the ledger must recompute from the new value.
    const updated = await updateTrainingSession(committed.id, { burn_kcal: 450 });
    assert(updated.burn_kcal === 450, `updated burn_kcal was ${updated.burn_kcal}, want 450`);

    const afterUpdate = await listTrainingSessionsForDay(today);
    const ledgerAfterUpdate = computeDayLedger([], afterUpdate, null);
    assert(
      ledgerAfterUpdate.burned === baselineBurned + 450,
      `ledger burned after update was ${ledgerAfterUpdate.burned}, want ${baselineBurned + 450}`,
    );
    console.log(`✓ updated ${committed.id}'s burn to 450, ledger recomputed from the new value`);

    // 4. Soft-delete — the session must drop from the day read entirely.
    await softDeleteTrainingSession(committed.id);
    const afterDelete = await listTrainingSessionsForDay(today);
    assert(
      !afterDelete.some((s: TrainingSession) => s.id === committed.id),
      'soft-deleted session is still present in the day read',
    );
    const burnedAfterDelete = sumTrainingBurn(afterDelete);
    assert(
      burnedAfterDelete === baselineBurned,
      `burned after delete was ${burnedAfterDelete}, want back to baseline ${baselineBurned}`,
    );
    console.log(`✓ soft-deleted ${committed.id}, day read and burn total back to baseline`);

    console.log('\nTRAINING SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created.
    for (const id of sessionIds) {
      await supabase.from('training_sessions').delete().eq('id', id);
    }
    if (sessionIds.length) {
      console.log(`(cleanup) hard-deleted ${sessionIds.length} session(s)`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nTRAINING SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
