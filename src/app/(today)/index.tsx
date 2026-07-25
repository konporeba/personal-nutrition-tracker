// Today — the app's front door and the whole core loop in one screen: describe a
// meal at the top, see what has been logged and what it adds up to below.
// Browsing other days is S-11, so this is always the current day.
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayTotal } from '@/components/day-total';
import { MealComposer } from '@/components/meal-composer';
import { MealEntryRow } from '@/components/meal-entry-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useDayEntries, useDeleteMealEntry } from '@/data/use-meal-entries';
import { useTargets } from '@/data/use-profile';

export default function TodayScreen() {
  // `day` comes back from the hook so the header label and the query key are the
  // same instant by construction, and so the day rolls over on resume.
  const { query, day } = useDayEntries();
  const { data, isPending, isError } = query;
  const deleteEntry = useDeleteMealEntry();
  const entries = data ?? [];

  // Effective (resting) targets for the header's consumed-vs-target bars; null
  // until a profile and a first weight exist, in which case DayTotal falls back
  // to the bare S-01 total.
  const { targets } = useTargets();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={[styles.safeArea, surfacePlatformStyle]}
        edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Pinned above the list, not inside it — the input should never
              scroll out of reach. */}
          <ThemedView style={styles.composer}>
            <MealComposer />
          </ThemedView>
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => (
              <MealEntryRow entry={item} onLongPress={() => deleteEntry.mutate(item)} />
            )}
            ListHeaderComponent={
              <>
                <DayTotal entries={entries} date={day} targets={targets} />
                {/* A failed soft delete leaves the row in place, which reads as
                    "the long-press didn't register" — say so instead. */}
                {deleteEntry.isError ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.deleteError}>
                    Couldn&apos;t delete that entry. Try again.
                  </ThemedText>
                ) : null}
              </>
            }
            ListEmptyComponent={
              <EmptyState isPending={isPending} isError={isError} />
            }
            contentContainerStyle={[styles.listContent, listPlatformStyle]}
            ItemSeparatorComponent={Separator}
            keyboardShouldPersistTaps="handled"
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Separator() {
  return <ThemedView style={styles.separator} />;
}

function EmptyState({ isPending, isError }: { isPending: boolean; isError: boolean }) {
  if (isPending) return <ActivityIndicator style={styles.empty} />;

  return (
    <ThemedText themeColor="textSecondary" style={styles.empty}>
      {isError ? "Couldn't load today's entries." : 'Nothing logged yet today.'}
    </ThemedText>
  );
}

// The web tab bar floats over the top of the screen; the native one sits at the
// bottom. Each platform pads away from its own — the top clearance has to sit on
// the surface rather than the list, or the pinned composer slides under the bar.
const surfacePlatformStyle = Platform.select({ web: { paddingTop: Spacing.six } });
const listPlatformStyle = Platform.select({
  default: { paddingBottom: BottomTabInset + Spacing.three },
  web: undefined,
});

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
  composer: {
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  deleteError: {
    paddingBottom: Spacing.two,
  },
});
