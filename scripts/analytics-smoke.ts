// Smoke test for the analytics-and-trends (S-11) data layer — machine-checked
// coverage for what a single manual pass can't easily prove: the range
// queries' boundary correctness, the daily-target snapshot's write-once
// immutability, the day-grouping helper's gap-free bucketing, and the trend
// math's exact output at its boundary cases.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and
// drives the same seams `useAnalyticsRange` drives, against the **deployed**
// backend — the `training-smoke.ts` pattern, one slice over.
//
// Run: `npm run smoke:analytics` (bundles + runs via scripts/run-analytics-smoke.mjs).
import { ensureDailyTarget } from '@/data/daily-targets.repo';
import { listMealEntriesForRange } from '@/data/meal-entries.repo';
import { listTrainingSessionsForRange } from '@/data/training-sessions.repo';
import { classifyDayAdherence } from '@/lib/adherence';
import { groupByLocalDay } from '@/lib/group-by-local-day';
import { movingAverage } from '@/lib/moving-average';
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
// A separate day, far from the range above, dedicated to the
// ensureDailyTarget immutability test so its writes can't collide with
// anything else this script touches.
const SNAPSHOT_DAY = new Date(2099, 6, 1); // 2099-07-01

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 0. Pure math first — check it before touching the network.

  // 0a. groupByLocalDay: one bucket per requested day, in order, including a
  //     day with zero matching rows.
  const day1 = new Date(2020, 0, 1);
  const day2 = new Date(2020, 0, 2);
  const day3 = new Date(2020, 0, 3);
  const rows = [
    { at: new Date(2020, 0, 1, 9), label: 'a' },
    { at: new Date(2020, 0, 1, 20), label: 'b' },
    { at: new Date(2020, 0, 3, 12), label: 'c' },
  ];
  const buckets = groupByLocalDay(rows, (row) => row.at, [day1, day2, day3]);
  assert(buckets.length === 3, `groupByLocalDay returned ${buckets.length} buckets, want 3`);
  assert(
    buckets[0].map((r) => r.label).join(',') === 'a,b',
    `day1 bucket was ${JSON.stringify(buckets[0])}, want [a, b]`,
  );
  assert(buckets[1].length === 0, `day2 bucket was ${JSON.stringify(buckets[1])}, want empty`);
  assert(
    buckets[2].map((r) => r.label).join(',') === 'c',
    `day3 bucket was ${JSON.stringify(buckets[2])}, want [c]`,
  );
  console.log('✓ groupByLocalDay: one bucket per requested day, in order, empty days included');

  // 0b. movingAverage: a trailing window with a partial window at the start.
  const series = movingAverage([1, 2, 3, 4, 5], 3);
  assert(
    JSON.stringify(series) === JSON.stringify([1, 1.5, 2, 3, 4]),
    `movingAverage([1,2,3,4,5], 3) was ${JSON.stringify(series)}, want [1, 1.5, 2, 3, 4]`,
  );
  console.log('✓ movingAverage: matches a hand-computed series, partial window at the start');

  // 0c. classifyDayAdherence: exact ±5% boundary of a 2000-target day.
  assert(classifyDayAdherence(2100, 2000) === 'on', 'net 2100 vs target 2000 (+5% exactly) should be on');
  assert(classifyDayAdherence(2101, 2000) === 'over', 'net 2101 vs target 2000 (just past +5%) should be over');
  assert(classifyDayAdherence(1900, 2000) === 'on', 'net 1900 vs target 2000 (-5% exactly) should be on');
  assert(classifyDayAdherence(1899, 2000) === 'under', 'net 1899 vs target 2000 (just past -5%) should be under');
  assert(classifyDayAdherence(1500, null) === null, 'a null target should classify as null');
  console.log('✓ classifyDayAdherence: correct at the exact ±5% boundary, null target passes through');

  // 1. Authenticate as the owner. The live round trips below rely on this session.
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
    // 2. Meal entries: one before, one at each edge, one in the middle, one after.
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

    // 3. Training sessions: same boundary shape.
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

    // 4. ensureDailyTarget: insert-if-absent, never-update. A second call with
    //    different values must return the *first* call's stored snapshot.
    await supabase.from('daily_targets').delete().eq('owner_id', ownerId).eq('day', '2099-07-01');
    const first = await ensureDailyTarget(SNAPSHOT_DAY, {
      calories: 1111,
      protein_g: 111,
      carbs_g: 111,
      fat_g: 11,
    });
    assert(first.calories === 1111, `first ensureDailyTarget call returned calories ${first.calories}, want 1111`);
    const second = await ensureDailyTarget(SNAPSHOT_DAY, {
      calories: 2222,
      protein_g: 222,
      carbs_g: 222,
      fat_g: 22,
    });
    assert(
      second.calories === 1111 && second.id === first.id,
      `second ensureDailyTarget call returned ${JSON.stringify(second)}, want the first snapshot (1111 kcal, same id) unchanged`,
    );
    console.log('✓ ensureDailyTarget: insert-if-absent — a second call with different values returns the first snapshot');

    console.log('\nANALYTICS SMOKE PASSED ✅');
  } finally {
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    for (const id of sessionIds) {
      await supabase.from('training_sessions').delete().eq('id', id);
    }
    await supabase.from('daily_targets').delete().eq('owner_id', ownerId).eq('day', '2099-07-01');
    if (entryIds.length || sessionIds.length) {
      console.log(
        `(cleanup) hard-deleted ${entryIds.length} entr${entryIds.length === 1 ? 'y' : 'ies'}, ${sessionIds.length} session(s), and the snapshot fixture`,
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
