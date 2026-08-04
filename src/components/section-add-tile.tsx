// The empty slot under a meal section: a dashed drop-target with a `＋` in it,
// tapping which opens the composer already set to that section.
//
// This is what turns the five fixed sections (S-06/FR-057) from labels into
// *containers*. Before it, an empty section rendered as a bare heading with
// nothing under it — visible, but not something you could act on, so logging
// breakfast always meant going through the one global "Log a meal" control and
// picking the section by hand. The dashed outline is the whole affordance:
// it reads as a space waiting to be filled rather than as a button someone
// forgot to style.
//
// Only rendered for sections that are actually empty. A section with entries in
// it already shows its rows, and a permanent tile under each of the five would
// put four calls-to-action on a screen whose primary action is the capture
// button.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { PlusBadge } from '@/components/ui/plus-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SectionAddTile({
  /** The section's display name — for the spoken label, not shown on the tile. */
  label,
  /** Share the meal pane's leftover height with the other empty sections. */
  grow = false,
  onPress,
}: {
  label: string;
  grow?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${label.toLowerCase()}`}
      style={({ pressed }) => [grow && styles.grow, pressed && styles.pressed]}>
      <ThemedView
        type="transparent"
        style={[styles.tile, grow && styles.grow, { borderColor: theme.border }]}>
        <PlusBadge size={34} color={theme.textMuted} backgroundColor={theme.surfaceSoft} />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    // The floor, not the height. On the dashboard `grow` lets the empty
    // sections split whatever the meal pane has left over, so they fill it at
    // any window height instead of being tuned to one; this is what they
    // shrink to once there is nothing spare and the pane starts scrolling.
    minHeight: 72,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    // Hairline is too fine to read as "dashed" on a phone; 1px is the floor
    // where the gaps survive the device pixel ratio.
    borderStyle: 'dashed',
  },
  grow: {
    // Grow into spare height, never shrink below `minHeight` — once the
    // sections stop fitting, the pane scrolls rather than squashing them.
    flexGrow: 1,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.6,
  },
});
