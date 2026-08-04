// One place that decides "which shape is this app right now".
//
// Two independent questions get answered here, and conflating them is what
// makes responsive code rot: `isWide` is about *how much room is there*
// (does a second column of cards fit), while `isDashboard` is about *which
// navigation shell is mounted* (the desktop sidebar, or the phone layout).
// Only web ever becomes a dashboard — native is a phone even on a tablet,
// because `NativeTabs` is the navigation there.
import { Platform, useWindowDimensions } from 'react-native';

import { Breakpoints } from '@/constants/theme';

export function useLayout() {
  const { width } = useWindowDimensions();
  // Width is 0 during static rendering, before the client knows the viewport.
  // Assume desktop there: it is the common case for web, and it keeps the
  // server markup and the first client render identical for those visitors.
  const effectiveWidth = width > 0 ? width : Breakpoints.desktop;
  const isWeb = Platform.OS === 'web';

  return {
    width: effectiveWidth,
    /** Enough room for side-by-side cards. True on wide native tablets too. */
    isWide: effectiveWidth >= Breakpoints.wide,
    /** The desktop web shell: sidebar nav, full-bleed dashboard grid. */
    isDashboard: isWeb && effectiveWidth >= Breakpoints.desktop,
    isWeb,
  };
}
