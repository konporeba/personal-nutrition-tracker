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
//
// Design rule this screen enforces: nothing here may read as final. Every
// number is an editable field, every model-derived value carries an "Estimated"
// tag, and the confidence the model reported is stated rather than implied.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, seedField, toNumberOrNull } from '@/components/ui/field';
import { useTabBarClearance } from '@/components/ui/screen';
import { SECTION_LABELS } from '@/components/section-subtotal';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import type { Confidence, Estimate } from '@/data/estimation-types';
import { uploadMealPhoto } from '@/data/meal-photos.repo';
import { queryKeys } from '@/data/query-keys';
import type { Section } from '@/data/types';
import { useCreateMealEntry } from '@/data/use-meal-entries';
import { useTargets } from '@/data/use-profile';
import { useCreateSavedMeal } from '@/data/use-saved-meals';
import { useTheme } from '@/hooks/use-theme';
import type { CapturedPhoto } from '@/lib/capture-photo';
import { sectionForTime } from '@/lib/section-for-time';

/** `section` only ever arrives from our own add-meal popup (`add-meal-sheet.tsx`)
 *  or capture flow, but it comes in as an untyped route param — validate
 *  membership rather than trusting the cast. */
function parseSection(value: string | undefined): Section | undefined {
  return value !== undefined && value in SECTION_LABELS ? (value as Section) : undefined;
}

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: 'High confidence — still worth a glance.',
  medium: 'Medium confidence — check the portion.',
  low: 'Low confidence — these numbers are a rough guess.',
};

export default function ReviewScreen() {
  const { runId, text, source, section } = useLocalSearchParams<{
    runId?: string;
    text?: string;
    source?: string;
    section?: string;
  }>();
  const queryClient = useQueryClient();
  // "Log it" is the last thing on this page and the point of the whole screen —
  // it must not end up under the floating tab bar.
  const tabBarClearance = useTabBarClearance();

  const estimate = runId ? queryClient.getQueryData<Estimate>(queryKeys.estimate(runId)) : undefined;
  // Staged by the capture flow; undefined for the text path.
  const photo = runId
    ? queryClient.getQueryData<CapturedPhoto>(queryKeys.capturedPhoto(runId))
    : undefined;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Review' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        keyboardShouldPersistTaps="handled">
        <ThemedView type="transparent" style={styles.inner}>
          {estimate && runId ? (
            <ReviewForm
              estimate={estimate}
              runId={runId}
              typedText={text ?? ''}
              isLabelScan={source === 'label_scan'}
              isPlatePhoto={source === 'plate_photo'}
              photo={photo}
              section={parseSection(section)}
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
  isPlatePhoto,
  photo,
  section,
}: {
  estimate: Estimate;
  runId: string;
  typedText: string;
  isLabelScan: boolean;
  isPlatePhoto: boolean;
  photo: CapturedPhoto | undefined;
  /** Chosen up front in the add-meal popup; falls back to the time-of-day
   *  guess for every other capture path (native FAB, mobile composer, mobile
   *  web's quick-capture button), which never sets this. */
  section: Section | undefined;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useCreateMealEntry();
  const createSavedMeal = useCreateSavedMeal();
  const { targets } = useTargets();
  const recognized = estimate.recognized;
  // A label capture is only "per-serving" when it actually extracted a serving
  // size; an unrecognized label has none and falls through to the plain manual
  // form below, same as any other unrecognized input.
  const showServings = recognized && estimate.serving_size !== null;
  // Mirrors showServings: a plate photo only gets the weight-rescale field
  // when the model could confidently judge portion size.
  const showWeightRescale = recognized && isPlatePhoto && estimate.implied_weight_g !== null;

  // Seeded once. An unrecognized input contributes no numbers at all — the
  // owner's own text is the only thing worth carrying over.
  const [name, setName] = useState(() => (recognized ? estimate.name : typedText || estimate.name));
  const [calories, setCalories] = useState(() => seedField(estimate.calories));
  const [protein, setProtein] = useState(() => seedField(estimate.protein_g));
  const [carbs, setCarbs] = useState(() => seedField(estimate.carbs_g));
  const [fat, setFat] = useState(() => seedField(estimate.fat_g));
  const [servings, setServings] = useState('1');
  // Empty by default — there's no neutral non-empty value for a weight the
  // owner hasn't measured, unlike servings' default of '1'.
  const [weight, setWeight] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(false);

  // `isSuccess` matters as much as `isPending`: between onSuccess firing and the
  // navigation unmounting this screen there is a frame in which the button would
  // otherwise be live again, and a second tap would commit a duplicate entry.
  const canSave = name.trim().length > 0 && !create.isPending && !create.isSuccess;

  // 1× for every path with nothing to rescale against, so their totals are
  // unaffected.
  const multiplier = showServings
    ? parseServings(servings)
    : showWeightRescale
      ? parseWeightMultiplier(weight, estimate.implied_weight_g!)
      : 1;
  function total(perServing: string): number | null {
    const value = toNumberOrNull(perServing);
    return value === null ? null : value * multiplier;
  }

  function save() {
    if (!canSave) return;
    const loggedAt = new Date();

    create.mutate(
      {
        input: {
          logged_at: loggedAt.toISOString(),
          section: section ?? sectionForTime(loggedAt),
          // A photo capture that came back unrecognized is filled in by hand, same
          // as any other unrecognized input — the capture path alone doesn't make
          // it a label_scan/plate_photo entry (FR-006).
          source: recognized
            ? isLabelScan
              ? 'label_scan'
              : isPlatePhoto
                ? 'plate_photo'
                : 'free_text'
            : 'manual',
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
        targets,
      },
      {
        onSuccess: (entry) => {
          // Best-effort, after the entry already exists: the photo is evidence
          // only, so a failed upload must never block the log or surface to the
          // owner (FR-007's privacy model, extended by S-03/S-04).
          if ((isLabelScan || isPlatePhoto) && photo) {
            uploadMealPhoto(entry.id, photo.data).catch((err) => {
              console.error('[review] evidence photo upload failed:', err);
            });
          }
          // Best-effort too, same posture as the photo upload above: saving to
          // the library (S-08) is a convenience on top of an already-committed
          // entry, so a failure here must never undo or block the log.
          if (saveToLibrary) {
            createSavedMeal.mutate(
              {
                name: entry.name,
                calories: entry.calories,
                protein_g: entry.protein_g,
                carbs_g: entry.carbs_g,
                fat_g: entry.fat_g,
                food_category: entry.food_category,
              },
              {
                onError: (err) => {
                  console.error('[review] save-to-library failed:', err);
                },
              }
            );
          }
          // The staged estimate (and, for a photo capture, the captured photo
          // bytes) have served their purpose — drop them rather than letting
          // them sit in the persisted cache for up to the default gcTime.
          queryClient.removeQueries({ queryKey: queryKeys.estimate(runId) });
          queryClient.removeQueries({ queryKey: queryKeys.capturedPhoto(runId) });
          backToToday(router);
        },
      }
    );
  }

  return (
    <>
      {photo ? (
        <Image
          source={{ uri: `data:${photo.mediaType};base64,${photo.data}` }}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel="The photo you captured"
        />
      ) : null}

      {recognized ? (
        <Card style={styles.headCard}>
          <ThemedView type="transparent" style={styles.chipRow}>
            <Chip label="Estimated" tone="accent" />
            <Chip label={`${estimate.confidence} confidence`} />
            {showServings ? <Chip label={`Serving: ${estimate.serving_size}`} /> : null}
            {showWeightRescale ? <Chip label={`~${estimate.implied_weight_g} g`} /> : null}
          </ThemedView>
          <ThemedText type="small" themeColor="textMuted">
            {CONFIDENCE_COPY[estimate.confidence]} Every field below is yours to change before
            anything is logged.
          </ThemedText>
        </Card>
      ) : (
        <UnrecognizedNotice />
      )}

      <Card style={styles.card}>
        <Field label="Meal" value={name} onChangeText={setName} placeholder="What was it?" />
        <ThemedView type="transparent" style={styles.pairRow}>
          <ThemedView type="transparent" style={styles.pairItem}>
            <Field
              label="Calories"
              unit="kcal"
              numeric
              value={calories}
              onChangeText={setCalories}
              badge={recognized ? <AiBadge /> : undefined}
            />
          </ThemedView>
          <ThemedView type="transparent" style={styles.pairItem}>
            <Field
              label="Protein"
              unit="g"
              numeric
              value={protein}
              onChangeText={setProtein}
              badge={recognized ? <AiBadge /> : undefined}
            />
          </ThemedView>
        </ThemedView>
        <ThemedView type="transparent" style={styles.pairRow}>
          <ThemedView type="transparent" style={styles.pairItem}>
            <Field
              label="Carbs"
              unit="g"
              numeric
              value={carbs}
              onChangeText={setCarbs}
              badge={recognized ? <AiBadge /> : undefined}
            />
          </ThemedView>
          <ThemedView type="transparent" style={styles.pairItem}>
            <Field
              label="Fat"
              unit="g"
              numeric
              value={fat}
              onChangeText={setFat}
              badge={recognized ? <AiBadge /> : undefined}
            />
          </ThemedView>
        </ThemedView>

        {showServings ? (
          <Field
            label="Servings"
            unit="×"
            numeric
            value={servings}
            onChangeText={setServings}
            hint="Values above are per serving; totals are multiplied by this before saving."
          />
        ) : null}

        {showWeightRescale ? (
          <Field
            label="Actual weight"
            unit="g"
            numeric
            value={weight}
            onChangeText={setWeight}
            hint="Enter the plate's real weight to rescale the estimate proportionally, or leave blank to use it as-is."
          />
        ) : null}

        {!showServings && !showWeightRescale ? (
          <ThemedText type="micro" themeColor="textMuted">
            Leave a field empty to log it as unknown rather than zero.
          </ThemedText>
        ) : null}
      </Card>

      {estimate.assumptions.length > 0 ? (
        <Card tone="soft" elevated={false} style={styles.card}>
          <ThemedText type="smallBold">What the model assumed</ThemedText>
          {estimate.assumptions.map((assumption) => (
            <ThemedText key={assumption} type="small" themeColor="textMuted">
              • {assumption}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      <SaveToLibraryToggle checked={saveToLibrary} onToggle={() => setSaveToLibrary((p) => !p)} />

      {create.isError ? (
        <ThemedText type="small" themeColor="danger">
          Couldn&apos;t save that. Try again.
        </ThemedText>
      ) : null}

      {/* `soft` + `strong` + ☑️ — the same shape and mark every commit action
          in the app wears, from the headers' "Log a meal" to the popups' "Save
          changes". This is the one that finally writes the entry, so it keeps
          `large`. */}
      <AppButton
        label="Log it"
        icon="☑️"
        variant="soft"
        strong
        size="large"
        full
        onPress={save}
        disabled={!canSave}
        pending={create.isPending}
      />
    </>
  );
}

/** "Estimated", not the "AI est." this used to read. The abbreviation saved
 *  four characters and cost the meaning: it named the *machine* where what the
 *  owner needs to know is the *status of the number* — that it is a guess they
 *  are free to overwrite. One plain word says that. */
function AiBadge() {
  return (
    <ThemedText type="micro" themeColor="accentText">
      Estimated
    </ThemedText>
  );
}

/** The manual-entry fallback (FR-008). Framed as a normal path, not an error:
 *  the owner can still log the meal, they just supply the numbers. */
function UnrecognizedNotice() {
  const theme = useTheme();

  return (
    <Card style={[styles.headCard, { borderColor: theme.warning }]}>
      <ThemedText type="smallBold">Not recognized as a food</ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        Nothing has been filled in — we won&apos;t invent numbers. Type what you know below and log
        it by hand, or go back and describe it differently.
      </ThemedText>
    </Card>
  );
}

function SaveToLibraryToggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Card tone="soft" elevated={false} style={styles.toggleCard}>
      <ThemedView type="transparent" style={styles.toggleText}>
        <ThemedText type="smallBold">Save to library</ThemedText>
        <ThemedText type="micro" themeColor="textMuted">
          Re-log it later in one tap.
        </ThemedText>
      </ThemedView>
      {/* "Saved", not "Saving": nothing is in flight here. The toggle only
          records what will happen when "Log it" is pressed, and a progressive
          tense read as a spinner that never resolved.

          🔖 in both states, deliberately. The icon names the *subject* — the
          saved-meal library — which does not change when the toggle flips;
          swapping it for a ☑️ made the two states look like two different
          controls rather than one control that is on or off.

          `ghost` → `soft`, the design's own outlined pair, rather than
          `secondary` → `soft`: `secondary` fills with `surfaceSoft`, which is
          the exact color of the soft card this sits on, so the off state had no
          edge, no contrast and nothing that read as a button. (It carried a
          `borderColor` override, but `secondary` never sets a border width, so
          that line had never drawn anything.) With the icon now constant, this
          pairing is what carries the state: outlined off, filled and bold on. */}
      <AppButton
        label={checked ? 'Saved' : 'Save'}
        icon="🔖"
        variant={checked ? 'soft' : 'ghost'}
        strong={checked}
        size="small"
        onPress={onToggle}
        accessibilityLabel={checked ? 'Do not save to library' : 'Save to library'}
      />
    </Card>
  );
}

/**
 * Reached by a direct link or after the cache was cleared. There is nothing to
 * review, so offer the way back rather than rendering an empty form.
 */
function MissingEstimate() {
  const router = useRouter();

  return (
    <Card style={styles.card}>
      <ThemedText type="subtitle">Nothing to review</ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        This estimate is no longer available. Describe the meal again to get a new one.
      </ThemedText>
      <AppButton label="Back to today" variant="primary" onPress={() => backToToday(router)} />
    </Card>
  );
}

function backToToday(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** An invalid or non-positive servings count falls back to 1 (the seeded default). */
function parseServings(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * A ratio, not a raw count: the owner's entered weight divided by the
 * model's implied weight. An empty or invalid entry means "don't rescale"
 * (multiplier 1) — the same *meaning* as servings' empty-means-neutral
 * default, computed differently.
 */
function parseWeightMultiplier(value: string, impliedWeightG: number): number {
  const trimmed = value.trim();
  if (trimmed === '') return 1;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 && impliedWeightG > 0 ? parsed / impliedWeightG : 1;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    // `three`, not `four`: this screen is a form, and on a phone those 16pt of
    // gutter are worth more inside the fields than outside them.
    padding: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: Radius.card,
  },
  headCard: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pairRow: {
    flexDirection: 'row',
    // Wraps rather than squeezing. Two numeric fields side by side need ~200pt
    // each once the label row carries an "Estimated" badge beside "Calories
    // (kcal)"; below that the label and the badge collided and the whole form
    // overflowed the screen horizontally. This is a self-adjusting rule, not a
    // breakpoint: the pair stacks on a phone and stays two-up from about a
    // 460pt content width, wherever that happens to fall.
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  pairItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    minWidth: 0,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  toggleText: {
    flexShrink: 1,
    gap: 1,
  },
});
