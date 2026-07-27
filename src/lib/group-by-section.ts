// Group a day's entries into the five fixed sections (S-06), in one
// dependency-free place so the smoke script asserts against the same code the
// UI runs — the `sum-calories.ts` / `sum-macros.ts` pattern, one level up.
import type { MacroTotals } from '@/lib/sum-macros';
import { sumCalories } from '@/lib/sum-calories';
import { sumMacros } from '@/lib/sum-macros';
import type { MealEntry, Section } from '@/data/types';

/** Fixed FR-056 order — mirrors the `Section` union's own declaration order. */
export const SECTION_ORDER: Section[] = ['breakfast', 'snack', 'lunch', 'bite', 'supper'];

/** One section's entries plus its pre-computed subtotal. */
export type SectionGroup = {
  section: Section;
  entries: MealEntry[];
  calories: number;
  macros: MacroTotals;
};

/**
 * Group a day's entries into all five sections, always, in `SECTION_ORDER` —
 * a section with no matching entries still gets a group with an empty
 * `entries` array and a zeroed subtotal (FR-057). Each group's entries keep
 * whatever order `entries` arrived in (ascending `logged_at`, per
 * `listMealEntriesForDay`).
 */
export function groupEntriesBySection(entries: MealEntry[]): SectionGroup[] {
  return SECTION_ORDER.map((section) => {
    const sectionEntries = entries.filter((entry) => entry.section === section);
    return {
      section,
      entries: sectionEntries,
      calories: sumCalories(sectionEntries),
      macros: sumMacros(sectionEntries),
    };
  });
}
