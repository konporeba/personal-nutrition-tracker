// The app's primary action, as a single disc: log a meal.
//
// One component for both shells, because it is one control — mobile web sets it
// into the center of the bottom bar (`app-tabs.web.tsx`) and native floats it
// over Today (`capture-fab.tsx`), but a user moving between them is looking at
// the same button and it should not be two designs drifting apart.
//
// Deliberately quiet. An earlier version wore the brand gradient, a specular
// highlight and an accent glow, and the result was the loudest thing on a
// screen whose actual content is the day's numbers — a control shouting over
// the data it exists to add to. This one is the same surface and the same edge
// as the bar it sits in, and everything that marks it as *the* action is
// structural rather than decorative:
//
// - **Position** — dead center of the bar, raised out of it.
// - **The gap** — a ring of page background separates the disc from the bar, so
//   it reads as its own element rather than as a fifth tab. That ring is the
//   `cradle`, and it is the whole reason the button looks deliberate instead of
//   parked. A button floating over content doesn't get one: there is no surface
//   for it to be cut out of, and the ring would read as a hole in the content.
// - **The mark** — the only accent-coloured thing in the bar.
//
// The press is a spring on the UI thread rather than an opacity flash, which is
// the one piece of the old version worth keeping: it makes the disc feel like
// an object. `useReducedMotion` is honoured — the state still changes, it just
// arrives instantly.
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { PlusBadge } from '@/components/ui/plus-badge';
import { floatShadow, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Snappy and slightly under-damped — it settles with the faintest overshoot,
 *  which is what makes the disc feel like an object rather than a fade. */
const SPRING = { damping: 15, stiffness: 300, mass: 0.6 } as const;

/** Width of the page-background ring that separates the disc from the bar. */
const CRADLE_GAP = 6;

export function PlusButton({
  /** Diameter of the disc itself. Everything else scales off it. */
  size,
  onPress,
  accessibilityLabel,
  /** Draw the page-background ring that holds the disc apart from the bar
   *  behind it. See the header for when not to. */
  cradle = false,
}: {
  size: number;
  onPress: () => void;
  accessibilityLabel: string;
  cradle?: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  function setPressed(next: number) {
    pressed.value = reducedMotion ? next : withSpring(next, SPRING);
  }

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.09 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(1)}
      onPressOut={() => setPressed(0)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}>
      {cradle ? (
        <View
          pointerEvents="none"
          style={[
            styles.cradle,
            {
              width: size + CRADLE_GAP * 2,
              height: size + CRADLE_GAP * 2,
              top: -CRADLE_GAP,
              left: -CRADLE_GAP,
              backgroundColor: theme.background,
            },
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.body,
          {
            width: size,
            height: size,
            // The bar's own surface and edge. The disc is a peer of the thing it
            // sits in, not a foreign object dropped onto it.
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
          floatShadow(theme.shadow),
          bodyStyle,
        ]}>
        {/* Drawn, not typed. A `+` from the loaded font is at the mercy of what
            that font thinks a plus is at 30px, and the ➕ emoji is worse — most
            platforms render U+2795 as a *green* glyph, which no amount of
            styling can override and which belongs to no part of this palette.
            Two rounded bars are the same weight and optical center everywhere
            (see `plus-badge.tsx`). `backgroundColor` matches the disc purely to
            suppress the badge's own ring — the fill is invisible. */}
        <PlusBadge
          size={Math.round(size * 0.55)}
          color={theme.accent}
          backgroundColor={theme.surface}
          bold
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cradle: {
    position: 'absolute',
    borderRadius: Radius.pill,
  },
  body: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    // A full 1px, not a hairline: on a dark canvas a sub-pixel edge fades out
    // entirely and the disc loses its outline against the page.
    borderWidth: 1,
  },
});
