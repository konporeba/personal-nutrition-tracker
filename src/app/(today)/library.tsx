// Saved meals library (S-08): every meal saved from the review screen. Tapping
// one re-logs it to today instantly — no AI call, no confirmation screen — the
// path that satisfies FR-011's "at most two interactions" requirement (open
// library, tap the row). Long-press opens a management sheet: Edit, Delete, or
// "Log to another day…".
//
// The `section` param is how the add-meal popup's picker survives the trip
// here. Without it this screen fell back to the time-of-day guess, so tapping
// the ＋ under Breakfast, choosing "From saved meals" and picking a row logged
// the meal to whatever section the clock implied — supper, most evenings. The
// owner had made the choice two screens earlier and watched it be ignored.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { LogToDaySheet } from '@/components/log-to-day-sheet';
import { SavedMealActionsSheet } from '@/components/saved-meal-actions-sheet';
import { SavedMealRow } from '@/components/saved-meal-row';
import { SECTION_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { useTabBarClearance } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { SavedMeal, Section } from '@/data/types';
import { useCreateMealEntry } from '@/data/use-meal-entries';
import { useDeleteSavedMeal, useSavedMeals } from '@/data/use-saved-meals';
import { useTargets } from '@/data/use-profile';
import { isSameLocalDay, parseLocalDayKey } from '@/lib/local-day';
import { loggedAtForDay } from '@/lib/logged-at-for-day';
import { sectionForTime } from '@/lib/section-for-time';
import { timeForSection } from '@/lib/time-for-section';

/** `section` only ever arrives from our own add-meal popup, but it comes in as
 *  an untyped route param — validate membership rather than trusting the cast.
 *  Mirrors `review.tsx`'s parser, which guards the same hand-off. */
function parseSection(value: string | undefined): Section | undefined {
  return value !== undefined && value in SECTION_LABELS ? (value as Section) : undefined;
}

/** Short, because it is appended to a header title that already has a noun. */
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export default function LibraryScreen() {
  const router = useRouter();
  const { section: sectionParam, day: dayParam } = useLocalSearchParams<{
    section?: string;
    day?: string;
  }>();
  // Absent (reached any other way), every write below falls back to the
  // time-of-day guess exactly as it always did.
  const chosenSection = parseSection(sectionParam);
  // The day the add-meal popup was opened from. Absent — or malformed, or in
  // the future — means today, per `parseLocalDayKey`'s clamp.
  const chosenDay = parseLocalDayKey(dayParam);
  // The tab bar floats over this list; the last saved meal has to stay tappable.
  const tabBarClearance = useTabBarClearance();
  const { data, isPending, isError } = useSavedMeals();
  const createEntry = useCreateMealEntry();
  const { targets } = useTargets();
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
    // Same section-then-timestamp ordering as `review.tsx`, and the same
    // reason: a past day's time is derived from the section, not the reverse.
    const resolvedSection = chosenSection ?? sectionForTime(new Date());
    const loggedAt = loggedAtForDay(chosenDay ?? new Date(), timeForSection(resolvedSection));

    createEntry.mutate(
      {
        input: {
          logged_at: loggedAt,
          section: resolvedSection,
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
        targets,
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      }
    );
  }

  // Same write path as `relog`, except the day comes from the picker rather
  // than from the route.
  //
  // This used to build its own timestamp — the picked calendar day at the
  // *current* clock time — which is exactly the construction that puts a supper
  // logged at 00:05 first in yesterday's ledger. It now goes through the shared
  // `loggedAtForDay`, so both of this screen's write paths agree and a
  // backdated saved meal gets a time that matches its section.
  function logToDay(savedMeal: SavedMeal, day: Date, section: Section) {
    // Same double-submit guard as `relog` — `createEntry` is one shared
    // mutation instance for the whole screen, so this closes the window for
    // both write paths.
    if (createEntry.isPending || createEntry.isSuccess) return;
    const loggedAt = loggedAtForDay(day, timeForSection(section));

    createEntry.mutate(
      {
        input: {
          logged_at: loggedAt,
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
        targets,
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
      {/* The header names the day when it isn't today: tapping a row here logs
          instantly, with no review step in between, so this title is the last
          thing the owner sees before the write happens. */}
      <Stack.Screen
        options={{
          title:
            chosenDay && !isSameLocalDay(chosenDay, new Date())
              ? `Saved meals · ${dayFormat.format(chosenDay)}`
              : 'Saved meals',
        }}
      />
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
            isPending ? (
              <ActivityIndicator style={styles.empty} />
            ) : (
              <Card style={styles.emptyCard}>
                <ThemedText type="subtitle">
                  {isError ? 'Couldn’t load your library' : 'Nothing saved yet'}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  {isError
                    ? 'Check your connection and pull to try again.'
                    : 'Tick “Save to library” when you log a meal, and it will show up here for one-tap re-logging.'}
                </ThemedText>
              </Card>
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
        />
        {createEntry.isError ? (
          <ThemedText type="small" themeColor="danger">
            Couldn&apos;t log that meal. Try again.
          </ThemedText>
        ) : null}
        {deleteSavedMeal.isError ? (
          <ThemedText type="small" themeColor="danger">
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
        initialSection={chosenSection}
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
  },
  emptyCard: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  logging: {
    paddingVertical: Spacing.two,
  },
});
