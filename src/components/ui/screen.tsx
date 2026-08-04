// The frame every tab screen sits in.
//
// It resolves to one of two shapes, and `useLayout()` decides which:
//
// - **Dashboard** (desktop web): the screen fills its pane edge to edge. The
//   sidebar already owns the left of the window, so there is nothing to center
//   against and no phone-width cap — `DashboardMaxWidth` only stops an
//   ultrawide monitor from stretching a line of body text across a metre.
// - **Column** (native, mobile web): a centered reading column capped at
//   `MaxContentWidth`, clear of the platform's own tab bar. Both bars now sit
//   at the bottom — the native platform one, and mobile web's floating pill
//   (`app-tabs.web.tsx`) — so the column pads its bottom on either platform and
//   nothing pads the top. Getting that wrong is what slides content under the
//   nav.
import type { ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { GradientFill } from '@/components/ui/gradient';
import {
  BottomTabInset,
  DashboardMaxWidth,
  MaxContentWidth,
  Spacing,
  WebTabBarInset,
} from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';

/** How far the page's ambient wash reaches down from the top edge. Roughly the
 *  height of a hero card, so it fades out behind the first thing on the page
 *  rather than tinting the whole scroll. */
const WASH_HEIGHT = 360;

/** Clearance for the platform's own tab bar, in the column shape. Nothing is
 *  reserved at the *top* on either platform any more, now that mobile web's bar
 *  has moved down to join native's. */
const columnBottomInset = Platform.select({
  web: WebTabBarInset,
  default: BottomTabInset + Spacing.three,
});

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { isDashboard } = useLayout();
  const theme = useTheme();

  return (
    <ThemedView style={styles.canvas}>
      {/* Ambient wash down the top of the page. It is the flat canvas color
          that makes a tinted palette look like a spreadsheet; this is the one
          gradient that costs nothing to have on every screen, because it sits
          behind everything and fades to the canvas before any content. */}
      <View pointerEvents="none" style={styles.wash}>
        <GradientFill from={theme.glowFrom} to={theme.glowTo} direction="vertical" />
      </View>
      <SafeAreaView
        style={[
          styles.frame,
          isDashboard ? { maxWidth: DashboardMaxWidth } : { maxWidth: MaxContentWidth },
          style,
        ]}
        // The dashboard shell has no notch to dodge and no floating bar to
        // clear; its own padding is enough.
        edges={isDashboard ? [] : ['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

/** `Screen` with the standard scrolling body — gutters, vertical rhythm, and
 *  bottom clearance already applied to the content container. */
export function ScreenScroll({
  children,
  contentStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useScreenContentInsets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          {
            paddingHorizontal: insets.paddingHorizontal,
            paddingTop: insets.paddingTop,
            paddingBottom: insets.paddingBottom,
            gap: Spacing.four,
          },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...rest}>
        {children}
      </ScrollView>
    </Screen>
  );
}

/**
 * The gutters and rhythm `ScreenScroll` applies, for screens driving their own
 * list (a `SectionList`, say) that must match the same measurements.
 *
 * The dashboard breathes more: wider gutters and real top padding, because
 * there is no floating bar above the content to stand in for it.
 */
export function useScreenContentInsets() {
  const { isDashboard } = useLayout();

  return {
    paddingHorizontal: isDashboard ? Spacing.five : Spacing.four,
    paddingTop: isDashboard ? Spacing.five : 0,
    paddingBottom: isDashboard ? Spacing.five : columnBottomInset,
  };
}

/**
 * Just the bottom clearance, for a screen that draws its own frame instead of
 * using `Screen` — the pushed stack screens (review, the library, profile's
 * sub-pages). The tab bar floats over those exactly as it does over a tab's own
 * screen, and each of them ends in something you have to be able to reach: a
 * "Log it" button, the last row of a list.
 */
export function useTabBarClearance(): number {
  const { isDashboard } = useLayout();
  return isDashboard ? 0 : columnBottomInset;
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: WASH_HEIGHT,
  },
  frame: {
    flex: 1,
    width: '100%',
  },
});
