// One reusable chart used by every Analytics panel (S-11): a daily series as
// points/line, an optional overlaid moving-average line, an optional flat
// reference line (target or goal), and an optional per-point color+shape
// override for the adherence-coded Net-vs-Budget panel. Hand-rolled over
// `react-native-svg` rather than a charting library — victory-native XL (the
// initial pick) has no official web support, which conflicts with FR-041's
// desktop-browser requirement.
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TrendPoint = { x: Date; y: number };

/**
 * Per-point color+shape override for the adherence-coded panel. The shape
 * distinction exists so the coding stays legible without relying on color
 * alone — never the sole distinguishing signal.
 */
export type TrendPointStyle = { color: ThemeColor; shape: 'circle' | 'diamond' | 'triangle' };

type TrendLineChartProps = {
  data: TrendPoint[];
  /** One value per `data` entry, same order — the smoothed overlay line. */
  movingAverage?: number[];
  /** A flat horizontal reference line (a target or a goal). */
  referenceValue?: number;
  pointStyle?: (point: TrendPoint, index: number) => TrendPointStyle;
  /** A tap on a rendered point — used by the Net-vs-Budget panel (Phase 6) to open that day. */
  onPointPress?: (point: TrendPoint) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 160;
const PADDING_X = 16;
const PADDING_Y = 16;
const POINT_RADIUS = 4;
/** An invisible tap target several times the visual point radius — react-native-svg shapes don't support `hitSlop`. */
const TOUCH_RADIUS = 14;

export function TrendLineChart({
  data,
  movingAverage,
  referenceValue,
  pointStyle,
  onPointPress,
  height = DEFAULT_HEIGHT,
}: TrendLineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  if (data.length === 0 || width === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  const values = [
    ...data.map((point) => point.y),
    ...(movingAverage ?? []),
    ...(referenceValue !== undefined ? [referenceValue] : []),
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

  const linePath = pathFor(data.map((point, index) => [xForIndex(index), yForValue(point.y)]));
  const averagePath = movingAverage
    ? pathFor(movingAverage.map((value, index) => [xForIndex(index), yForValue(value)]))
    : null;

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={width} height={height}>
        {referenceValue !== undefined ? (
          <Line
            x1={PADDING_X}
            x2={width - PADDING_X}
            y1={yForValue(referenceValue)}
            y2={yForValue(referenceValue)}
            stroke={theme.textSecondary}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ) : null}

        <Path d={linePath} stroke={theme.textSecondary} strokeWidth={1.5} fill="none" />

        {averagePath ? (
          <Path
            d={averagePath}
            stroke={theme.text}
            strokeWidth={1.5}
            strokeDasharray="6,3"
            fill="none"
          />
        ) : null}

        {data.map((point, index) => {
          const style = pointStyle?.(point, index);
          const color = style ? theme[style.color] : theme.text;
          const cx = xForIndex(index);
          const cy = yForValue(point.y);
          return (
            <PointMark
              key={point.x.toISOString()}
              cx={cx}
              cy={cy}
              color={color}
              shape={style?.shape ?? 'circle'}
              onPress={onPointPress ? () => onPointPress(point) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function pathFor(points: [number, number][]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

function PointMark({
  cx,
  cy,
  color,
  shape,
  onPress,
}: {
  cx: number;
  cy: number;
  color: string;
  shape: TrendPointStyle['shape'];
  onPress?: () => void;
}) {
  // react-native-svg shapes have no `hitSlop`; a near-invisible, larger
  // circle underneath gives a real touch target without shrinking the
  // visible mark. `fillOpacity` (not `fill="transparent"`) so it still
  // participates in hit testing on web.
  const touchTarget = onPress ? (
    <Circle cx={cx} cy={cy} r={TOUCH_RADIUS} fill={color} fillOpacity={0.001} onPress={onPress} />
  ) : null;

  if (shape === 'diamond') {
    const p = `${cx},${cy - POINT_RADIUS} ${cx + POINT_RADIUS},${cy} ${cx},${cy + POINT_RADIUS} ${cx - POINT_RADIUS},${cy}`;
    return (
      <>
        {touchTarget}
        <Polygon points={p} fill={color} onPress={onPress} />
      </>
    );
  }
  if (shape === 'triangle') {
    const p = `${cx},${cy - POINT_RADIUS} ${cx + POINT_RADIUS},${cy + POINT_RADIUS} ${cx - POINT_RADIUS},${cy + POINT_RADIUS}`;
    return (
      <>
        {touchTarget}
        <Polygon points={p} fill={color} onPress={onPress} />
      </>
    );
  }
  return (
    <>
      {touchTarget}
      <Circle cx={cx} cy={cy} r={POINT_RADIUS} fill={color} onPress={onPress} />
    </>
  );
}
