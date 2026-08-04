// A plus inside a circle, drawn rather than typed.
//
// Every earlier attempt at this was a text glyph — `＋` (the fullwidth
// Unicode plus, whose advance width and vertical metrics are built for a CJK
// grid, so it sits high and thin beside Latin text) and then a plain `+`,
// which is at the mercy of whatever the loaded font decides a plus should
// look like at 14px. Two rounded bars in a ring have no font behind them:
// same weight, same optical center, same crispness on every platform and at
// every size.
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';

export function PlusBadge({
  size = 20,
  /** The plus itself, and the ring around it when there is no fill. */
  color,
  /** Fills the disc. Omitted, the badge is a ring instead. */
  backgroundColor,
  /** Thicker bars and ring, to sit beside a bold label without looking drawn
   *  in a finer pen than the text next to it. */
  bold = false,
}: {
  size?: number;
  color: string;
  backgroundColor?: string;
  bold?: boolean;
}) {
  // All derived from `size` so the badge stays proportional wherever it lands.
  const stroke = bold ? 0.13 : 0.09;
  const thickness = Math.max(1.5, Math.round(size * stroke * 2) / 2);
  const arm = Math.round(size * 0.46);
  const ring = backgroundColor ? 0 : Math.max(1, Math.round(size * (bold ? 0.11 : 0.075)));

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Radius.pill,
          backgroundColor: backgroundColor ?? 'transparent',
          borderWidth: ring,
          borderColor: color,
        },
      ]}>
      <View
        style={[
          styles.bar,
          { width: arm, height: thickness, borderRadius: thickness, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.bar,
          { width: thickness, height: arm, borderRadius: thickness, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
  },
});
