// Today — the app's front door and the whole core loop in one screen: the
// day's budget as a hero ring, what has been logged beneath it, and capture
// one tap away.
//
// `DayView` (S-11) owns the day surface, parameterized by `date`; this screen
// resolves "today", supplies the greeting, week rail and streak above it, and
// mounts the floating ＋ that makes logging the app's most prominent control on
// native (mobile web gets the same ＋ raised into the center of its own bottom
// bar instead — see `app-tabs.web.tsx`).
//
// Picking a past day off the rail swaps the dashboard *in place* rather than
// pushing a screen. It used to route to `/(today)/day`, which meant a stack
// header appeared over the layout announcing which day you were on — a second,
// competing answer to a question the rail's own selected cell already answers.
// Here the chrome never moves: greeting, rail and streak stay put, and only
// the surface beneath them re-resolves against `viewedDay`.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { useAddMeal } from '@/components/add-meal-provider';
import { CaptureFab } from '@/components/capture-fab';
import { DayView } from '@/components/day-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { isSameDay } from '@/components/ui/date-strip';
import { Screen } from '@/components/ui/screen';
import { StreakPill } from '@/components/ui/streak-pill';
import { WeekRail } from '@/components/week-rail';
import { Spacing } from '@/constants/theme';
import { useDayEntries } from '@/data/use-meal-entries';
import { useLoggingStreak } from '@/data/use-streak';
import { useLayout } from '@/hooks/use-layout';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function TodayScreen() {
  // `day` comes back from the hook so the header label and the query key are the
  // same instant by construction, and so the day rolls over on resume. `DayView`
  // resolves the same day again internally (same query key, so TanStack Query
  // dedupes the read) — this call exists only to hand `day` to `DayView`.
  const { day } = useDayEntries();
  const streak = useLoggingStreak();
  // Wide enough for the greeting, the week rail and the actions to share a line.
  const { isWide } = useLayout();
  // The add-meal popup lives above the tabs (`add-meal-provider.tsx`), because
  // the ＋ that opens it does too. This screen only asks for it — from the
  // header button (wide), from the FAB (native), and from every empty
  // section's add tile, which passes the section it was sitting under.
  const addMeal = useAddMeal();
  // Which day the dashboard below is answering for. `null` means today, rather
  // than a captured date: `day` is re-derived every render so the screen rolls
  // over at midnight, and storing "today" here would pin it to yesterday.
  const [pastDay, setPastDay] = useState<Date | null>(null);
  const viewedDay = pastDay ?? day;
  const viewingToday = pastDay === null;

  const greetingBlock = (
    <ThemedView type="transparent" style={styles.greetingText}>
      {/* The greeting is time-of-day, not day-of-week: it stays put whichever
          day is being viewed. The line under it is the one thing in the header
          that has to follow the selection, or a past day would sit under
          today's date. */}
      <ThemedText type={isWide ? 'title' : 'subtitle'}>{greeting(day)}</ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        {dayFormat.format(viewedDay)}
      </ThemedText>
    </ThemedView>
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <DayView
          date={viewedDay}
          // A past day supports editing what is already logged, not composing
          // new entries into it — so every add affordance is off there.
          onAddToSection={viewingToday ? (section) => addMeal.open(section) : undefined}
          header={
            <ThemedView
              type="transparent"
              style={[styles.header, isWide && styles.headerWide]}>
              {/* Bare text, no card. The greeting is the page's own title —
                  putting it on a surface made it read as one more panel of
                  data competing with the ones below it. */}
              {isWide ? (
                greetingBlock
              ) : (
                <ThemedView type="transparent" style={styles.greetingRow}>
                  {greetingBlock}
                  <StreakPill days={streak.days} />
                </ThemedView>
              )}

              {/* The rail sits immediately after the greeting and shares its
                  center line; only the actions are pushed to the far edge. */}
              <ThemedView type="transparent" style={styles.rail}>
                <WeekRail
                  selected={viewedDay}
                  today={day}
                  // Back to `null` on today, so the screen keeps following the
                  // clock instead of freezing on the instant of the tap.
                  onSelect={(date) => setPastDay(isSameDay(date, day) ? null : date)}
                />
              </ThemedView>

              {isWide ? (
                <ThemedView type="transparent" style={styles.headerAside}>
                  <StreakPill days={streak.days} />
                  {/* `small` so it matches the streak pill above it — the two
                      read as one stacked pair, and the header shouldn't carry
                      a control taller than the greeting's own line. Disabled
                      on a past day: nothing new gets logged into one. */}
                  <AppButton
                    label="Log a meal"
                    icon="☑️"
                    size="small"
                    variant="soft"
                    full
                    strong
                    disabled={!viewingToday}
                    onPress={() => addMeal.open()}
                  />
                </ThemedView>
              ) : null}
            </ThemedView>
          }
        />
      </KeyboardAvoidingView>

      {/* Native only: on web the bottom bar carries the ＋ in its center, and a
          FAB on top of it would be a second, competing primary action. Gone on
          a past day for the same reason the header button is disabled there —
          a new entry always lands in today, which would be a silent surprise
          while a different day is on screen. */}
      {Platform.OS === 'web' || !viewingToday ? null : (
        <CaptureFab onPress={() => addMeal.open()} />
      )}
    </Screen>
  );
}

/** Time-of-day greeting. Cosmetic, but it is what makes the screen feel like
 *  it belongs to the owner rather than to the data. */
function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  headerWide: {
    flexDirection: 'row',
    // Every block in the header shares one center line: the greeting, the week
    // cells beside it, and the streak/action stack at the far end.
    alignItems: 'center',
    flexWrap: 'wrap',
    // Wider than the column's own rhythm: the greeting and the week cells are
    // two unrelated things sharing a line, and they need to read that way.
    gap: Spacing.five,
    paddingTop: 0,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  greetingText: {
    gap: Spacing.half,
  },
  rail: {
    // The rail is a horizontal ScrollView: in the wide row it has to be the
    // part that gives way when the window narrows, not the actions.
    flexShrink: 1,
    justifyContent: 'center',
  },
  headerAside: {
    // Pushed to the far edge of the row, whatever the rail's width came out to.
    marginLeft: 'auto',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
});
