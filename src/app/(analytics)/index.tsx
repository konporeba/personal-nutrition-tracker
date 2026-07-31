// Analytics — the payoff for weeks of logging (S-11, US-06): intake,
// expenditure, and net-vs-budget trends over a rolling 7-day or 30-day
// window, each day's adherence coded directly into the net panel, and body
// weight plotted against the owner's goal. Every metric comes from the exact
// functions Today and Profile already use (`effectiveTargets`,
// `computeDayLedger`) via `useAnalyticsRange` — this screen adds range
// plumbing and presentation only, no new domain math.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrendLineChart, type TrendPoint, type TrendPointStyle } from '@/components/charts/trend-line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAnalyticsRange } from '@/data/use-analytics';
import { useBodyWeights } from '@/data/use-body-weights';
import { useProfile } from '@/data/use-profile';
import { classifyDayAdherence } from '@/lib/adherence';
import { movingAverage } from '@/lib/moving-average';

const WINDOW_OPTIONS: { value: 7 | 30; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

const ADHERENCE_STYLE: Record<'on' | 'over' | 'under', TrendPointStyle> = {
  on: { color: 'adherenceOn', shape: 'circle' },
  over: { color: 'adherenceOver', shape: 'triangle' },
  under: { color: 'adherenceUnder', shape: 'diamond' },
};
const NO_TARGET_STYLE: TrendPointStyle = { color: 'textSecondary', shape: 'circle' };

export default function AnalyticsScreen() {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const { days, isPending, isError } = useAnalyticsRange(windowDays);
  const { data: profile } = useProfile();
  const { data: weights } = useBodyWeights();

  const intakeSeries = days.map((d) => d.consumed);
  const burnedSeries = days.map((d) => d.burned);
  const netSeries = days.map((d) => d.net);
  const adherence = days.map((d) => classifyDayAdherence(d.net, d.target));
  const onCount = adherence.filter((a) => a === 'on').length;
  const overCount = adherence.filter((a) => a === 'over').length;
  const underCount = adherence.filter((a) => a === 'under').length;
  // The most recently touched day's target — a single flat reference line,
  // not a per-day one, since a target can only change day-to-day if the
  // profile itself changed mid-range.
  const latestTarget = days.length > 0 ? days[days.length - 1].target : null;

  const rangeStart = days[0]?.day;
  const rangeEndExclusive =
    days.length > 0 ? addDays(days[days.length - 1].day, 1) : undefined;
  const weightPoints: TrendPoint[] = (weights ?? [])
    .filter((w) => {
      if (!rangeStart || !rangeEndExclusive) return false;
      const measuredAt = new Date(w.measured_at);
      return measuredAt >= rangeStart && measuredAt < rangeEndExclusive;
    })
    .map((w) => ({ x: new Date(w.measured_at), y: w.weight_kg }))
    .sort((a, b) => a.x.getTime() - b.x.getTime());

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={[styles.safeArea, surfacePlatformStyle]}
        edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, listPlatformStyle]}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Analytics</ThemedText>

          <ThemedView style={styles.toggleRow}>
            {WINDOW_OPTIONS.map((option) => {
              const selected = option.value === windowDays;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setWindowDays(option.value)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type={selected ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.toggleOption}>
                    <ThemedText
                      type="smallBold"
                      themeColor={selected ? 'text' : 'textSecondary'}>
                      {option.label}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </ThemedView>

          {isPending ? (
            <ActivityIndicator style={styles.loading} />
          ) : isError ? (
            <ThemedText themeColor="textSecondary">Couldn&apos;t load your analytics.</ThemedText>
          ) : (
            <>
              <Panel title="Intake">
                <TrendLineChart
                  data={days.map((d) => ({ x: d.day, y: d.consumed }))}
                  movingAverage={movingAverage(intakeSeries, 7)}
                />
              </Panel>

              <Panel title="Expenditure">
                <TrendLineChart
                  data={days.map((d) => ({ x: d.day, y: d.burned }))}
                  movingAverage={movingAverage(burnedSeries, 7)}
                />
              </Panel>

              <Panel title="Net vs. budget">
                <ThemedText type="small" themeColor="textSecondary">
                  {onCount} on · {overCount} over · {underCount} under
                </ThemedText>
                <TrendLineChart
                  data={days.map((d) => ({ x: d.day, y: d.net }))}
                  movingAverage={movingAverage(netSeries, 7)}
                  referenceValue={latestTarget ?? undefined}
                  pointStyle={(_point, index) => {
                    const status = adherence[index];
                    return status ? ADHERENCE_STYLE[status] : NO_TARGET_STYLE;
                  }}
                />
              </Panel>

              <Panel title="Weight vs. goal">
                {weightPoints.length > 0 ? (
                  <TrendLineChart
                    data={weightPoints}
                    referenceValue={profile?.target_weight_kg ?? undefined}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No weight logged in this window.
                  </ThemedText>
                )}
              </Panel>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

// Match Profile: the web tab bar floats over the top, the native one sits at
// the bottom; each platform pads away from its own.
const surfacePlatformStyle = { paddingTop: Spacing.six };
const listPlatformStyle = { paddingBottom: BottomTabInset + Spacing.three };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  loading: {
    paddingVertical: Spacing.six,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toggleOption: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  panel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
