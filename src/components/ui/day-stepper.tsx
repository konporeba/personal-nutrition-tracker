// Pick a day, one step at a time. Extracted from `log-to-day-sheet.tsx`, which
// was its only home until composing into and moving between past days gave it
// four callers.
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
  pressed: {
    opacity: 0.7,
  },
});
