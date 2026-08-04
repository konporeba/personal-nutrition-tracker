// Turn a day's net-vs-target into the on/over/under adherence signal FR-034
// asks for (S-11), in one dependency-free place so the smoke script asserts
// against the same code the UI runs.

/** The verdict. `null` is a separate case: nothing to judge, not a fourth state. */
export type DayAdherence = 'on' | 'over' | 'under';

/**
 * The default width of the on-target band, as a fraction of the target.
 *
 * Exported because it is drawn as well as computed: the Analytics net panel
 * shades this exact range behind its line, and a band that disagreed with the
 * classifier would put points visibly inside the zone while calling them over.
 */
export const ADHERENCE_TOLERANCE = 0.05;

/**
 * `'on'` when `net` is within `tolerance` (±5% by default) of `target`,
 * otherwise `'over'`/`'under'` by sign of `net - target`. The tolerance band
 * is checked first, so a day just outside the exact target but still within
 * ±5% reads as `'on'`, not `'over'`/`'under'`. `null` when `target` is
 * `null` (no profile/weight yet, mirroring `DayLedger.target`'s own
 * nullability) — there is nothing to classify against.
 */
export function classifyDayAdherence(
  net: number,
  target: number | null,
  tolerance = ADHERENCE_TOLERANCE,
): DayAdherence | null {
  if (target === null) return null;
  if (Math.abs(net - target) <= tolerance * target) return 'on';
  return net > target ? 'over' : 'under';
}
