// The day surface — extracted from `(today)/index.tsx` so a past day (S-11,
// FR-031) can reuse exactly the same rendering, parameterized by `date`
// instead of always observing today. Behavior is unchanged from what Today
// rendered before this extraction: five fixed sections with subtotals, the
// day total/ledger header, the training list, and navigation to
// entry/session detail (now carrying `date` so the detail screens resolve
// against the right day — see meal-detail.tsx/session-detail.tsx).
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, SectionList, StyleSheet } from 'react-native';

import { DayLedger } from '@/components/day-ledger';
import { DayTotal } from '@/components/day-total';
import { MealComposer } from '@/components/meal-composer';
import { MealEntryRow } from '@/components/meal-entry-row';
import { SectionSubtotal } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrainingSessionRow } from '@/components/training-session-row';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { MealEntry, Section, TrainingSession } from '@/data/types';
import { useDayEntries } from '@/data/use-meal-entries';
import { useTargets } from '@/data/use-profile';
import { useDaySessions } from '@/data/use-training-sessions';
import { groupEntriesBySection } from '@/lib/group-by-section';
import type { MacroTotals } from '@/lib/sum-macros';
import { sumTrainingBurn } from '@/lib/sum-training-burn';

/** One `SectionList` section: the five fixed groups from `groupEntriesBySection`. */
type DaySection = {
  title: string;
  data: MealEntry[];
  id: Section;
  calories: number;
  macros: MacroTotals;
};

/**
 * `showComposer` gates the add-new-entry affordances (the free-text composer
 * and the "Saved meals"/"Log training" quick actions) — Today shows them,
 * the past-day route (Phase 6) never does, per the plan's explicit scope:
 * a past day supports edit/re-section/delete of what's already logged, not
 * composing new entries into it.
 */
export function DayView({ date, showComposer }: { date: Date; showComposer: boolean }) {
  const router = useRouter();
  const { query } = useDayEntries(date);
  const { data, isPending, isError } = query;
  const entries = data ?? [];

  // Effective (resting) targets for the header's consumed-vs-target bars; null
  // until a profile and a first weight exist, in which case DayTotal falls back
  // to the bare total.
  const { targets } = useTargets();

  const { query: sessionsQuery } = useDaySessions(date);
  const sessions = sessionsQuery.data ?? [];

  // All five sections, always — a section with no entries still gets its own
  // group (FR-057), which SectionList renders as a header with no rows beneath.
  //
  // Gated to [] while pending/errored: VirtualizedSectionList counts +2 per
  // section (header+footer slots) toward its item count regardless of that
  // section's data length, so passing all 5 unconditionally would make
  // `getItemCount` always >0 and ListEmptyComponent (the spinner/error state
  // below) would never fire.
  const sections: DaySection[] =
    isPending || isError
      ? []
      : groupEntriesBySection(entries).map((group) => ({
          title: group.section,
          data: group.entries,
          id: group.section,
          calories: group.calories,
          macros: group.macros,
        }));

  return (
    <>
      {showComposer ? (
        <ThemedView style={styles.composer}>
          <MealComposer />
          <ThemedView style={styles.entryPointsRow}>
            <Pressable
              onPress={() => router.push('/(today)/library')}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundSelected" style={styles.libraryButton}>
                <ThemedText type="smallBold">Saved meals</ThemedText>
              </ThemedView>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(today)/session-composer')}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundSelected" style={styles.libraryButton}>
                <ThemedText type="smallBold">Log training</ThemedText>
              </ThemedView>
            </Pressable>
          </ThemedView>
        </ThemedView>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => (
          <MealEntryRow
            entry={item}
            onPress={() =>
              router.push({
                pathname: '/(today)/meal-detail',
                params: { id: item.id, date: date.toISOString() },
              })
            }
          />
        )}
        renderSectionHeader={({ section }) => (
          <SectionSubtotal
            section={section.id}
            calories={section.calories}
            macros={section.macros}
          />
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            <DayTotal entries={entries} date={date} targets={targets} />
            <DayLedger entries={entries} sessions={sessions} target={targets?.calories ?? null} />
            <TrainingSection sessions={sessions} date={date} />
          </>
        }
        ListEmptyComponent={<EmptyState isPending={isPending} />}
        contentContainerStyle={[styles.listContent, listPlatformStyle]}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
      />
    </>
  );
}

function Separator() {
  return <ThemedView style={styles.separator} />;
}

// The Training list (S-09): the day's logged sessions plus a running burned
// total. No ledger math here (that's DayLedger) — this is purely the
// list-and-navigate surface, mirroring the meal SectionList's role.
function TrainingSection({ sessions, date }: { sessions: TrainingSession[]; date: Date }) {
  const router = useRouter();
  const burned = sumTrainingBurn(sessions);

  return (
    <ThemedView style={styles.trainingContainer}>
      <ThemedView style={styles.trainingHeader}>
        <ThemedText type="smallBold">Training</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Burned: {Math.round(burned)} kcal
        </ThemedText>
      </ThemedView>
      {sessions.map((session) => (
        <TrainingSessionRow
          key={session.id}
          session={session}
          onPress={() =>
            router.push({
              pathname: '/(today)/session-detail',
              params: { id: session.id, date: date.toISOString() },
            })
          }
        />
      ))}
    </ThemedView>
  );
}

// `sections` is only ever [] while pending or on error (see above) — once the
// query settles, it always carries all 5 groups, even on a genuinely empty
// day, so there is no "nothing logged" case left for this component to render.
function EmptyState({ isPending }: { isPending: boolean }) {
  if (isPending) return <ActivityIndicator style={styles.empty} />;

  return (
    <ThemedText themeColor="textSecondary" style={styles.empty}>
      Couldn&apos;t load this day&apos;s entries.
    </ThemedText>
  );
}

// The web tab bar floats over the top of the screen; the native one sits at the
// bottom. Each caller's own SafeAreaView handles top clearance — this is the
// list's bottom clearance, needed by every embedding (Today and the past-day
// route are both rendered under the same native bottom tab bar).
const listPlatformStyle = Platform.select({
  default: { paddingBottom: BottomTabInset + Spacing.three },
  web: undefined,
});

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  entryPointsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  libraryButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  trainingContainer: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  trainingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
