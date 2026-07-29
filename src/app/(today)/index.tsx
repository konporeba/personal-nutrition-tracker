// Today — the app's front door and the whole core loop in one screen: describe a
// meal at the top, see what has been logged and what it adds up to below.
// Browsing other days is S-11, so this is always the current day.
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayTotal } from '@/components/day-total';
import { MealComposer } from '@/components/meal-composer';
import { MealEntryRow } from '@/components/meal-entry-row';
import { SectionSubtotal } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrainingSessionRow } from '@/components/training-session-row';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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

export default function TodayScreen() {
  const router = useRouter();
  // `day` comes back from the hook so the header label and the query key are the
  // same instant by construction, and so the day rolls over on resume.
  const { query, day } = useDayEntries();
  const { data, isPending, isError } = query;
  const entries = data ?? [];

  // Effective (resting) targets for the header's consumed-vs-target bars; null
  // until a profile and a first weight exist, in which case DayTotal falls back
  // to the bare S-01 total.
  const { targets } = useTargets();

  // Today's training sessions (S-09), same `day` the meal query resolves so
  // both lists observe the same instant.
  const { query: sessionsQuery } = useDaySessions(day);
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
          <SectionList
            sections={sections}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => (
              <MealEntryRow
                entry={item}
                onPress={() =>
                  router.push({ pathname: '/(today)/meal-detail', params: { id: item.id } })
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
                <DayTotal entries={entries} date={day} targets={targets} />
                <TrainingSection sessions={sessions} />
              </>
            }
            ListEmptyComponent={<EmptyState isPending={isPending} />}
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

// The Training list (S-09): today's logged sessions plus a running burned
// total. No ledger math here yet (that's DayLedger, S-09 Phase 4) — this is
// purely the list-and-navigate surface, mirroring the meal SectionList's role.
function TrainingSection({ sessions }: { sessions: TrainingSession[] }) {
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
            router.push({ pathname: '/(today)/session-detail', params: { id: session.id } })
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
      Couldn&apos;t load today&apos;s entries.
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
