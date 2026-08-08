// Create, edit or delete a saved meal, as a popup.
//
// The saved-meals twin of `training-session-sheet.tsx`, and deliberately the
// same shape: one component covers both jobs because they are the same form —
// `savedMeal` absent is "add a new one", present is "edit this one", which adds
// a delete and seeds every field from the row that was tapped (no re-read; the
// list already has the record in hand).
//
// No AI estimate is ever made here. A saved meal's numbers are whatever was
// reviewed when it was first saved, or whatever the owner types now — the same
// reason the training sheet has no estimate step.
//
// Editing only ever calls `updateSavedMeal`, never `meal_entries`: copy-on-log
// means entries already logged from this saved meal are untouched by an edit.
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { IconChip } from '@/components/icon-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Field, seedField } from '@/components/ui/field';
import { toNumberOrNull } from '@/lib/decimal-input';
import { Sheet } from '@/components/ui/sheet';
import { Spacing } from '@/constants/theme';
import type { SavedMeal } from '@/data/types';
import {
  useCreateSavedMeal,
  useDeleteSavedMeal,
  useUpdateSavedMeal,
} from '@/data/use-saved-meals';
import { iconForEntry } from '@/lib/food-emoji';

export function SavedMealSheet({
  visible,
  /** The saved meal being edited, or `null` to add a new one. */
  savedMeal,
  onRequestClose,
}: {
  visible: boolean;
  savedMeal: SavedMeal | null;
  onRequestClose: () => void;
}) {
  const create = useCreateSavedMeal();
  const update = useUpdateSavedMeal();
  const remove = useDeleteSavedMeal();

  // Seeded once per mount. The caller remounts on a different meal (see
  // `saved/index.tsx`), which is what makes tapping a second row load that
  // row's values rather than keeping the first one's.
  const [name, setName] = useState(savedMeal?.name ?? '');
  const [calories, setCalories] = useState(() => seedField(savedMeal?.calories));
  const [protein, setProtein] = useState(() => seedField(savedMeal?.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(savedMeal?.carbs_g));
  const [fat, setFat] = useState(() => seedField(savedMeal?.fat_g));
  const [foodCategory, setFoodCategory] = useState(savedMeal?.food_category ?? '');

  // Save, add and delete aren't mutually exclusive by construction — guard on
  // the combined state so a second action can't fire while another is in flight.
  const anyPending = create.isPending || update.isPending || remove.isPending;
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !anyPending;

  function submit() {
    if (!canSubmit) return;

    // Every macro goes through `toNumberOrNull`: an emptied field means
    // "unknown" and must persist as null, never as a fabricated 0.
    const fields = {
      name: trimmedName,
      calories: toNumberOrNull(calories),
      protein_g: toNumberOrNull(protein),
      carbs_g: toNumberOrNull(carbs),
      fat_g: toNumberOrNull(fat),
      food_category: foodCategory.trim() || null,
    };

    if (savedMeal) {
      update.mutate({ id: savedMeal.id, patch: fields }, { onSuccess: onRequestClose });
      return;
    }

    create.mutate(fields, { onSuccess: onRequestClose });
  }

  // No confirmation step — tapping Delete IS the confirmation, matching the
  // training sheet's and the meal row's established convention.
  function destroy() {
    if (!savedMeal || anyPending) return;
    remove.mutate({ id: savedMeal.id }, { onSuccess: onRequestClose });
  }

  const failed = create.isError || update.isError;

  return (
    <Sheet
      visible={visible}
      title={savedMeal ? 'Edit saved meal' : 'New saved meal'}
      subtitle={
        savedMeal
          ? 'Meals already logged from this one stay as they were'
          : 'Add a meal you eat often, for one-tap logging'
      }
      // Editing wears the row's own mark, matching the training popup. Tracks
      // the fields live, so renaming or re-categorising changes it on the spot.
      leading={
        savedMeal ? (
          <IconChip
            icon={iconForEntry({ food_category: foodCategory.trim() || null, name: trimmedName })}
            accent
          />
        ) : undefined
      }
      // Centered on every size, matching the add-meal, meal and training
      // popups — this was the last form sheet still anchored to the bottom
      // edge, where on a phone it ran off the top of the viewport.
      placement="center"
      onRequestClose={onRequestClose}>
      <Field label="Meal" value={name} onChangeText={setName} placeholder="What is it?" />

      {/* Two-up: four short numbers that are always entered together, and
          stacking them would push the actions off a phone's first screen. */}
      <ThemedView type="transparent" style={styles.pair}>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Calories" unit="kcal" numeric value={calories} onChangeText={setCalories} />
        </ThemedView>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Protein" unit="g" numeric value={protein} onChangeText={setProtein} />
        </ThemedView>
      </ThemedView>
      <ThemedView type="transparent" style={styles.pair}>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Carbs" unit="g" numeric value={carbs} onChangeText={setCarbs} />
        </ThemedView>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Fat" unit="g" numeric value={fat} onChangeText={setFat} />
        </ThemedView>
      </ThemedView>

      <Field
        label="Category"
        value={foodCategory}
        onChangeText={setFoodCategory}
        placeholder="e.g. pizza"
        hint="Picks the icon this meal wears in the list."
      />

      {failed ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t save that meal. Try again.
        </ThemedText>
      ) : null}

      {remove.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t delete that meal. Try again.
        </ThemedText>
      ) : null}

      <ThemedView type="transparent" style={styles.actions}>
        {/* `soft` + `strong`, the shape every commit action in the app wears.
            As in the training popup, only the icon forks: 🔖 while this is a
            *new* library entry — the bookmark this app already uses to mean
            "saved meal", in the add-meal popup's own library row — and the ☑️
            every "save what I changed" button carries once there is an existing
            meal under it. Not the Saved tab's 🥗, which would read as one more
            food-category mark next to the rows' own icons. */}
        <AppButton
          label={savedMeal ? 'Save changes' : 'Save meal'}
          icon={savedMeal ? '☑️' : '🔖'}
          variant="soft"
          strong
          style={styles.primaryAction}
          onPress={submit}
          disabled={!canSubmit}
          pending={create.isPending || update.isPending}
        />
        {savedMeal ? (
          <AppButton
            label="Delete"
            variant="danger"
            onPress={destroy}
            disabled={anyPending}
            pending={remove.isPending}
          />
        ) : null}
      </ThemedView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pairItem: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  primaryAction: {
    // Takes the row; Delete hugs its own label beside it.
    flex: 1,
  },
});
