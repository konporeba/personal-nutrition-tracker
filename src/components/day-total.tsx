// The day's hero card: the calorie ring and the budget breakdown that produced
// it (FR-030). Without targets (no profile or no weight logged yet) it degrades
// to the S-01 bare calorie total plus a way into profile setup, so the screen
// stays useful before S-02 is filled in.
//
// The three macro rings used to live in here too. They are their own cards now
// (`macro-cards.tsx`, mounted by `day-view.tsx` beneath this one) — this card
// answers exactly one question, "how much room is left today", and the
// breakdown chips below the ring are the answer's working out.
//
// Those chips exist to make the sedentary-baseline model legible:
// `remaining = base − food + exercise`, with exercise added back explicitly
// rather than folded into an activity multiplier. Someone reading the ring
// should be able to see where its number came from without leaving the card.
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { CalorieRing } from '@/components/calorie-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { GradientFill } from '@/components/ui/gradient';
import { Spacing } from '@/constants/theme';
import type { MealEntry } from '@/data/types';
import { useLayout } from '@/hooks/use-layout';
import type { Targets } from '@/lib/derive-targets';
import { sumCalories } from '@/lib/sum-calories';
import { useTheme } from '@/hooks/use-theme';

/** The dashboard's ring, shrunk from the phone's 216 so the left column's
 *  three cards — hero, macros, ledger — clear a laptop viewport without the
 *  net-vs-budget bar falling below the fold. */
const WIDE_RING_SIZE = 168;

export function DayTotal({
  entries,
  targets,
  /** Today's logged training burn — the "+ exercise" half of the budget. */
  burned,
}: {
  entries: MealEntry[];
  /** The effective daily targets, or null when none can be derived yet. */
  targets: Targets | null;
  burned: number;
}) {
  return targets ? (
    <BudgetCard entries={entries} targets={targets} burned={burned} />
  ) : (
    <BareTotalCard entries={entries} />
  );
}

function BudgetCard({
  entries,
  targets,
  burned,
}: {
  entries: MealEntry[];
  targets: Targets;
  burned: number;
}) {
  const theme = useTheme();
  const { isWide } = useLayout();
  const calories = sumCalories(entries);

  return (
    <Card style={[styles.card, isWide && styles.cardWide]}>
      {/* Ambient wash behind the ring. The hero is the one card that gets it —
          spread across every card it would stop meaning "look here". */}
      <GradientFill from={theme.glowFrom} to={theme.glowTo} direction="vertical" />

      {/* Left-aligned against the card, unlike everything below it: the title
          names the card, the ring is the card's content. Title Case here and
          nowhere else — this is the dashboard's one named panel. */}
      <ThemedText type="subtitle">Daily Consumption</ThemedText>

      <ThemedView type="transparent" style={[styles.body, isWide && styles.bodyWide]}>
        <CalorieRing
          consumed={calories}
          target={targets.calories}
          burned={burned}
          size={isWide ? WIDE_RING_SIZE : undefined}
        />

        <ThemedView type="transparent" style={styles.chipRow}>
          <Chip label={`Base ${format(targets.calories)}`} />
          <Chip label={`Food −${format(calories)}`} />
          {/* Only shown once there is a burn to add back — a "+0" chip would
              imply the model does something on a rest day that it doesn't. */}
          {burned > 0 ? <Chip label={`Exercise +${format(burned)}`} tone="accent" /> : null}
        </ThemedView>
      </ThemedView>
    </Card>
  );
}

/** The S-01 fallback: the bare calorie total and a way to set up targets. */
function BareTotalCard({ entries }: { entries: MealEntry[] }) {
  const router = useRouter();
  const total = sumCalories(entries);

  return (
    <Card style={styles.bareCard}>
      <ThemedView type="transparent" style={styles.totalRow}>
        <ThemedText type="hero">{format(total)}</ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          kcal today
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" themeColor="textMuted">
        Add your height, age and weight to turn this into a daily budget with
        macro targets.
      </ThemedText>
      <AppButton
        label="Set up your profile"
        variant="primary"
        onPress={() => router.push('/profile')}
      />
    </Card>
  );
}

function format(value: number): string {
  return Math.round(value).toLocaleString();
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.four,
  },
  cardWide: {
    // Every measurement in the dashboard's hero is one step down the scale
    // from the phone's; together with the smaller ring that is what buys the
    // ledger bar its place above the fold.
    gap: Spacing.three,
    padding: Spacing.three,
  },
  bareCard: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  body: {
    alignItems: 'center',
    gap: Spacing.four,
  },
  bodyWide: {
    gap: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
