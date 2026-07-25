// The daily-target derivation, in one dependency-free place so the smoke script
// asserts against the same code the UI runs. It lives in `src/lib` (not beside a
// component) because the esbuild-bundled Node smoke cannot load `react-native`.
//
// Model A / sedentary baseline (OQ-1): the activity multiplier is FIXED at
// sedentary (1.2). `activity_level` is stored on the profile for display but is
// deliberately NOT an input here — training is added to the day's budget by S-09,
// never baked into the resting target. See context/foundation/prd.md (Business
// Logic + OQ-1) and the plan's "Critical Implementation Details".
//
// Every constant below is a named default, not a knob the owner sees — the owner
// tunes a target by overriding it (effective-targets.ts layers that on top).

import type { BodyGoal, Sex } from '@/data/types';

/** The four derived daily targets, in the same units the UI shows. */
export type Targets = {
  /** kcal/day */
  calories: number;
  /** grams/day */
  protein_g: number;
  /** grams/day */
  carbs_g: number;
  /** grams/day */
  fat_g: number;
};

/** Stats + current weight the derivation needs. No `activity_level` (Model A). */
export type DeriveTargetsInput = {
  height_cm: number;
  age: number;
  sex: Sex;
  goal: BodyGoal;
  weight_kg: number;
};

// Sedentary maintenance multiplier over BMR (Model A — fixed).
const SEDENTARY_MULTIPLIER = 1.2;

// Goal factor applied to maintenance calories (FR-021).
const CALORIE_GOAL_FACTOR: Record<BodyGoal, number> = {
  lose: 0.85,
  maintain: 1.0,
  gain: 1.1,
};

// Protein target in grams per kg of body weight, goal-aware.
const PROTEIN_G_PER_KG: Record<BodyGoal, number> = {
  lose: 2.0,
  maintain: 1.8,
  gain: 1.6,
};

// Share of calories from fat, and the kcal-per-gram of each macro.
const FAT_CALORIE_SHARE = 0.275;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

/**
 * Stats + current weight → the four resting daily targets.
 *
 * Pipeline (all in whole-number output):
 *   BMR (Mifflin-St Jeor) = 10·kg + 6.25·cm − 5·age + (male ? +5 : −161)
 *   maintenance           = BMR × 1.2                     (sedentary, fixed)
 *   calories              = maintenance × goal factor
 *   protein_g             = (g/kg by goal) × weight
 *   fat_g                 = 27.5% of calories ÷ 9 kcal/g
 *   carbs_g               = remaining calories ÷ 4 kcal/g, floored at 0
 *
 * Carbs are computed from the ROUNDED calorie/protein/fat targets so the number
 * is reproducible by hand (the smoke asserts exact equality). Total over every
 * numeric input.
 */
export function deriveTargets(input: DeriveTargetsInput): Targets {
  const { height_cm, age, sex, goal, weight_kg } = input;

  const bmr =
    10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : -161);
  const maintenance = bmr * SEDENTARY_MULTIPLIER;

  const calories = Math.round(maintenance * CALORIE_GOAL_FACTOR[goal]);
  const protein_g = Math.round(PROTEIN_G_PER_KG[goal] * weight_kg);
  const fat_g = Math.round((FAT_CALORIE_SHARE * calories) / KCAL_PER_G_FAT);

  const remainingCalories =
    calories - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT;
  const carbs_g = Math.max(0, Math.round(remainingCalories / KCAL_PER_G_CARB));

  return { calories, protein_g, carbs_g, fat_g };
}
