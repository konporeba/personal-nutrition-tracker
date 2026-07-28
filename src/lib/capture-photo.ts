// Native photo capture — label scan (S-03) or plate photo (S-04): offers
// camera or gallery, downscales the result, and hands back base64 JPEG bytes
// ready for `estimateMeal({ kind: 'image', imageKind, … })`. `null` means the
// owner canceled at any step — the composer must leave its state untouched.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { downscalePhoto, type CapturedPhoto } from '@/lib/downscale-photo';

export type { CapturedPhoto };

const PROMPTS: Record<'label' | 'plate', { title: string; message: string }> = {
  label: { title: 'Scan a label', message: 'Take a new photo or choose one from your library.' },
  plate: {
    title: 'Photograph your plate',
    message: 'Take a new photo or choose one from your library.',
  },
};

export async function capturePhoto(kind: 'label' | 'plate'): Promise<CapturedPhoto | null> {
  const source = await promptSource(kind);
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

  return downscalePhoto(asset.uri);
}

/** A native action sheet is overkill for two choices — a plain Alert is enough. */
function promptSource(kind: 'label' | 'plate'): Promise<'camera' | 'library' | null> {
  const { title, message } = PROMPTS[kind];
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Take Photo', onPress: () => resolve('camera') },
      { text: 'Choose from Library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
