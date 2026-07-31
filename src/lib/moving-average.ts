// A trailing moving average over a day-by-day series (S-11), in one
// dependency-free place so the smoke script asserts against the same code
// the UI runs — the `day-ledger.ts` pattern, one slice over.

/**
 * The trailing `windowSize`-wide moving average of `values`. For index `i`,
 * averages `values[max(0, i - windowSize + 1) .. i]` — a partial window at
 * the start of the series rather than `null`/omission, so the earliest days
 * of a new range still show a smoothed line.
 */
export function movingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, i) => {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = values.slice(windowStart, i + 1);
    const sum = window.reduce((total, value) => total + value, 0);
    return sum / window.length;
  });
}
