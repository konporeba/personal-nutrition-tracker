// Web label capture (S-03): gallery/file picker only — FR-040 frames the
// camera as a mobile capability, and `expo-image-picker`'s web implementation
// has no camera branch to offer. `null` means the owner canceled the picker.
import * as ImagePicker from 'expo-image-picker';

import { downscaleLabel, type CapturedLabel } from '@/lib/downscale-label';

export type { CapturedLabel };

export async function captureLabel(): Promise<CapturedLabel | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  return downscaleLabel(asset.uri);
}
