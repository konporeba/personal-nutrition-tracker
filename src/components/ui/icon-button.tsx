// A small square control carrying a glyph instead of a label — for the actions
// that have to sit *beside* the thing they act on rather than under it, where
// there is no room for a word. The daily-target overrides are the case that
// forced it: a "Reset" button that appeared under a field the moment you typed
// in it moved everything below it down the page mid-edit.
//
// The glyphs are drawn on `react-native-svg`, not typed — same reasoning as
// `PlusBadge`. A `✓` or a `✕` from the loaded font is at the mercy of whatever
// that font thinks those characters should look like at 20px, and they render
// at visibly different weights and optical sizes from each other. Two stroked
// paths on a shared 24-unit grid do not.
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Matches `Field`'s input height, so a pair of these sits flush beside one. */
const SIZE = 46;
const GLYPH_SIZE = 20;

export type IconGlyph = 'check' | 'cross';

const PATHS: Record<IconGlyph, string> = {
  check: 'M5 12.5 L9.75 17.5 L19 7',
  cross: 'M7 7 L17 17 M17 7 L7 17',
};

export function IconButton({
  glyph,
  /** Required: a glyph names nothing on its own. Say what pressing it does. */
  accessibilityLabel,
  onPress,
  /** `accent` marks the affirmative one of a pair — save against reset. */
  tone = 'neutral',
  disabled = false,
  pending = false,
}: {
  glyph: IconGlyph;
  accessibilityLabel: string;
  onPress: () => void;
  tone?: 'neutral' | 'accent';
  disabled?: boolean;
  pending?: boolean;
}) {
  const theme = useTheme();
  const inert = disabled || pending;
  const accent = tone === 'accent' && !inert;

  const stroke = inert ? theme.textMuted : accent ? theme.accentText : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inert, busy: pending }}
      // The box is already at the 44pt minimum; the slop covers the gap between
      // the pair so a near-miss between them still lands on one of them.
      hitSlop={Spacing.one}
      style={({ pressed }) => pressed && !inert && styles.pressed}>
      <ThemedView
        type="transparent"
        style={[
          styles.body,
          {
            backgroundColor: accent ? theme.accentSoft : theme.surfaceSoft,
            borderColor: accent ? theme.accentBorder : theme.border,
          },
          inert && styles.inert,
        ]}>
        {pending ? (
          <ActivityIndicator size="small" color={stroke} />
        ) : (
          <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
            <Path
              d={PATHS[glyph]}
              stroke={stroke}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inert: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.65,
  },
});
