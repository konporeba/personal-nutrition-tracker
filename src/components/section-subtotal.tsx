// A section header for the Today list (S-06): the section's name alongside
// its own calories + macro subtotal. Lighter than DayTotal's progress bars —
// this is a scannable label, not another set of targets.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Section } from '@/data/types';
import type { MacroTotals } from '@/lib/sum-macros';

const SECTION_LABELS: Record<Section, string> = {
  breakfast: 'Breakfast',
  snack: 'Snack',
  lunch: 'Lunch',
  bite: 'Bite',
  supper: 'Supper',
};

export function SectionSubtotal({
  section,
  calories,
  macros,
}: {
  section: Section;
  calories: number;
  macros: MacroTotals;
}) {
  return (
    <ThemedView style={styles.row}>
      <ThemedText type="smallBold">{SECTION_LABELS[section]}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {Math.round(calories)} kcal · {Math.round(macros.protein_g)}P{' '}
        {Math.round(macros.carbs_g)}C {Math.round(macros.fat_g)}F
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
