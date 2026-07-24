// One row of the Today list: what was eaten and what it cost. The sectioned day
// view (S-06) and the food icon (S-05) belong to later slices — this renders a
// flat chronological row.
//
// Deleting is a long-press, not a tap. There is deliberately no confirm step
// (editing a committed entry is S-07, so delete-and-relog is the whole correction
// path for now), which means the gesture itself has to be the safeguard.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealEntry } from '@/data/types';

export function MealEntryRow({
  entry,
  onLongPress,
}: {
  entry: MealEntry;
  onLongPress?: () => void;
}) {
  return (
    <Pressable onLongPress={onLongPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText style={styles.name} numberOfLines={2}>
          {entry.name}
        </ThemedText>
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
  name: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
