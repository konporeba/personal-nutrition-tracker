// Edit a saved meal's fields (S-08). A trimmed `review.tsx`-style form — no
// assumptions, no AI — since editing is a plain field update, not a review of
// an estimate. This screen only ever calls `updateSavedMeal`: it never
// touches `meal_entries`, which is exactly what makes copy-on-log hold —
// entries already logged from this saved meal are untouched by an edit here.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTabBarClearance } from '@/components/ui/screen';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import type { SavedMeal } from '@/data/types';
import { useSavedMeals, useUpdateSavedMeal } from '@/data/use-saved-meals';
import { useTheme } from '@/hooks/use-theme';
import { onlyDecimal, toNumberOrNull } from '@/lib/decimal-input';

export default function SavedMealEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data } = useSavedMeals();
  const savedMeal = data?.find((meal) => meal.id === id) ?? null;
  // Clears the floating tab bar, which this screen's Save button would
  // otherwise end up under.
  const tabBarClearance = useTabBarClearance();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Edit saved meal' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.inner}>
          {savedMeal ? <EditForm savedMeal={savedMeal} /> : <MissingSavedMeal />}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function EditForm({ savedMeal }: { savedMeal: SavedMeal }) {
  const router = useRouter();
  const update = useUpdateSavedMeal();

  const [name, setName] = useState(savedMeal.name);
  const [calories, setCalories] = useState(() => seedField(savedMeal.calories));
  const [protein, setProtein] = useState(() => seedField(savedMeal.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(savedMeal.carbs_g));
  const [fat, setFat] = useState(() => seedField(savedMeal.fat_g));
  const [foodCategory, setFoodCategory] = useState(savedMeal.food_category ?? '');

  const canSave = name.trim().length > 0 && !update.isPending && !update.isSuccess;

  function save() {
    if (!canSave) return;
    update.mutate(
      {
        id: savedMeal.id,
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
      }
    );
  }

  return (
    <>
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

      <ThemedText type="small" themeColor="textMuted">
        Changes here never affect meals already logged from this saved meal.
      </ThemedText>

      {update.isError ? (
        <ThemedText type="small" themeColor="danger">
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
            type={canSave ? 'accent' : 'surfaceSoft'}
            style={styles.button}>
            <ThemedText type="smallBold" themeColor={canSave ? 'onAccent' : 'textMuted'}>
              Save changes
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
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}
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
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (next: string) => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textMuted">
        {label} ({unit})
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}
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

/**
 * Reached with a stale/unknown id (e.g. deleted from another client). There is
 * nothing to edit, so offer the way back rather than rendering an empty form.
 */
function MissingSavedMeal() {
  const router = useRouter();

  return (
    <>
      <ThemedText type="subtitle">Not found</ThemedText>
      <ThemedText themeColor="textMuted">
        This saved meal is no longer available.
      </ThemedText>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="surfaceSoft" style={styles.button}>
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
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 46,
  },
  button: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
  },
  saving: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
