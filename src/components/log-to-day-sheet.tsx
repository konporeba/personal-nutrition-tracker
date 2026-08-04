// "Log to another day…" sheet (S-08, FR-011): the one flow that genuinely
// needs a day other than today. A minimal stepper, not a calendar — the
// next-day control disables once the selection reaches today, because there is
// no such thing as logging to a future day.
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { SECTION_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Radius, Spacing } from '@/constants/theme';
import type { SavedMeal, Section } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { SECTION_ORDER } from '@/lib/group-by-section';
import { sectionForTime } from '@/lib/section-for-time';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

const SECTION_OPTIONS = SECTION_ORDER.map((section) => ({
  value: section,
  label: SECTION_LABELS[section],
}));

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

export function LogToDaySheet({
  visible,
  savedMeal,
  /** The section the owner already picked upstream (the add-meal popup), if
   *  any. Absent, the picker opens on the time-of-day guess as before. */
  initialSection,
  onLog,
  onRequestClose,
}: {
  visible: boolean;
  savedMeal: SavedMeal | null;
  initialSection?: Section;
  onLog: (day: Date, section: Section) => void;
  onRequestClose: () => void;
}) {
  const today = startOfDay(new Date());
  const [day, setDay] = useState(today);
  const [section, setSection] = useState<Section>(
    () => initialSection ?? sectionForTime(new Date())
  );
  const isToday = day.getTime() === today.getTime();

  // Reset for the next time the sheet opens, so a prior pick doesn't linger.
  function close() {
    setDay(today);
    setSection(initialSection ?? sectionForTime(new Date()));
    onRequestClose();
  }

  return (
    <Sheet
      visible={visible}
      title={savedMeal?.name ?? 'This meal'}
      subtitle="Log to another day"
      onRequestClose={close}>
      <ThemedView type="transparent" style={styles.stepper}>
        <StepButton glyph="‹" label="Previous day" onPress={() => setDay((p) => addDays(p, -1))} />
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
          onPress={() => setDay((p) => addDays(p, 1))}
        />
      </ThemedView>

      <Segmented options={SECTION_OPTIONS} value={section} onSelect={setSection} />

      <AppButton
        label="Log it"
        variant="primary"
        size="large"
        full
        onPress={() => onLog(day, section)}
        style={styles.log}
      />
    </Sheet>
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
  log: {
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
