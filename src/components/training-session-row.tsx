// One row of the Training list: type + intensity on the left, burn on the
// right — the `MealEntryRow` layout convention, one slice over. Tapping opens
// the session detail screen (edit/delete); there is no long-press gesture.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { TrainingIntensity, TrainingSession } from '@/data/types';

const INTENSITY_LABELS: Record<TrainingIntensity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export function TrainingSessionRow({
  session,
  onPress,
}: {
  session: TrainingSession;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedView type="backgroundElement" style={styles.left}>
          <ThemedText style={styles.type} numberOfLines={1}>
            {session.session_type}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {INTENSITY_LABELS[session.intensity]} · {session.duration_minutes} min
          </ThemedText>
        </ThemedView>
        <ThemedText type="smallBold">{Math.round(session.burn_kcal)} kcal</ThemedText>
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
  left: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  type: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
