// The logging streak, above the header's primary action: a flame and the run
// of consecutive days the owner has recorded something (see `lib/streak.ts`
// for what "something" means and why today counts as pending, not broken).
//
// It renders nothing on a broken streak — a "0 days" badge is a scold, and the
// screen already says the day is empty. From one day up it shows, because the
// first day is exactly when the counter has something to encourage.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Below this the badge is hidden entirely. */
const MIN_STREAK = 1;

export function StreakPill({ days }: { days: number }) {
  const theme = useTheme();

  if (days < MIN_STREAK) return null;

  return (
    <ThemedView
      type="transparent"
      accessibilityRole="text"
      accessibilityLabel={`${days} ${days === 1 ? 'day' : 'days'} logging streak`}
      style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
      <ThemedText style={styles.flame}>🔥</ThemedText>
      <ThemedText type="smallBold" themeColor="accentText">
        {days.toLocaleString()} {days === 1 ? 'day' : 'days'}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    // Centered rather than left-aligned, and no `alignSelf`: the pill sits in
    // a stretched column beside the header's primary action on the dashboard,
    // where it should match that button's width.
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  flame: {
    fontSize: 15,
    lineHeight: 19,
  },
});
