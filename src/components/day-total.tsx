// The running calorie header for Today. Deliberately a bare total, not
// "X of Y remaining" — there is no target to divide by until S-02 lands.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealEntry } from '@/data/types';
import { sumCalories } from '@/lib/sum-calories';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function DayTotal({ entries, date }: { entries: MealEntry[]; date: Date }) {
  const total = sumCalories(entries);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {dayFormat.format(date)}
      </ThemedText>
      <ThemedView style={styles.totalRow}>
        <ThemedText type="title">{Math.round(total)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.unit}>
          kcal
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  unit: {
    textTransform: 'uppercase',
  },
});
