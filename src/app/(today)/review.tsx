// Review, edit, and commit. FR-005 is explicit that nothing reaches the day until
// the owner confirms it, so this screen is the gate — and the only place a meal
// entry is written.
//
// The estimate is read from the query cache by `runId` rather than from route
// params: it keeps a sizeable object out of the URL, survives a remount, and
// means this route is only reachable with a real recorded run behind it.
//
// One form, two modes. When the model recognized the input the fields arrive
// filled in and the entry commits as `free_text`; when it didn't, the macro
// fields start blank, the typed text seeds the name, and the entry commits as
// `manual` (FR-008). Structurally the same code path, so there is no separate
// manual-entry branch that can silently rot.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { Estimate } from '@/data/estimation-types';
import { uploadMealPhoto } from '@/data/meal-photos.repo';
import { queryKeys } from '@/data/query-keys';
import { useCreateMealEntry } from '@/data/use-meal-entries';
import { useTheme } from '@/hooks/use-theme';
import type { CapturedLabel } from '@/lib/capture-label';
import { sectionForTime } from '@/lib/section-for-time';

export default function ReviewScreen() {
  const { runId, text, source } = useLocalSearchParams<{
    runId?: string;
    text?: string;
    source?: string;
  }>();
  const queryClient = useQueryClient();

  const estimate = runId
    ? queryClient.getQueryData<Estimate>(queryKeys.estimate(runId))
    : undefined;
  // Staged by the composer's scan affordance; undefined for the text path.
  const photo = runId
    ? queryClient.getQueryData<CapturedLabel>(queryKeys.labelPhoto(runId))
    : undefined;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Review' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.inner}>
          {estimate && runId ? (
            <ReviewForm
              estimate={estimate}
              runId={runId}
              typedText={text ?? ''}
              isLabelScan={source === 'label_scan'}
              photo={photo}
            />
          ) : (
            <MissingEstimate />
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function ReviewForm({
  estimate,
  runId,
  typedText,
  isLabelScan,
  photo,
}: {
  estimate: Estimate;
  runId: string;
  typedText: string;
  isLabelScan: boolean;
  photo: CapturedLabel | undefined;
}) {
  const router = useRouter();
  const create = useCreateMealEntry();
  const recognized = estimate.recognized;
  // A label capture is only "per-serving" when it actually extracted a serving
  // size; an unrecognized label has none and falls through to the plain manual
  // form below, same as any other unrecognized input.
  const showServings = recognized && estimate.serving_size !== null;

  // Seeded once. An unrecognized input contributes no numbers at all — the
  // owner's own text is the only thing worth carrying over.
  const [name, setName] = useState(() =>
    recognized ? estimate.name : typedText || estimate.name
  );
  const [calories, setCalories] = useState(() => seedField(estimate.calories));
  const [protein, setProtein] = useState(() => seedField(estimate.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(estimate.carbs_g));
  const [fat, setFat] = useState(() => seedField(estimate.fat_g));
  const [servings, setServings] = useState('1');

  // `isSuccess` matters as much as `isPending`: between onSuccess firing and the
  // navigation unmounting this screen there is a frame in which the button would
  // otherwise be live again, and a second tap would commit a duplicate entry.
  const canSave = name.trim().length > 0 && !create.isPending && !create.isSuccess;

  // 1× for every non-label path, so their totals are unaffected.
  const multiplier = showServings ? parseServings(servings) : 1;
  function total(perServing: string): number | null {
    const value = toNumberOrNull(perServing);
    return value === null ? null : value * multiplier;
  }

  function save() {
    if (!canSave) return;
    const loggedAt = new Date();

    create.mutate(
      {
        logged_at: loggedAt.toISOString(),
        section: sectionForTime(loggedAt),
        // A label capture that came back unrecognized is filled in by hand, same
        // as any other unrecognized input — the capture path alone doesn't make
        // it a label_scan entry (FR-006).
        source: recognized ? (isLabelScan ? 'label_scan' : 'free_text') : 'manual',
        name: name.trim(),
        calories: total(calories),
        protein_g: total(protein),
        carbs_g: total(carbs),
        fat_g: total(fat),
        // The model's coarse label, stored so Today can show a specific icon
        // (S-05). Null on the unrecognized/manual path — and an empty label
        // normalizes to null too, so "no category" has one representation. The
        // day view falls back to a name-derived or generic icon there.
        food_category: recognized ? estimate.food_category || null : null,
        // Linked in both modes: an unrecognized input still produced a real run,
        // and the link is the audit trail of what the model was asked.
        estimation_run_id: runId,
      },
      {
        onSuccess: (entry) => {
          // Best-effort, after the entry already exists: the photo is evidence
          // only, so a failed upload must never block the log or surface to the
          // owner (FR-007's privacy model, extended by S-03).
          if (isLabelScan && photo) {
            uploadMealPhoto(entry.id, photo.data).catch((err) => {
              console.error('[review] evidence photo upload failed:', err);
            });
          }
          backToToday(router);
        },
      }
    );
  }

  return (
    <>
      {!recognized ? (
        <ThemedView type="backgroundElement" style={styles.notice}>
          <ThemedText type="small">
            We couldn&apos;t identify this as a food, so nothing has been filled in. Enter
            the values yourself to log it, or go back.
          </ThemedText>
        </ThemedView>
      ) : null}

      {showServings ? (
        <ThemedText type="small" themeColor="textSecondary">
          Serving size: {estimate.serving_size}
        </ThemedText>
      ) : null}

      <Field label="Meal" value={name} onChangeText={setName} placeholder="What was it?" />
      <NumericField label="Calories" unit="kcal" value={calories} onChangeText={setCalories} />
      <NumericField label="Protein" unit="g" value={protein} onChangeText={setProtein} />
      <NumericField label="Carbs" unit="g" value={carbs} onChangeText={setCarbs} />
      <NumericField label="Fat" unit="g" value={fat} onChangeText={setFat} />

      {showServings ? (
        <NumericField label="Servings" unit="×" value={servings} onChangeText={setServings} />
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        {showServings
          ? 'Values above are per serving; totals are multiplied by servings before saving.'
          : 'Leave a field empty to log it as unknown rather than zero.'}
      </ThemedText>

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

      {create.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t save that. Try again.
        </ThemedText>
      ) : null}

      {create.isPending ? (
        <ActivityIndicator style={styles.saving} />
      ) : (
        <Pressable
          onPress={save}
          disabled={!canSave}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView
            type={canSave ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.button}>
            <ThemedText type="smallBold" themeColor={canSave ? 'text' : 'textSecondary'}>
              Log it
            </ThemedText>
          </ThemedView>
        </Pressable>
      )}
    </>
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

/**
 * A macro field. Non-numeric characters are dropped as they are typed, so the
 * value can never become something `toNumberOrNull` has to guess at.
 */
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
        onChangeText={(next) => onChangeText(onlyNumeric(next))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="—"
        placeholderTextColor={theme.textSecondary}
      />
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
        onPress={() => backToToday(router)}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">Back to Today</ThemedText>
        </ThemedView>
      </Pressable>
    </>
  );
}

function backToToday(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Seed a field from an estimate. Null becomes empty, never a fabricated `0`. */
function seedField(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Keep digits and a single decimal point; drop everything else. */
function onlyNumeric(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

/**
 * An empty field means "unknown", which is `null` — not `0`. Zero is a real
 * measurement and must only be stored when the owner actually typed it.
 */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** An invalid or non-positive servings count falls back to 1 (the seeded default). */
function parseServings(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
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
  saving: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
