// The day's hero: one large ring showing calories remaining against the day's
// budget, with the number that matters oversized in the middle.
//
// The budget is the sedentary-baseline one — `target + burned`, since every
// logged session earns its burn back explicitly rather than being folded into
// a activity multiplier (see `DayTotal`'s breakdown chips).
//
// Two different questions, deliberately answered by two different rules:
//
// - **The number and its label** are arithmetic. At 16 kcal past the budget
//   you have nothing left and 16 over, so it reads "16 kcal over" — strictly,
//   from `remaining < 0`. Softening that would be lying about the total.
// - **The color** is the adherence verdict, and it comes from
//   `classifyDayAdherence` — the same ±5% band the week rail and the Analytics
//   counters use. This ring used to hand-roll a strict `> 0` test of its own,
//   which is how the calendar could call a day on-target while the hero card
//   painted it red.
//
// Color is never the only cue (see the adherence-signal rule in
// `constants/theme.ts`): the label carries the same information in words, and
// the arc's length carries it in shape.
import { StyleSheet } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ADHERENCE_COLOR } from '@/components/ui/adherence-color';
import { Spacing } from '@/constants/theme';
import { classifyDayAdherence } from '@/lib/adherence';
import { budgetFraction } from '@/lib/day-ledger';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 216;
/** Stroke stays proportional to the ring, so a smaller one isn't a fat donut. */
const STROKE_RATIO = 18 / 216;

export function CalorieRing({
  consumed,
  target,
  burned = 0,
  /** Diameter. The dashboard passes a smaller one so the whole left column —
   *  hero, macro cards and the net-vs-budget bar — fits without scrolling. */
  size = SIZE,
}: {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
}) {
  const theme = useTheme();
  const budget = target + burned;
  const remaining = budget - consumed;
  const over = remaining < 0;
  // Shared with the week rail — see `budgetFraction`'s note on why the fill has
  // exactly one formula.
  const fraction = budgetFraction({ consumed, burned, target });

  // `consumed − burned` against the plain resting target: the same two numbers
  // the week rail classifies, so the two can't disagree. (Algebraically
  // identical to `consumed` vs. `target + burned` — see `lib/day-ledger.ts`.)
  const status = classifyDayAdherence(consumed - burned, target) ?? 'under';

  return (
    <ProgressRing
      size={size}
      strokeWidth={Math.round(size * STROKE_RATIO)}
      fraction={fraction}
      // Flat, and never a gradient: the arc's color is now a verdict rather
      // than decoration, and a two-stop sweep would put the ring between two
      // adherence colors at every point along its run.
      color={theme[ADHERENCE_COLOR[status]]}
      trackColor={theme.track}>
      <ThemedView type="transparent" style={styles.center}>
        <ThemedText type="hero" numberOfLines={1} adjustsFontSizeToFit>
          {Math.round(Math.abs(remaining)).toLocaleString()}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          {over ? 'kcal over' : 'kcal left'}
        </ThemedText>
      </ThemedView>
    </ProgressRing>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: Spacing.half,
    // The hero number can reach five digits; keep it clear of the stroke.
    paddingHorizontal: Spacing.four,
  },
});
