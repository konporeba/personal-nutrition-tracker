// Inspect and edit a single logged entry (S-07), as a popup: the full macro
// breakdown, its section, and delete, all in one dialog.
//
// This replaces the `(today)/meal-detail` route, which pushed a full screen
// with a stack header over the day — same move as the training composer, and
// the last of the app's forms to make it. The header carries the entry's
// `IconChip`, the same disc the row wears in the list, so the popup visibly
// belongs to the thing that was tapped.
//
// Two things the old screen did with extra chrome are folded in here:
// re-sectioning is an inline picker rather than a "Change section" button that
// opened a second sheet (`move-section-sheet.tsx`, deleted with it), and it
// rides the same save as everything else — `MealEntryPatch` already carries
// `section`, so there was never a reason for it to be its own round trip.
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { IconChip } from '@/components/icon-chip';
import { SECTION_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Radius, Spacing } from '@/constants/theme';
import type { EntrySource, MealEntry, Section } from '@/data/types';
import { useDeleteMealEntry, useUpdateMealEntry } from '@/data/use-meal-entries';
import { useTheme } from '@/hooks/use-theme';
import { onlyDecimal, toNumberOrNull } from '@/lib/decimal-input';
import { iconForEntry } from '@/lib/food-emoji';
import { SECTION_ORDER } from '@/lib/group-by-section';

/** Display label per source (FR-062) — how the entry was originally captured. */
const SOURCE_LABELS: Record<EntrySource, string> = {
  label_scan: 'Label scan',
  plate_photo: 'Plate photo',
  free_text: 'Free text',
  saved_meal: 'Saved meal',
  manual: 'Manual',
  exercise_estimate: 'Exercise estimate',
};

const SECTION_OPTIONS = SECTION_ORDER.map((section) => ({
  value: section,
  label: SECTION_LABELS[section],
}));

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function MealEntrySheet({
  entry,
  onRequestClose,
}: {
  entry: MealEntry;
  onRequestClose: () => void;
}) {
  const update = useUpdateMealEntry();
  const remove = useDeleteMealEntry();

  const [name, setName] = useState(entry.name);
  const [section, setSection] = useState<Section>(entry.section);
  const [calories, setCalories] = useState(() => seedField(entry.calories));
  const [protein, setProtein] = useState(() => seedField(entry.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(entry.carbs_g));
  const [fat, setFat] = useState(() => seedField(entry.fat_g));
  const [foodCategory, setFoodCategory] = useState(entry.food_category ?? '');

  // Save and delete aren't mutually exclusive by construction — guard on the
  // combined state so a second action can't fire while another is in flight.
  const anyPending = update.isPending || remove.isPending;
  const canSave = name.trim().length > 0 && !anyPending;

  function save() {
    if (!canSave) return;
    // `source` is deliberately absent from this patch — editing a value never
    // erases how the entry was originally captured.
    update.mutate(
      {
        id: entry.id,
        logged_at: entry.logged_at,
        patch: {
          name: name.trim(),
          section,
          calories: toNumberOrNull(calories),
          protein_g: toNumberOrNull(protein),
          carbs_g: toNumberOrNull(carbs),
          fat_g: toNumberOrNull(fat),
          food_category: foodCategory.trim() || null,
        },
      },
      { onSuccess: onRequestClose }
    );
  }

  // No confirmation step — tapping Delete IS the confirmation, matching
  // SavedMealActionsSheet's established convention.
  function destroy() {
    if (anyPending) return;
    remove.mutate({ id: entry.id, logged_at: entry.logged_at }, { onSuccess: onRequestClose });
  }

  return (
    <Sheet
      visible
      title={entry.name}
      subtitle={`${timeFormat.format(new Date(entry.logged_at))} · ${SOURCE_LABELS[entry.source]}`}
      // Tracks the fields as they're edited, so re-categorizing an entry shows
      // its new mark immediately rather than after a save and a reopen.
      leading={<IconChip icon={iconForEntry({ food_category: foodCategory, name })} />}
      // Centered on every size, matching the add-meal and training popups. This
      // is a six-field form; anchored to the bottom edge on a phone it ran off
      // the top of the viewport with its own title out of reach.
      placement="center"
      onRequestClose={onRequestClose}>
      <Field label="Meal" value={name} onChangeText={setName} placeholder="What was it?" />

      <ThemedView type="transparent" style={styles.field}>
        <ThemedText type="small" themeColor="textMuted">
          Section
        </ThemedText>
        <Segmented options={SECTION_OPTIONS} value={section} onSelect={setSection} />
      </ThemedView>

      <NumericField label="Calories" unit="kcal" value={calories} onChangeText={setCalories} />

      {/* The three macros always move together, so they share a line rather
          than stacking into three near-identical rows. */}
      <ThemedView type="transparent" style={styles.macros}>
        <NumericField label="Protein" unit="g" value={protein} onChangeText={setProtein} grouped />
        <NumericField label="Carbs" unit="g" value={carbs} onChangeText={setCarbs} grouped />
        <NumericField label="Fat" unit="g" value={fat} onChangeText={setFat} grouped />
      </ThemedView>

      <Field
        label="Category"
        value={foodCategory}
        onChangeText={setFoodCategory}
        placeholder="e.g. pizza"
      />

      {update.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t save your changes. Try again.
        </ThemedText>
      ) : null}

      {remove.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t delete that entry. Try again.
        </ThemedText>
      ) : null}

      <ThemedView type="transparent" style={styles.actions}>
        {/* `soft` + `strong` + ☑️ — the shape every commit action in the app
            now wears, from the headers' "Log a meal" to the add-meal popup's
            Estimate. */}
        <AppButton
          label="Save changes"
          icon="☑️"
          variant="soft"
          strong
          style={styles.primaryAction}
          onPress={save}
          disabled={!canSave}
          pending={update.isPending}
        />
        <AppButton
          label="Delete"
          variant="danger"
          onPress={destroy}
          disabled={anyPending}
          pending={remove.isPending}
        />
      </ThemedView>
    </Sheet>
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
    <ThemedView type="transparent" style={styles.field}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
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
  /** One of a row of peers — takes an equal share instead of the full width. */
  grouped = false,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (next: string) => void;
  grouped?: boolean;
}) {
  const theme = useTheme();

  return (
    <ThemedView type="transparent" style={[styles.field, grouped && styles.grouped]}>
      <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
        {label} ({unit})
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft }]}
        value={value}
        onChangeText={(next) => onChangeText(onlyDecimal(next))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="—"
        placeholderTextColor={theme.textMuted}
      />
    </ThemedView>
  );
}

/** Seed a field from a saved value. Null becomes empty, never a fabricated `0`. */
function seedField(value: number | null): string {
  return value === null ? '' : String(value);
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  macros: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grouped: {
    flex: 1,
  },
  input: {
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 46,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  primaryAction: {
    // Takes the row; Delete hugs its own label beside it.
    flex: 1,
  },
});
