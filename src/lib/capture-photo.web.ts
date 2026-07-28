// Web photo capture — label scan (S-03) or plate photo (S-04): gallery/file
// picker only — FR-040 frames the camera as a mobile capability, and
// `expo-image-picker`'s web implementation has no camera branch to offer.
// `null` means the owner canceled the picker. `kind` is unused here (no
// source-choice prompt on web) but kept for signature parity with the native
// module.
import * as ImagePicker from 'expo-image-picker';

import { downscalePhoto, type CapturedPhoto } from '@/lib/downscale-photo';

export type { CapturedPhoto };

export async function capturePhoto(_kind: 'label' | 'plate'): Promise<CapturedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  return downscalePhoto(asset.uri);
}
