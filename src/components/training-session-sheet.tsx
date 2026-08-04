// Log or edit a training session (S-09), as a popup.
//
// This replaces the `training/session-composer` and `(training)/session-detail`
// routes, which pushed full screens over the tab and brought a stack header
// with them — a whole page of chrome for four fields. Same reasoning as the
// meal composer's move to `add-meal-sheet.tsx`, and the same shape: a centered
// dialog on the dashboard, a bottom sheet on a phone.
//
// One component covers both jobs because they are the same form. `session`
// absent is "log a new one"; present is "edit this one", which adds a delete
// and seeds every field from the row that was tapped — no re-read, since the
// list already has the record in hand.
//
// No AI estimate is ever made here (FR-070/071, OQ-9): the burn is owner-entered.
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { IconChip } from '@/components/icon-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Radius, Spacing } from '@/constants/theme';
import type { TrainingIntensity, TrainingSession } from '@/data/types';
import { useTargets } from '@/data/use-profile';
import {
  useCreateTrainingSession,
  useDeleteTrainingSession,
  useUpdateTrainingSession,
} from '@/data/use-training-sessions';
import { useTheme } from '@/hooks/use-theme';
import { emojiForTraining } from '@/lib/training-emoji';

const INTENSITY_OPTIONS: { value: TrainingIntensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

/**
 * The session types worth one tap. `session_type` is a free `text` column, so
 * this list is a UI convenience rather than a constraint — which is what makes
 * `Other` honest rather than a dead end: it reveals the old free-text field, so
 * anything not on the list is still loggable under its own name, and sessions
 * logged before this picker existed still open with their original type intact.
 */
const TYPE_PRESETS = ['Gym', 'Cycling', 'Running', 'Trekking', 'Swimming'] as const;
const OTHER = 'Other';

const TYPE_OPTIONS = [...TYPE_PRESETS, OTHER].map((value) => ({ value, label: value }));

/** Which segment a stored `session_type` selects — an exact preset, else `Other`. */
function presetFor(sessionType: string | undefined): string {
  if (!sessionType) return '';
  return TYPE_PRESETS.some((preset) => preset === sessionType) ? sessionType : OTHER;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function TrainingSessionSheet({
  visible,
  /** The session being edited, or `null` to log a new one. */
  session,
  onRequestClose,
}: {
  visible: boolean;
  session: TrainingSession | null;
  onRequestClose: () => void;
}) {
  const { targets } = useTargets();
  const create = useCreateTrainingSession();
  const update = useUpdateTrainingSession();
  const remove = useDeleteTrainingSession();

  // Every field below is seeded once per mount. The caller remounts on a
  // different session (see `training/index.tsx`), which is what makes tapping a
  // second row load that row's values rather than keeping the first one's.
  //
  // `typeChoice` is the picked segment and `customType` the free-text name that
  // only `Other` uses. Empty
  // `typeChoice` means nothing is selected yet — `Segmented` matches no option,
  // so a new session starts with no type chosen, exactly as the old blank text
  // field did. Nothing is defaulted to `Gym`: a preselected type is one you can
  // log by forgetting to look at it.
  const [typeChoice, setTypeChoice] = useState(() => presetFor(session?.session_type));
  const [customType, setCustomType] = useState(() =>
    presetFor(session?.session_type) === OTHER ? (session?.session_type ?? '') : ''
  );
  const [intensity, setIntensity] = useState<TrainingIntensity>(session?.intensity ?? 'moderate');
  const [duration, setDuration] = useState(
    session ? String(session.duration_minutes) : ''
  );
  const [burn, setBurn] = useState(session ? String(session.burn_kcal) : '');

  // Save, log and delete aren't mutually exclusive by construction — guard on
  // the combined state so a second action can't fire while another is in flight.
  const anyPending = create.isPending || update.isPending || remove.isPending;

  const durationMinutes = toIntOrNull(duration);
  const burnKcal = toNumberOrNull(burn);
  // `Other` is only a type once it has been named — the picker alone doesn't
  // make "Other" a meaningful thing to have logged.
  const resolvedType = typeChoice === OTHER ? customType.trim() : typeChoice;
  const canSubmit =
    resolvedType.length > 0 && durationMinutes !== null && burnKcal !== null && !anyPending;

  function submit() {
    if (!canSubmit || durationMinutes === null || burnKcal === null) return;

    const fields = {
      session_type: resolvedType,
      intensity,
      duration_minutes: durationMinutes,
      burn_kcal: burnKcal,
    };

    if (session) {
      update.mutate(
        { id: session.id, logged_at: session.logged_at, patch: fields },
        { onSuccess: onRequestClose }
      );
      return;
    }

    create.mutate(
      // `logged_at` is the submission instant, matching the rest of the app's
      // "log now" convention.
      { input: { logged_at: new Date().toISOString(), ...fields }, targets },
      { onSuccess: onRequestClose }
    );
  }

  // No confirmation step — tapping Delete IS the confirmation, matching
  // MealDetailScreen's/SavedMealActionsSheet's established convention.
  function destroy() {
    if (!session || anyPending) return;
    remove.mutate(
      { id: session.id, logged_at: session.logged_at },
      { onSuccess: onRequestClose }
    );
  }

  const failed = create.isError || update.isError;

  return (
    <Sheet
      visible={visible}
      title={session ? 'Edit training' : 'Log training'}
      subtitle={
        session ? dateFormat.format(new Date(session.logged_at)) : 'Add to today'
      }
      // Editing wears the row's own mark, matching the meal popup. Tracks the
      // picker live, so switching type changes the icon on the spot.
      leading={
        session ? <IconChip icon={emojiForTraining(resolvedType)} accent /> : undefined
      }
      // Centered on every size, matching the add-meal popup. This sheet is a
      // four-field form; anchored to the bottom edge on a phone it ran off the
      // top of the viewport with its own title out of reach.
      placement="center"
      onRequestClose={onRequestClose}>
      <ThemedView type="transparent" style={styles.field}>
        <ThemedText type="small" themeColor="textMuted">
          Type
        </ThemedText>
        <Segmented options={TYPE_OPTIONS} value={typeChoice} onSelect={setTypeChoice} />
      </ThemedView>

      {/* Only `Other` needs a name typed out; the five presets are their own. */}
      {typeChoice === OTHER ? (
        <Field
          label="What was it?"
          value={customType}
          onChangeText={setCustomType}
          placeholder="e.g. bouldering"
        />
      ) : null}

      <ThemedView type="transparent" style={styles.field}>
        <ThemedText type="small" themeColor="textMuted">
          Intensity
        </ThemedText>
        <Segmented options={INTENSITY_OPTIONS} value={intensity} onSelect={setIntensity} full />
      </ThemedView>

      {/* Side by side: two short numbers that are always entered together, and
          stacking them would push the actions off a phone's first screen. */}
      <ThemedView type="transparent" style={styles.pair}>
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
      </ThemedView>

      {failed ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t save that session. Try again.
        </ThemedText>
      ) : null}

      {remove.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t delete that session. Try again.
        </ThemedText>
      ) : null}

      <ThemedView type="transparent" style={styles.actions}>
        {/* `soft` + `strong`, the shape every commit action in the app wears.
            The icon is the one thing that forks: 💪🏻 while this is a *new*
            session, matching the Training tab it was opened from, and the ☑️
            every "save what I changed" button carries once there is an existing
            session under it. */}
        <AppButton
          label={session ? 'Save changes' : 'Log session'}
          icon={session ? '☑️' : '💪🏻'}
          variant="soft"
          strong
          style={styles.primaryAction}
          onPress={submit}
          disabled={!canSubmit}
          pending={create.isPending || update.isPending}
        />
        {session ? (
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
    <ThemedView type="transparent" style={[styles.field, styles.pairItem]}>
      <ThemedText type="small" themeColor="textMuted">
        {label} ({unit})
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="—"
        placeholderTextColor={theme.textMuted}
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
  field: {
    gap: Spacing.one,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pairItem: {
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
