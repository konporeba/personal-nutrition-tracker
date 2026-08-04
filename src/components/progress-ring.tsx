// A circular progress indicator — the shared shape behind the day dashboard's
// hero calorie ring and its three small macro rings. Hand-rolled over
// `react-native-svg` (already the project's charting dependency, see
// `charts/trend-line-chart.tsx`) rather than a gauge library, for the same
// reason: keep the web/native rendering path identical.
//
// The fill animates on the UI thread. `strokeDashoffset` is driven by a
// Reanimated shared value through `useAnimatedProps`, never by per-frame
// `setState` — a ring that re-rendered React 60 times a second would drag the
// whole SectionList behind it with every meal logged.
import { type ReactNode, useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const FILL_DURATION_MS = 900;

export function ProgressRing({
  size,
  strokeWidth,
  fraction,
  color,
  /** Second stop. Given, the arc is painted with a `color` → `colorTo` sweep. */
  colorTo,
  trackColor,
  /** Staggers this ring behind its siblings. Ignored under reduced motion. */
  delayMs = 0,
  children,
}: {
  size: number;
  strokeWidth: number;
  /** 0..1, already clamped by the caller. */
  fraction: number;
  color: string;
  colorTo?: string;
  trackColor: string;
  delayMs?: number;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  // Per-instance id: two rings sharing a gradient id is the classic SVG bug
  // where one silently paints with the other's stops.
  const gradientId = `ring-${useId().replace(/:/g, '')}`;
  const stroke = colorTo ? `url(#${gradientId})` : color;

  // Honors the OS "reduce motion" setting: the ring still shows the right
  // value, it just arrives there instantly instead of sweeping.
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? fraction : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = fraction;
      return;
    }
    progress.value = withDelay(
      delayMs,
      withTiming(fraction, { duration: FILL_DURATION_MS, easing: Easing.out(Easing.cubic) })
    );
  }, [fraction, delayMs, reducedMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {colorTo ? (
          <Defs>
            {/* Left-to-right across the ring's box. The arc starts at 12
                o'clock and sweeps clockwise, so this reads as the fill
                warming up as it goes round. */}
            <LinearGradient id={gradientId} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={color} />
              <Stop offset="1" stopColor={colorTo} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          // Start the fill at 12 o'clock instead of svg's default 3 o'clock.
          // A `transform` attribute (rather than the `rotation`/`origin*` props)
          // avoids react-native-svg emitting an invalid `transform-origin` DOM
          // attribute on web.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {children ? (
        <View pointerEvents="none" style={styles.center}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Bound a value to `[0, 1]`. */
export function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
