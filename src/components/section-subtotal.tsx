// A section header for the day list (S-06): the section's name alongside its
// own calories and macro subtotal. Lighter than `DayTotal`'s rings — this is a
// scannable label, not another set of targets.
//
// Sentence case, not the small-caps it used to be: the redesign uses size and
// color for hierarchy, never capitalization.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { Section } from '@/data/types';
import type { MacroTotals } from '@/lib/sum-macros';

/** Display label per section — shared with every sheet that names a section. */
export const SECTION_LABELS: Record<Section, string> = {
  breakfast: 'Breakfast',
  snack: 'Snack',
  lunch: 'Lunch',
  bite: 'Bite',
  supper: 'Supper',
};

/**
 * The same five, shortened to survive a five-across picker on a phone (see
 * `add-meal-sheet.tsx`). Only Breakfast actually loses letters — the other four
 * are already short enough — but they live here as a set so a caller picks one
 * vocabulary or the other and never mixes them mid-row.
 *
 * Never use these as a *heading*: a section header has the whole width of the
 * card and no excuse for an abbreviation.
 */
export const SECTION_SHORT_LABELS: Record<Section, string> = {
  breakfast: 'Brkfst',
  snack: 'Snack',
  lunch: 'Lunch',
  bite: 'Bite',
  supper: 'Supper',
};

export function SectionSubtotal({
  section,
  calories,
  macros,
  /** The first section in a list. Drops the top padding, which is there to
   *  separate this section from the one above it — and above the first one is
   *  the "Meals" heading, which brings its own spacing. */
  first = false,
}: {
  section: Section;
  calories: number;
  macros: MacroTotals;
  first?: boolean;
}) {
  const empty = calories === 0 && macros.protein_g === 0 && macros.carbs_g === 0 && macros.fat_g === 0;

  return (
    <ThemedView type="transparent" style={[styles.row, first && styles.rowFirst]}>
      <ThemedText type="smallBold" themeColor={empty ? 'textMuted' : 'text'}>
        {SECTION_LABELS[section]}
      </ThemedText>
      {empty ? null : (
        <ThemedView type="transparent" style={styles.chips}>
          <Chip label={`${Math.round(calories).toLocaleString()} kcal`} />
          <Chip label={`${Math.round(macros.protein_g)}g`} dotColor="protein" />
          <Chip label={`${Math.round(macros.carbs_g)}g`} dotColor="carbs" />
          <Chip label={`${Math.round(macros.fat_g)}g`} dotColor="fat" />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  rowFirst: {
    paddingTop: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
