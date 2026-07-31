// The destination of a Net-vs-Budget chart tap (S-11, FR-031): a past day's
// full entry/session list, editable exactly like Today — reuses `DayView`
// with `showComposer={false}`, since composing new entries into a past day
// is a distinct, unrequested capability (see the plan's "What We're NOT
// Doing"). The Stack header (from `(analytics)/_layout.tsx`) supplies back
// navigation automatically; this screen only sets its title.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayView } from '@/components/day-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function AnalyticsDayScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const parsedDate = date ? new Date(date) : null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: parsedDate ? dayFormat.format(parsedDate) : 'Day' }} />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        {parsedDate ? (
          <DayView date={parsedDate} showComposer={false} />
        ) : (
          <MissingDay onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** Reached with no/unparseable `date` param — there is nothing to show. */
function MissingDay({ onBack }: { onBack: () => void }) {
  return (
    <ThemedView style={styles.missing}>
      <ThemedText type="subtitle">No day selected</ThemedText>
      <ThemedText themeColor="textSecondary" onPress={onBack}>
        Go back
      </ThemedText>
    </ThemedView>
  );
}

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
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
