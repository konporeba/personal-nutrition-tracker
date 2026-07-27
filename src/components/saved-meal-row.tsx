// One row of the saved-meals library: an icon, the meal's name, and its
// calories — the exact visual layout of `MealEntryRow`, since a saved meal is
// rendered the same way a logged entry is.
//
// Tap re-logs it to today instantly (S-08, FR-011's ≤2-interaction path).
// Long-press opens the management sheet (Edit / Delete / Log to another day),
// following the same "tap vs long-press, never conflicting" split as
// `MealEntryRow` — RN fires only one of `onPress`/`onLongPress` per touch.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SavedMeal } from '@/data/types';
import { iconForEntry } from '@/lib/food-emoji';

export function SavedMealRow({
  savedMeal,
  onPress,
  onLongPress,
}: {
  savedMeal: SavedMeal;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedView type="backgroundElement" style={styles.left}>
          <ThemedText style={styles.icon}>{iconForEntry(savedMeal)}</ThemedText>
          <ThemedText style={styles.name} numberOfLines={2}>
            {savedMeal.name}
          </ThemedText>
        </ThemedView>
        {/* A missing calorie value renders as a dash — showing 0 would read as a
            real measurement of nothing, which it isn't. */}
        {savedMeal.calories === null ? (
          <ThemedText themeColor="textSecondary">—</ThemedText>
        ) : (
          <ThemedText type="smallBold">{Math.round(savedMeal.calories)} kcal</ThemedText>
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
