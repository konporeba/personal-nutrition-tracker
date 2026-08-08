// Profile — the owner's stats and goal, the four derived daily targets (each
// overridable), appearance, security, and the way into weight logging.
//
// Stats save as a batch; targets re-derive from the saved stats + latest weight
// via `useTargets`. Overrides are nullable columns edited here: an empty
// override field means "use derived", so the derived value is never stored and
// re-derivation can't clobber an override.
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Card } from '@/components/ui/card';
import { Field, seedField } from '@/components/ui/field';
import { toNumberOrNull } from '@/lib/decimal-input';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenScroll } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import type { ActivityLevel, BodyGoal, Profile, ProfilePatch, Sex } from '@/data/types';
import { useLatestBodyWeight } from '@/data/use-body-weights';
import { useProfile, useTargets, useUpsertProfile } from '@/data/use-profile';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import type { Targets } from '@/lib/derive-targets';
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

/** The four nullable override columns, keyed to the target each one replaces. */
type OverrideColumn =
  | 'calorie_target_override'
  | 'protein_target_override'
  | 'carb_target_override'
  | 'fat_target_override';

/** The override fields as the form holds them: text, where '' means "derived". */
type OverrideFields = Record<OverrideColumn, string>;

const TARGET_ROWS: { column: OverrideColumn; field: keyof Targets; label: string; unit: string }[] =
  [
    { column: 'calorie_target_override', field: 'calories', label: 'Calories', unit: 'kcal' },
    { column: 'protein_target_override', field: 'protein_g', label: 'Protein', unit: 'g' },
    { column: 'carb_target_override', field: 'carbs_g', label: 'Carbs', unit: 'g' },
    { column: 'fat_target_override', field: 'fat_g', label: 'Fat', unit: 'g' },
  ];

export default function ProfileScreen() {
  const { data: profile, isPending, isError } = useProfile();

  return (
    <ScreenScroll>
      <ThemedView type="transparent" style={styles.head}>
        <SectionHeader title="Profile" />
        <ThemedText type="small" themeColor="textMuted">
          Your stats set the budget. Everything else is optional.
        </ThemedText>
      </ThemedView>

      {isPending || isError ? (
        <Columns
          main={
            <>
              {isPending ? (
                <ActivityIndicator style={styles.loading} />
              ) : (
                <ThemedText themeColor="textMuted">Couldn&apos;t load your profile.</ThemedText>
              )}
              {/* Security doesn't depend on the profile row, so it stays usable
                  even when that fetch is still in flight or failed. */}
              <SecurityCard />
            </>
          }
        />
      ) : (
        // Keyed on the row's last-write so a successful save (or a
        // cross-client change) re-seeds the form from the persisted values.
        <ProfileForm
          key={profile?.updated_at ?? 'new'}
          profile={profile ?? null}
          security={<SecurityCard />}
        />
      )}
    </ScreenScroll>
  );
}

/**
 * The profile's two-column arrangement: the body — your stats, then your
 * weight — runs down the left, and the numbers that come *out* of it (the
 * derived daily targets) down the right, with the device's own settings
 * tucked under them. Security is the smallest card on the page and the one
 * that is read least, so it rides under the tall targets card rather than
 * taking a slot of its own beside them.
 *
 * Below the breakpoint the two columns stack into the single reading column,
 * left one first.
 */
function Columns({ main, side }: { main: ReactNode; side?: ReactNode }) {
  const { isWide } = useLayout();

  return (
    <ThemedView type="transparent" style={[styles.grid, isWide && styles.gridWide]}>
      <ThemedView type="transparent" style={[styles.column, isWide && styles.columnWide]}>
        {main}
      </ThemedView>
      {side ? (
        <ThemedView type="transparent" style={[styles.column, isWide && styles.columnWide]}>
          {side}
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

function ProfileForm({ profile, security }: { profile: Profile | null; security: ReactNode }) {
  const router = useRouter();
  const upsert = useUpsertProfile();
  const targetsView = useTargets();
  const { data: latestWeight } = useLatestBodyWeight();
  const { isWide } = useLayout();

  const [heightCm, setHeightCm] = useState(() => seedField(profile?.height_cm));
  const [age, setAge] = useState(() => seedField(profile?.age));
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity_level ?? 'sedentary');
  const [goal, setGoal] = useState<BodyGoal>(profile?.goal ?? 'maintain');

  // Overrides are their own columns; empty means "use derived" (null). Held as
  // one record rather than four states because each one is now saved by its own
  // control, and every one of those needs to send the other three untouched.
  const [overrides, setOverrides] = useState<OverrideFields>(() => ({
    calorie_target_override: seedField(profile?.calorie_target_override),
    protein_target_override: seedField(profile?.protein_target_override),
    carb_target_override: seedField(profile?.carb_target_override),
    fat_target_override: seedField(profile?.fat_target_override),
  }));
  // Which override control should show the spinner. The mutation itself is
  // shared, so without this every row would spin at once — and the action has
  // to be part of it, because a reset leaves the field looking unsaved too.
  const [pendingAction, setPendingAction] = useState<{
    column: OverrideColumn;
    action: 'save' | 'reset';
  } | null>(null);
  // The Weight-vs-Goal panel's reference line (S-11 FR-033) — same "empty means
  // unset" convention as the overrides above.
  const [targetWeightKg, setTargetWeightKg] = useState(() => seedField(profile?.target_weight_kg));

  const heightNum = toNumberOrNull(heightCm);
  const ageNum = toNumberOrNull(age);
  const canSave =
    heightNum !== null && heightNum > 0 && ageNum !== null && ageNum > 0 && !upsert.isPending;

  // Always built from the whole form, whichever control triggered it: the form
  // is keyed on the row's `updated_at`, so a successful save remounts it and
  // re-seeds every field from the server. A patch that carried only the field
  // that was pressed would take the rest of the form's unsaved edits down with
  // it on the way back.
  function buildPatch(overrideFields: OverrideFields): ProfilePatch {
    return {
      height_cm: heightNum!,
      age: Math.round(ageNum!),
      sex,
      activity_level: activity,
      goal,
      calorie_target_override: toNumberOrNull(overrideFields.calorie_target_override),
      protein_target_override: toNumberOrNull(overrideFields.protein_target_override),
      carb_target_override: toNumberOrNull(overrideFields.carb_target_override),
      fat_target_override: toNumberOrNull(overrideFields.fat_target_override),
      target_weight_kg: toNumberOrNull(targetWeightKg),
    };
  }

  function save() {
    if (!canSave) return;
    setPendingAction(null);
    upsert.mutate(buildPatch(overrides));
  }

  /** Persist one override exactly as typed. */
  function saveOverride(column: OverrideColumn) {
    if (!canSave) return;
    setPendingAction({ column, action: 'save' });
    upsert.mutate(buildPatch(overrides));
  }

  /**
   * Clear one override back to derived. The field empties either way; the write
   * only happens when there was a stored override to unset — clearing digits
   * that were typed but never saved is a local edit and shouldn't cost a round
   * trip.
   */
  function resetOverride(column: OverrideColumn) {
    const next: OverrideFields = { ...overrides, [column]: '' };
    setOverrides(next);
    if (profile?.[column] == null || !canSave) return;
    setPendingAction({ column, action: 'reset' });
    upsert.mutate(buildPatch(next));
  }

  const youCard = (
    <Card style={styles.card}>
      <ThemedText type="smallBold">You</ThemedText>
      <ThemedView type="transparent" style={styles.pairRow}>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Height" unit="cm" numeric value={heightCm} onChangeText={setHeightCm} />
        </ThemedView>
        <ThemedView type="transparent" style={styles.pairItem}>
          <Field label="Age" unit="years" numeric value={age} onChangeText={setAge} />
        </ThemedView>
      </ThemedView>
      {/* All three pickers span the card rather than hugging their labels. Left
          to hug, they sized themselves to their longest word and then wrapped
          raggedly on a phone — three tracks of three different widths, none of
          them lining up with the fields above or the button below. */}
      <Labeled label="Sex">
        <Segmented options={SEX_OPTIONS} value={sex} onSelect={setSex} full />
      </Labeled>
      <Labeled
        label="Activity level"
        hint="Kept at sedentary by default — every logged session adds its own burn, so a multiplier here would count it twice.">
        {/* Tiled, not `full`: five labels this long squeezed into one row would
            each get about 50pt on a phone and ellipsize to a syllable. At a
            96pt floor they come out three across on a phone and all five on a
            dashboard card, reading in full either way. */}
        <Segmented
          options={ACTIVITY_OPTIONS}
          value={activity}
          onSelect={setActivity}
          minOptionWidth={96}
        />
      </Labeled>
      <Labeled label="Goal">
        <Segmented options={GOAL_OPTIONS} value={goal} onSelect={setGoal} full />
      </Labeled>

      {upsert.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t save your profile. Try again.
        </ThemedText>
      ) : null}

      <AppButton
        label="Save profile"
        icon="☑️"
        variant="soft"
        strong
        onPress={save}
        disabled={!canSave}
        pending={upsert.isPending}
      />
    </Card>
  );

  // Last in the left column, under the stats it belongs with. Like the last
  // card in the other column it absorbs that column's leftover height, so
  // whichever side is shorter closes the gap and the two end on the same line.
  const weightCard = (
    <Card style={[styles.card, isWide && styles.cardFill]}>
      <ThemedText type="smallBold">Weight</ThemedText>
      <ThemedView type="transparent" style={styles.weightRow}>
        <ThemedView type="transparent" style={styles.weightReading}>
          <ThemedText type="micro" themeColor="textMuted">
            Current
          </ThemedText>
          <ThemedText type="title">{latestWeight ? `${latestWeight.weight_kg} kg` : '—'}</ThemedText>
        </ThemedView>
        {/* ⚖️, not the ☑️ every commit action wears: this one doesn't commit
            anything, it opens the weight log. The icon names the subject. */}
        <AppButton
          label="Log weight"
          icon="⚖️"
          variant="soft"
          strong
          onPress={() => router.push('/profile/weight')}
        />
      </ThemedView>
      <Field
        label="Weight goal"
        unit="kg"
        numeric
        value={targetWeightKg}
        onChangeText={setTargetWeightKg}
        hint="Sets the reference line on Analytics' Weight-vs-Goal panel. Leave empty for none."
      />
      {/* Its own save. The goal used to rely on "Save profile" in the You
          card — which on the dashboard sits in a *different card beside this
          one*, so the field looked like it had no way to be applied. Same
          mutation and same full patch; only the button is new. */}
      <AppButton
        label="Save goal"
        icon="☑️"
        variant="soft"
        strong
        onPress={save}
        disabled={!canSave}
        pending={upsert.isPending}
      />
    </Card>
  );

  const targets = targetsView.targets;
  const targetsCard = (
    <Card style={styles.card}>
      <ThemedText type="smallBold">Daily targets</ThemedText>
      {targetsView.needsProfile ? (
        <ThemedText type="small" themeColor="textMuted">
          Enter your stats and save to see your derived targets.
        </ThemedText>
      ) : targetsView.needsWeight ? (
        <ThemedText type="small" themeColor="textMuted">
          Log your weight to see your derived targets.
        </ThemedText>
      ) : targets ? (
        <>
          {/* One row per target, each with its own controls. This used to be a
              two-up grid of tiles, to keep the card — the one you only read —
              from being the tallest on the page. It stays about that height:
              the value moved onto the row's heading line, next to the name,
              instead of sitting on a line of its own. */}
          <ThemedView type="transparent" style={styles.targetList}>
            {TARGET_ROWS.map((row, index) => {
              const stored = profile?.[row.column] ?? null;
              const typed = overrides[row.column];
              return (
                <TargetRow
                  key={row.column}
                  label={row.label}
                  unit={row.unit}
                  effective={targets[row.field]}
                  overridden={targetsView.overridden.has(row.field)}
                  value={typed}
                  onChangeValue={(next) =>
                    setOverrides((current) => ({ ...current, [row.column]: next }))
                  }
                  onSave={() => saveOverride(row.column)}
                  onReset={() => resetOverride(row.column)}
                  // Nothing to save when the box already says what's stored.
                  dirty={toNumberOrNull(typed) !== stored}
                  hasStoredOverride={stored !== null}
                  formValid={canSave}
                  busy={upsert.isPending}
                  savePending={
                    upsert.isPending &&
                    pendingAction?.column === row.column &&
                    pendingAction.action === 'save'
                  }
                  resetPending={
                    upsert.isPending &&
                    pendingAction?.column === row.column &&
                    pendingAction.action === 'reset'
                  }
                  divided={index > 0}
                />
              );
            })}
          </ThemedView>
          {upsert.isError ? (
            <ThemedText type="small" themeColor="danger">
              Couldn&apos;t save that target. Try again.
            </ThemedText>
          ) : null}
          <ThemedText type="micro" themeColor="textMuted">
            Each target saves on its own — the tick applies the number you typed, the cross clears
            it and hands the target back to the derived value.
          </ThemedText>
        </>
      ) : null}
    </Card>
  );

  return (
    <Columns
      main={
        <>
          {youCard}
          {weightCard}
        </>
      }
      side={
        <>
          {targetsCard}
          {security}
        </>
      }
    />
  );
}

/** Change the device PIN or lock it immediately. */
function SecurityCard() {
  const router = useRouter();
  const { lock } = usePinGate();
  const { isWide } = useLayout();
  const [error, setError] = useState<string | null>(null);

  async function onLockNow() {
    setError(null);
    try {
      await lock();
    } catch {
      setError("Couldn't lock. Try again.");
    }
  }

  return (
    // Last in the right column, below the targets — see `weightCard` for why
    // it grows. It is the smallest card on the page, which is the point of it
    // being here: it sits under the tall targets card rather than taking a
    // full-width slot of its own beside them.
    <Card style={[styles.card, isWide && styles.cardFill]}>
      <ThemedText type="smallBold">Security</ThemedText>
      {/* Side by side on the dashboard, stacked full-width on a phone. Two
          buttons never did fit one phone-width row: at the medium size they
          wrapped their labels, and shrinking them to `small` only traded that
          for a truncated "Change PIN…". A phone has one axis to spare, so the
          buttons take the width they need and the card takes the height. */}
      <ThemedView type="transparent" style={isWide ? styles.buttonRow : styles.buttonColumn}>
        <AppButton
          label="Change PIN"
          icon="☑️"
          variant="soft"
          strong
          full={!isWide}
          style={isWide ? styles.rowButton : undefined}
          onPress={() => router.push('/profile/pin-security')}
        />
        <AppButton
          label="Lock now"
          icon="🔒"
          variant="ghost"
          full={!isWide}
          style={isWide ? styles.rowButton : undefined}
          onPress={onLockNow}
        />
      </ThemedView>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </Card>
  );
}

/**
 * One target: the effective value and an "overridden" marker on the heading
 * line, then the override input with its own save and reset beside it.
 *
 * Both buttons are always mounted, disabled rather than hidden when they have
 * nothing to do. That is the point of them: the reset they replace appeared
 * only once the field had something in it, so the act of typing a target grew
 * the card and pushed everything under it down the page.
 */
function TargetRow({
  label,
  unit,
  effective,
  overridden,
  value,
  onChangeValue,
  onSave,
  onReset,
  dirty,
  hasStoredOverride,
  formValid,
  busy,
  savePending,
  resetPending,
  divided,
}: {
  label: string;
  unit: string;
  effective: number;
  overridden: boolean;
  value: string;
  onChangeValue: (next: string) => void;
  onSave: () => void;
  onReset: () => void;
  dirty: boolean;
  hasStoredOverride: boolean;
  formValid: boolean;
  busy: boolean;
  savePending: boolean;
  resetPending: boolean;
  divided: boolean;
}) {
  const theme = useTheme();

  // Clearing digits that were never saved is local, so it doesn't need the
  // stats to be valid the way a write does.
  const canReset = (hasStoredOverride ? formValid : value.length > 0) && !busy;

  return (
    <ThemedView
      type="transparent"
      style={[
        styles.targetRow,
        divided && styles.targetRowDivided,
        divided && { borderTopColor: theme.border },
      ]}>
      <ThemedView type="transparent" style={styles.targetHeader}>
        <ThemedView type="transparent" style={styles.targetName}>
          <ThemedText type="smallBold">{label}</ThemedText>
          {overridden ? (
            <ThemedText type="micro" themeColor="accentText">
              overridden
            </ThemedText>
          ) : null}
        </ThemedView>
        <ThemedView type="transparent" style={styles.targetValue}>
          <ThemedText type="subtitle">{effective.toLocaleString()}</ThemedText>
          <ThemedText type="micro" themeColor="textMuted">
            {unit}
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <Field
        label={`${label} override`}
        hideLabel
        numeric
        value={value}
        onChangeText={onChangeValue}
        placeholder="derived"
        editable={!busy}
        trailing={
          <>
            <IconButton
              glyph="check"
              tone="accent"
              accessibilityLabel={`Save ${label.toLowerCase()} override`}
              onPress={onSave}
              disabled={!dirty || !formValid || busy}
              pending={savePending}
            />
            <IconButton
              glyph="cross"
              accessibilityLabel={`Reset ${label.toLowerCase()} to derived`}
              onPress={onReset}
              disabled={!canReset}
              pending={resetPending}
            />
          </>
        }
      />
    </ThemedView>
  );
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <ThemedView type="transparent" style={styles.labeled}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText type="micro" themeColor="textMuted">
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  head: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
  },
  loading: {
    paddingVertical: Spacing.six,
  },
  grid: {
    gap: Spacing.four,
  },
  gridWide: {
    flexDirection: 'row',
    // Not `flex-start`: the default stretch is what makes both columns as tall
    // as the taller one, which the last card in each then fills.
    alignItems: 'stretch',
  },
  column: {
    gap: Spacing.four,
  },
  columnWide: {
    // Only ever applied inside the row-direction grid — stacked, `flex` would
    // divide the column's *height* between the two.
    flex: 1,
    minWidth: 320,
  },
  card: {
    gap: Spacing.three,
  },
  cardFill: {
    // Absorbs the column's leftover height. Only the last card in a column
    // takes this — anywhere else it would eat the space above its neighbours.
    flexGrow: 1,
  },
  pairRow: {
    flexDirection: 'row',
    // Same self-adjusting rule the review form uses: Height and Age stay side
    // by side while each can hold its label and its box, and stack rather than
    // squeeze once they can't.
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  pairItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 130,
    minWidth: 0,
  },
  labeled: {
    gap: Spacing.one + 2,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Neither the reading nor the button could shrink or wrap, so a three-digit
    // weight pushed the button off the card's edge. Now the pair drops onto two
    // lines before that happens.
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  weightReading: {
    flexShrink: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  buttonColumn: {
    gap: Spacing.two,
  },
  rowButton: {
    // Dashboard only. Share the row rather than each hugging its own label and
    // leaving a ragged tail of empty card beside them.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 132,
  },
  targetList: {
    gap: Spacing.three,
  },
  targetRow: {
    gap: Spacing.two,
  },
  targetRowDivided: {
    // A hairline between targets instead of four nested cards — the rows carry
    // controls now, and boxing each one turns the card into a stack of forms.
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  targetName: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  targetValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
});
