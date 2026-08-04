// Web app shell. Keep in sync with `app-tabs.tsx` — Metro picks one per
// platform, so a tab added there and not here breaks native silently (and vice
// versa).
//
// Two shells, one set of triggers:
//
// - **Desktop (≥ `Breakpoints.desktop`)** is a real dashboard. A fixed left
//   rail holds the brand, the nav, the capture button and the theme control,
//   and the content pane takes the entire rest of the window. `Tabs` is a
//   `ViewProps` host, so making it a flex row and putting the `TabList` before
//   the `TabSlot` is all the layout this needs.
// - **Mobile web (< that)** is the phone: a floating *bottom* bar of icon tabs
//   with a raised ＋ in its center, over a single centered column. The phone
//   idiom, and the one the thumb can actually reach — it used to be a top bar
//   with text labels, which neither fit the width nor sat anywhere near a
//   thumb.
//
// Both shells render the same `TabTrigger`s, so routing behaves identically and
// there is only one list of tabs to keep in sync with native.
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAddMeal } from '@/components/add-meal-provider';
import { PlusButton } from '@/components/plus-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandMark } from '@/components/ui/brand-mark';
import { GradientFill } from '@/components/ui/gradient';
import {
  floatShadow,
  MaxContentWidth,
  MobileTabBar,
  Radius,
  SidebarWidth,
  Spacing,
} from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';

// Emoji rather than the geometric glyphs (`◈ ◑ ◔ ◎`) this started with: those
// were abstract enough that only their position told you which was which.
// Emoji are the icon set the rest of the app already uses — meal rows, training
// rows, the streak pill — so the rail now speaks the same language as the
// content it navigates to. `🏋️` for Training rather than `🔥`, which the streak
// pill has already claimed to mean something else.
//
// `bar: false` is Saved's, and it means "register the route, keep it off the
// phone's bottom bar". Every trigger a navigator will ever route to has to be
// declared inside its `TabList` — `triggersToScreens` builds the screen list
// from exactly these — so dropping the element would make `/saved` unreachable
// on mobile web rather than merely unlisted. Saved is off the bar because the
// bar has room for four tabs either side of a *centered* ＋, and the ＋'s own
// popup already offers "From saved meals" as one of its four ways to log.
const NAV_ITEMS = [
  { name: 'today', href: '/(today)', label: 'Today', icon: '🍽️', bar: true },
  { name: 'saved', href: '/saved', label: 'Saved', icon: '🥗', bar: false },
  { name: 'training', href: '/training', label: 'Training', icon: '💪🏻', bar: true },
  { name: 'analytics', href: '/analytics', label: 'Analytics', icon: '📊', bar: true },
  { name: 'profile', href: '/profile', label: 'Profile', icon: '👤', bar: true },
] as const;

/** The bar's tabs, split so the ＋ sits between two equal halves. */
const BAR_ITEMS = NAV_ITEMS.filter((item) => item.bar);
const LEFT_ITEMS = BAR_ITEMS.slice(0, Math.floor(BAR_ITEMS.length / 2));
const RIGHT_ITEMS = BAR_ITEMS.slice(Math.floor(BAR_ITEMS.length / 2));
const OFF_BAR_ITEMS = NAV_ITEMS.filter((item) => !item.bar);

export default function AppTabs() {
  const { isDashboard } = useLayout();

  return isDashboard ? <DashboardShell /> : <MobileShell />;
}

/* ---------------------------------------------------------------- desktop -- */

function DashboardShell() {
  return (
    <Tabs style={styles.shell}>
      {/* TabList first, TabSlot second: in a flex row that puts the rail on
          the left and gives the content pane everything else. */}
      <TabList asChild>
        <Sidebar>
          {NAV_ITEMS.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <SidebarLink icon={item.icon}>{item.label}</SidebarLink>
            </TabTrigger>
          ))}
        </Sidebar>
      </TabList>
      <TabSlot style={styles.pane} />
    </Tabs>
  );
}

function Sidebar({ children }: { children?: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Ambient wash behind the rail — the one place the brand gradient shows
          up as atmosphere rather than as a control. */}
      <GradientFill from={theme.glowFrom} to={theme.glowTo} direction="vertical" />

      <View style={styles.brandRow}>
        <BrandMark size={36} />
        <View>
          <ThemedText type="smallBold">Nutrition</ThemedText>
          <ThemedText type="micro" themeColor="textMuted">
            Tracker
          </ThemedText>
        </View>
      </View>

      <View style={styles.nav}>{children}</View>
    </View>
  );
}

function SidebarLink({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon?: string }) {
  const theme = useTheme();

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type="transparent"
        style={[styles.navItem, isFocused && { backgroundColor: theme.accentSoft }]}>
        {/* Emoji ignore `themeColor` — they carry their own palette — so the
            unfocused state is carried by opacity instead. Without it the icons
            would all sit at full strength and only the label would dim. */}
        <ThemedText style={[styles.navIcon, !isFocused && styles.navIconDim]}>
          {icon}
        </ThemedText>
        <ThemedText type="smallBold" themeColor={isFocused ? 'accentText' : 'textMuted'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

/* ----------------------------------------------------------------- mobile -- */

function MobileShell() {
  // Flat children, deliberately: `parseTriggersFromChildren` walks the
  // `TabList`'s (here `BottomBar`'s) immediate children and arrays of them, and
  // does *not* descend into arbitrary elements — a trigger wrapped in a layout
  // `View` would silently stop being a route. So the bar receives the triggers
  // and the ＋ as one flat list and does its grouping with flex instead.
  return (
    <Tabs>
      <TabSlot style={styles.fill} />
      <TabList asChild>
        <BottomBar>
          {LEFT_ITEMS.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <BottomBarLink icon={item.icon} label={item.label} />
            </TabTrigger>
          ))}
          {/* Not a tab: a fixed-width hole in the row, exactly as wide as the
              capture button that `BottomBar` floats over it. With equal
              numbers of tabs either side, that hole — and so the ＋ — is dead
              center of the bar without any measuring. */}
          <View style={styles.captureSlot} />
          {RIGHT_ITEMS.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <BottomBarLink icon={item.icon} label={item.label} />
            </TabTrigger>
          ))}
          {/* Declared so the route exists, rendered to nothing — see NAV_ITEMS. */}
          {OFF_BAR_ITEMS.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <BottomBarLink icon={item.icon} label={item.label} hidden />
            </TabTrigger>
          ))}
        </BottomBar>
      </TabList>
    </Tabs>
  );
}

function BottomBar({ children }: { children?: ReactNode }) {
  const theme = useTheme();
  const safeArea = useSafeAreaInsets();

  return (
    // `box-none`: the anchor spans the viewport's full width so it can center
    // the bar, and its padding must not swallow taps meant for the content
    // scrolling underneath it.
    <View
      pointerEvents="box-none"
      style={[styles.barAnchor, { paddingBottom: MobileTabBar.gap + safeArea.bottom }]}>
      <ThemedView
        type="surface"
        style={[styles.bar, { borderColor: theme.border }, floatShadow(theme.shadow)]}>
        {children}
      </ThemedView>
      {/* A full-width strip that centers its one child, rather than an
          absolutely positioned button trusting the parent's `alignItems` — the
          strip's centering is the same on every platform, which matters for the
          one control the whole screen is arranged around. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.captureAnchor,
          {
            bottom:
              MobileTabBar.gap +
              safeArea.bottom +
              (MobileTabBar.height - MobileTabBar.capture) / 2 +
              MobileTabBar.lift,
          },
        ]}>
        <CaptureButton />
      </View>
    </View>
  );
}

/**
 * One icon tab. Icon-only: five words of nav across a 360px viewport is what
 * the old top bar tried and could not fit, and the emoji are already the app's
 * icon language. The label survives as the spoken one, so the bar is no less
 * navigable with a screen reader than it was with text.
 */
function BottomBarLink({
  isFocused,
  icon,
  label,
  hidden = false,
  ...props
}: TabTriggerSlotProps & { icon: string; label: string; hidden?: boolean }) {
  const theme = useTheme();

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      style={({ pressed }) => [
        hidden ? styles.hidden : styles.barItem,
        pressed && !hidden && styles.pressed,
      ]}>
      <ThemedView
        type="transparent"
        style={[styles.barItemBody, isFocused && { backgroundColor: theme.accentSoft }]}>
        {/* Emoji ignore `themeColor` — they carry their own palette — so the
            unfocused state is carried by opacity instead. Without it every icon
            would sit at full strength and nothing would say which tab you are
            on. */}
        <ThemedText style={[styles.barIcon, !isFocused && styles.barIconDim]}>{icon}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

/**
 * The app's primary action, in the center of the bar: open the add-meal popup,
 * which is where the photo / label / description / saved-meal choice now lives
 * (`add-meal-sheet.tsx`). It used to go straight to the camera, which made one
 * of the four ways to log a meal the only one with a first-class control.
 *
 * Native gets the same job done by a FAB on Today (`capture-fab.tsx`), since
 * `NativeTabs` has no slot for a raised center tab.
 */
function CaptureButton() {
  const addMeal = useAddMeal();

  return (
    <PlusButton
      size={MobileTabBar.capture}
      accessibilityLabel="Log a meal"
      // Cut out of the bar rather than laid on top of it — this is the shell
      // that has a surface for the disc to be punched through.
      cradle
      onPress={() => addMeal.open()}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    height: '100%',
  },

  // — desktop —
  shell: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
  },
  sidebar: {
    width: SidebarWidth,
    height: '100%',
    padding: Spacing.four,
    gap: Spacing.four,
    borderRightWidth: StyleSheet.hairlineWidth,
    // Contains the ambient GradientFill.
    overflow: 'hidden',
  },
  pane: {
    flex: 1,
    height: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nav: {
    gap: Spacing.one,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
  },
  navIcon: {
    // A step up from the old glyphs: emoji carry detail, and at 15px the
    // dumbbell and the bar chart were a smudge apiece.
    fontSize: 17,
    lineHeight: 22,
    // Fixed width so the labels line up in a column whatever the emoji's own
    // advance width turns out to be — they are not all the same.
    width: 22,
    textAlign: 'center',
  },
  navIconDim: {
    opacity: 0.55,
  },

  // — mobile —
  barAnchor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: MobileTabBar.gap,
    paddingTop: MobileTabBar.gap,
    // Over the content, and over the raised capture button's own drop shadow.
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: MobileTabBar.height,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  barItem: {
    // Equal shares of whatever is left beside the capture slot, so the icons
    // are evenly spread at any viewport width instead of bunching up.
    flex: 1,
    alignItems: 'center',
  },
  barItemBody: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    paddingVertical: Spacing.two - 1,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  barIcon: {
    fontSize: 21,
    lineHeight: 26,
  },
  barIconDim: {
    opacity: 0.5,
  },
  hidden: {
    display: 'none',
  },
  captureSlot: {
    // The hole the capture button sits in. Wider than the button so the two
    // neighbouring tabs don't crowd it.
    width: MobileTabBar.capture + Spacing.four,
  },
  captureAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  pressed: {
    opacity: 0.7,
  },
});
