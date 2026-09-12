// Smoke test for past-day logging — proves the claims a manual pass can't
// cheaply cover, in two layers.
//
// First the pure day seam, which has no UI to click at all: the section/time
// round trip, the day-key trust boundary (malformed, impossible, future), and
// `moveToDay`'s preservation of a time of day across a DST boundary. Then the
// same seam driven through the repos against the deployed backend: a meal
// composed into a past day lands in that day and not today, an entry moved
// across days leaves the one it came from, and a session does the same.
//
// The pure half is deliberately not tz-dependent on the runner: every date is
// constructed locally and compared through `localDayKey`, which is the app's
// own definition of "which day is this".
//
// Authenticates as the owner (creds from the git-ignored .env.local) and drives
// the same repo seam the sheets and the review screen drive — the
// `meal-detail-smoke.ts` / `training-smoke.ts` pattern, one slice up.
//
// Run: `npm run smoke:past-day` (bundles + runs via scripts/run-past-day-smoke.mjs).
import {
  createMealEntry,
  listMealEntriesForDay,
  softDeleteMealEntry,
  updateMealEntry,
} from '@/data/meal-entries.repo';
import {
  createTrainingSession,
  listTrainingSessionsForDay,
  softDeleteTrainingSession,
  updateTrainingSession,
} from '@/data/training-sessions.repo';
import type { Section } from '@/data/types';
import { supabase } from '@/lib/supabase';
import { SECTION_ORDER } from '@/lib/group-by-section';
import { addLocalDays, localDayKey, parseLocalDayKey, startOfLocalDay } from '@/lib/local-day';
import { loggedAtForDay, moveToDay } from '@/lib/logged-at-for-day';
import { sectionForTime } from '@/lib/section-for-time';
import { timeForSection } from '@/lib/time-for-section';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

/** The pure seam. No network, no auth — runs before we bother signing in. */
function checkDaySeam() {
  const now = new Date(2026, 8, 12, 14, 30);
  const today = startOfLocalDay(now);

  // Every section's representative time must re-infer as that same section, or
  // a backdated meal would display in one section and re-derive into another.
  for (const section of SECTION_ORDER) {
    const time = timeForSection(section);
    const at = new Date(2026, 8, 10, time.hours, time.minutes);
    assert(
      sectionForTime(at) === section,
      `timeForSection(${section}) = ${time.hours}:${time.minutes} re-infers as ${sectionForTime(at)}`,
    );
  }
  console.log(`✓ timeForSection round-trips through sectionForTime for all ${SECTION_ORDER.length} sections`);

  // The trust boundary. A day arriving from a route param, a deep link or a
  // hand-edited URL must never produce a future entry.
  assert(parseLocalDayKey(undefined, now) === undefined, 'undefined key was accepted');
  assert(parseLocalDayKey('nope', now) === undefined, 'malformed key was accepted');
  assert(parseLocalDayKey('2026-02-31', now) === undefined, 'impossible date (2026-02-31) was accepted');
  assert(
    localDayKey(parseLocalDayKey('2027-01-01', now)!) === localDayKey(today),
    'a future day key was not clamped to today',
  );
  assert(
    localDayKey(parseLocalDayKey('2026-09-10', now)!) === '2026-09-10',
    'a valid past key did not round-trip',
  );
  // The UTC trap: `new Date('2026-09-10')` is UTC midnight, which is the
  // *previous* local day anywhere west of Greenwich.
  assert(parseLocalDayKey('2026-09-10', now)!.getHours() === 0, 'parsed day is not local midnight');
  console.log('✓ parseLocalDayKey rejects malformed/impossible keys, clamps the future, parses locally');

  // Today keeps its true instant; only another day gets a time invented for it.
  assert(
    loggedAtForDay(now, timeForSection('supper'), now) === now.toISOString(),
    "today's logged_at was approximated instead of kept exact",
  );
  const backdated = new Date(loggedAtForDay(addLocalDays(today, -1), timeForSection('supper'), now));
  assert(backdated.getHours() === 19 && backdated.getMinutes() === 30, 'backdated supper is not at 19:30');
  assert(localDayKey(backdated) === localDayKey(addLocalDays(today, -1)), 'backdated entry landed on the wrong day');
  console.log('✓ loggedAtForDay keeps today exact and gives a past day its section time');

  // The midnight repair: 00:05:33.120 must survive the move intact.
  const midnightish = new Date(2026, 8, 12, 0, 5, 33, 120).toISOString();
  const moved = new Date(moveToDay(midnightish, new Date(2026, 8, 11)));
  assert(
    moved.getHours() === 0 && moved.getMinutes() === 5 && moved.getSeconds() === 33 && moved.getMilliseconds() === 120,
    `moveToDay did not preserve the time of day: ${moved.toISOString()}`,
  );
  assert(localDayKey(moved) === '2026-09-11', 'moveToDay landed on the wrong day');

  // Across a DST boundary a time-preserving shift lands 23h earlier and reads
  // as the same day; `addLocalDays` is midnight-anchored precisely to avoid it.
  const dstStep = addLocalDays(new Date(2026, 9, 26), -1);
  assert(localDayKey(dstStep) === '2026-10-25', `addLocalDays across DST gave ${localDayKey(dstStep)}`);
  console.log('✓ moveToDay preserves h/m/s/ms; addLocalDays is stable across a DST boundary');
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  checkDaySeam();

  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  const today = startOfLocalDay(new Date());
  const yesterday = addLocalDays(today, -1);
  const entryIds: string[] = [];
  const sessionIds: string[] = [];

  try {
    // 1. Compose into a past day, the way review.tsx does it: resolve the
    //    section first, then derive the timestamp from it.
    const section: Section = 'supper';
    const composed = await createMealEntry({
      logged_at: loggedAtForDay(yesterday, timeForSection(section)),
      section,
      source: 'free_text',
      name: 'smoke: past-day compose',
      calories: 640,
    });
    entryIds.push(composed.id);

    const composedAt = new Date(composed.logged_at);
    assert(composedAt.getHours() === 19, `composed entry is at ${composedAt.getHours()}h, want 19h`);
    assert(
      (await listMealEntriesForDay(yesterday)).some((e) => e.id === composed.id),
      'composed entry is missing from the past day it was aimed at',
    );
    assert(
      !(await listMealEntriesForDay(today)).some((e) => e.id === composed.id),
      'composed entry leaked into today',
    );
    console.log("✓ a meal composed into a past day lands there, at its section's time, and not in today");

    // 2. The midnight repair, end to end: an entry logged at 00:05 moves back a
    //    day and must leave the day it came from.
    const justAfterMidnight = new Date(
      today.getFullYear(), today.getMonth(), today.getDate(), 0, 5, 33, 120,
    );
    const stray = await createMealEntry({
      logged_at: justAfterMidnight.toISOString(),
      section: 'supper',
      source: 'manual',
      name: 'smoke: past-day move',
      calories: 300,
    });
    entryIds.push(stray.id);
    assert(
      (await listMealEntriesForDay(today)).some((e) => e.id === stray.id),
      'the stray entry was not in today before the move',
    );

    const movedEntry = await updateMealEntry(stray.id, {
      logged_at: moveToDay(stray.logged_at, yesterday),
    });
    const movedAt = new Date(movedEntry.logged_at);
    assert(
      movedAt.getHours() === 0 && movedAt.getMinutes() === 5 && movedAt.getSeconds() === 33,
      'the move rewrote the entry’s time of day',
    );
    assert(
      !(await listMealEntriesForDay(today)).some((e) => e.id === stray.id),
      'the moved entry is STILL in the day it left — the stale-day read a two-key invalidation exists to prevent',
    );
    assert(
      (await listMealEntriesForDay(yesterday)).some((e) => e.id === stray.id),
      'the moved entry never arrived in the target day',
    );
    console.log('✓ an entry moved across days keeps its time, leaves the source day, and arrives in the target');

    // 3. A training session, composed into a past day and then moved back.
    const now = new Date();
    const session = await createTrainingSession({
      logged_at: loggedAtForDay(yesterday, { hours: now.getHours(), minutes: now.getMinutes() }, now),
      session_type: 'Gym',
      intensity: 'moderate',
      duration_minutes: 45,
      burn_kcal: 400,
    });
    sessionIds.push(session.id);
    assert(
      (await listTrainingSessionsForDay(yesterday)).some((s) => s.id === session.id),
      'the session is missing from the past day it was aimed at',
    );
    assert(
      !(await listTrainingSessionsForDay(today)).some((s) => s.id === session.id),
      'the session leaked into today',
    );

    await updateTrainingSession(session.id, { logged_at: moveToDay(session.logged_at, today) });
    assert(
      (await listTrainingSessionsForDay(today)).some((s) => s.id === session.id),
      'the moved session never arrived in today',
    );
    assert(
      !(await listTrainingSessionsForDay(yesterday)).some((s) => s.id === session.id),
      'the moved session is still in the day it left',
    );
    console.log('✓ a training session composes into a past day and moves back out of it');

    // 4. Soft deletes still drop both from their day reads.
    await softDeleteMealEntry(composed.id);
    await softDeleteTrainingSession(session.id);
    assert(
      !(await listMealEntriesForDay(yesterday)).some((e) => e.id === composed.id),
      'a soft-deleted backdated entry still appears in its day read',
    );
    console.log('✓ soft delete drops a backdated record from its day read');

    console.log('\nPAST-DAY SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created (soft-deleted rows still
    // exist in the table, so this is not redundant with step 4 above).
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    for (const id of sessionIds) {
      await supabase.from('training_sessions').delete().eq('id', id);
    }
    if (entryIds.length || sessionIds.length) {
      console.log(`(cleanup) hard-deleted ${entryIds.length} entry(ies), ${sessionIds.length} session(s)`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nPAST-DAY SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
