// Turn a day's net-vs-target into the on/over/under adherence signal FR-034
// asks for (S-11), in one dependency-free place so the smoke script asserts
// against the same code the UI runs.

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
  tolerance = 0.05,
): 'on' | 'over' | 'under' | null {
  if (target === null) return null;
  if (Math.abs(net - target) <= tolerance * target) return 'on';
  return net > target ? 'over' : 'under';
}
