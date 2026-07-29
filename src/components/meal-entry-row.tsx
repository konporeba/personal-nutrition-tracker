// One row of a section's list: an icon, what was eaten, and what it cost. The
// leading emoji (S-05) is resolved from the entry's stored `food_category`, or
// best-effort from its name, so the day is scannable.
//
// Tapping opens the meal detail screen (S-07) — the one place edit, re-section,
// and delete now live. There is no long-press gesture on this row.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealEntry } from '@/data/types';
import { iconForEntry } from '@/lib/food-emoji';

export function MealEntryRow({
  entry,
  onPress,
}: {
  entry: MealEntry;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedView type="backgroundElement" style={styles.left}>
          <ThemedText style={styles.icon}>{iconForEntry(entry)}</ThemedText>
          <ThemedText style={styles.name} numberOfLines={2}>
            {entry.name}
          </ThemedText>
        </ThemedView>
        {/* A missing calorie value renders as a dash — showing 0 would read as a
            real measurement of nothing, which it isn't. */}
        {entry.calories === null ? (
          <ThemedText themeColor="textSecondary">—</ThemedText>
        ) : (
          <ThemedText type="smallBold">{Math.round(entry.calories)} kcal</ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  // Icon + name grouped on the left so calories stay pinned right.
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  icon: {
    fontSize: 20,
  },
  name: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
