// The destination of a Net-vs-Budget chart tap (S-11, FR-031): a past day's
// full entry/session list, editable exactly like Today — and, since the
// past-day-logging change, composable into as well. `onAddToSection` opens the
// same app-wide add-meal popup Today uses, aimed at this route's day, so a gap
// spotted in the chart can be filled without navigating back to the rail.
// The Stack header (from `analytics/_layout.tsx`) supplies back navigation
// automatically; this screen only sets its title.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAddMeal } from '@/components/add-meal-provider';
import { DayView } from '@/components/day-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { parseLocalDayKey } from '@/lib/local-day';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function AnalyticsDayScreen() {
  const router = useRouter();
  // `AddMealProvider` wraps `AppTabs` (`src/app/_layout.tsx`), so the popup this
  // opens is the same single instance the Today tab and the tab bar's ＋ use —
  // no second copy mounted over this route.
  const addMeal = useAddMeal();
  const { date } = useLocalSearchParams<{ date?: string }>();
  // Through the parser, never `new Date(date)` — this screen composes entries
  // (see `onAddToSection` below), so it is a write surface and needs the same
  // trust boundary `review.tsx` and `library.tsx` use. Raw parsing failed three
  // ways here: an unparseable param yields an `Invalid Date`, which is *truthy*,
  // so `MissingDay` never fired and the formatter threw; an ISO instant resolved
  // to the previous local day across a DST boundary; and nothing clamped a
  // hand-edited future day, which would have shown one day in the composer while
  // the entry landed in another.
  const parsedDate = parseLocalDayKey(date) ?? null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: parsedDate ? dayFormat.format(parsedDate) : 'Day' }} />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        {parsedDate ? (
          <DayView
            date={parsedDate}
            onAddToSection={(section) => addMeal.open(section, parsedDate)}
          />
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
      <AppButton label="Go back" variant="primary" onPress={onBack} />
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
    gap: Spacing.three,
  },
});
