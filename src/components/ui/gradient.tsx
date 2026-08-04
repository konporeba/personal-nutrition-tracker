// Gradients, on `react-native-svg`.
//
// Why not `expo-linear-gradient`: it is a native module, so adding it forces a
// rebuild of every dev client for what is a purely visual change. `react-native-svg`
// is already a dependency (the charts and the rings use it), renders identically
// on web and native, and does everything needed here.
//
// `GradientFill` is an absolutely-positioned layer, so it goes *inside* the
// element it paints and the element keeps owning its own size and radius:
//
//   <View style={{ borderRadius: 24, overflow: 'hidden' }}>
//     <GradientFill from={a} to={b} />
//     …content…
//   </View>
//
// The parent must clip (`overflow: 'hidden'`) for the gradient to respect a
// rounded corner — the SVG itself is a plain rectangle.
import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type GradientDirection = 'diagonal' | 'horizontal' | 'vertical';

const DIRECTIONS: Record<GradientDirection, { x1: string; y1: string; x2: string; y2: string }> = {
  diagonal: { x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
  horizontal: { x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
  vertical: { x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
};

export function GradientFill({
  from,
  to,
  direction = 'diagonal',
  /** Fade the whole layer. Cheaper than a second pair of rgba stops. */
  opacity = 1,
}: {
  from: string;
  to: string;
  direction?: GradientDirection;
  opacity?: number;
}) {
  // `useId` gives every instance its own gradient def. Two gradients sharing an
  // id is the classic SVG bug where one silently paints with the other's stops.
  const id = `grad-${useId().replace(/:/g, '')}`;
  const coords = DIRECTIONS[direction];

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      // Without this the Rect below is laid out in the SVG's own user units
      // rather than stretched to the parent's measured box.
      preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} {...coords}>
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </Svg>
  );
}
