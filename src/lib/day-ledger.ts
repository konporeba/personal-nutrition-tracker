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

/**
 * How much of the day's budget the intake has used, as a `0..1` arc/bar fill.
 *
 * One formula for every gauge in the app, for the reason `classifyDayAdherence`
 * is one function: the hero ring and the week rail used to derive their fills
 * separately — `consumed / (target + burned)` against `net / target` — and
 * those are only equal when nothing was trained. On a day with real burn the
 * two arcs visibly disagreed, and once burn exceeded intake `net / target` went
 * *negative* and clamped the rail's ring to empty while the hero showed a
 * partial fill.
 *
 * The surviving framing is the hero's, because it is the one the day's headline
 * number already speaks: `budget = target + burned` (sedentary baseline, burn
 * earned back explicitly), used up by what was eaten. That keeps the fraction in
 * `[0, 1]` by construction — an empty ring means nothing eaten, never "trained
 * a lot" — and still lands on a full ring exactly where `classifyDayAdherence`
 * turns `'on'`, so length and color can't tell different stories.
 *
 * `0` when there is no target to divide by, matching `DayLedger.target`'s
 * nullability; callers draw a bare track for that case rather than a zero.
 */
export function budgetFraction(ledger: Omit<DayLedger, 'net'>): number {
  if (ledger.target === null) return 0;
  const budget = ledger.target + ledger.burned;
  if (budget <= 0 || Number.isNaN(ledger.consumed)) return 0;
  return Math.min(1, Math.max(0, ledger.consumed / budget));
}
