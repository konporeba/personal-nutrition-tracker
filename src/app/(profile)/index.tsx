// Profile — the owner's stats and goal, the four derived daily targets (each
// overridable), and the way into weight logging. Stats save as a batch; targets
// re-derive from the saved stats + latest weight via `useTargets`. Overrides are
// nullable columns edited here: an empty override field means "use derived", so
// the derived value is never stored and re-derivation can't clobber an override.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { ActivityLevel, BodyGoal, Profile, ProfilePatch, Sex } from '@/data/types';
import { useProfile, useTargets, useUpsertProfile } from '@/data/use-profile';
import { useLatestBodyWeight } from '@/data/use-body-weights';
import { useTheme } from '@/hooks/use-theme';
import { usePinGate } from '@/lib/pin-gate';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];
const GOAL_OPTIONS: { value: BodyGoal; label: string }[] = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];
const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export default function ProfileScreen() {
  const { data: profile, isPending, isError } = useProfile();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={[styles.safeArea, surfacePlatformStyle]}
        edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, listPlatformStyle]}
          keyboardShouldPersistTaps="handled">
          {isPending ? (
            <ActivityIndicator style={styles.loading} />
          ) : isError ? (
            <ThemedText themeColor="textSecondary">Couldn&apos;t load your profile.</ThemedText>
          ) : (
            // Keyed on the row's last-write so a successful save (or a
            // cross-client change) re-seeds the form from the persisted values.
            <ProfileForm key={profile?.updated_at ?? 'new'} profile={profile ?? null} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const upsert = useUpsertProfile();
  const targetsView = useTargets();
  const { data: latestWeight } = useLatestBodyWeight();

  const [heightCm, setHeightCm] = useState(() => seed(profile?.height_cm));
  const [age, setAge] = useState(() => seed(profile?.age));
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity_level ?? 'sedentary');
  const [goal, setGoal] = useState<BodyGoal>(profile?.goal ?? 'maintain');

  // Overrides are their own columns; empty means "use derived" (null).
  const [calorieOverride, setCalorieOverride] = useState(() => seed(profile?.calorie_target_override));
  const [proteinOverride, setProteinOverride] = useState(() => seed(profile?.protein_target_override));
  const [carbOverride, setCarbOverride] = useState(() => seed(profile?.carb_target_override));
  const [fatOverride, setFatOverride] = useState(() => seed(profile?.fat_target_override));

  const heightNum = toNumberOrNull(heightCm);
  const ageNum = toNumberOrNull(age);
  const canSave = heightNum !== null && heightNum > 0 && ageNum !== null && ageNum > 0 && !upsert.isPending;

  function buildPatch(): ProfilePatch {
    return {
      height_cm: heightNum!,
      age: Math.round(ageNum!),
      sex,
      activity_level: activity,
      goal,
      calorie_target_override: toNumberOrNull(calorieOverride),
      protein_target_override: toNumberOrNull(proteinOverride),
      carb_target_override: toNumberOrNull(carbOverride),
      fat_target_override: toNumberOrNull(fatOverride),
    };
  }

  function save() {
    if (!canSave) return;
    upsert.mutate(buildPatch());
  }

  return (
    <>
      <ThemedText type="subtitle">Profile</ThemedText>

      <ThemedView style={styles.section}>
        <NumericField label="Height" unit="cm" value={heightCm} onChangeText={setHeightCm} />
        <NumericField label="Age" unit="years" value={age} onChangeText={setAge} />
        <SegmentedField label="Sex" options={SEX_OPTIONS} value={sex} onSelect={setSex} />
        <SegmentedField label="Activity level" options={ACTIVITY_OPTIONS} value={activity} onSelect={setActivity} />
        <SegmentedField label="Goal" options={GOAL_OPTIONS} value={goal} onSelect={setGoal} />
      </ThemedView>

      {upsert.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t save your profile. Try again.
        </ThemedText>
      ) : null}

      <SaveButton onPress={save} disabled={!canSave} pending={upsert.isPending} />

      <ThemedView style={styles.divider} />

      <ThemedView style={styles.weightRow}>
        <ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            Current weight
          </ThemedText>
          <ThemedText type="smallBold">
            {latestWeight ? `${latestWeight.weight_kg} kg` : 'Not logged yet'}
          </ThemedText>
        </ThemedView>
        <Pressable
          onPress={() => router.push('/(profile)/weight')}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundSelected" style={styles.smallButton}>
            <ThemedText type="smallBold">Log weight</ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.divider} />

      <SecuritySection />

      <ThemedView style={styles.divider} />

      <ThemedText type="subtitle">Daily targets</ThemedText>

      {targetsView.needsProfile ? (
        <ThemedText themeColor="textSecondary">
          Enter your stats above and save to see your derived targets.
        </ThemedText>
      ) : targetsView.needsWeight ? (
        <ThemedText themeColor="textSecondary">
          Log your weight to see your derived targets.
        </ThemedText>
      ) : targetsView.targets ? (
        <ThemedView style={styles.section}>
          <TargetRow
            label="Calories"
            unit="kcal"
            effective={targetsView.targets.calories}
            overridden={targetsView.overridden.has('calories')}
            overrideValue={calorieOverride}
            onChangeOverride={setCalorieOverride}
          />
          <TargetRow
            label="Protein"
            unit="g"
            effective={targetsView.targets.protein_g}
            overridden={targetsView.overridden.has('protein_g')}
            overrideValue={proteinOverride}
            onChangeOverride={setProteinOverride}
          />
          <TargetRow
            label="Carbs"
            unit="g"
            effective={targetsView.targets.carbs_g}
            overridden={targetsView.overridden.has('carbs_g')}
            overrideValue={carbOverride}
            onChangeOverride={setCarbOverride}
          />
          <TargetRow
            label="Fat"
            unit="g"
            effective={targetsView.targets.fat_g}
            overridden={targetsView.overridden.has('fat_g')}
            overrideValue={fatOverride}
            onChangeOverride={setFatOverride}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Leave an override empty to use the derived value. Save to apply changes.
          </ThemedText>
        </ThemedView>
      ) : null}
    </>
  );
}

/** Change the device PIN or lock it immediately, mirroring the weight row's layout. */
function SecuritySection() {
  const router = useRouter();
  const { lock } = usePinGate();

  return (
    <>
      <ThemedText type="subtitle">Security</ThemedText>
      <ThemedView style={styles.weightRow}>
        <Pressable
          onPress={() => router.push('/(profile)/pin-security')}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundSelected" style={styles.smallButton}>
            <ThemedText type="smallBold">Change PIN</ThemedText>
          </ThemedView>
        </Pressable>
        <Pressable onPress={() => lock()} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.smallButton}>
            <ThemedText type="smallBold">Lock now</ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>
    </>
  );
}

/**
 * One target row: the effective value, an "overridden" marker when it differs
 * from derived, an override input, and a reset that clears the override back to
 * derived (an empty field persists as null on the next save).
 */
function TargetRow({
  label,
  unit,
  effective,
  overridden,
  overrideValue,
  onChangeOverride,
}: {
  label: string;
  unit: string;
  effective: number;
  overridden: boolean;
  overrideValue: string;
  onChangeOverride: (next: string) => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.targetRow}>
      <ThemedView type="backgroundElement" style={styles.targetHeader}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedView type="backgroundElement" style={styles.targetValue}>
          <ThemedText type="smallBold">{effective}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
          {overridden ? (
            <ThemedText type="small" themeColor="textSecondary">
              · overridden
            </ThemedText>
          ) : null}
        </ThemedView>
      </ThemedView>
      <ThemedView type="backgroundElement" style={styles.overrideRow}>
        <TextInput
          style={[styles.overrideInput, { color: theme.text, backgroundColor: theme.background }]}
          value={overrideValue}
          onChangeText={(next) => onChangeOverride(onlyNumeric(next))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="override"
          placeholderTextColor={theme.textSecondary}
        />
        {overrideValue.length > 0 ? (
          <Pressable
            onPress={() => onChangeOverride('')}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.resetLink}>
              Reset to derived
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}

function SaveButton({
  onPress,
  disabled,
  pending,
}: {
  onPress: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  if (pending) return <ActivityIndicator style={styles.saving} />;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={disabled ? 'backgroundElement' : 'backgroundSelected'}
        style={styles.button}>
        <ThemedText type="smallBold" themeColor={disabled ? 'textSecondary' : 'text'}>
          Save profile
        </ThemedText>
      </ThemedView>
    </Pressable>
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
        onChangeText={(next) => onChangeText(onlyNumeric(next))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="—"
        placeholderTextColor={theme.textSecondary}
      />
    </ThemedView>
  );
}

/** A segmented picker over a string-literal union. */
function SegmentedField<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (next: T) => void;
}) {
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView style={styles.segments}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={selected ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.segment}>
                <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                  {option.label}
                </ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

/** Seed a form field from a stored value. Null/undefined becomes empty. */
function seed(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Keep digits and a single decimal point; drop everything else. */
function onlyNumeric(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

/** An empty field means "unset", which is `null` — never a fabricated `0`. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Match Today: the web tab bar floats over the top, the native one sits at the
// bottom; each platform pads away from its own.
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
  section: {
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
  segments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  segment: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  smallButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  saving: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  divider: {
    height: 1,
    backgroundColor: 'transparent',
    marginVertical: Spacing.one,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  targetRow: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  targetValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  overrideInput: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    fontSize: 16,
    minWidth: 120,
  },
  resetLink: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
