// Today — the app's front door and the read side of the core loop: what has been
// logged so far and what it adds up to. The composer that feeds it arrives in
// Phase 2; browsing other days is S-11, so this is always the current day.
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayTotal } from '@/components/day-total';
import { MealEntryRow } from '@/components/meal-entry-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useDayEntries } from '@/data/use-meal-entries';

export default function TodayScreen() {
  // One instant for the whole render, so the header label and the query key
  // cannot disagree if the render straddles midnight.
  const today = useMemo(() => new Date(), []);
  const { data, isPending, isError } = useDayEntries(today);
  const entries = data ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <MealEntryRow entry={item} />}
          ListHeaderComponent={<DayTotal entries={entries} date={today} />}
          ListEmptyComponent={
            <EmptyState isPending={isPending} isError={isError} />
          }
          contentContainerStyle={[styles.listContent, contentPlatformStyle]}
          ItemSeparatorComponent={Separator}
        />
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
// bottom. Each platform pads away from its own.
const contentPlatformStyle = Platform.select({
  web: { paddingTop: Spacing.six },
  default: { paddingBottom: BottomTabInset + Spacing.three },
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
});
