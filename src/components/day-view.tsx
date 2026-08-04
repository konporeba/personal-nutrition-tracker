// The day surface — extracted from `(today)/index.tsx` so a past day (S-11,
// FR-031) can reuse exactly the same rendering, parameterized by `date`
// instead of always observing today: five fixed sections with subtotals, the
// hero card and ledger, and navigation to entry detail (carrying `date` so
// the detail screen resolves against the right day).
//
// Two genuinely different shapes, not one shape restyled. Narrow keeps the
// original single scrolling column: header, hero, macros, ledger, then the
// meal sections, all riding one `SectionList`. Wide turns into a real
// two-pane dashboard — a left column (hero + macro cards + ledger) beside a
// meal-log card on the right, each scrolling independently, so the day's stats
// never scroll out of view while browsing a long list of meals. Both panes are
// built to *fill* the window rather than stack from the top: the ledger takes
// the left column's slack, the empty meal sections split the right pane's.
// Training moved off this screen entirely (it has its own tab now, with full
// cross-day history); this component keeps `useDaySessions` only to compute
// `burned` for the hero/ledger.
//
// Each of the five sections is a *container*, not just a heading: an empty one
// renders a dashed add tile (`section-add-tile.tsx`) that composes straight
// into that section. That is what `onAddToSection` is for; a caller that
// doesn't pass it (the past-day route) gets headings only, matching the plan's
// scope — a past day supports editing what is logged, not composing into it.
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, SectionList, StyleSheet } from 'react-native';

import { DayLedger } from '@/components/day-ledger';
import { DayTotal } from '@/components/day-total';
import { MacroCards } from '@/components/macro-cards';
import { MealEntryRow } from '@/components/meal-entry-row';
import { MealEntrySheet } from '@/components/meal-entry-sheet';
import { SectionAddTile } from '@/components/section-add-tile';
import { SECTION_LABELS, SectionSubtotal } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { useScreenContentInsets } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Spacing } from '@/constants/theme';
import type { MealEntry, Section } from '@/data/types';
import { useDayEntries } from '@/data/use-meal-entries';
import { useTargets } from '@/data/use-profile';
import { useDaySessions } from '@/data/use-training-sessions';
import { useLayout } from '@/hooks/use-layout';
import { groupEntriesBySection } from '@/lib/group-by-section';
import type { MacroTotals } from '@/lib/sum-macros';
import { sumMacros } from '@/lib/sum-macros';
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
 * `header` is whatever the embedding screen wants above the dashboard (Today
 * puts its greeting, week rail and streak there); the past-day route passes
 * nothing.
 *
 * `onAddToSection` opens the caller's composer pre-set to one section. Absent,
 * the per-section add tiles are not rendered at all — which is the past-day
 * route's whole configuration, per the plan's explicit scope: a past day
 * supports edit/re-section/delete of what is already logged, not composing new
 * entries into it.
 *
 * There used to be a `showComposer` flag too, gating an always-open compose
 * card between the stats and the meal list. It is gone: composing now starts
 * from the ＋ — the bar's on mobile web, the FAB's on native, a section's own
 * tile for a specific meal — and a permanently expanded form competing with
 * all three was the biggest block on the phone's most-visited screen.
 */
export function DayView({
  date,
  header,
  onAddToSection,
}: {
  date: Date;
  header?: ReactNode;
  onAddToSection?: (section: Section) => void;
}) {
  const { isWide } = useLayout();
  const insets = useScreenContentInsets();
  // Tapping a row opens its detail popup (`meal-entry-sheet.tsx`). It lives
  // here rather than on the embedding screen because this component owns the
  // list — which means Today and the analytics day route both get it without
  // threading a callback through either of them.
  const [openEntry, setOpenEntry] = useState<MealEntry | null>(null);
  const { query } = useDayEntries(date);
  const { data, isPending, isError } = query;
  const entries = data ?? [];

  // Effective (resting) targets for the hero's budget; null until a profile and
  // a first weight exist, in which case DayTotal falls back to the bare total
  // and the macro cards — which have no denominator without it — stay off.
  const { targets } = useTargets();

  const { query: sessionsQuery } = useDaySessions(date);
  const sessions = sessionsQuery.data ?? [];
  const burned = sumTrainingBurn(sessions);

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

  const macros = sumMacros(entries);

  // Shared between both shapes below — only the header/container wiring
  // around this list differs.
  const mealListProps = {
    sections,
    keyExtractor: (entry: MealEntry) => entry.id,
    renderItem: ({ item }: { item: MealEntry }) => (
      <MealEntryRow entry={item} onPress={() => setOpenEntry(item)} />
    ),
    renderSectionHeader: ({ section }: { section: DaySection }) => (
      <SectionSubtotal
        section={section.id}
        calories={section.calories}
        macros={section.macros}
        first={section.id === sections[0]?.id}
      />
    ),
    // The container half of each section. Only the empty ones get a tile: a
    // section with rows in it is already full, and five permanent slots would
    // bury the meals themselves under calls to action.
    renderSectionFooter: ({ section }: { section: DaySection }) =>
      onAddToSection && section.data.length === 0 ? (
        <SectionAddTile
          label={SECTION_LABELS[section.id]}
          onPress={() => onAddToSection(section.id)}
        />
      ) : null,
    stickySectionHeadersEnabled: false,
    ListEmptyComponent: <EmptyState isPending={isPending} />,
    ItemSeparatorComponent: Separator,
    keyboardShouldPersistTaps: 'handled' as const,
    showsVerticalScrollIndicator: false,
  };

  // The day's stats, in the order they answer questions: how much room is
  // left, how the macros are tracking, then the in/out/net detail. On the
  // dashboard the ledger takes the column's leftover height (see its `grow`),
  // so the three cards reach the bottom of the window as one block.
  const stats = (
    <>
      <DayTotal entries={entries} targets={targets} burned={burned} />
      {targets ? (
        <MacroCards
          protein={{ consumed: macros.protein_g, target: targets.protein_g }}
          carbs={{ consumed: macros.carbs_g, target: targets.carbs_g }}
          fat={{ consumed: macros.fat_g, target: targets.fat_g }}
        />
      ) : null}
      <DayLedger
        entries={entries}
        sessions={sessions}
        target={targets?.calories ?? null}
        expanded={isWide}
      />
    </>
  );

  // Keyed on the entry so reopening a different row re-seeds every field —
  // the `useState` initializers inside only run on mount. Rendered only while
  // open, since the sheet has no meaningful shape without an entry.
  const detailSheet = openEntry ? (
    <MealEntrySheet
      key={openEntry.id}
      entry={openEntry}
      onRequestClose={() => setOpenEntry(null)}
    />
  ) : null;

  if (isWide) {
    return (
      <ThemedView
        type="transparent"
        style={[
          styles.wideFill,
          {
            paddingHorizontal: insets.paddingHorizontal,
            paddingTop: insets.paddingTop,
            paddingBottom: insets.paddingBottom,
          },
        ]}>
        {header}
        <ThemedView type="transparent" style={styles.dashboard}>
          {/* Scrolls on its own so a short window clips nothing — the point of
              the two-pane shape is that the stats and the meal log move
              independently, not that either of them is fixed. */}
          <ScrollView
            style={styles.leftColumn}
            contentContainerStyle={styles.leftColumnContent}
            showsVerticalScrollIndicator={false}>
            {stats}
          </ScrollView>
          <Card style={styles.mealCard} padded={false}>
            <ThemedView type="transparent" style={styles.mealCardHead}>
              <SectionHeader title="Meals" detail={`${entries.length} logged`} />
            </ThemedView>
            {/* A plain flex column, not the `SectionList` the narrow branch
                uses. Virtualization buys nothing for one day of meals, and it
                is precisely what stops the empty sections from splitting the
                pane's leftover height — a virtualized cell sizes to its own
                content and cannot grow into the space below the last one. */}
            <ScrollView
              style={styles.mealList}
              contentContainerStyle={styles.mealPaneContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {isPending || isError ? (
                <EmptyState isPending={isPending} />
              ) : (
                sections.map((section, index) => (
                  <ThemedView
                    key={section.id}
                    type="transparent"
                    // Only sections that actually have a tile in them stretch.
                    // On a past day there are none, and spreading five bare
                    // headings down the pane would read as a rendering fault.
                    style={
                      section.data.length === 0 && onAddToSection
                        ? styles.sectionBlockGrow
                        : undefined
                    }>
                    <SectionSubtotal
                      section={section.id}
                      calories={section.calories}
                      macros={section.macros}
                      first={index === 0}
                    />
                    {section.data.length > 0 ? (
                      <ThemedView type="transparent" style={styles.sectionRows}>
                        {section.data.map((entry) => (
                          <MealEntryRow
                            key={entry.id}
                            entry={entry}
                            onPress={() => setOpenEntry(entry)}
                          />
                        ))}
                      </ThemedView>
                    ) : onAddToSection ? (
                      <SectionAddTile
                        label={SECTION_LABELS[section.id]}
                        grow
                        onPress={() => onAddToSection(section.id)}
                      />
                    ) : null}
                  </ThemedView>
                ))
              )}
            </ScrollView>
          </Card>
        </ThemedView>
        {detailSheet}
      </ThemedView>
    );
  }

  return (
    <>
      <SectionList
        {...mealListProps}
        ListHeaderComponent={
          <ThemedView type="transparent" style={styles.listHeader}>
            {header}
            {stats}
            <SectionHeader title="Meals" detail={`${entries.length} logged`} />
          </ThemedView>
        }
        contentContainerStyle={{
          paddingHorizontal: insets.paddingHorizontal,
          paddingTop: insets.paddingTop,
          paddingBottom: insets.paddingBottom,
        }}
      />
      {detailSheet}
    </>
  );
}

function Separator() {
  return <ThemedView type="transparent" style={styles.separator} />;
}

// `sections` is only ever [] while pending or on error (see above) — once the
// query settles, it always carries all 5 groups, even on a genuinely empty
// day, so there is no "nothing logged" case left for this component to render.
function EmptyState({ isPending }: { isPending: boolean }) {
  if (isPending) return <ActivityIndicator style={styles.empty} />;

  return (
    <ThemedText themeColor="textMuted" style={styles.empty}>
      Couldn&apos;t load this day&apos;s entries.
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    gap: Spacing.four,
    paddingBottom: Spacing.two,
  },
  wideFill: {
    flex: 1,
  },
  dashboard: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.four,
    paddingTop: Spacing.four,
  },
  leftColumn: {
    flex: 1,
  },
  leftColumnContent: {
    gap: Spacing.four,
    // Fill the window when the cards are shorter than it, scroll when they
    // aren't — `flexGrow` is what lets the ledger's `flex: 1` have a height to
    // claim, and it costs nothing on a short viewport where there is no slack.
    flexGrow: 1,
    // Clears the scroll's own edge so the last card's shadow isn't clipped.
    paddingBottom: Spacing.two,
  },
  mealCard: {
    // The meal log is the wider pane: it holds five sections of rows, where the
    // left column holds fixed-height cards.
    flex: 1.35,
  },
  mealCardHead: {
    padding: Spacing.four,
    paddingBottom: Spacing.two,
  },
  mealList: {
    flex: 1,
  },
  mealPaneContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    // Fill the pane when the sections are shorter than it — this is what the
    // empty sections' `flexGrow` claims. Below that it just scrolls.
    flexGrow: 1,
  },
  sectionBlockGrow: {
    flexGrow: 1,
    flexShrink: 0,
  },
  sectionRows: {
    gap: Spacing.two,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});
