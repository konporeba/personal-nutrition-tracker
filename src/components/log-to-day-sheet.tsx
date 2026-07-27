// "Log to another day…" sheet (S-08, FR-011): the one flow that genuinely
// needs a day other than today. A minimal stepper, not a calendar — this app
// has no day-browsing UI yet (that's S-11), so there's no bigger picker to
// reuse. The next-day control disables once the selection reaches today:
// there's no such thing as logging to a future day.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SECTION_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SavedMeal, Section } from '@/data/types';
import { SECTION_ORDER } from '@/lib/group-by-section';
import { sectionForTime } from '@/lib/section-for-time';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

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
  onLog,
  onRequestClose,
}: {
  visible: boolean;
  savedMeal: SavedMeal | null;
  onLog: (day: Date, section: Section) => void;
  onRequestClose: () => void;
}) {
  const today = startOfDay(new Date());
  const [day, setDay] = useState(today);
  const [section, setSection] = useState<Section>(() => sectionForTime(new Date()));
  const isToday = day.getTime() === today.getTime();

  // Reset for the next time the sheet opens, so a prior pick doesn't linger.
  function close() {
    setDay(today);
    setSection(sectionForTime(new Date()));
    onRequestClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable onPress={() => {}}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
              <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
                Log {savedMeal?.name ?? 'this meal'} to…
              </ThemedText>

              <ThemedView style={styles.stepper}>
                <Pressable
                  onPress={() => setDay((prev) => addDays(prev, -1))}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundElement" style={styles.stepButton}>
                    <ThemedText type="smallBold">◀</ThemedText>
                  </ThemedView>
                </Pressable>
                <ThemedText type="smallBold">{dateFormat.format(day)}</ThemedText>
                <Pressable
                  onPress={() => !isToday && setDay((prev) => addDays(prev, 1))}
                  disabled={isToday}
                  style={({ pressed }) => pressed && !isToday && styles.pressed}>
                  <ThemedView
                    type={isToday ? 'backgroundElement' : 'backgroundSelected'}
                    style={styles.stepButton}>
                    <ThemedText type="smallBold" themeColor={isToday ? 'textSecondary' : 'text'}>
                      ▶
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              </ThemedView>

              {SECTION_ORDER.map((option) => {
                const isSelected = option === section;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setSection(option)}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <ThemedView
                      type={isSelected ? 'backgroundSelected' : 'backgroundElement'}
                      style={styles.option}>
                      <ThemedText themeColor={isSelected ? 'text' : 'textSecondary'}>
                        {SECTION_LABELS[option]}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => onLog(day, section)}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundSelected" style={styles.logButton}>
                  <ThemedText type="smallBold">Log</ThemedText>
                </ThemedView>
              </Pressable>

              <Pressable onPress={close} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView style={styles.cancel}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Cancel
                  </ThemedText>
                </ThemedView>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    padding: Spacing.four,
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
  },
  sheetInner: {
    gap: Spacing.two,
  },
  title: {
    paddingBottom: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  stepButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  option: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  logButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.one,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
