// One consumed-vs-target row on Today: a label, `consumed / target unit`, and a
// bar filled to how much of the target is used. Shared by calories and each of
// the three macros. The bar clamps at full — going over target reads as "done",
// not as an overflowing bar — and a null/absent target degrades to consumed with
// no bar rather than dividing by zero or fabricating a denominator.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function MacroProgress({
  label,
  unit,
  consumed,
  target,
}: {
  label: string;
  unit: string;
  /** Grams (or kcal) logged so far today. */
  consumed: number;
  /** The effective daily target, or null when none can be derived yet. */
  target: number | null;
}) {
  const theme = useTheme();

  // A missing or non-positive target has no meaningful denominator; show the
  // consumed number alone rather than a bar filled against nothing.
  const hasBar = target !== null && target > 0;
  const fraction = hasBar ? clamp(consumed / target, 0, 1) : 0;

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.header}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedView style={styles.valueRow}>
          <ThemedText type="smallBold">{Math.round(consumed)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hasBar ? `/ ${Math.round(target)} ${unit}` : unit}
          </ThemedText>
        </ThemedView>
      </ThemedView>
      {hasBar ? (
        <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: theme.text, width: `${fraction * 100}%` },
            ]}
          />
        </View>
      ) : null}
    </ThemedView>
  );
}

/** Bound a value to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  track: {
    height: Spacing.two,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Spacing.one,
  },
});
