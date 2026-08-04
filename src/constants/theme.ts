/**
 * The single source of truth for the app's visual language.
 *
 * The palette is a periwinkle/indigo family built from four brand colors:
 *
 *   #F4EEFF  lilac canvas   #DCD6F7  soft periwinkle
 *   #A6B1E1  mid periwinkle #424874  deep indigo
 *
 * The app is dark-only: canvas is a near-black indigo and the mid periwinkle
 * carries the accent, with the deep indigo as the ink on top of it.
 *
 * Three rules govern edits here:
 * 1. Nothing colored may be hardcoded outside this file. If a screen needs a
 *    value that isn't a token, add the token.
 * 2. Every text/background pair below has been checked against WCAG AA (4.5:1
 *    for body text). Contrast wins over swatch, always.
 * 3. There are two brand gradients, and they are not interchangeable.
 *    `accentFrom → accentTo` is the *control* sweep: its far stop is held
 *    close enough to the near stop that `onAccent` clears AA across the whole
 *    run, so buttons can carry a label. `sweepFrom → sweepTo` is the *art*
 *    sweep: a much wider, prettier run for the capture button, which carries
 *    no small text (it clears the 3:1 non-text bar, not the 4.5:1 one).
 *    Putting a label on the art sweep is the mistake this split exists to
 *    prevent. The hero calorie ring used to wear it too; it doesn't any more,
 *    because its arc now carries an adherence *verdict* (see
 *    `components/ui/adherence-color.ts`) and a color that means something
 *    cannot also be a gradient.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // — Surfaces — near-black *indigo*, mixed down from #424874 rather than
  //   toward grey, which is what keeps this in the same brand family.
  background: '#0F1120',
  surface: '#191C31',
  surfaceSoft: '#232741',

  // — Text —
  text: '#EFEDFA',
  textMuted: '#9AA2C8',

  // — Accent — the mid periwinkle carries the accent at these luminances;
  //   the deep indigo becomes the ink on top of it.
  accent: '#A6B1E1',
  accentFrom: '#A6B1E1',
  accentTo: '#CFCAF3',
  onAccent: '#171A33',
  accentSoft: 'rgba(166,177,225,0.18)',
  accentText: '#B7C0EE',
  /** The edge on an `accentSoft` fill. Tinted rather than neutral, so a soft
   *  control reads as *live* next to a disabled one wearing plain `border`. */
  accentBorder: 'rgba(166,177,225,0.45)',

  glowFrom: 'rgba(166,177,225,0.16)',
  glowTo: 'rgba(66,72,116,0.00)',

  sweepFrom: '#8E9AE0',
  sweepTo: '#DCD6F7',

  // — Structure —
  border: 'rgba(220,214,247,0.13)',
  track: '#2E3352',
  shadow: 'rgba(0,0,0,0.55)',

  // Macro identity colors — a fixed hue per macro so the same color always
  // means the same nutrient across the app, independent of the adherence
  // signal below. Ring strokes and dots only, never small text.
  protein: '#FF7FA8',
  carbs: '#F2B45E',
  fat: '#5CD0DE',

  // Adherence signal (S-11 FR-034): on/over/under a day's budget. Always
  // paired with a non-color shape cue (trend-line-chart.tsx) — never the
  // sole distinguishing signal.
  success: '#5FD9A8',
  warning: '#F2B45E',
  danger: '#FF8A8A',
  info: '#9FB2FF',
} as const;

export type ThemeColor = keyof typeof Colors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * The two weights the whole app is built from — see `ThemedText`'s style
 * scale. `main` (Elms Sans Medium, 500) carries the important things: titles,
 * headings, numbers; `other` (Elms Sans Light, 300) carries everything else —
 * secondary copy, captions, labels. 300 rather than the 100 this started at:
 * a hairline weight at 12–14px on a near-black canvas loses its strokes to
 * sub-pixel rendering, and captions are the text that can least afford it.
 * Loaded at runtime via `useFonts` in
 * `_layout.tsx`, which registers the same family name on every platform — on
 * web the CSS vars name that same registered family first and only fall
 * through to a system stack before the webfont lands, so there's no reflow.
 */
export const FontWeight = {
  main: Platform.select({
    web: 'var(--font-display-main)',
    default: 'ElmsSans_500Medium',
  }) as string,
  other: Platform.select({
    web: 'var(--font-display-other)',
    default: 'ElmsSans_300Light',
  }) as string,
  /**
   * Elms Sans Bold (700). Not part of the type scale — `ThemedText` never
   * reaches for it — and deliberately not a third tier of prose. It exists for
   * one job: the label on a button marked `strong`, where the control has to
   * out-weigh the copy around it. A real loaded face rather than
   * `fontWeight: '700'` on the medium one, because naming a specific family
   * makes native ignore the weight and web synthesize a smeared fake.
   */
  strong: Platform.select({
    web: 'var(--font-display-strong)',
    default: 'ElmsSans_700Bold',
  }) as string,
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Corner radii. Big soft cards are the defining shape of this design, so the
 * scale is intentionally coarse — pick the role, never an arbitrary number.
 */
export const Radius = {
  /** Inputs, small tiles. */
  small: 4,
  /** Chips and segmented options. */
  chip: 6,
  /** Buttons and other controls. */
  control: 8,
  /** Cards — the hero shape. */
  card: 12,
  /** Fully round: pills, icon tiles, the capture button. */
  pill: 999,
} as const;

/**
 * Card elevation. `boxShadow` is supported on every platform from RN 0.76,
 * so one string works for iOS, Android and web — but the color has to come
 * from the active theme, hence a function rather than a constant.
 */
export function cardShadow(shadowColor: string) {
  return { boxShadow: `0px 2px 14px ${shadowColor}` } as const;
}

/** A deeper lift, for the elements that float over content. */
export function floatShadow(shadowColor: string) {
  return { boxShadow: `0px 10px 30px ${shadowColor}` } as const;
}

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/**
 * Layout widths.
 *
 * `MaxContentWidth` is the reading column — phones, mobile web, and any
 * stack-pushed detail screen, where a single centered column is right.
 * `DashboardMaxWidth` is what the desktop web dashboard uses instead: it fills
 * the window rather than pretending to be a phone, capped only so the layout
 * doesn't fall apart on an ultrawide monitor.
 */
export const MaxContentWidth = 800;
export const DashboardMaxWidth = 1680;
/** Desktop web only: the fixed left nav rail. */
export const SidebarWidth = 252;

/**
 * Mobile web only: the floating bottom tab bar's own measurements, and the
 * clearance a screen has to leave under its content so the last row isn't
 * hidden behind it. Exported rather than inlined because three files have to
 * agree on them — the bar draws itself from the first two, `ui/screen.tsx`
 * pads by the third, and the raised capture button positions itself against
 * all three.
 */
export const MobileTabBar = {
  /** The pill's own height. */
  height: 60,
  /** Gap between the pill and the viewport's bottom edge. */
  gap: Spacing.three,
  /** The raised capture button's diameter. */
  capture: 58,
  /** How far the capture button rides above the pill's vertical center. */
  lift: 12,
} as const;

/** What a mobile-web screen must keep clear at the bottom for the tab bar. */
export const WebTabBarInset = MobileTabBar.height + MobileTabBar.gap * 2 + Spacing.two;

/**
 * Responsive thresholds, in window width.
 *
 * `desktop` is the one that matters: at and above it, web switches from the
 * phone-shaped single column to the sidebar dashboard. Below it, mobile web
 * gets exactly the phone layout, which is what it should be.
 */
export const Breakpoints = {
  /** Two columns of cards start to fit. */
  wide: 900,
  /** Sidebar + multi-column dashboard. */
  desktop: 1080,
} as const;
