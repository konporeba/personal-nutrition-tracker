// Saved meals — the library as something you can *manage*, in its own tab.
//
// The library already existed as `(today)/library.tsx`, but that screen is the
// re-log path: it is pushed from the capture popup, a tap logs the meal to
// today, and editing or deleting hid behind a long-press on a screen you only
// reach when you are trying to log something. So the library was, in practice,
// append-only.
//
// This is the same list with the opposite bias, and it is deliberately the
// Training tab's screen down to the header: a title, a count, one primary
// action, and a tap that opens the row in a sheet where it can be edited or
// deleted. `(today)/library.tsx` keeps its logging job unchanged.
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { SavedMealRow } from '@/components/saved-meal-row';
import { SavedMealSheet } from '@/components/saved-meal-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Screen, useScreenContentInsets } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import type { SavedMeal } from '@/data/types';
import { useSavedMeals } from '@/data/use-saved-meals';
import { useLayout } from '@/hooks/use-layout';

export default function SavedMealsScreen() {
  const { isWide } = useLayout();
  const insets = useScreenContentInsets();
  const { data, isPending, isError } = useSavedMeals();
  const savedMeals = data ?? [];

  // One sheet for both jobs: `editing` null with the sheet open means "add a
  // new saved meal", a meal means "edit that one".
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SavedMeal | null>(null);

  function open(savedMeal: SavedMeal | null) {
    setEditing(savedMeal);
    setSheetOpen(true);
  }

  return (
    <Screen>
      <FlatList
        data={savedMeals}
        keyExtractor={(savedMeal) => savedMeal.id}
        renderItem={({ item }) => (
          <SavedMealRow
            savedMeal={item}
            // Tap edits here, where the library's tap logs — the two screens
            // exist to do different things to the same row, so the subtitle
            // says which one you are on.
            subtitle="Tap to edit or delete"
            onPress={() => open(item)}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          // Same shape as Training's and Today's header — title and count on
          // the left, the primary action on the right.
          <ThemedView
            type="transparent"
            style={[styles.head, isWide ? styles.headWide : styles.headColumn]}>
            <ThemedView type="transparent" style={styles.headText}>
              <ThemedText type={isWide ? 'title' : 'subtitle'}>Saved meals</ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {savedMeals.length} saved
              </ThemedText>
            </ThemedView>
            <AppButton
              label="New saved meal"
              icon="☑️"
              size="small"
              variant="soft"
              strong
              onPress={() => open(null)}
            />
          </ThemedView>
        }
        ListEmptyComponent={
          isPending ? (
            <ActivityIndicator style={styles.empty} />
          ) : (
            <ThemedText themeColor="textMuted" style={styles.empty}>
              {isError
                ? "Couldn't load your saved meals."
                : 'Nothing saved yet — tick “Save to library” when you log a meal, or add one here.'}
            </ThemedText>
          )
        }
        contentContainerStyle={{
          paddingHorizontal: insets.paddingHorizontal,
          paddingTop: insets.paddingTop,
          paddingBottom: insets.paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Remounted per meal: the sheet seeds its fields from `savedMeal` in
          `useState` initializers, which only run on mount — the same reason
          `TrainingSessionSheet` is keyed on its session. */}
      <SavedMealSheet
        key={editing?.id ?? 'new'}
        visible={sheetOpen}
        savedMeal={editing}
        onRequestClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

function Separator() {
  return <ThemedView type="transparent" style={styles.separator} />;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  // Same pair as Training's, and for the same reason — see the note there.
  headColumn: {
    paddingTop: Spacing.three,
  },
  headWide: {
    paddingTop: 0,
  },
  headText: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});
