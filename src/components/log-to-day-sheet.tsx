// "Log to another day…" sheet (S-08, FR-011): the saved-meal path's way to
// reach a day other than the one it was opened from.
//
// The stepper it used to own now lives in `ui/day-stepper.tsx` — composing into
// a past day and moving a logged record between days both need the same
// control, and three copies would drift. This sheet keeps its own job: pairing
// that day with a section and handing both back to the library screen.
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { SECTION_LABELS } from '@/components/section-subtotal';
import { AppButton } from '@/components/ui/app-button';
import { DayStepper } from '@/components/ui/day-stepper';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Spacing } from '@/constants/theme';
import type { SavedMeal, Section } from '@/data/types';
import { SECTION_ORDER } from '@/lib/group-by-section';
import { startOfLocalDay } from '@/lib/local-day';
import { sectionForTime } from '@/lib/section-for-time';

const SECTION_OPTIONS = SECTION_ORDER.map((section) => ({
  value: section,
  label: SECTION_LABELS[section],
}));

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
  const today = startOfLocalDay(new Date());
  const [day, setDay] = useState(today);
  const [section, setSection] = useState<Section>(
    () => initialSection ?? sectionForTime(new Date())
  );

  // No reset on close: the caller mounts this sheet only while it is open
  // (`library.tsx`), so every open runs these initializers fresh. It used to
  // reset by hand here, which covered the cancel path but not the success one —
  // that closes through `setLoggingDayFor(null)` and relies on an unmount that
  // doesn't happen when `router.canGoBack()` is false.
  return (
    <Sheet
      visible={visible}
      title={savedMeal?.name ?? 'This meal'}
      subtitle="Log to another day"
      onRequestClose={onRequestClose}>
      <DayStepper day={day} today={today} onChange={setDay} />

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

const styles = StyleSheet.create({
  log: {
    marginTop: Spacing.two,
  },
});
