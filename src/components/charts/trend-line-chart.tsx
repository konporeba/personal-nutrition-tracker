// One reusable chart used by every Analytics panel (S-11): a daily series as a
// smoothed line with points, an optional moving-average overlay, an optional
// flat reference line, an optional tolerance band around it, and a hover/tap
// readout. Hand-rolled over `react-native-svg` rather than a charting library
// — victory-native XL (the initial pick) has no official web support, which
// conflicts with FR-041's desktop-browser requirement.
//
// Three things here are deliberate:
//
// - **The line is a spline, not a polyline.** Catmull-Rom through the points,
//   converted to cubic Béziers. Daily calorie data is spiky, and a zig-zag of
//   straight segments reads as noise; a curve reads as a trend, which is what
//   this screen is for. Control points are clamped to the plot box so the
//   smoothing can't overshoot out of frame on a sharp day.
// - **The readout replaces per-point color coding.** Values used to be encoded
//   as colored, differently-shaped marks. Now a hovered (web) or tapped
//   (native) day says what it was, in words, and the marks are uniform.
// - **`referenceBand` is drawn, not implied.** The net panel shades the exact
//   ±tolerance range `classifyDayAdherence` uses, so "on target" is a place on
//   the chart rather than a color to memorize.
import { useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TrendPoint = { x: Date; y: number };

type TrendLineChartProps = {
  data: TrendPoint[];
  /** One value per `data` entry, same order — the smoothed overlay line. */
  movingAverage?: number[];
  /** A flat horizontal reference line (a target or a goal). */
  referenceValue?: number;
  /**
   * Shades ±this fraction of `referenceValue` as the on-target zone. Ignored
   * without a `referenceValue`. Pass `ADHERENCE_TOLERANCE` to match the
   * classifier the rest of the app judges days by.
   */
  referenceBand?: number;
  /** Words for the hovered point's value. Defaults to a rounded number. */
  formatValue?: (value: number) => string;
  /** A tap on a day — used by the Net-vs-Budget panel to open that day. */
  onPointPress?: (point: TrendPoint) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 160;
const PADDING_X = 16;
const PADDING_Y = 16;
const POINT_RADIUS = 3.5;
/** How much of the Catmull-Rom tangent to use. Below 1 the curve hugs the data. */
const SMOOTHING = 0.8;

const tooltipDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function TrendLineChart({
  data,
  movingAverage,
  referenceValue,
  referenceBand,
  formatValue = (value) => Math.round(value).toLocaleString(),
  onPointPress,
  height = DEFAULT_HEIGHT,
}: TrendLineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  if (data.length === 0 || width === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  // The band's edges have to be in range too, or a target near the top of the
  // data would have its upper edge clipped off the chart.
  const bandEdges =
    referenceValue !== undefined && referenceBand
      ? [referenceValue * (1 - referenceBand), referenceValue * (1 + referenceBand)]
      : [];

  const values = [
    ...data.map((point) => point.y),
    ...(movingAverage ?? []),
    ...(referenceValue !== undefined ? [referenceValue] : []),
    ...bandEdges,
  ];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const innerWidth = Math.max(width - PADDING_X * 2, 0);
  const innerHeight = height - PADDING_Y * 2;

  function xForIndex(index: number): number {
    return data.length === 1
      ? PADDING_X + innerWidth / 2
      : PADDING_X + (index / (data.length - 1)) * innerWidth;
  }

  function yForValue(value: number): number {
    return PADDING_Y + innerHeight - ((value - minValue) / valueRange) * innerHeight;
  }

  const linePath = smoothPath(
    data.map((point, index) => [xForIndex(index), yForValue(point.y)]),
    height
  );
  const averagePath = movingAverage
    ? smoothPath(
        movingAverage.map((value, index) => [xForIndex(index), yForValue(value)]),
        height
      )
    : null;

  // One full-height column per day, so hover picks the nearest day by x rather
  // than requiring the pointer to find a 4px dot.
  const slotWidth = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth || width;

  const active = activeIndex !== null ? data[activeIndex] : null;

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={width} height={height}>
        {referenceValue !== undefined && referenceBand ? (
          <Rect
            x={PADDING_X}
            width={innerWidth}
            y={yForValue(referenceValue * (1 + referenceBand))}
            height={Math.abs(
              yForValue(referenceValue * (1 - referenceBand)) -
                yForValue(referenceValue * (1 + referenceBand))
            )}
            fill={theme.success}
            fillOpacity={0.12}
            rx={Radius.small}
          />
        ) : null}

        {referenceValue !== undefined ? (
          <Line
            x1={PADDING_X}
            x2={width - PADDING_X}
            y1={yForValue(referenceValue)}
            y2={yForValue(referenceValue)}
            stroke={theme.textMuted}
            strokeWidth={1}
            strokeDasharray="2,5"
          />
        ) : null}

        {/* The hovered day's guide, behind the data. */}
        {activeIndex !== null ? (
          <Line
            x1={xForIndex(activeIndex)}
            x2={xForIndex(activeIndex)}
            y1={PADDING_Y / 2}
            y2={height - PADDING_Y / 2}
            stroke={theme.border}
            strokeWidth={1}
          />
        ) : null}

        {/* The series carries the accent; the moving average is the quieter
            dashed line behind it, not the other way round. */}
        <Path
          d={linePath}
          stroke={theme.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {averagePath ? (
          <Path
            d={averagePath}
            stroke={theme.textMuted}
            strokeWidth={1.5}
            strokeDasharray="6,4"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        {data.map((point, index) => (
          <Circle
            key={`dot-${point.x.toISOString()}`}
            cx={xForIndex(index)}
            cy={yForValue(point.y)}
            r={index === activeIndex ? POINT_RADIUS + 2 : POINT_RADIUS}
            fill={theme.accent}
          />
        ))}

        {/* Interaction last, so the columns sit above everything they select. */}
        {data.map((point, index) => (
          <Rect
            key={`hit-${point.x.toISOString()}`}
            x={xForIndex(index) - slotWidth / 2}
            y={0}
            width={slotWidth}
            height={height}
            // Not `fill="transparent"` — a fill of none/transparent drops out
            // of hit testing on web.
            fill={theme.accent}
            fillOpacity={0.001}
            {...hitProps(
              () => setActiveIndex(index),
              () => setActiveIndex(null),
              onPointPress ? () => onPointPress(point) : undefined
            )}
          />
        ))}
      </Svg>

      {active ? (
        <ThemedView
          type="surfaceSoft"
          pointerEvents="none"
          style={[
            styles.tooltip,
            { borderColor: theme.border },
            tooltipPosition(xForIndex(activeIndex!), width),
          ]}>
          <ThemedText type="micro" themeColor="textMuted">
            {tooltipDateFormat.format(active.x)}
          </ThemedText>
          <ThemedText type="smallBold">{formatValue(active.y)}</ThemedText>
          {movingAverage && activeIndex !== null ? (
            <ThemedText type="micro" themeColor="textMuted">
              avg {formatValue(movingAverage[activeIndex])}
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : null}
    </View>
  );
}

/**
 * Hover on web, tap on native.
 *
 * `onPress` on web routes through react-native-svg's touchable mixin, which
 * stamps native gesture-responder props onto the DOM node — react-native-web
 * doesn't translate those for raw SVG tags, so React logs them as unknown.
 * `onClick`/`onMouseEnter` are real SVG DOM events and skip that path.
 */
function hitProps(enter: () => void, leave: () => void, press?: () => void) {
  if (Platform.OS === 'web') {
    return {
      onMouseEnter: enter,
      onMouseLeave: leave,
      ...(press ? { onClick: press } : null),
    } as object;
  }
  // Native has no hover: a tap both selects the day (showing the readout) and
  // fires the caller's action.
  return {
    onPress: () => {
      enter();
      press?.();
    },
  } as object;
}

/** Keep the readout inside the chart's own box rather than off its edge. */
function tooltipPosition(x: number, width: number) {
  const TOOLTIP_WIDTH = 104;
  const left = Math.min(Math.max(x - TOOLTIP_WIDTH / 2, 0), Math.max(width - TOOLTIP_WIDTH, 0));
  return { left, width: TOOLTIP_WIDTH };
}

/**
 * A Catmull-Rom spline through every point, emitted as cubic Béziers.
 *
 * Each segment's control points come from the *neighbouring* points' tangent,
 * which is what makes the curve continuous across joins instead of kinking at
 * each one. Control-point y is clamped to the plot box: an unclamped spline
 * overshoots past a local extreme, and on a spiky day that put the curve
 * outside the chart.
 */
function smoothPath(points: [number, number][], height: number): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  }

  const clampY = (y: number) => Math.min(Math.max(y, 0), height);
  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * SMOOTHING;
    const c1y = clampY(p1[1] + ((p2[1] - p0[1]) / 6) * SMOOTHING);
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * SMOOTHING;
    const c2y = clampY(p2[1] - ((p3[1] - p1[1]) / 6) * SMOOTHING);

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }

  return d;
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    gap: 1,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
