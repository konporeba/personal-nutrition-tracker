// Pick a day, one step at a time. Extracted from `log-to-day-sheet.tsx`, which
// was its only home until composing into and moving between past days gave it
// several callers.
//
// A stepper, not a calendar, for the reason the original file gave: the days
// that matter are the last few, and a month grid is a lot of chrome to pick
// "yesterday". The next-day control disables once the selection reaches today —
// there is no such thing as logging into a future day, and this is the control
// half of that rule (`parseLocalDayKey` is the other half, for days arriving
// from outside the app).
//
// Backwards is deliberately unbounded: an owner filling in a week they forgot
// is doing the thing this exists for.
//
// **Two shapes, for two very different callers.** `LogToDaySheet` is *about*
// picking a day, so it gets `DayStepper` — the full-width row, the main control
// on the sheet. The meal and training detail popups are not: they are dense
// forms where moving a day is the rare repair, and a labelled 44pt stepper row
// cost ~80pt of a sheet already fighting for a phone viewport. They get
// `DayPill`, which is the day's own *value* on the popup's subtitle line and
// grows arrows inside itself when tapped. Zero added height in either state,
// and nothing on the page moves when it opens.
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addLocalDays, isSameLocalDay } from '@/lib/local-day';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

/** Shorter, for the pill — it shares a line with the time and the source. */
const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function DayStepper({
  day,
  today,
  onChange,
}: {
  day: Date;
  /** Passed in rather than derived here: the embedding screen re-derives "now"
   *  per render (see `context/foundation/lessons.md`), and this control must
   *  agree with the day its caller is actually observing. */
  today: Date;
  onChange: (next: Date) => void;
}) {
  const isToday = isSameLocalDay(day, today);

  return (
    <ThemedView type="transparent" style={styles.stepper}>
      <StepButton glyph="‹" label="Previous day" onPress={() => onChange(addLocalDays(day, -1))} />
      <ThemedView type="transparent" style={styles.dayLabel}>
        <ThemedText type="smallBold">{dateFormat.format(day)}</ThemedText>
        {isToday ? (
          <ThemedText type="micro" themeColor="textMuted">
            Today
          </ThemedText>
        ) : null}
      </ThemedView>
      <StepButton
        glyph="›"
        label="Next day"
        disabled={isToday}
        onPress={() => onChange(addLocalDays(day, 1))}
      />
    </ThemedView>
  );
}

/**
 * The day as an inline pill that becomes its own stepper.
 *
 * Closed it is just the date, sized to sit beside caption text. Tapped, the
 * arrows appear *inside* the same pill rather than opening a control elsewhere
 * — so the thing you press to change the day is the thing showing the day, and
 * the surrounding form neither grows nor shifts.
 *
 * No edit affordance on the closed state. It read as clutter on a control whose
 * whole job is one tap, and the owner of a single-user tracker knows their own
 * app; the pill's outline is enough to say it is pressable.
 *
 * `open` is internal: no caller has ever wanted to drive it, and keeping it here
 * is what lets the embedding sheets stay a single expression. One-way per mount
 * — an owner who opened it is mid-repair, and a pill that collapsed under them
 * would just have to be reopened.
 */
export function DayPill({
  day,
  today,
  onChange,
}: {
  day: Date;
  today: Date;
  onChange: (next: Date) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isToday = isSameLocalDay(day, today);
  // Always the date, never "Today". The word is four characters where a date is
  // eleven, so the pill visibly shrank on the most common value of all and read
  // as a different, half-empty control. A fixed-width label (see `pillLabel`)
  // keeps it steady; the date itself is unambiguous enough without the word.
  const label = shortDateFormat.format(day);

  const pill = (
    <ThemedView type="transparent" style={[styles.pill, { borderColor: theme.border }]}>
      {open ? (
        <PillArrow
          glyph="‹"
          label="Previous day"
          onPress={() => onChange(addLocalDays(day, -1))}
        />
      ) : null}
      <ThemedText type="micro" themeColor="textMuted" style={styles.pillLabel}>
        {label}
      </ThemedText>
      {open ? (
        <PillArrow
          glyph="›"
          label="Next day"
          disabled={isToday}
          onPress={() => onChange(addLocalDays(day, 1))}
        />
      ) : null}
    </ThemedView>
  );

  // A row wrapper so the pill hugs its content wherever it is mounted. Without
  // it the pill stretches to fill a *column* parent — which is exactly what the
  // sheet header's subtitle slot is — and the date ends up centered in its own
  // 78pt box inside a pill spanning the whole dialog. Owned here rather than
  // left to each call site, because "don't stretch" is a fact about this
  // control, not about the two places that happen to use it.
  return (
    <ThemedView type="transparent" style={styles.pillWrap}>
      {/* Once open the pill is a container of two buttons, not a button itself
          — wrapping it in a Pressable then would swallow taps meant for the
          arrows. */}
      {open ? (
        pill
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          // The visible label is the *value*; the spoken one has to be the
          // action, or a screen reader announces a date with no hint that it
          // can be moved.
          accessibilityLabel={`Change day, currently ${label}`}
          style={({ pressed }) => pressed && styles.pressed}>
          {pill}
        </Pressable>
      )}
    </ThemedView>
  );
}

/** An arrow inside the pill. Small on purpose, so `hitSlop` does the work of
 *  making it a real touch target rather than padding making the pill bulky. */
function PillArrow({
  glyph,
  label,
  onPress,
  disabled = false,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={10}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <ThemedText
        type="smallBold"
        themeColor={disabled ? 'textMuted' : 'accentText'}
        style={styles.pillArrow}>
        {glyph}
      </ThemedText>
    </Pressable>
  );
}

function StepButton({
  glyph,
  label,
  onPress,
  disabled = false,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <ThemedView
        type="transparent"
        style={[styles.stepButton, { backgroundColor: theme.surfaceSoft }]}>
        <ThemedText type="subtitle" themeColor={disabled ? 'textMuted' : 'text'}>
          {glyph}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  dayLabel: {
    alignItems: 'center',
    gap: 1,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  pillWrap: {
    // A row, so whatever it contains sizes to its content instead of to the
    // parent's cross axis. `alignSelf: 'flex-start'` on the pill would do the
    // same in a column parent but top-align it in a row one, which is the meal
    // popup's subtitle line — this works in both.
    flexDirection: 'row',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    // Matches `Chip`'s outline tone, so the day reads as one of the app's
    // existing small pills rather than as a new kind of control.
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: {
    // Centered inside a floor width, which is what actually keeps the date
    // still. Without it the pill resized on every step — "Sep 9" is narrower
    // than "Sep 10" — so the text drifted under the cursor while stepping, and
    // the two arrows appeared to move apart and back together.
    minWidth: 78,
    textAlign: 'center',
  },
  pillArrow: {
    // A fixed box per arrow, so the label sits in the true middle of the pill.
    // Left to themselves, `‹` and `›` carry different side bearings and the
    // date ended up a pixel or two off-center — visible precisely because the
    // pill is small.
    width: 12,
    textAlign: 'center',
    // The arrows are `smallBold` (14/19) beside a `micro` label (12/16).
    // Matching the label's line height is what makes `alignItems: 'center'`
    // center the glyphs rather than the two differently-tall boxes they sit in.
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
