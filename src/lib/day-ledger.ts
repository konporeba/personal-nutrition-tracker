// The day's ledger — calories in, out, and net (Model A / OQ-1: training burn
// is purely additive, never baked into the resting target derived in
// derive-targets.ts/effective-targets.ts, which this module does not touch).
// Kept dependency-free, in one place, so the smoke script asserts against the
// same code the UI runs — the `derive-targets.ts` pattern, one slice over.
import { sumCalories } from '@/lib/sum-calories';
import { sumTrainingBurn } from '@/lib/sum-training-burn';

/** The day's ledger: consumed, burned, and their net against the resting target. */
export type DayLedger = {
  /** Calories in — the day's logged meal calories. */
  consumed: number;
  /** Calories out — the day's logged training burn. */
  burned: number;
  /**
   * consumed − burned. Compared against the plain resting `target` (not an
   * adjusted one) — the two are mathematically equivalent under Model A, since
   * `target + burned − consumed === target − net`. Can be negative on a day
   * where logged burn exceeds logged intake; this is never clamped.
   */
  net: number;
  /** The resting daily target, or null when none can be derived yet. */
  target: number | null;
};

/**
 * Compute the day's ledger from a day's meal entries, a day's training
 * sessions, and the resting calorie target (or null if none exists yet).
 */
export function computeDayLedger(
  entries: { calories: number | null }[],
  sessions: { burn_kcal: number }[],
  target: number | null,
): DayLedger {
  const consumed = sumCalories(entries);
  const burned = sumTrainingBurn(sessions);
  return { consumed, burned, net: consumed - burned, target };
}
