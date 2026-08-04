// One consumed-vs-target bar: a label, `consumed / target unit`, and a track
// filled to how much of the target is used.
//
// The bar clamps at full — going over target reads as "done", not as an
// overflowing bar — and a null/absent target degrades to the consumed value
// with no bar, rather than dividing by zero or fabricating a denominator.
//
// The fill's color is `classifyDayAdherence`'s verdict, the same ±5% band the
// week rail and the hero ring use. It used to be a strict `consumed > target`
// test of its own, which is how this bar could read red on a day the calendar
// called on-target.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ADHERENCE_COLOR } from '@/components/ui/adherence-color';
import { Radius, Spacing } from '@/constants/theme';
import { classifyDayAdherence } from '@/lib/adherence';
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
  const status = hasBar ? classifyDayAdherence(consumed, target) : null;

  return (
    <ThemedView type="transparent" style={styles.row}>
      <ThemedView type="transparent" style={styles.header}>
        <ThemedText type="small" themeColor="textMuted">
          {label}
        </ThemedText>
        <ThemedView type="transparent" style={styles.valueRow}>
          <ThemedText type="smallBold">{Math.round(consumed).toLocaleString()}</ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {hasBar ? `/ ${Math.round(target).toLocaleString()} ${unit}` : unit}
          </ThemedText>
        </ThemedView>
      </ThemedView>
      {hasBar ? (
        <View style={[styles.track, { backgroundColor: theme.track }]}>
          <View
            style={[
              styles.fill,
              {
                // The adherence signal, shared with the hero ring and the week
                // rail — never a new color for the same meaning.
                backgroundColor: status ? theme[ADHERENCE_COLOR[status]] : theme.accent,
                width: `${fraction * 100}%`,
              },
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
    gap: Spacing.one + 2,
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
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});
