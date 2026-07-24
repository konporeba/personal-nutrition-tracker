// Review the estimate before anything is logged. FR-005 is explicit that nothing
// reaches the day until the owner confirms it, so this screen is the gate.
//
// The estimate is read from the query cache by `runId` rather than from route
// params: it keeps a sizeable object out of the URL, survives a remount, and
// means this route is only reachable with a real recorded run behind it.
//
// Phase 3 turns the read-outs below into editable fields and adds the commit.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { Estimate } from '@/data/estimation-types';
import { queryKeys } from '@/data/query-keys';

export default function ReviewScreen() {
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const queryClient = useQueryClient();

  const estimate = runId
    ? queryClient.getQueryData<Estimate>(queryKeys.estimate(runId))
    : undefined;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Review' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.inner}>
          {estimate ? <EstimateDetails estimate={estimate} /> : <MissingEstimate />}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function EstimateDetails({ estimate }: { estimate: Estimate }) {
  return (
    <>
      <ThemedText type="subtitle">{estimate.name || 'Unnamed meal'}</ThemedText>

      {!estimate.recognized ? (
        <ThemedView type="backgroundElement" style={styles.notice}>
          <ThemedText type="small">
            We couldn&apos;t identify this as a food. Nothing has been logged — enter the
            values yourself if you want to keep it.
          </ThemedText>
        </ThemedView>
      ) : null}

      <ThemedView style={styles.readouts}>
        <Readout label="Calories" value={estimate.calories} unit="kcal" />
        <Readout label="Protein" value={estimate.protein_g} unit="g" />
        <Readout label="Carbs" value={estimate.carbs_g} unit="g" />
        <Readout label="Fat" value={estimate.fat_g} unit="g" />
      </ThemedView>

      {estimate.assumptions.length > 0 ? (
        <ThemedView style={styles.assumptions}>
          <ThemedText type="smallBold">Assumptions</ThemedText>
          {estimate.assumptions.map((assumption) => (
            <ThemedText key={assumption} type="small" themeColor="textSecondary">
              • {assumption}
            </ThemedText>
          ))}
        </ThemedView>
      ) : null}
    </>
  );
}

/** A single macro read-out. A null value shows a dash — never a fabricated 0. */
function Readout({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.readout}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">
        {value === null ? '—' : `${Math.round(value)} ${unit}`}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Reached by a direct link or after the cache was cleared. There is nothing to
 * review, so offer the way back rather than rendering an empty form.
 */
function MissingEstimate() {
  const router = useRouter();

  return (
    <>
      <ThemedText type="subtitle">Nothing to review</ThemedText>
      <ThemedText themeColor="textSecondary">
        This estimate is no longer available. Describe the meal again to get a new one.
      </ThemedText>
      <Pressable
        onPress={() => router.replace('/')}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">Back to Today</ThemedText>
        </ThemedView>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  notice: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  readouts: {
    gap: Spacing.two,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  assumptions: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
