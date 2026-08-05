// The add-meal popup — the app's one entry point for logging, opened by the ＋
// in mobile web's bottom bar, by native's FAB, by Today's header button on the
// dashboard, and by each empty section's own add tile.
//
// Two steps, deliberately. Step one asks the two questions every path shares:
// *which meal* (the section picker) and *how* — describe it, photograph a
// plate, scan a label, or take one from the library. Step two is only the
// describe path's text field; photo and label go straight to the picker, and
// saved meals go to the library. It used to be one screenful with the text
// field always open and three buttons under it, which made typing look like the
// only real option and left the popup taller than a phone viewport.
//
// The picker is what fixes "I tapped ＋ under Breakfast and it landed in
// Supper": every path out of here carries the chosen section — through the
// route params for the text and capture paths (`review.tsx` reads it), and
// through the library route for saved meals. Nothing falls back to the
// time-of-day guess unless the owner never touched the picker.
//
// Not extracted into a shared hook with the review screen: two call sites with
// different wrapping, an extra picker, and different post-success side effects
// made the duplication clearer than a forced abstraction.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { IconChip } from '@/components/icon-chip';
import { SECTION_LABELS, SECTION_SHORT_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Radius, Spacing } from '@/constants/theme';
import type { Section } from '@/data/types';
import { estimateErrorMessage, isSessionExpired, useEstimateMeal } from '@/data/use-estimate';
import { useCaptureFlow } from '@/hooks/use-capture-flow';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { SECTION_ORDER } from '@/lib/group-by-section';
import { usePinGate } from '@/lib/pin-gate';
import { sectionForTime } from '@/lib/section-for-time';

const SECTION_OPTIONS = SECTION_ORDER.map((section) => ({
  value: section,
  label: SECTION_LABELS[section],
}));

const SHORT_SECTION_OPTIONS = SECTION_ORDER.map((section) => ({
  value: section,
  label: SECTION_SHORT_LABELS[section],
}));

/**
 * Viewport width below which the picker switches to short labels and compact
 * segments. Five options at full size need ~500pt of track; the dialog gives up
 * roughly `width − 100` to it, so this is where "Breakfast" stops fitting. Not
 * a `Breakpoints` entry: it is a fact about this one five-across row, not about
 * the app's layout, and putting it there would invite reuse it can't support.
 */
const SHORT_LABEL_WIDTH = 600;

export function AddMealSheet({
  visible,
  onRequestClose,
  /**
   * Which section the picker opens on. Defaults to whatever the clock implies;
   * the per-section add tiles (`section-add-tile.tsx`) pass their own section
   * so tapping the slot under "Supper" composes into supper. Still overridable
   * in the picker either way — the tile sets the default, it doesn't lock it.
   */
  initialSection,
}: {
  visible: boolean;
  onRequestClose: () => void;
  initialSection?: Section;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useLayout();
  const short = width < SHORT_LABEL_WIDTH;
  const [text, setText] = useState('');
  const [section, setSection] = useState<Section>(
    () => initialSection ?? sectionForTime(new Date())
  );
  // `null` is the method chooser; 'text' is the describe-it form. The capture
  // and library methods never become a step — they leave this popup.
  const [method, setMethod] = useState<'text' | null>(null);
  const estimate = useEstimateMeal();
  // One shared instance for both photo paths below, same "two ways to spend
  // one AI call" posture the review screen already established.
  const capture = useCaptureFlow();

  // Locking is the repair for an expired session (see `errors` below), so the
  // popup needs the gate as well as the estimator.
  const { hasPinSet, lock } = usePinGate();

  const trimmed = text.trim();
  const busy = estimate.isPending || capture.isBusy;
  const canSubmit = trimmed.length > 0 && !busy;
  // Either path can raise it — the text estimate and the capture flow share one
  // session, so they fail this way together.
  const sessionExpired =
    (estimate.isError && !estimate.isPending && isSessionExpired(estimate.error)) ||
    isSessionExpired(capture.error);

  // The caller mounts this component fresh on every open (see
  // `add-meal-provider.tsx`), so there is no state to reset for next time —
  // closing is just closing.
  function close() {
    onRequestClose();
  }

  function submitText() {
    // Whitespace alone is not a meal — never spend an AI call on it.
    if (!canSubmit) return;
    estimate.mutate(
      { kind: 'text', text: trimmed },
      {
        onSuccess: ({ runId }) => {
          const loggedSection = section;
          close();
          router.push({
            pathname: '/review',
            params: { runId, text: trimmed, section: loggedSection },
          });
        },
      }
    );
  }

  function openLibrary() {
    const loggedSection = section;
    close();
    // The section rides along: a saved meal re-logged from here belongs to the
    // meal the owner picked, not to whatever the clock says when they tap it.
    router.push({ pathname: '/(today)/library', params: { section: loggedSection } });
  }

  const errors = (
    <>
      {estimate.isError && !estimate.isPending ? (
        <ThemedText type="small" themeColor="danger">
          {estimateErrorMessage(estimate.error)}
        </ThemedText>
      ) : null}

      {capture.error ? (
        <ThemedText type="small" themeColor="danger">
          {estimateErrorMessage(capture.error)}
        </ThemedText>
      ) : null}

      {/* The one failure with a way out instead of a Retry. Locking hands the
          app back to the PIN gate, which signs in again from the credentials
          sealed under the PIN — so six digits is the whole repair. Offered only
          when a PIN exists, since there is nothing to unlock otherwise. */}
      {sessionExpired && hasPinSet ? (
        <AppButton label="Unlock and sign back in" icon="🔓" variant="soft" full onPress={lock} />
      ) : null}

      {capture.captureFailed ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t read that photo. Try again.
        </ThemedText>
      ) : null}
    </>
  );

  return (
    <Sheet
      visible={visible}
      title="Log a meal"
      subtitle={`To ${SECTION_LABELS[section].toLowerCase()}, today`}
      // A centered dialog on every size, not a bottom sheet on the phone. This
      // popup carries a picker, a form and four choices; anchored to the bottom
      // edge it grew past the top of the viewport with its own header out of
      // reach. Centered and height-capped, it reads as the dialog it is.
      placement="center"
      onRequestClose={close}>
      {/* Above the fork, because it applies to whichever way in gets chosen.
          Always `full` — five meals are one set of equal choices, and a track
          that hugs its labels leaves a ragged gap at the end of the row on a
          wide dialog and wraps onto a second line on a phone. Both were wrong
          for the same reason: the row's width is the dialog's, not the words'.
          Below `SHORT_LABEL_WIDTH` the labels shorten instead of the row
          breaking; the spoken label stays the full word either way. */}
      <Segmented
        options={short ? SHORT_SECTION_OPTIONS : SECTION_OPTIONS}
        value={section}
        onSelect={setSection}
        accessibilityLabelFor={(option) => SECTION_LABELS[option.value]}
        full
        compact={short}
      />

      {method === 'text' ? (
        <>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceSoft }]}
            placeholder="What did you eat?"
            placeholderTextColor={theme.textMuted}
            multiline
            autoFocus
            value={text}
            onChangeText={setText}
            editable={!busy}
            submitBehavior="submit"
            onSubmitEditing={submitText}
          />
          {/* `soft`, not `primary`: the same accent-washed, bold-labelled shape
              as the "Log a meal" / "Log training" buttons the headers carry, so
              the app's commit actions all look like one another. The ✨ stays —
              it is what marks this as the estimated path. */}
          <AppButton
            label={estimate.isError ? 'Retry' : 'Estimate'}
            icon="✨"
            variant="soft"
            strong
            full
            onPress={submitText}
            disabled={!canSubmit}
            pending={estimate.isPending}
          />
          <AppButton
            label="Another way"
            variant="ghost"
            full
            onPress={() => setMethod(null)}
            disabled={busy}
          />
          {errors}
        </>
      ) : (
        <>
          {/* Four rows, not a grid of buttons: they are alternatives to each
              other, and a list is what says "pick one of these". Description
              first — it is the fastest and the one that needs no permission
              prompt — then the two capture paths, then the library. */}
          <MethodRow
            icon="✍️"
            title="Describe it"
            detail="Type what you ate and let the estimate fill in the numbers"
            onPress={() => setMethod('text')}
          />
          <MethodRow
            icon="📱"
            title="Photograph a plate"
            detail="Take a photo of your meal to estimate the portion"
            // `pendingKind`, not `isBusy`: both capture rows share one flow, so
            // `isBusy` would spin whichever one the owner didn't tap too.
            pending={capture.pendingKind === 'plate'}
            disabled={busy && capture.pendingKind !== 'plate'}
            onPress={() => capture.capture('plate', section, close)}
          />
          <MethodRow
            icon="🏷️"
            title="Scan a label"
            detail="Read the nutrition panel off the packaging"
            pending={capture.pendingKind === 'label'}
            disabled={busy && capture.pendingKind !== 'label'}
            onPress={() => capture.capture('label', section, close)}
          />
          <MethodRow
            icon="🔖"
            title="From saved meals"
            detail="Re-log something from your library in one tap"
            disabled={busy}
            onPress={openLibrary}
          />
          {errors}
        </>
      )}
    </Sheet>
  );
}

/**
 * One way in. Shaped like the app's `ListRow` — icon chip, name, one line of
 * what it does — because these read as a list of things to choose between, not
 * as a toolbar. It isn't `ListRow` itself: only this list has rows that can be
 * mid-flight (a capture spends an AI call before the popup closes), and pushing
 * `pending`/`disabled` into the shared row for one caller would put dead state
 * on every meal and training row in the app.
 */
function MethodRow({
  icon,
  title,
  detail,
  onPress,
  pending = false,
  disabled = false,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const inert = pending || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: pending }}
      style={({ pressed }) => [inert && styles.rowInert, pressed && !inert && styles.rowPressed]}>
      <ThemedView type="surface" style={[styles.row, { borderColor: theme.border }]}>
        <IconChip icon={icon} />
        <ThemedView type="transparent" style={styles.rowText}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="micro" themeColor="textMuted">
            {detail}
          </ThemedText>
        </ThemedView>
        {/* Pinned to the row's far end rather than trailing the copy: `gap`
            alone parked it a few points off the last word, wherever that
            happened to fall, so it read as punctuation on the sentence instead
            of as the row's status. */}
        {pending ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.rowSpinner} />
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.card - 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    // Lets the detail line wrap inside the row instead of pushing the spinner
    // off its end.
    flexShrink: 1,
    gap: 1,
  },
  rowSpinner: {
    marginLeft: 'auto',
  },
  rowInert: {
    opacity: 0.5,
  },
  rowPressed: {
    opacity: 0.65,
  },
  input: {
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 96,
    // A multiline input is a `<textarea>` on web, which arrives wearing the
    // UA's default border. The matching *focus* ring can't be removed from
    // here — React Native has no `:focus` — and lives in `global.css`.
    borderWidth: 0,
  },
});
