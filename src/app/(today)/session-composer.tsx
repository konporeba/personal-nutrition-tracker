// Log a new training session (S-09): type, intensity, duration, and an
// owner-entered calorie burn (FR-070/071) — no AI estimate is ever made here,
// mirroring OQ-9's resolution. `logged_at` defaults to the submission
// instant, matching the rest of the app's "log now" convention.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { TrainingIntensity } from '@/data/types';
import { useTargets } from '@/data/use-profile';
import { useCreateTrainingSession } from '@/data/use-training-sessions';
import { useTheme } from '@/hooks/use-theme';

const INTENSITY_OPTIONS: { value: TrainingIntensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

export default function SessionComposerScreen() {
  const router = useRouter();
  const create = useCreateTrainingSession();
  const { targets } = useTargets();

  const [sessionType, setSessionType] = useState('');
  const [intensity, setIntensity] = useState<TrainingIntensity>('moderate');
  const [duration, setDuration] = useState('');
  const [burn, setBurn] = useState('');

  const durationMinutes = toIntOrNull(duration);
  const burnKcal = toNumberOrNull(burn);
  const canSubmit =
    sessionType.trim().length > 0 &&
    durationMinutes !== null &&
    burnKcal !== null &&
    !create.isPending &&
    !create.isSuccess;

  function submit() {
    if (!canSubmit || durationMinutes === null || burnKcal === null) return;
    create.mutate(
      {
        input: {
          logged_at: new Date().toISOString(),
          session_type: sessionType.trim(),
          intensity,
          duration_minutes: durationMinutes,
          burn_kcal: burnKcal,
        },
        targets,
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      },
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Log training' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.inner}>
          <Field
            label="Type"
            value={sessionType}
            onChangeText={setSessionType}
            placeholder="e.g. 5k run"
          />

          <ThemedView style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Intensity
            </ThemedText>
            <ThemedView style={styles.intensityRow}>
              {INTENSITY_OPTIONS.map((option) => {
                const selected = option.value === intensity;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setIntensity(option.value)}
                    style={({ pressed }) => [styles.intensityOption, pressed && styles.pressed]}>
                    <ThemedView
                      type={selected ? 'backgroundSelected' : 'backgroundElement'}
                      style={styles.intensityInner}>
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
          </ThemedView>

          <NumericField
            label="Duration"
            unit="min"
            value={duration}
            onChangeText={(next) => setDuration(onlyInteger(next))}
          />
          <NumericField
            label="Burn"
            unit="kcal"
            value={burn}
            onChangeText={(next) => setBurn(onlyDecimal(next))}
          />

          {create.isError ? (
            <ThemedText type="small" themeColor="textSecondary">
              Couldn&apos;t log that session. Try again.
            </ThemedText>
          ) : null}

          {create.isPending ? (
            <ActivityIndicator style={styles.saving} />
          ) : (
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={canSubmit ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.button}>
                <ThemedText type="smallBold" themeColor={canSubmit ? 'text' : 'textSecondary'}>
                  Log session
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
      />
    </ThemedView>
  );
}

function NumericField({
  label,
  unit,
  value,
  onChangeText,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (next: string) => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label} ({unit})
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="—"
        placeholderTextColor={theme.textSecondary}
      />
    </ThemedView>
  );
}

/** Keep digits only — duration is a whole number of minutes. */
function onlyInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** Keep digits and a single decimal point; drop everything else. */
function onlyDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

/** An empty field means "not entered" — `null`, never a fabricated `0`. */
function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** An empty field means "not entered" — `null`, never a fabricated `0`. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  intensityRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  intensityOption: {
    flex: 1,
  },
  intensityInner: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  saving: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
