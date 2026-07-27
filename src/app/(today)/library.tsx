// Saved meals library (S-08): every meal saved from the review screen. Tapping
// one re-logs it to today instantly — no AI call, no confirmation screen — the
// path that satisfies FR-011's "at most two interactions" requirement (open
// library, tap the row). Long-press management (Edit / Delete / Log to
// another day) is wired in Phase 4.
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { SavedMealRow } from '@/components/saved-meal-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { SavedMeal } from '@/data/types';
import { useCreateMealEntry } from '@/data/use-meal-entries';
import { useSavedMeals } from '@/data/use-saved-meals';
import { sectionForTime } from '@/lib/section-for-time';

export default function LibraryScreen() {
  const router = useRouter();
  const { data, isPending, isError } = useSavedMeals();
  const createEntry = useCreateMealEntry();
  const savedMeals = data ?? [];

  function relog(savedMeal: SavedMeal) {
    if (createEntry.isPending) return;
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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Saved meals' }} />
      <ThemedView style={styles.inner}>
        <FlatList
          data={savedMeals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SavedMealRow savedMeal={item} onPress={() => relog(item)} />}
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
        {createEntry.isPending ? <ActivityIndicator style={styles.logging} /> : null}
      </ThemedView>
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
