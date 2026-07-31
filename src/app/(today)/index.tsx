// Today — the app's front door and the whole core loop in one screen: describe a
// meal at the top, see what has been logged and what it adds up to below.
// `DayView` (S-11) owns the actual day surface, parameterized by `date`; this
// screen's own job is just resolving "today" and adding the composer on top.
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayView } from '@/components/day-view';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDayEntries } from '@/data/use-meal-entries';

export default function TodayScreen() {
  // `day` comes back from the hook so the header label and the query key are the
  // same instant by construction, and so the day rolls over on resume. `DayView`
  // resolves the same day again internally (same query key, so TanStack Query
  // dedupes the read) — this call exists only to hand `day` to `DayView`.
  const { day } = useDayEntries();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={[styles.safeArea, surfacePlatformStyle]}
        edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <DayView date={day} showComposer />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

// The web tab bar floats over the top of the screen; the native one sits at the
// bottom. Each platform pads away from its own — the top clearance has to sit on
// the surface rather than the list, or the pinned composer slides under the bar.
const surfacePlatformStyle = Platform.select({ web: { paddingTop: Spacing.six } });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  fill: {
    flex: 1,
  },
});
