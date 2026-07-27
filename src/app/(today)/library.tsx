// Saved meals library (S-08): every meal saved from the review screen. Tapping
// one re-logs it to today instantly — no AI call, no confirmation screen — the
// path that satisfies FR-011's "at most two interactions" requirement (open
// library, tap the row). Long-press opens a management sheet: Edit, Delete, or
// "Log to another day…".
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { LogToDaySheet } from '@/components/log-to-day-sheet';
import { SavedMealActionsSheet } from '@/components/saved-meal-actions-sheet';
import { SavedMealRow } from '@/components/saved-meal-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { SavedMeal, Section } from '@/data/types';
import { useCreateMealEntry } from '@/data/use-meal-entries';
import { useDeleteSavedMeal, useSavedMeals } from '@/data/use-saved-meals';
import { sectionForTime } from '@/lib/section-for-time';

export default function LibraryScreen() {
  const router = useRouter();
  const { data, isPending, isError } = useSavedMeals();
  const createEntry = useCreateMealEntry();
  const deleteSavedMeal = useDeleteSavedMeal();
  const savedMeals = data ?? [];

  // The saved meal targeted by a long-press, or null when the actions sheet is
  // closed. Only one of the two sheets below is ever visible at a time.
  const [actionsFor, setActionsFor] = useState<SavedMeal | null>(null);
  const [loggingDayFor, setLoggingDayFor] = useState<SavedMeal | null>(null);

  function relog(savedMeal: SavedMeal) {
    // `isSuccess` matters as much as `isPending`: between `onSuccess` firing
    // and the navigation unmounting this screen there is a frame in which the
    // row would otherwise be tappable again, and a second tap would commit a
    // duplicate entry — same reasoning as `review.tsx`'s `canSave` guard.
    if (createEntry.isPending || createEntry.isSuccess) return;
    const loggedAt = new Date();

    createEntry.mutate(
      {
        logged_at: loggedAt.toISOString(),
        section: sectionForTime(loggedAt),
        source: 'saved_meal',
        name: savedMeal.name,
        calories: savedMeal.calories,
        protein_g: savedMeal.protein_g,
        carbs_g: savedMeal.carbs_g,
        fat_g: savedMeal.fat_g,
        food_category: savedMeal.food_category,
        // No AI call is involved in a re-log — there is no run to link.
        estimation_run_id: null,
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      }
    );
  }

  // Same write path as `relog`, except the day comes from the picker rather
  // than "now" — the picked calendar day combined with the current
  // clock-time, so `logged_at` lands in the picked day's local bucket and
  // still carries a sensible time-of-day for the chosen section.
  function logToDay(savedMeal: SavedMeal, day: Date, section: Section) {
    // Same double-submit guard as `relog` — `createEntry` is one shared
    // mutation instance for the whole screen, so this closes the window for
    // both write paths.
    if (createEntry.isPending || createEntry.isSuccess) return;
    const now = new Date();
    const loggedAt = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      now.getHours(),
      now.getMinutes()
    );

    createEntry.mutate(
      {
        logged_at: loggedAt.toISOString(),
        section,
        source: 'saved_meal',
        name: savedMeal.name,
        calories: savedMeal.calories,
        protein_g: savedMeal.protein_g,
        carbs_g: savedMeal.carbs_g,
        fat_g: savedMeal.fat_g,
        food_category: savedMeal.food_category,
        estimation_run_id: null,
      },
      {
        onSuccess: () => {
          setLoggingDayFor(null);
          if (router.canGoBack()) router.back();
        },
      }
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Saved meals' }} />
      <ThemedView style={styles.inner}>
        <FlatList
          data={savedMeals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SavedMealRow
              savedMeal={item}
              onPress={() => relog(item)}
              onLongPress={() => setActionsFor(item)}
            />
          )}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {isPending
                ? 'Loading…'
                : isError
                  ? "Couldn't load your saved meals."
                  : 'No saved meals yet. Check "Save to library" when logging a meal.'}
            </ThemedText>
          }
          contentContainerStyle={styles.listContent}
        />
        {createEntry.isError ? (
          <ThemedText type="small" themeColor="textSecondary">
            Couldn&apos;t log that meal. Try again.
          </ThemedText>
        ) : null}
        {deleteSavedMeal.isError ? (
          <ThemedText type="small" themeColor="textSecondary">
            Couldn&apos;t delete that saved meal. Try again.
          </ThemedText>
        ) : null}
        {createEntry.isPending ? <ActivityIndicator style={styles.logging} /> : null}
      </ThemedView>
      <SavedMealActionsSheet
        visible={actionsFor !== null}
        savedMeal={actionsFor}
        onEdit={(savedMeal) => {
          setActionsFor(null);
          router.push({ pathname: '/(today)/saved-meal-edit', params: { id: savedMeal.id } });
        }}
        onLogToAnotherDay={(savedMeal) => {
          setActionsFor(null);
          setLoggingDayFor(savedMeal);
        }}
        onDelete={(savedMeal) => {
          setActionsFor(null);
          deleteSavedMeal.mutate(savedMeal);
        }}
        onRequestClose={() => setActionsFor(null)}
      />
      <LogToDaySheet
        visible={loggingDayFor !== null}
        savedMeal={loggingDayFor}
        onLog={(day, section) => loggingDayFor && logToDay(loggingDayFor, day, section)}
        onRequestClose={() => setLoggingDayFor(null)}
      />
    </ThemedView>
  );
}

function Separator() {
  return <ThemedView style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  logging: {
    paddingVertical: Spacing.two,
  },
});
