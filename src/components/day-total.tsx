// The Today header. With targets, it's consumed-vs-target — a progress bar for
// calories and each of the three macros (FR-030). Without them (no profile or no
// weight logged yet), it degrades to the S-01 bare calorie total plus a hint to
// set up the profile, so the screen stays useful before S-02 is filled in.
import { StyleSheet } from 'react-native';

import { MacroProgress } from '@/components/macro-progress';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealEntry } from '@/data/types';
import type { Targets } from '@/lib/derive-targets';
import { sumCalories } from '@/lib/sum-calories';
import { sumMacros } from '@/lib/sum-macros';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function DayTotal({
  entries,
  date,
  targets,
}: {
  entries: MealEntry[];
  date: Date;
  /** The effective daily targets, or null when none can be derived yet. */
  targets: Targets | null;
}) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {dayFormat.format(date)}
      </ThemedText>
      {targets ? (
        <ProgressBars entries={entries} targets={targets} />
      ) : (
        <BareTotal entries={entries} />
      )}
    </ThemedView>
  );
}

/** Consumed-vs-target: calories plus each macro as a labelled progress bar. */
function ProgressBars({ entries, targets }: { entries: MealEntry[]; targets: Targets }) {
  const calories = sumCalories(entries);
  const macros = sumMacros(entries);

  return (
    <ThemedView style={styles.bars}>
      <MacroProgress label="Calories" unit="kcal" consumed={calories} target={targets.calories} />
      <MacroProgress label="Protein" unit="g" consumed={macros.protein_g} target={targets.protein_g} />
      <MacroProgress label="Carbs" unit="g" consumed={macros.carbs_g} target={targets.carbs_g} />
      <MacroProgress label="Fat" unit="g" consumed={macros.fat_g} target={targets.fat_g} />
    </ThemedView>
  );
}

/** The S-01 fallback: the bare calorie total and a hint to set up the profile. */
function BareTotal({ entries }: { entries: MealEntry[] }) {
  const total = sumCalories(entries);

  return (
    <>
      <ThemedView style={styles.totalRow}>
        <ThemedText type="title">{Math.round(total)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.unit}>
          kcal
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        Set up your profile to see targets.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
  },
  bars: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  unit: {
    textTransform: 'uppercase',
  },
});
