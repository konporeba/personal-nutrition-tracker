// The app's mark: the apple. Used by the web sidebar, the sign-in card and
// the PIN gate — the three places the product introduces itself rather than
// just doing its job.
//
// Drawn `contain` on a transparent ground rather than cropped into a disc: the
// artwork is a logo with its own silhouette (the leaf reaches into the top
// corner), so a circular mask would clip exactly the part that makes it read
// as an apple rather than as a red ball.
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <ThemedView type="transparent" style={{ width: size, height: size }}>
      <Image
        source={require('@/assets/images/brand-apple.png')}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
      />
    </ThemedView>
  );
}
