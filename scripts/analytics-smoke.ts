// Smoke test for the analytics-and-trends (S-11) data layer — machine-checked
// coverage for what a single manual pass can't easily prove.
//
// Phase 2 stub: covers the ranged repo queries' boundary correctness only
// (listMealEntriesForRange/listTrainingSessionsForRange). Phase 7 fills in
// ensureDailyTarget immutability, groupByLocalDay, movingAverage, and
// classifyDayAdherence coverage alongside this.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same seams `useAnalyticsRange` drives, against the **deployed**
// backend — the `training-smoke.ts` pattern, one slice over.
//
// Run: `npm run smoke:analytics` (bundles + runs via scripts/run-analytics-smoke.mjs).
import { listMealEntriesForRange } from '@/data/meal-entries.repo';
import { listTrainingSessionsForRange } from '@/data/training-sessions.repo';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

// A fixed, far-future window so fixture rows never collide with real logged
// data. The range under test is [RANGE_START, RANGE_END] inclusive; one
// fixture lands just before and one just after, to prove the boundary is
// exact in both directions.
const RANGE_START = new Date(2099, 5, 1); // 2099-06-01
const RANGE_MID = new Date(2099, 5, 2); // 2099-06-02
const RANGE_END = new Date(2099, 5, 3); // 2099-06-03
const AFTER_RANGE = new Date(2099, 5, 4); // 2099-06-04

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

  const entryIds: string[] = [];
  const sessionIds: string[] = [];
  const beforeDay = new Date(2099, 4, 31); // 2099-05-31 — the day before RANGE_START

  try {
    // 1. Meal entries: one before, one at each edge, one in the middle, one after.
    for (const day of [beforeDay, RANGE_START, RANGE_MID, RANGE_END, AFTER_RANGE]) {
      const { data, error } = await supabase
        .from('meal_entries')
        .insert({
          owner_id: ownerId,
          logged_at: day.toISOString(),
          section: 'lunch',
          source: 'manual',
          name: 'smoke: analytics range',
          calories: 100,
        })
        .select()
        .single();
      assert(!error, `meal entry insert failed: ${error?.message}`);
      entryIds.push(data.id);
    }

    const entriesInRange = await listMealEntriesForRange(RANGE_START, RANGE_END);
    const idsInRange = new Set(entriesInRange.map((e) => e.id));
    assert(
      idsInRange.has(entryIds[1]) && idsInRange.has(entryIds[2]) && idsInRange.has(entryIds[3]),
      'listMealEntriesForRange missing an entry that should be within [start, end]',
    );
    assert(
      !idsInRange.has(entryIds[0]) && !idsInRange.has(entryIds[4]),
      'listMealEntriesForRange returned an entry outside [start, end]',
    );
    console.log('✓ listMealEntriesForRange: exact [start, end] boundary, none outside it');

    // 2. Training sessions: same boundary shape.
    for (const day of [beforeDay, RANGE_START, RANGE_MID, RANGE_END, AFTER_RANGE]) {
      const { data, error } = await supabase
        .from('training_sessions')
        .insert({
          owner_id: ownerId,
          logged_at: day.toISOString(),
          session_type: 'smoke: analytics range',
          intensity: 'moderate',
          duration_minutes: 10,
          burn_kcal: 50,
        })
        .select()
        .single();
      assert(!error, `training session insert failed: ${error?.message}`);
      sessionIds.push(data.id);
    }

    const sessionsInRange = await listTrainingSessionsForRange(RANGE_START, RANGE_END);
    const sessionIdsInRange = new Set(sessionsInRange.map((s) => s.id));
    assert(
      sessionIdsInRange.has(sessionIds[1]) &&
        sessionIdsInRange.has(sessionIds[2]) &&
        sessionIdsInRange.has(sessionIds[3]),
      'listTrainingSessionsForRange missing a session that should be within [start, end]',
    );
    assert(
      !sessionIdsInRange.has(sessionIds[0]) && !sessionIdsInRange.has(sessionIds[4]),
      'listTrainingSessionsForRange returned a session outside [start, end]',
    );
    console.log('✓ listTrainingSessionsForRange: exact [start, end] boundary, none outside it');

    console.log('\nANALYTICS SMOKE (Phase 2 stub) PASSED ✅');
  } finally {
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    for (const id of sessionIds) {
      await supabase.from('training_sessions').delete().eq('id', id);
    }
    if (entryIds.length || sessionIds.length) {
      console.log(
        `(cleanup) hard-deleted ${entryIds.length} entr${entryIds.length === 1 ? 'y' : 'ies'} and ${sessionIds.length} session(s)`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nANALYTICS SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
