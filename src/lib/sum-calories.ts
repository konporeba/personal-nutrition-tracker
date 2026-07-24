// The day-total rule, in one dependency-free place so the smoke script asserts
// against the same code the UI runs. It lives in `src/lib` rather than beside
// `DayTotal` because that component imports `react-native`, which the
// esbuild-bundled Node smoke cannot load.

/**
 * Sum logged calories, skipping entries that carry none.
 *
 * A null calorie value means "unknown", not zero, so it contributes nothing
 * rather than being coerced — the same distinction the review form preserves
 * when it stores an empty field as `null`.
 */
export function sumCalories(entries: { calories: number | null }[]): number {
  return entries.reduce((total, entry) => total + (entry.calories ?? 0), 0);
}
