// Shared downscale step for a captured label photo (S-03). Both platform
// variants of `captureLabel` funnel their picked photo through this so the
// same bytes are sent to the vision estimate and later uploaded as evidence
// (Phase 3) — the stored photo always matches what the model saw.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_WIDTH = 1500;
const JPEG_COMPRESS = 0.7;

export type CapturedLabel = { data: string; mediaType: string };

export async function downscaleLabel(uri: string): Promise<CapturedLabel> {
  const context = ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_COMPRESS,
    base64: true,
  });

  if (!saved.base64) throw new Error('image manipulation did not return base64 data');
  return { data: saved.base64, mediaType: 'image/jpeg' };
}
