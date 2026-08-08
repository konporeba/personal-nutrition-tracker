// The week rail above the day's hero: seven day cells ending on today, each
// carrying its own adherence ring.
//
// Rolling backwards from today rather than showing a Mon–Sun calendar week is
// deliberate — a tracker has nothing to say about tomorrow, and a row of dead
// future pills invites taps that can only lead to an empty day.
//
// The ring around each weekday letter is the rail's whole point now: at a
// glance the owner sees which of the last seven days landed on budget, which
// went over, and which came in under, without opening Analytics. Per the
// adherence-signal rule in `constants/theme.ts`, color is never the only cue —
// the arc's *length* says the same thing (a full ring is over, a short one is
// under), and every cell carries a spoken label for screen readers.
//
// Two shapes, one week. On a phone the seven cells *fit*: each takes an equal
// share of the row and the ring shrinks to match, because a week you have to
// swipe sideways to see is a week you never look at — the whole value of the
// rail is taking it in at a glance. The dashboard keeps the scroller and the
// bigger cells, where the rail shares a header line with the greeting and the
// actions and has to be the part that gives way.
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { clampFraction, ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ADHERENCE_COLOR, ADHERENCE_LABEL } from '@/components/ui/adherence-color';
import { Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import type { DayAdherence } from '@/lib/adherence';
import { useTheme } from '@/hooks/use-theme';

const DAYS_SHOWN = 7;
const RING_SIZE = 34;
// The floor for the fitted row: seven of these plus their gaps and the page's
// own gutters clear a 320pt viewport, the narrowest phone still in service.
const FITTED_RING_SIZE = 30;
const RING_STROKE = 3;
/** Each ring starts a beat after the one to its left. */
const STAGGER_MS = 60;

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * One day's ring. `status` is `classifyDayAdherence`'s verdict, or `null` when
 * the day has nothing logged or no target to judge it against — which renders
 * as a bare track, visibly "no answer" rather than a fabricated zero.
 */
export type DayProgress = {
  /**
   * Intake against the day's budget (`target + burned`), 0..1 — `budgetFraction`
   * in `lib/day-ledger.ts`, the same value the hero ring fills to. Clamped by
   * the caller or here.
   */
  fraction: number;
  status: DayAdherence | null;
};

export function DateStrip({
  selected,
  onSelect,
  /** Anchors the rail. Defaults to today; passed in so callers share one clock. */
  today = new Date(),
  /** Per-day adherence, resolved by the caller (see `week-rail.tsx`). */
  progressFor,
}: {
  selected: Date;
  onSelect: (date: Date) => void;
  today?: Date;
  progressFor?: (date: Date) => DayProgress | null;
}) {
  // The dashboard is the only shape with room to spare, so it is the only one
  // that still scrolls; everywhere else the week fits by construction.
  const { isDashboard } = useLayout();
  const days = Array.from({ length: DAYS_SHOWN }, (_, index) =>
    addDays(startOfDay(today), index - (DAYS_SHOWN - 1))
  );

  const cells = days.map((day, index) => (
    <DayCell
      key={day.toISOString()}
      date={day}
      isSelected={isSameDay(day, selected)}
      isToday={isSameDay(day, today)}
      progress={progressFor?.(day) ?? null}
      delayMs={index * STAGGER_MS}
      fitted={!isDashboard}
      onPress={() => onSelect(day)}
    />
  ));

  if (isDashboard) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {cells}
      </ScrollView>
    );
  }

  return (
    <ThemedView type="transparent" style={[styles.rail, styles.railFitted]}>
      {cells}
    </ThemedView>
  );
}

function DayCell({
  date,
  isSelected,
  isToday,
  progress,
  delayMs,
  /** Take an equal share of the row instead of the cell's natural width. */
  fitted,
  onPress,
}: {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  progress: DayProgress | null;
  delayMs: number;
  fitted: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  const status = progress?.status ?? null;
  // No verdict paints no arc — an empty ring reads as "nothing logged", which
  // is the truth, where a grey full ring would read as a result.
  const fraction = status ? clampFraction(progress?.fraction ?? 0) : 0;
  const arcColor = status ? theme[ADHERENCE_COLOR[status]] : theme.track;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={
        status
          ? `${fullDateFormat.format(date)}, ${ADHERENCE_LABEL[status]}`
          : `${fullDateFormat.format(date)}, nothing logged`
      }
      style={({ pressed }) => [fitted && styles.cellFlex, pressed && styles.pressed]}>
      <ThemedView
        type={isSelected ? 'surfaceSoft' : 'surface'}
        style={[
          styles.cell,
          fitted && styles.cellFitted,
          {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isSelected ? theme.accent : theme.border,
          },
        ]}>
        {/* The ring is decoration on a tappable cell — it must never become
            the thing the tap lands on, on any platform. */}
        <ThemedView type="transparent" pointerEvents="none">
          <ProgressRing
            size={fitted ? FITTED_RING_SIZE : RING_SIZE}
            strokeWidth={RING_STROKE}
            fraction={fraction}
            color={arcColor}
            trackColor={theme.track}
            delayMs={delayMs}>
            <ThemedText type="smallBold" themeColor={isSelected ? 'text' : 'textMuted'}>
              {weekdayFormat.format(date)}
            </ThemedText>
          </ProgressRing>
        </ThemedView>
        <ThemedText type="smallBold" themeColor={isToday ? 'accentText' : 'text'}>
          {`${date.getDate()}`.padStart(2, '0')}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  railFitted: {
    // Tighter than the scroller's gap: those four points per gutter are what
    // buy the seventh cell its width on a 320pt screen.
    gap: Spacing.one,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minWidth: 58,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.card,
  },
  cellFlex: {
    // Equal sevenths of the row. `flexBasis: 0` is what makes them equal rather
    // than each sized to its own content, and `minWidth: 0` lets them go below
    // the natural width of a cell — without it the row overflows instead.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cellFitted: {
    // Overrides the natural-width floor above, which exists for the scroller.
    minWidth: 0,
    gap: Spacing.half,
    paddingVertical: Spacing.two - 2,
    paddingHorizontal: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
