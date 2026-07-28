// Smoke test for the server-side AI estimation proxy (F-02) and the label-scan
// vision path (S-03).
//
// Authenticates as the owner (creds from the git-ignored .env.local) and drives
// the real client seam `estimateMeal` against the **deployed** Edge Function:
// a real meal text must come back recognized with usable macros and a recorded
// EstimationRun; gibberish must come back recognized:false with null macros
// (never a fabricated number, FR-008). A real label photo (scripts/fixtures/)
// must come back recognized with per-serving macros, a serving_size, and a
// run recorded as source:'label_scan'; a non-label photo must never fabricate
// a value either. Also asserts the recorded run is owner-scoped and invisible
// to an anonymous client (RLS).
//
// Plate-photo (S-04) vision correctness is verified manually only — no
// fixture image is checked in for it yet, unlike the label-scan fixtures
// (scripts/fixtures/label.jpg, not-a-label.jpg). See
// context/changes/plate-photo-logging/plan.md for the testing decision.
//
// This is what keeps the two copies of the wire contract honest — the Deno one
// in supabase/functions/estimate/types.ts and the client one in
// src/data/estimation-types.ts — because it exercises the real wire shape.
//
// Run: `npm run smoke:estimate` (bundles + runs via scripts/run-estimate-smoke.mjs).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { estimateMeal } from '@/data/estimation';
import { supabase } from '@/lib/supabase';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

const REAL_MEAL = 'two scrambled eggs with a slice of buttered toast';
const GIBBERISH = 'zxqw plnk vvbb';

/** Fixtures for the label-scan (S-03) vision path, resolved from the repo root. */
function readFixtureBase64(name: string): string {
  return readFileSync(resolve(process.cwd(), 'scripts/fixtures', name)).toString('base64');
}

async function main() {
  assert(url && anonKey, 'EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY must be set (.env)');
  assert(
    ownerEmail && ownerPassword && ownerPassword !== '<fill-in-owner-password>',
    'OWNER_EMAIL / OWNER_PASSWORD must be set in .env.local',
  );

  // 1. Authenticate as the owner. The seam relies on supabase-js attaching this
  //    session's JWT to the invoke; without it the function answers 401.
  const signIn = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  assert(!signIn.error, `sign-in failed: ${signIn.error?.message}`);
  const ownerId = signIn.data.user?.id;
  assert(ownerId, 'no owner uid after sign-in');
  console.log(`✓ signed in as owner ${ownerId}`);

  const runIds: string[] = [];

  try {
    // 2. A real meal — recognized, with usable macros and surfaced assumptions.
    const real = await estimateMeal({ kind: 'text', text: REAL_MEAL });
    assert(real.ok, `real-meal estimate failed: ${real.ok ? '' : real.error}`);
    runIds.push(real.runId);
    assert(real.runId.length > 0, 'empty runId on a successful estimate');
    const est = real.estimate;
    assert(est.recognized === true, 'a real meal came back as unrecognized');
    assert(typeof est.calories === 'number' && est.calories > 0, 'calories missing or not positive');
    assert(typeof est.protein_g === 'number', 'protein_g is null on a recognized estimate');
    assert(typeof est.carbs_g === 'number', 'carbs_g is null on a recognized estimate');
    assert(typeof est.fat_g === 'number', 'fat_g is null on a recognized estimate');
    assert(est.assumptions.length >= 1, 'no assumptions surfaced (FR-082)');
    assert(est.name.length > 0 && est.food_category.length > 0, 'name/food_category empty');
    console.log(
      `✓ estimated "${est.name}": ${est.calories} kcal ` +
        `(${est.protein_g}p/${est.carbs_g}c/${est.fat_g}f), ` +
        `${est.assumptions.length} assumption(s), confidence=${est.confidence}`,
    );

    // 3. The EstimationRun must exist, be owner-scoped, and carry the source marker.
    const runRead = await supabase
      .from('estimation_runs')
      .select('id, owner_id, source, input_summary, raw_result')
      .eq('id', real.runId)
      .single();
    assert(!runRead.error && runRead.data, `estimation_runs row ${real.runId} not found`);
    assert(runRead.data.owner_id === ownerId, 'recorded run is not owner-scoped');
    assert(runRead.data.source === 'free_text', `run source is ${runRead.data.source}, want free_text`);
    assert(runRead.data.raw_result !== null, 'run recorded without raw_result (no audit trail)');
    console.log(`✓ EstimationRun ${real.runId} recorded, owner-scoped, source=free_text`);

    // 4. RLS proof — an anonymous client must not see the owner's run.
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonRead = await anon.from('estimation_runs').select('id').limit(5);
    assert(
      (anonRead.data ?? []).length === 0,
      `anon read returned ${anonRead.data?.length} row(s); RLS not enforcing`,
    );
    console.log('✓ RLS: anonymous client sees 0 estimation_runs');

    // 5. Gibberish — a *successful* call that recognizes nothing. Null macros,
    //    never a fabricated number (FR-008); this is the offer-manual-entry cue.
    const junk = await estimateMeal({ kind: 'text', text: GIBBERISH });
    assert(junk.ok, `gibberish estimate returned an error: ${junk.ok ? '' : junk.error}`);
    runIds.push(junk.runId);
    assert(junk.estimate.recognized === false, 'gibberish came back as recognized');
    assert(junk.estimate.calories === null, 'gibberish returned a calorie number (fabricated!)');
    assert(junk.estimate.protein_g === null, 'gibberish returned protein_g');
    assert(junk.estimate.carbs_g === null, 'gibberish returned carbs_g');
    assert(junk.estimate.fat_g === null, 'gibberish returned fat_g');
    console.log(`✓ unrecognized input: recognized=false, null macros, run ${junk.runId} still recorded`);

    // 6. A real, legible label — recognized with per-serving macros and a
    //    non-null serving_size; the recorded run carries source:'label_scan'.
    const labelData = readFixtureBase64('label.jpg');
    const label = await estimateMeal({
      kind: 'image',
      imageKind: 'label',
      mediaType: 'image/jpeg',
      data: labelData,
    });
    assert(label.ok, `label estimate failed: ${label.ok ? '' : label.error}`);
    runIds.push(label.runId);
    const labelEst = label.estimate;
    assert(labelEst.recognized === true, 'a legible label came back as unrecognized');
    assert(
      typeof labelEst.calories === 'number' && labelEst.calories > 0,
      'label calories missing or not positive',
    );
    assert(typeof labelEst.protein_g === 'number', 'label protein_g is null on a recognized estimate');
    assert(typeof labelEst.carbs_g === 'number', 'label carbs_g is null on a recognized estimate');
    assert(typeof labelEst.fat_g === 'number', 'label fat_g is null on a recognized estimate');
    assert(
      typeof labelEst.serving_size === 'string' && labelEst.serving_size.length > 0,
      'label estimate has no serving_size',
    );
    console.log(
      `✓ label estimated "${labelEst.name}": ${labelEst.calories} kcal per ${labelEst.serving_size} ` +
        `(${labelEst.protein_g}p/${labelEst.carbs_g}c/${labelEst.fat_g}f)`,
    );

    const labelRunRead = await supabase
      .from('estimation_runs')
      .select('source')
      .eq('id', label.runId)
      .single();
    assert(!labelRunRead.error && labelRunRead.data, `estimation_runs row ${label.runId} not found`);
    assert(
      labelRunRead.data.source === 'label_scan',
      `label run source is ${labelRunRead.data.source}, want label_scan`,
    );
    console.log(`✓ EstimationRun ${label.runId} recorded with source=label_scan`);

    // 7. A non-label image — never fabricate a value (FR-008); null macros and
    //    null serving_size, same never-fabricate contract as text gibberish.
    const notLabelData = readFixtureBase64('not-a-label.jpg');
    const notLabel = await estimateMeal({
      kind: 'image',
      imageKind: 'label',
      mediaType: 'image/jpeg',
      data: notLabelData,
    });
    assert(notLabel.ok, `non-label estimate returned an error: ${notLabel.ok ? '' : notLabel.error}`);
    runIds.push(notLabel.runId);
    assert(notLabel.estimate.recognized === false, 'non-label image came back as recognized');
    assert(notLabel.estimate.calories === null, 'non-label image returned a calorie number (fabricated!)');
    assert(notLabel.estimate.serving_size === null, 'non-label image returned a serving_size (fabricated!)');
    console.log('✓ non-label image: recognized=false, null macros, null serving_size');

    console.log('\nESTIMATE SMOKE PASSED ✅');
  } finally {
    // Cleanup: hard-delete the runs this script created so the audit table does
    // not accumulate smoke junk. Real runs are immutable and never deleted.
    for (const id of runIds) {
      await supabase.from('estimation_runs').delete().eq('id', id);
    }
    if (runIds.length) console.log(`(cleanup) hard-deleted ${runIds.length} smoke run(s)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nESTIMATE SMOKE FAILED ❌\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
