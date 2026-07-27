// Native label capture (S-03): offers camera or gallery, downscales the
// result, and hands back base64 JPEG bytes ready for `estimateMeal({ kind:
// 'image', imageKind: 'label', … })`. `null` means the owner canceled at any
// step — the composer must leave its state untouched in that case.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { downscaleLabel, type CapturedLabel } from '@/lib/downscale-label';

export type { CapturedLabel };

export async function captureLabel(): Promise<CapturedLabel | null> {
  const source = await promptSource();
  if (source === null) return null;

  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  return downscaleLabel(asset.uri);
}

/** A native action sheet is overkill for two choices — a plain Alert is enough. */
function promptSource(): Promise<'camera' | 'library' | null> {
  return new Promise((resolve) => {
    Alert.alert('Scan a label', 'Take a new photo or choose one from your library.', [
      { text: 'Take Photo', onPress: () => resolve('camera') },
      { text: 'Choose from Library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
