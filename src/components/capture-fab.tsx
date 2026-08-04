// The most prominent control in the app, on native: log a meal. Floats over the
// day list, clear of the tab bar, and opens the add-meal popup
// (`add-meal-sheet.tsx`) where the four ways in — describe it, photograph a
// plate, scan a label, pick a saved meal — are all one tap away.
//
// This file is only the *placement*. The button itself is `PlusButton`, shared
// with mobile web's bottom bar, so the app's primary action is one design in
// one file rather than two that drift.
//
// Why a floating button and not a center tab: SDK 57's `NativeTabs` renders a
// real platform tab bar, which has no supported slot for a raised custom tab.
// Faking one would mean abandoning the native bar entirely. So native gets an
// overlaid FAB on the screen logging belongs to, and the web shell — which
// draws its own bar — raises the same disc into the middle of it (see
// `app-tabs.web.tsx`).
import { Platform, StyleSheet, View } from 'react-native';

import { PlusButton } from '@/components/plus-button';
import { BottomTabInset, Spacing } from '@/constants/theme';

const SIZE = 64;

export function CaptureFab({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.anchor}>
      {/* No cradle here: this disc floats over a scrolling list, so there is no
          surface for it to be cut out of and a ring of page background would
          read as a hole punched in the content. */}
      <PlusButton size={SIZE} accessibilityLabel="Log a meal" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: Spacing.four,
    // Clear of the tab bar on native; on web the FAB is not rendered at all,
    // but the fallback keeps the value defined for any future embedding.
    bottom: Platform.select({ web: Spacing.four, default: BottomTabInset + Spacing.three }),
  },
});
