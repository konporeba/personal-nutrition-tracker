// The day's ledger (S-09, FR-075): calories in, out, and net — a sibling to
// `DayTotal`, not a modification of it.
//
// Rendered as a row of stat tiles rather than a third block of rings: this is
// detail-on-demand, and the hero above has already answered the only question
// most days raise. When a resting target exists the row gains a net-vs-budget
// bar so a training day visibly earns budget back; when none exists the
// numbers still render, because training logging must never be gated behind
// profile setup.
//
// `expanded` is the dashboard variant, and it does what its name says in both
// axes: the card grows to fill the left column's leftover height, and the four
// tiles grow to fill its width in one row of equal shares.
//
// Off (the phone) they wrap into a 2×2 grid, each tile half the card wide.
// They used to scroll sideways instead — four tiles at their natural width
// across a 375pt screen, so the fourth was always off the edge and the row
// looked cut off rather than scrollable. Half-width tiles are wide enough for
// the number and its unit on one line, and nothing is hidden.
import { StyleSheet } from 'react-native';

import { MacroProgress } from '@/components/macro-progress';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import type { MealEntry, TrainingSession } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { computeDayLedger } from '@/lib/day-ledger';

export function DayLedger({
  entries,
  sessions,
  target,
  /** The dashboard variant — see the header for what it changes and why. */
  expanded = false,
}: {
  entries: MealEntry[];
  sessions: TrainingSession[];
  /** The resting daily target, or null when none can be derived yet. */
  target: number | null;
  expanded?: boolean;
}) {
  const ledger = computeDayLedger(entries, sessions, target);

  const stats = (
    <>
      <Stat label="Eaten" value={ledger.consumed} unit="kcal" accent="text" expanded={expanded} />
      <Stat
        label="Burned"
        value={ledger.burned}
        unit="kcal"
        accent="accentText"
        expanded={expanded}
      />
      <Stat label="Net" value={ledger.net} unit="kcal" accent="text" expanded={expanded} />
      {ledger.target !== null ? (
        <Stat
          label="Budget"
          value={ledger.target}
          unit="kcal"
          accent="textMuted"
          expanded={expanded}
        />
      ) : null}
    </>
  );

  return (
    <Card style={[styles.card, expanded && styles.cardExpanded]} padded={false}>
      {/* Names the card the way "Daily Consumption" names the hero. It also
          earns its keep on the dashboard, where the card is stretched: a
          heading is a better use of the top of that space than more padding. */}
      <ThemedView type="transparent" style={styles.head}>
        <ThemedText type="subtitle">Summary</ThemedText>
      </ThemedView>

      {expanded ? (
        // One row spanning the card. The wrapper is what takes the card's spare
        // height, so the row itself can stay the height of its tallest tile and
        // let the others match it.
        <ThemedView type="transparent" style={styles.railFill}>
          <ThemedView type="transparent" style={[styles.rail, styles.railExpanded]}>
            {stats}
          </ThemedView>
        </ThemedView>
      ) : (
        <ThemedView type="transparent" style={[styles.rail, styles.railGrid]}>
          {stats}
        </ThemedView>
      )}

      {ledger.target !== null ? (
        <ThemedView type="transparent" style={styles.barWrap}>
          <MacroProgress
            label="Net vs. budget"
            unit="kcal"
            consumed={ledger.net}
            target={ledger.target}
          />
        </ThemedView>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
  expanded,
}: {
  label: string;
  value: number;
  unit: string;
  accent: 'text' | 'textMuted' | 'accentText';
  expanded: boolean;
}) {
  const theme = useTheme();

  return (
    <ThemedView
      type="transparent"
      style={[styles.stat, expanded && styles.statExpanded, { backgroundColor: theme.surfaceSoft }]}>
      <ThemedText type="micro" themeColor="textMuted">
        {label}
      </ThemedText>
      <ThemedView type="transparent" style={styles.statValue}>
        <ThemedText type="subtitle" themeColor={accent}>
          {Math.round(value).toLocaleString()}
        </ThemedText>
        <ThemedText type="micro" themeColor="textMuted">
          {unit}
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  cardExpanded: {
    // Fills the left column's leftover height; the stretched rail inside
    // (`railExpanded`) is what absorbs it, leaving the budget bar on the
    // card's bottom edge.
    flex: 1,
    paddingVertical: Spacing.four,
  },
  head: {
    paddingHorizontal: Spacing.three,
  },
  rail: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  railGrid: {
    // Two per row, two rows. On a day with no target there are three tiles, and
    // the third takes the second row on its own — a half-empty last row reads
    // as "there is no budget yet", which is exactly what it means.
    flexWrap: 'wrap',
  },
  railFill: {
    // Absorbs the card's spare height so the slack lands around the tiles
    // rather than as one dead band above the budget bar.
    flexGrow: 1,
    justifyContent: 'center',
  },
  railExpanded: {
    // Every tile takes the height of the tallest — in a narrow column the unit
    // wraps under the number on some tiles and not others, and a row of
    // mismatched heights is the one thing worse than the wrap itself.
    alignItems: 'stretch',
  },
  stat: {
    // Half the row, minus half the gap between the two. Expressed as a basis
    // rather than a width so `flexGrow` can hand a lone tile on the last row
    // the whole line instead of leaving a gap beside it.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%',
    minWidth: 0,
    gap: Spacing.half,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
  },
  statExpanded: {
    // Equal shares of the card's width, whatever that width is: `flexBasis: 0`
    // overrides the half-row basis above, which is what would otherwise wrap
    // the dashboard's four tiles into two rows as well.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.two,
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    // Lets the unit drop under the number in a narrow tile instead of being
    // clipped — the two-pane layout starts well below desktop width.
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  barWrap: {
    paddingHorizontal: Spacing.three,
  },
});
