// The day's macro totals, in one dependency-free place so the smoke script
// asserts against the same code the UI runs — the `sum-calories.ts` pattern,
// extended to the three macros. It lives in `src/lib` rather than beside
// `DayTotal` because that component imports `react-native`, which the
// esbuild-bundled Node smoke cannot load.

/** The day's consumed macros, in grams. */
export type MacroTotals = {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/**
 * Sum logged protein/carbs/fat, skipping values an entry doesn't carry.
 *
 * A null macro value means "unknown", not zero, so it contributes nothing
 * rather than being coerced — the same null-skipping distinction `sumCalories`
 * preserves for calories.
 */
export function sumMacros(
  entries: { protein_g: number | null; carbs_g: number | null; fat_g: number | null }[],
): MacroTotals {
  return entries.reduce<MacroTotals>(
    (totals, entry) => ({
      protein_g: totals.protein_g + (entry.protein_g ?? 0),
      carbs_g: totals.carbs_g + (entry.carbs_g ?? 0),
      fat_g: totals.fat_g + (entry.fat_g ?? 0),
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}
