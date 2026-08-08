// The photo capture path, from "tap the camera" to "the review screen is open"
// — extracted from `MealComposer` because capture is now reachable from more
// than one place (the composer, the Today FAB, the web app bar's raised
// button), and three copies of this sequence would drift.
//
// **Two phases, not one.** The picker returning no longer spends the AI call:
// it *stages* the photo and stops, and `confirm` is what estimates. The gap
// between them is where the owner sees the shot they actually took and can add
// a note to it — a picture is worst at portion size, quantity and what is
// actually in the dish, which are the things that move the number most.
// Everything the note earns is optional: `confirm()` with no note is the same
// one-tap capture as before (FR-003), and the staging step pays for itself even
// unused, because a bad shot can now be spotted and retaken *before* an AI call
// rather than after one.
//
// The invariants it carries over unchanged from the composer:
// - A canceled picker is a no-op. No AI call is spent and nothing is shown.
// - A picker/downscale failure surfaces, never fails silently (FR: the owner
//   always learns why nothing happened).
// - The photo bytes are staged in the query cache under the run id, not passed
//   through the URL, so the review screen can upload them as evidence later.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { queryKeys } from '@/data/query-keys';
import type { Section } from '@/data/types';
import { useEstimateMeal } from '@/data/use-estimate';
import { capturePhoto, type CapturedPhoto } from '@/lib/capture-photo';

export type CaptureKind = 'label' | 'plate';

/**
 * A photo taken and waiting on the owner: what it is, the bytes, and the two
 * things the estimate leg needs to finish the job it was started with. The
 * section and the completion callback are captured *here* rather than passed to
 * `confirm`, so the caller can't accidentally finish a capture into a different
 * meal than the one it began in.
 */
export type StagedCapture = {
  kind: CaptureKind;
  photo: CapturedPhoto;
  section?: Section;
  onSuccess?: () => void;
};

export function useCaptureFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const estimate = useEstimateMeal();
  // Covers the picker + downscale window, before `estimate.isPending` engages.
  // Without it, a tap during that window fires a second AI call on the same
  // mutation.
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  // *Which* path is in flight. One flow instance serves both the plate and the
  // label button (they spend the same AI call, so only one may run), and with
  // `isBusy` alone both buttons spun on either tap — the owner could not tell
  // which one they had actually pressed.
  const [pendingKind, setPendingKind] = useState<CaptureKind | null>(null);
  // The photo waiting on the owner. Non-null is the staging step: the picker
  // has returned, no AI call has been spent yet, and `confirm` is what spends
  // one.
  const [staged, setStaged] = useState<StagedCapture | null>(null);

  const isBusy = isCapturing || estimate.isPending;

  const capture = useCallback(
    /**
     * Take (or pick) a photo and stage it. `section`, when given, travels
     * through to the review screen so it lands the entry in the meal the owner
     * picked (the add-meal popup's section selector) rather than the
     * time-of-day guess. `onSuccess` fires right after the push — the one hook
     * into "capture actually completed" a caller gets, since navigation happens
     * inside `confirm` rather than being left to the caller. Both are held on
     * the staged capture until then.
     */
    async (kind: CaptureKind, section?: Section, onSuccess?: () => void) => {
      if (isCapturing || estimate.isPending) return;
      setCaptureFailed(false);
      setPendingKind(kind);
      setIsCapturing(true);

      let captured;
      try {
        captured = await capturePhoto(kind);
      } catch (err) {
        console.error(`[capture-flow] ${kind} capture failed:`, err);
        setCaptureFailed(true);
        setIsCapturing(false);
        setPendingKind(null);
        return;
      }
      setIsCapturing(false);
      // A canceled picker is a no-op — release the button rather than leaving
      // it spinning at nothing. On a retake this deliberately leaves the
      // previously staged photo in place: backing out of "take another one"
      // means keeping the one you had, not losing it.
      if (!captured) {
        setPendingKind(null);
        return;
      }

      // Staged, not estimated. `pendingKind` stays set — this path is still in
      // flight, it is just waiting on the owner rather than on the network.
      setStaged({ kind, photo: captured, section, onSuccess });
    },
    [estimate, isCapturing]
  );

  const confirm = useCallback(
    /**
     * Spend the AI call on the staged photo, with the owner's note when they
     * wrote one. Blank notes are dropped rather than sent as `''` — the wire
     * field is optional and the function treats absent and empty alike, so
     * there is no reason for the two to reach it as different requests.
     */
    (note?: string) => {
      if (!staged || estimate.isPending) return;
      const { kind, photo, section, onSuccess } = staged;
      const trimmed = note?.trim();

      estimate.mutate(
        {
          kind: 'image',
          imageKind: kind,
          mediaType: photo.mediaType,
          data: photo.data,
          ...(trimmed ? { note: trimmed } : null),
        },
        {
          onSuccess: ({ runId }) => {
            queryClient.setQueryData(queryKeys.capturedPhoto(runId), photo);
            router.push({
              pathname: '/review',
              params: {
                runId,
                source: kind === 'label' ? 'label_scan' : 'plate_photo',
                ...(section ? { section } : null),
              },
            });
            // Cleared on success only. A failed estimate keeps the photo and
            // the note staged so Retry costs one tap instead of another trip
            // through the camera.
            setStaged(null);
            onSuccess?.();
          },
          // Settled, not success: an estimate that errors has to release the
          // button too, or the failure message appears under a live spinner.
          onSettled: () => setPendingKind(null),
        }
      );
    },
    [estimate, queryClient, router, staged]
  );

  /**
   * Shoot the staged capture again, keeping the meal it was started for. Goes
   * back through `capture`, so canceling the picker leaves the current photo
   * staged rather than emptying the step.
   */
  const retake = useCallback(() => {
    if (!staged) return;
    void capture(staged.kind, staged.section, staged.onSuccess);
  }, [capture, staged]);

  /** Throw the staged photo away and go back to a clean slate. */
  const discard = useCallback(() => {
    setStaged(null);
    setCaptureFailed(false);
    setPendingKind(null);
    estimate.reset();
  }, [estimate]);

  return {
    capture,
    /** Estimate the staged photo. No-op when nothing is staged. */
    confirm,
    retake,
    discard,
    /** The photo waiting on the owner, or `null` outside the staging step. */
    staged,
    isBusy,
    /**
     * The estimate leg alone. Distinct from `isBusy`, which also covers the
     * picker: during a retake the staging step is busy but nothing is being
     * estimated, and a spinner on the Estimate button would be a lie.
     */
    isEstimating: estimate.isPending,
    /** Which path is in flight, so only the tapped button shows a spinner. */
    pendingKind,
    /** The estimator rejected. `estimateErrorMessage(error)` words it. */
    error: estimate.isError && !estimate.isPending ? estimate.error : null,
    /** The picker or downscale failed — a different failure with its own copy. */
    captureFailed: captureFailed && !estimate.isPending,
  };
}
