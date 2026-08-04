// The photo capture path, from "tap the camera" to "the review screen is open"
// — extracted from `MealComposer` because capture is now reachable from more
// than one place (the composer, the Today FAB, the web app bar's raised
// button), and three copies of this sequence would drift.
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
import { capturePhoto } from '@/lib/capture-photo';

export type CaptureKind = 'label' | 'plate';

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

  const isBusy = isCapturing || estimate.isPending;

  const capture = useCallback(
    /**
     * `section`, when given, travels through to the review screen so it
     * lands the entry in the meal the owner picked (the add-meal popup's
     * section selector) rather than the time-of-day guess. `onSuccess` fires
     * right after the push — the one hook into "capture actually completed"
     * a caller gets, since navigation happens inside this function rather
     * than being left to the caller.
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
      // it spinning at nothing.
      if (!captured) {
        setPendingKind(null);
        return;
      }

      estimate.mutate(
        { kind: 'image', imageKind: kind, mediaType: captured.mediaType, data: captured.data },
        {
          onSuccess: ({ runId }) => {
            queryClient.setQueryData(queryKeys.capturedPhoto(runId), captured);
            router.push({
              pathname: '/review',
              params: {
                runId,
                source: kind === 'label' ? 'label_scan' : 'plate_photo',
                ...(section ? { section } : null),
              },
            });
            onSuccess?.();
          },
          // Settled, not success: an estimate that errors has to release the
          // button too, or the failure message appears under a live spinner.
          onSettled: () => setPendingKind(null),
        }
      );
    },
    [estimate, isCapturing, queryClient, router]
  );

  const reset = useCallback(() => {
    setCaptureFailed(false);
    setPendingKind(null);
    estimate.reset();
  }, [estimate]);

  return {
    capture,
    isBusy,
    /** Which path is in flight, so only the tapped button shows a spinner. */
    pendingKind,
    /** The estimator rejected. `estimateErrorMessage(error)` words it. */
    error: estimate.isError && !estimate.isPending ? estimate.error : null,
    /** The picker or downscale failed — a different failure with its own copy. */
    captureFailed: captureFailed && !estimate.isPending,
    reset,
  };
}
