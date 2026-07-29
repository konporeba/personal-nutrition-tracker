// The day's ledger (S-09, FR-075): calories in, out, and net — a sibling to
// DayTotal, not a modification of it. When a resting target exists, net is
// shown as a MacroProgress bar so a training day visibly earns back budget;
// when no target exists yet (no profile or no weight logged), the burned/net
// numbers still render as plain values — training logging must never be
// gated behind profile setup.
import { StyleSheet } from 'react-native';

import { MacroProgress } from '@/components/macro-progress';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealEntry, TrainingSession } from '@/data/types';
import { computeDayLedger } from '@/lib/day-ledger';

export function DayLedger({
  entries,
  sessions,
  target,
}: {
  entries: MealEntry[];
  sessions: TrainingSession[];
  /** The resting daily target, or null when none can be derived yet. */
  target: number | null;
}) {
  const ledger = computeDayLedger(entries, sessions, target);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          In
        </ThemedText>
        <ThemedText type="smallBold">{Math.round(ledger.consumed)} kcal</ThemedText>
      </ThemedView>
      <ThemedView style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          Out
        </ThemedText>
        <ThemedText type="smallBold">{Math.round(ledger.burned)} kcal</ThemedText>
      </ThemedView>
      {ledger.target !== null ? (
        <MacroProgress label="Net" unit="kcal" consumed={ledger.net} target={ledger.target} />
      ) : (
        <ThemedView style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary">
            Net
          </ThemedText>
          <ThemedText type="smallBold">{Math.round(ledger.net)} kcal</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
