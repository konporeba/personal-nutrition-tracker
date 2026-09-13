// Small glyphs standing in for a macro's identity color: an egg for protein, a
// wheat stalk for carbs, a raindrop cluster for fat — the vocabulary most
// nutrition apps already use. Replaces a plain color dot (see `chip.tsx`)
// because a solid circle carries no meaning beyond hue; someone with a
// color-vision deficiency (or just a quick glance) gets a shape too.
//
// The artwork lives in `assets/images/macros` pre-colored to the exact
// `theme.protein` / `theme.carbs` / `theme.fat` hue, so it's drawn as-is
// rather than tinted at runtime — if a macro's identity color in
// `constants/theme.ts` ever changes, the matching PNG has to be re-exported
// to match, there's no shared source of truth between the two.
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

export type Macro = 'protein' | 'carbs' | 'fat';

const DEFAULT_SIZE = 12;

const MACRO_IMAGES = {
  protein: require('@/assets/images/macros/protein.png'),
  carbs: require('@/assets/images/macros/carbs.png'),
  fat: require('@/assets/images/macros/fat.png'),
} as const;

export function MacroIcon({ macro, size = DEFAULT_SIZE }: { macro: Macro; size?: number }) {
  return (
    <Image
      source={MACRO_IMAGES[macro]}
      style={[styles.image, { width: size, height: size }]}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    flexShrink: 0,
  },
});
