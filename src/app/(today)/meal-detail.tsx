// Inspect and edit a single logged entry (S-07): full macro breakdown, icon,
// and source marker, with edit/re-section/delete all living here. The day
// list only navigates to this screen — see `meal-entry-row.tsx`.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { MoveSectionSheet } from '@/components/move-section-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { EntrySource, MealEntry, Section } from '@/data/types';
import {
  useDayEntries,
  useDeleteMealEntry,
  useUpdateMealEntry,
  useUpdateMealEntrySection,
} from '@/data/use-meal-entries';
import { useTheme } from '@/hooks/use-theme';
import { iconForEntry } from '@/lib/food-emoji';

/** Display label per source (FR-062) — no screen has shown this before this one. */
const SOURCE_LABELS: Record<EntrySource, string> = {
  label_scan: 'Label scan',
  plate_photo: 'Plate photo',
  free_text: 'Free text',
  saved_meal: 'Saved meal',
  manual: 'Manual',
  exercise_estimate: 'Exercise estimate',
};

export default function MealDetailScreen() {
  // `date` is present when reached from a past day (S-11's analytics day
  // route); absent from Today, which defaults to today exactly as before.
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const { query } = useDayEntries(date ? new Date(date) : undefined);
  const entry = query.data?.find((candidate) => candidate.id === id) ?? null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Meal' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.inner}>
          {entry ? <DetailForm entry={entry} /> : <MissingMealEntry />}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function DetailForm({ entry }: { entry: MealEntry }) {
  const router = useRouter();
  const update = useUpdateMealEntry();
  const updateSection = useUpdateMealEntrySection();
  const deleteEntry = useDeleteMealEntry();

  const [name, setName] = useState(entry.name);
  const [calories, setCalories] = useState(() => seedField(entry.calories));
  const [protein, setProtein] = useState(() => seedField(entry.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(entry.carbs_g));
  const [fat, setFat] = useState(() => seedField(entry.fat_g));
  const [foodCategory, setFoodCategory] = useState(entry.food_category ?? '');
  const [movingSection, setMovingSection] = useState(false);

  // One row's three actions (save/re-section/delete) aren't mutually
  // exclusive by construction — guard on the combined state so a second
  // action can't fire while another is still in flight against this entry.
  const anyPending = update.isPending || updateSection.isPending || deleteEntry.isPending;
  const canSave = name.trim().length > 0 && !anyPending && !update.isSuccess;

  function save() {
    if (!canSave) return;
    // `source` is deliberately absent from this patch — editing a value never
    // erases how the entry was originally captured (see plan's Critical
    // Implementation Details).
    update.mutate(
      {
        id: entry.id,
        logged_at: entry.logged_at,
        patch: {
          name: name.trim(),
          calories: toNumberOrNull(calories),
          protein_g: toNumberOrNull(protein),
          carbs_g: toNumberOrNull(carbs),
          fat_g: toNumberOrNull(fat),
          food_category: foodCategory.trim() || null,
        },
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      },
    );
  }

  function moveTo(section: Section) {
    if (anyPending) return;
    if (section === entry.section) {
      setMovingSection(false);
      return;
    }
    updateSection.mutate(
      { id: entry.id, logged_at: entry.logged_at, section },
      { onSuccess: () => setMovingSection(false) },
    );
  }

  // No confirmation step — tapping Delete IS the confirmation, matching
  // SavedMealActionsSheet's established convention.
  function remove() {
    if (anyPending) return;
    deleteEntry.mutate(
      { id: entry.id, logged_at: entry.logged_at },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      },
    );
  }

  return (
    <>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.icon}>
          {iconForEntry({ food_category: foodCategory, name })}
        </ThemedText>
        <ThemedText type="title" style={styles.name}>
          {entry.name}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.sourceRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Source
        </ThemedText>
        <ThemedText type="smallBold">{SOURCE_LABELS[entry.source]}</ThemedText>
      </ThemedView>

      <Field label="Meal" value={name} onChangeText={setName} placeholder="What was it?" />
      <NumericField label="Calories" unit="kcal" value={calories} onChangeText={setCalories} />
      <NumericField label="Protein" unit="g" value={protein} onChangeText={setProtein} />
      <NumericField label="Carbs" unit="g" value={carbs} onChangeText={setCarbs} />
      <NumericField label="Fat" unit="g" value={fat} onChangeText={setFat} />
      <Field
        label="Category"
        value={foodCategory}
        onChangeText={setFoodCategory}
        placeholder="e.g. pizza"
      />

      {update.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t save your changes. Try again.
        </ThemedText>
      ) : null}

      {update.isPending ? (
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
              Save changes
            </ThemedText>
          </ThemedView>
        </Pressable>
      )}

      <Pressable
        onPress={() => setMovingSection(true)}
        disabled={anyPending}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold" themeColor={anyPending ? 'textSecondary' : 'text'}>
            Change section
          </ThemedText>
        </ThemedView>
      </Pressable>

      {updateSection.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t move that entry. Try again.
        </ThemedText>
      ) : null}

      {deleteEntry.isPending ? (
        <ActivityIndicator style={styles.saving} />
      ) : (
        <Pressable
          onPress={remove}
          disabled={anyPending}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.button}>
            <ThemedText type="smallBold" themeColor={anyPending ? 'textSecondary' : 'text'}>
              Delete
            </ThemedText>
          </ThemedView>
        </Pressable>
      )}

      {deleteEntry.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t delete that entry. Try again.
        </ThemedText>
      ) : null}

      <MoveSectionSheet
        visible={movingSection}
        currentSection={entry.section}
        onSelect={moveTo}
        onRequestClose={() => setMovingSection(false)}
      />
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
 * Reached with a stale/unknown id (e.g. deleted from another client). There is
 * nothing to show, so offer the way back rather than rendering an empty form.
 */
function MissingMealEntry() {
  const router = useRouter();

  return (
    <>
      <ThemedText type="subtitle">Not found</ThemedText>
      <ThemedText themeColor="textSecondary">This entry is no longer available.</ThemedText>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">Back</ThemedText>
        </ThemedView>
      </Pressable>
    </>
  );
}

/** Seed a field from a saved value. Null becomes empty, never a fabricated `0`. */
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  icon: {
    fontSize: 32,
  },
  name: {
    flexShrink: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
