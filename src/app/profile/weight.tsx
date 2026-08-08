// Weight — log a new body-weight reading and browse the history. Pushed over the
// profile form via the Profile tab's Stack. Logging a reading re-derives the
// targets (the hook invalidates the profile key). A reading can be logged and
// long-press soft-deleted, consistent with the meal-row delete; timestamps aren't
// editable (back-dating is out of scope for this slice).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { toNumberOrNull } from '@/lib/decimal-input';
import { useTabBarClearance } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import type { BodyWeight } from '@/data/types';
import { useBodyWeights, useCreateBodyWeight, useDeleteBodyWeight } from '@/data/use-body-weights';
import { useTheme } from '@/hooks/use-theme';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function WeightScreen() {
  // Clears the floating tab bar this pushed screen scrolls underneath.
  const tabBarClearance = useTabBarClearance();
  const { data, isPending, isError } = useBodyWeights();
  const create = useCreateBodyWeight();
  const deleteWeight = useDeleteBodyWeight();

  const [value, setValue] = useState('');
  const weightNum = toNumberOrNull(value);
  const canLog = weightNum !== null && weightNum > 0 && !create.isPending;

  function log() {
    if (!canLog) return;
    create.mutate(
      { weight_kg: weightNum!, measured_at: new Date().toISOString() },
      { onSuccess: () => setValue('') }
    );
  }

  const readings = data ?? [];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Weight' }} />
      <ThemedView style={styles.inner}>
        {/* Field, then error, then action — the same top-to-bottom order every
            other card in the app uses (the profile's You and Weight cards, both
            popups). The button used to sit *beside* the input, sharing its row
            and nudged down a point to line up with the input's baseline rather
            than its label's. That is a layout that only works at one font size
            and one label length, and it left the action reading as part of the
            field instead of as the card's conclusion. */}
        <Card style={styles.card}>
          <Field label="New weight" unit="kg" numeric value={value} onChangeText={setValue} />
          {create.isError ? (
            <ThemedText type="small" themeColor="danger">
              Couldn&apos;t log that weight. Try again.
            </ThemedText>
          ) : null}
          {/* ⚖️ rather than the ☑️ a "save what I changed" button wears: this
              creates a new reading, and a create carries its subject's mark —
              the same rule as 💪🏻 on "Log session" and 🔖 on "Save meal". */}
          <AppButton
            label="Log"
            icon="⚖️"
            variant="soft"
            strong
            onPress={log}
            disabled={!canLog}
            pending={create.isPending}
          />
        </Card>

        <SectionHeader title="History" detail={`${readings.length} readings`} />

        <FlatList
          data={readings}
          keyExtractor={(reading) => reading.id}
          renderItem={({ item }) => (
            <WeightRow reading={item} onLongPress={() => deleteWeight.mutate(item)} />
          )}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            isPending ? (
              <ActivityIndicator style={styles.empty} />
            ) : (
              <ThemedText themeColor="textMuted" style={styles.empty}>
                {isError ? "Couldn't load your weight history." : 'No weight logged yet.'}
              </ThemedText>
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
          showsVerticalScrollIndicator={false}
        />
        {deleteWeight.isError ? (
          <ThemedText type="small" themeColor="danger">
            Couldn&apos;t delete that reading. Try again.
          </ThemedText>
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}

function WeightRow({ reading, onLongPress }: { reading: BodyWeight; onLongPress?: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityHint="Hold to delete this reading"
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="surface" style={[styles.row, { borderColor: theme.border }]}>
        <ThemedText type="smallBold">{reading.weight_kg} kg</ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          {dateFormat.format(new Date(reading.measured_at))}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function Separator() {
  return <ThemedView type="transparent" style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    // `three`, matching the profile's own cards — the rhythm a card uses
    // between a field and the button that acts on it.
    gap: Spacing.three,
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
