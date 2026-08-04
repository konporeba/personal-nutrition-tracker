// Protein, carbs and fat as three separate cards, side by side under the
// calorie hero.
//
// They used to be a band of three rings *inside* the hero card (the since
// deleted `macro-ring-row.tsx`). Splitting them out is what the dashboard
// layout asks for and what the information wants: the hero answers one
// question ("how much room is left today"), and each macro is its own separate
// answer rather than a footnote to it. One card per macro also gives each ring
// its own labelled surface, so the identity color has something to sit on
// instead of floating in the hero's gradient wash.
//
// Each macro keeps its fixed identity hue from `constants/theme.ts` — the same
// color always means the same nutrient across the app.
import { StyleSheet } from 'react-native';

import { clampFraction, ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 76;
const STROKE_WIDTH = 8;
/** Each ring starts a beat after the one to its left. */
const STAGGER_MS = 110;

type MacroValue = { consumed: number; target: number };

export function MacroCards({
  protein,
  carbs,
  fat,
}: {
  protein: MacroValue;
  carbs: MacroValue;
  fat: MacroValue;
}) {
  return (
    <ThemedView type="transparent" style={styles.row}>
      <MacroCard label="Protein" color="protein" delayMs={0} {...protein} />
      <MacroCard label="Carbs" color="carbs" delayMs={STAGGER_MS} {...carbs} />
      <MacroCard label="Fat" color="fat" delayMs={STAGGER_MS * 2} {...fat} />
    </ThemedView>
  );
}

function MacroCard({
  label,
  color,
  consumed,
  target,
  delayMs,
}: {
  label: string;
  color: ThemeColor;
  consumed: number;
  target: number;
  delayMs: number;
}) {
  const theme = useTheme();
  const fraction = clampFraction(consumed / target);
  // Uncapped, unlike the ring itself — the ring tops out at full but the
  // number keeps counting, so 140% still reads as 140%.
  const percent = target > 0 ? Math.round((consumed / target) * 100) : 0;

  return (
    <Card style={styles.card}>
      <ProgressRing
        size={SIZE}
        strokeWidth={STROKE_WIDTH}
        fraction={fraction}
        color={theme[color]}
        trackColor={theme.track}
        delayMs={delayMs}>
        <ThemedText type="smallBold">{percent}%</ThemedText>
      </ProgressRing>
      <ThemedView type="transparent" style={styles.caption}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="micro" themeColor="textMuted" numberOfLines={1}>
          {Math.round(consumed)} / {Math.round(target)} g
        </ThemedText>
      </ThemedView>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  card: {
    // Equal thirds of whatever width the row gets, on every layout — the cards
    // are siblings, so none of them may size to its own label.
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  caption: {
    alignItems: 'center',
    gap: 1,
  },
});
