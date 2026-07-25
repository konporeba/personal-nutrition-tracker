// The one place `override ?? derived` is resolved, so every caller — the Profile
// UI, Today, and the smoke — agrees on the effective number. Kept dependency-free
// (only the pure deriveTargets + row types) so the Node smoke imports it directly.
//
// The override risk (the roadmap's named risk) is solved structurally: derived
// targets are never stored, so re-derivation cannot clobber an override. This
// module simply computes the derived numbers on demand and lets any non-null
// override win, per field.

import type { Profile } from '@/data/types';
import { deriveTargets, type Targets } from '@/lib/derive-targets';

/** The `Targets` field a given override column maps to. */
const OVERRIDE_COLUMNS: { field: keyof Targets; column: keyof Profile }[] = [
  { field: 'calories', column: 'calorie_target_override' },
  { field: 'protein_g', column: 'protein_target_override' },
  { field: 'carbs_g', column: 'carb_target_override' },
  { field: 'fat_g', column: 'fat_target_override' },
];

/**
 * The effective targets: `deriveTargets(profile stats, weightKg)` with each
 * field replaced by its override column when that column is non-null. The
 * caller supplies `weightKg` because current weight lives in the body_weights
 * series, not the profile.
 */
export function effectiveTargets(profile: Profile, weightKg: number): Targets {
  const derived = deriveTargets({
    height_cm: profile.height_cm,
    age: profile.age,
    sex: profile.sex,
    goal: profile.goal,
    weight_kg: weightKg,
  });

  const result = { ...derived };
  for (const { field, column } of OVERRIDE_COLUMNS) {
    const override = profile[column];
    if (typeof override === 'number') result[field] = override;
  }
  return result;
}

/**
 * Which target fields are currently overridden — for the UI's "overridden"
 * marker and "reset to derived" affordance. Pure, so the hook and the smoke can
 * share it.
 */
export function overriddenTargetFields(profile: Profile): Set<keyof Targets> {
  const overridden = new Set<keyof Targets>();
  for (const { field, column } of OVERRIDE_COLUMNS) {
    if (typeof profile[column] === 'number') overridden.add(field);
  }
  return overridden;
}
