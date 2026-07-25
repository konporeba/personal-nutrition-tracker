// Weight — log a new body-weight reading and browse the history. Pushed over the
// profile form via the Profile tab's Stack. Logging a reading re-derives the
// targets (the hook invalidates the profile key). A reading can be logged and
// long-press soft-deleted, consistent with the meal-row delete; timestamps aren't
// editable (back-dating is out of scope for this slice).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { BodyWeight } from '@/data/types';
import {
  useBodyWeights,
  useCreateBodyWeight,
  useDeleteBodyWeight,
} from '@/data/use-body-weights';
import { useTheme } from '@/hooks/use-theme';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function WeightScreen() {
  const theme = useTheme();
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
        <ThemedView style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            New weight (kg)
          </ThemedText>
          <ThemedView style={styles.entryRow}>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              value={value}
              onChangeText={(next) => setValue(onlyNumeric(next))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="—"
              placeholderTextColor={theme.textSecondary}
            />
            {create.isPending ? (
              <ActivityIndicator style={styles.logSpinner} />
            ) : (
              <Pressable
                onPress={log}
                disabled={!canLog}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView
                  type={canLog ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.button}>
                  <ThemedText type="smallBold" themeColor={canLog ? 'text' : 'textSecondary'}>
                    Log
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
          </ThemedView>
          {create.isError ? (
            <ThemedText type="small" themeColor="textSecondary">
              Couldn&apos;t log that weight. Try again.
            </ThemedText>
          ) : null}
        </ThemedView>

        <ThemedText type="smallBold">History</ThemedText>

        <FlatList
          data={readings}
          keyExtractor={(reading) => reading.id}
          renderItem={({ item }) => (
            <WeightRow reading={item} onLongPress={() => deleteWeight.mutate(item)} />
          )}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {isPending
                ? 'Loading…'
                : isError
                  ? "Couldn't load your weight history."
                  : 'No weight logged yet.'}
            </ThemedText>
          }
          contentContainerStyle={styles.listContent}
        />
        {deleteWeight.isError ? (
          <ThemedText type="small" themeColor="textSecondary">
            Couldn&apos;t delete that reading. Try again.
          </ThemedText>
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}

function WeightRow({
  reading,
  onLongPress,
}: {
  reading: BodyWeight;
  onLongPress?: () => void;
}) {
  return (
    <Pressable onLongPress={onLongPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="smallBold">{reading.weight_kg} kg</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {dateFormat.format(new Date(reading.measured_at))}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function Separator() {
  return <ThemedView style={styles.separator} />;
}

/** Keep digits and a single decimal point; drop everything else. */
function onlyNumeric(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

/** An empty field is "unset" (null), never a fabricated `0`. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  field: {
    gap: Spacing.one,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  logSpinner: {
    paddingHorizontal: Spacing.four,
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
    borderRadius: Spacing.three,
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
