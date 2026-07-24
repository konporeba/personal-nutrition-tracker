// Smoke test for free-text meal logging (S-01) — the north star's core loop,
// machine-checked rather than only clicked through.
//
// Authenticates as the owner (creds from the git-ignored .env.local) and drives
// the same seams the review screen drives, against the **deployed** backend:
// estimate -> build a NewMealEntry -> commit -> read the day back -> delete.
//
// The claims it protects:
//   * a real meal estimates, commits as `free_text`, appears in the day read,
//     carries its section and estimation_run_id, and counts toward the total
//   * an unrecognized input never yields a fabricated number, and commits as
//     `manual` with the owner's own values while still linking its run (FR-008)
//   * an empty macro field stores null, not 0
//   * a soft-deleted entry drops out of the day read
//   * sectionForTime is total and lands on the right side of every boundary
//
// Run: `npm run smoke:log` (bundles + runs via scripts/run-log-smoke.mjs).
import { estimateMeal } from '@/data/estimation';
import {
  createMealEntry,
  listMealEntriesForDay,
  softDeleteMealEntry,
} from '@/data/meal-entries.repo';
import type { Section } from '@/data/types';
import { sectionForTime } from '@/lib/section-for-time';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

const REAL_MEAL = 'three slices of pepperoni pizza';
const GIBBERISH = 'zxqw plnk vvbb';

/** The owner's own numbers for the manual path — nothing here came from the AI. */
const MANUAL_VALUES = { calories: 210, protein_g: 5, carbs_g: 30, fat_g: 8 };

/**
 * Every boundary of the provisional OQ-10 section map, including the exact
 * transition minutes. Each boundary belongs to the *later* section.
 */
const SECTION_CASES: { h: number; m: number; want: Section }[] = [
  { h: 0, m: 0, want: 'breakfast' },
  { h: 7, m: 15, want: 'breakfast' },
  { h: 10, m: 29, want: 'breakfast' },
  { h: 10, m: 30, want: 'snack' },
  { h: 11, m: 59, want: 'snack' },
  { h: 12, m: 0, want: 'lunch' },
  { h: 14, m: 59, want: 'lunch' },
  { h: 15, m: 0, want: 'bite' },
  { h: 17, m: 59, want: 'bite' },
  { h: 18, m: 0, want: 'supper' },
  { h: 23, m: 59, want: 'supper' },
];

function sumCalories(entries: { calories: number | null }[]): number {
  return entries.reduce((total, entry) => total + (entry.calories ?? 0), 0);
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 0. Section inference is pure — check it before spending an AI call.
  for (const { h, m, want } of SECTION_CASES) {
    const at = new Date(2026, 0, 15, h, m, 0, 0);
    const got = sectionForTime(at);
    assert(
      got === want,
      `sectionForTime(${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}) = ${got}, want ${want}`,
    );
  }
  console.log(`✓ sectionForTime: ${SECTION_CASES.length} boundary cases, all correct`);

  // 1. Authenticate as the owner. Both seams rely on this session.
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
  const runIds: string[] = [];

  try {
    const baseline = sumCalories(await listMealEntriesForDay(today));

    // 2. A real meal estimates and commits — the common path, end to end.
    const real = await estimateMeal({ kind: 'text', text: REAL_MEAL });
    assert(real.ok, `real-meal estimate failed: ${real.ok ? '' : real.error}`);
    runIds.push(real.runId);
    assert(real.estimate.recognized === true, 'a real meal came back as unrecognized');
    assert(
      typeof real.estimate.calories === 'number' && real.estimate.calories > 0,
      'recognized estimate has no usable calorie figure',
    );
    assert(real.estimate.assumptions.length >= 1, 'no assumptions surfaced (FR-082)');
    console.log(
      `✓ estimated "${real.estimate.name}": ${real.estimate.calories} kcal, ` +
        `${real.estimate.assumptions.length} assumption(s)`,
    );

    // The field names line up with NewMealEntry by design — no renaming here,
    // exactly as the review screen commits it.
    const loggedAt = new Date();
    const committed = await createMealEntry({
      logged_at: loggedAt.toISOString(),
      section: sectionForTime(loggedAt),
      source: 'free_text',
      name: real.estimate.name,
      calories: real.estimate.calories,
      protein_g: real.estimate.protein_g,
      carbs_g: real.estimate.carbs_g,
      fat_g: real.estimate.fat_g,
      estimation_run_id: real.runId,
    });
    entryIds.push(committed.id);
    assert(committed.owner_id === ownerId, 'committed entry is not owner-scoped');
    assert(committed.source === 'free_text', `source is ${committed.source}, want free_text`);
    assert(
      committed.section === sectionForTime(loggedAt),
      `section is ${committed.section}, want ${sectionForTime(loggedAt)}`,
    );
    assert(
      committed.estimation_run_id === real.runId,
      'committed entry lost its estimation_run_id (audit trail broken)',
    );
    console.log(
      `✓ committed ${committed.id} as free_text/${committed.section}, run ${real.runId} linked`,
    );

    // 3. It shows up in the day read and counts toward the total.
    const afterCommit = await listMealEntriesForDay(today);
    const found = afterCommit.find((entry) => entry.id === committed.id);
    assert(found, 'committed entry not returned by listMealEntriesForDay');
    assert(found.calories === real.estimate.calories, 'day read returned different calories');
    assert(
      sumCalories(afterCommit) === baseline + (real.estimate.calories ?? 0),
      'committed entry did not move the day total by its own calories',
    );
    console.log(
      `✓ day read: entry present, total ${baseline} -> ${sumCalories(afterCommit)} kcal`,
    );

    // 4. Unrecognized input — a *successful* estimate that fabricates nothing.
    //    The owner supplies the numbers and it commits as `manual`, but the run
    //    is still linked: the model was asked, and that is worth keeping.
    const junk = await estimateMeal({ kind: 'text', text: GIBBERISH });
    assert(junk.ok, `gibberish estimate returned an error: ${junk.ok ? '' : junk.error}`);
    runIds.push(junk.runId);
    assert(junk.estimate.recognized === false, 'gibberish came back as recognized');
    assert(junk.estimate.calories === null, 'gibberish returned a calorie number (fabricated!)');
    assert(junk.estimate.protein_g === null, 'gibberish returned protein_g');
    assert(junk.estimate.carbs_g === null, 'gibberish returned carbs_g');
    assert(junk.estimate.fat_g === null, 'gibberish returned fat_g');

    const manualAt = new Date();
    const manual = await createMealEntry({
      logged_at: manualAt.toISOString(),
      section: sectionForTime(manualAt),
      source: 'manual',
      name: GIBBERISH,
      ...MANUAL_VALUES,
      estimation_run_id: junk.runId,
    });
    entryIds.push(manual.id);
    assert(manual.source === 'manual', `manual entry source is ${manual.source}, want manual`);
    assert(manual.calories === MANUAL_VALUES.calories, "manual entry lost the owner's calories");
    assert(manual.protein_g === MANUAL_VALUES.protein_g, "manual entry lost the owner's protein");
    assert(
      manual.estimation_run_id === junk.runId,
      'manual entry did not link its estimation run',
    );
    console.log(
      `✓ unrecognized input: null macros from the model, committed ${manual.id} as manual ` +
        `with the owner's own values, run ${junk.runId} linked`,
    );

    // 5. A cleared macro field is unknown, not zero.
    const blankAt = new Date();
    const blank = await createMealEntry({
      logged_at: blankAt.toISOString(),
      section: sectionForTime(blankAt),
      source: 'manual',
      name: 'smoke: cleared macro',
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });
    entryIds.push(blank.id);
    assert(blank.protein_g === null, `cleared protein_g stored as ${blank.protein_g}, want null`);
    assert(blank.carbs_g === null, `cleared carbs_g stored as ${blank.carbs_g}, want null`);
    assert(blank.fat_g === null, `cleared fat_g stored as ${blank.fat_g}, want null`);
    console.log('✓ cleared macro fields stored as null, not 0');

    // 6. Soft delete drops the entry out of the day read and off the total.
    const beforeDelete = sumCalories(await listMealEntriesForDay(today));
    await softDeleteMealEntry(blank.id);
    const afterDelete = await listMealEntriesForDay(today);
    assert(
      !afterDelete.some((entry) => entry.id === blank.id),
      'soft-deleted entry still returned by listMealEntriesForDay',
    );
    assert(
      sumCalories(afterDelete) === beforeDelete - 100,
      'day total did not drop by the deleted entry’s calories',
    );
    console.log(
      `✓ soft delete: entry dropped from the day read, total ${beforeDelete} -> ${sumCalories(afterDelete)} kcal`,
    );

    console.log('\nLOG SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete what this script created. Entries first — the FK is
    // ON DELETE SET NULL, so removing runs first would silently break the
    // estimation_run_id assertions on a re-run.
    for (const id of entryIds) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
    for (const id of runIds) {
      await supabase.from('estimation_runs').delete().eq('id', id);
    }
    if (entryIds.length || runIds.length) {
      console.log(
        `(cleanup) hard-deleted ${entryIds.length} entry(ies) and ${runIds.length} run(s)`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nLOG SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
