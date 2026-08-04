// Analytics — the payoff for weeks of logging (S-11, US-06): intake,
// expenditure, and net-vs-budget trends over a rolling 7-day or 30-day
// window, each day's adherence coded directly into the net panel, and body
// weight plotted against the owner's goal. Every metric comes from the exact
// functions Today and Profile already use (`effectiveTargets`,
// `computeDayLedger`) via `useAnalyticsRange` — this screen adds range
// plumbing and presentation only, no new domain math.
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { TrendLineChart, type TrendPoint } from '@/components/charts/trend-line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ScreenScroll } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { useAnalyticsRange } from '@/data/use-analytics';
import { useBodyWeights } from '@/data/use-body-weights';
import { useProfile } from '@/data/use-profile';
import { useLayout } from '@/hooks/use-layout';
import { ADHERENCE_TOLERANCE, classifyDayAdherence } from '@/lib/adherence';
import { movingAverage } from '@/lib/moving-average';

const WINDOW_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
] as const satisfies readonly { value: 7 | 30; label: string }[];

/** Chart readouts spell their unit out; the axis doesn't exist to carry it. */
const kcal = (value: number) => `${Math.round(value).toLocaleString()} kcal`;
const kg = (value: number) => `${value} kg`;

export default function AnalyticsScreen() {
  const router = useRouter();
  // Wide screens get the panels two-up; the charts are square-ish, so a single
  // column wastes most of a desktop window.
  const { isWide } = useLayout();
  const [days, setDays] = useState<7 | 30>(7);
  const { days: range, isPending, isError } = useAnalyticsRange(days);
  const { data: profile } = useProfile();
  const { data: weights } = useBodyWeights();

  const intakeSeries = range.map((d) => d.consumed);
  const burnedSeries = range.map((d) => d.burned);
  const netSeries = range.map((d) => d.net);
  const adherence = range.map((d) => classifyDayAdherence(d.net, d.target));
  const onCount = adherence.filter((a) => a === 'on').length;
  const overCount = adherence.filter((a) => a === 'over').length;
  const underCount = adherence.filter((a) => a === 'under').length;
  // The most recently touched day's target — a single flat reference line,
  // not a per-day one, since a target can only change day-to-day if the
  // profile itself changed mid-range.
  const latestTarget = range.length > 0 ? range[range.length - 1].target : null;

  const rangeStart = range[0]?.day;
  const rangeEndExclusive = range.length > 0 ? addDays(range[range.length - 1].day, 1) : undefined;
  const weightPoints: TrendPoint[] = (weights ?? [])
    .filter((w) => {
      if (!rangeStart || !rangeEndExclusive) return false;
      const measuredAt = new Date(w.measured_at);
      return measuredAt >= rangeStart && measuredAt < rangeEndExclusive;
    })
    .map((w) => ({ x: new Date(w.measured_at), y: w.weight_kg }))
    .sort((a, b) => a.x.getTime() - b.x.getTime());

  return (
    <ScreenScroll>
      <ThemedView type="transparent" style={styles.head}>
        <SectionHeader title="Analytics" />
        <ThemedText type="small" themeColor="textMuted">
          How the last {days} days have actually gone.
        </ThemedText>
        <Segmented options={WINDOW_OPTIONS} value={days} onSelect={setDays} />
      </ThemedView>

      {isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : isError ? (
        <ThemedText themeColor="textMuted">Couldn&apos;t load your analytics.</ThemedText>
      ) : (
        <ThemedView type="transparent" style={[styles.grid, isWide && styles.gridWide]}>
          <Panel title="Intake" caption="Calories eaten per day, with a 7-day average.">
            <TrendLineChart
              data={range.map((d) => ({ x: d.day, y: d.consumed }))}
              movingAverage={movingAverage(intakeSeries, 7)}
              formatValue={kcal}
            />
          </Panel>

          <Panel title="Expenditure" caption="Training burn per day.">
            <TrendLineChart
              data={range.map((d) => ({ x: d.day, y: d.burned }))}
              movingAverage={movingAverage(burnedSeries, 7)}
              formatValue={kcal}
            />
          </Panel>

          <Panel
            title="Net vs. budget"
            caption="The shaded band is on target. Tap a day to open it.">
            <ThemedView type="transparent" style={styles.chipRow}>
              <Chip label={`${onCount} on`} tone="accent" />
              <Chip label={`${overCount} over`} />
              <Chip label={`${underCount} under`} />
            </ThemedView>
            <TrendLineChart
              data={range.map((d) => ({ x: d.day, y: d.net }))}
              movingAverage={movingAverage(netSeries, 7)}
              referenceValue={latestTarget ?? undefined}
              // The same ±5% the classifier uses, shaded rather than encoded
              // into the color of each mark: on-target becomes a place on the
              // chart you can see a point sitting inside.
              referenceBand={ADHERENCE_TOLERANCE}
              formatValue={kcal}
              onPointPress={(point) =>
                router.push({
                  pathname: '/analytics/day',
                  params: { date: point.x.toISOString() },
                })
              }
            />
          </Panel>

          <Panel
            title="Weight vs. goal"
            caption={
              profile?.target_weight_kg
                ? 'Your logged weight against the goal line.'
                : 'Set a weight goal in Profile to add the goal line.'
            }>
            {weightPoints.length > 0 ? (
              <TrendLineChart
                data={weightPoints}
                referenceValue={profile?.target_weight_kg ?? undefined}
                formatValue={kg}
              />
            ) : (
              <ThemedText type="small" themeColor="textMuted">
                No weight logged in this window.
              </ThemedText>
            )}
          </Panel>
        </ThemedView>
      )}
    </ScreenScroll>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  const { isWide } = useLayout();

  return (
    <Card style={[styles.panel, isWide && styles.panelWide]}>
      <ThemedView type="transparent">
        <ThemedText type="smallBold">{title}</ThemedText>
        {caption ? (
          <ThemedText type="micro" themeColor="textMuted">
            {caption}
          </ThemedText>
        ) : null}
      </ThemedView>
      {children}
    </Card>
  );
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

const styles = StyleSheet.create({
  head: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  loading: {
    paddingVertical: Spacing.six,
  },
  grid: {
    gap: Spacing.four,
  },
  gridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  panel: {
    gap: Spacing.three,
  },
  panelWide: {
    // Two per row, accounting for the row gap.
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 340,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
