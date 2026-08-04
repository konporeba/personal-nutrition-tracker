// A row of mutually exclusive options: the analytics window, the profile's
// sex/activity/goal pickers, the theme preference. One implementation so
// "selected" looks the same everywhere — previously each screen rolled its own
// and they disagreed about what a selected option looks like.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SegmentedOption<T extends string | number> = { value: T; label: string };

export function Segmented<T extends string | number>({
  options,
  value,
  onSelect,
  /** Fill the row, splitting the width evenly. Off by default (hug content). */
  full = false,
  /**
   * Tighter padding and smaller type, for a `full` row with more options than a
   * phone has room for at the normal size. Use it with shortened labels — this
   * buys the row about a third of its width back, not a whole word.
   */
  compact = false,
  /**
   * The floor an option may shrink to before the row wraps. Set it and the
   * track fills its container and tiles the options into even rows — as many
   * per row as fit, growing to share the width, wrapping when they don't.
   *
   * This is the answer for a set with more options than a phone has room for
   * but labels too long to abbreviate (the profile's activity levels): it gives
   * three across on a phone and all five on a dashboard card, from one number,
   * with no breakpoint to keep in sync. `full` is the simpler sibling — use it
   * when the set always fits on one line.
   */
  minOptionWidth,
  /** Names the group for screen readers, since the options alone may be
   *  abbreviated to the point of not standing on their own. */
  accessibilityLabelFor,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onSelect: (next: T) => void;
  full?: boolean;
  compact?: boolean;
  minOptionWidth?: number;
  accessibilityLabelFor?: (option: SegmentedOption<T>) => string;
}) {
  const theme = useTheme();
  const tiled = minOptionWidth !== undefined;

  return (
    <ThemedView
      type="transparent"
      style={[
        styles.row,
        (full || tiled) && styles.rowFull,
        { backgroundColor: theme.surfaceSoft },
      ]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={accessibilityLabelFor?.(option)}
            style={({ pressed }) => [
              full && styles.grow,
              tiled && [styles.tile, { flexBasis: minOptionWidth }],
              pressed && styles.pressed,
            ]}>
            <ThemedView
              type="transparent"
              style={[
                styles.segment,
                compact && styles.segmentCompact,
                // The selected pill is a raised surface inside the recessed
                // track — the same figure/ground trick the cards use.
                selected && { backgroundColor: theme.surface },
              ]}>
              <ThemedText
                type={compact ? 'micro' : 'smallBold'}
                themeColor={selected ? 'text' : 'textMuted'}
                // Ellipsize rather than wrap: a two-line option would make the
                // whole track taller than every other control in the sheet.
                numberOfLines={1}>
                {option.label}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
    gap: Spacing.half,
    padding: Spacing.half + 1,
    borderRadius: Radius.control,
  },
  rowFull: {
    // Without this the track keeps the `alignSelf: 'flex-start'` above and
    // hugs its options, so `full` grew the segments inside a box that never
    // got any wider — the prop did nothing.
    alignSelf: 'stretch',
  },
  grow: {
    flexGrow: 1,
    // Equal shares rather than each option sized to its own label, so a
    // three-option row doesn't come out lopsided.
    flexBasis: 0,
  },
  tile: {
    // `flexBasis` comes from `minOptionWidth`. Growing from a real width rather
    // than from 0 is the whole trick: options share the row evenly while they
    // fit, and wrap to the next line instead of squeezing when they don't.
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  segment: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
  },
  segmentCompact: {
    paddingVertical: Spacing.two - 1,
    paddingHorizontal: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
