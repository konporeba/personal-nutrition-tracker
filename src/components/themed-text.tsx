import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, FontWeight, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The type scale. Two weights only — Elms Sans Medium 500 (`FontWeight.main`)
 * for the important things (titles, headings, numbers) and Elms Sans Light 300
 * (`FontWeight.other`) for everything else — and sentence case everywhere. The
 * hierarchy is carried by size and color as well as weight, never by
 * capitalization or a third weight.
 *
 * `hero` is reserved for the one number that matters on a screen (the calorie
 * ring's center); `title` for large secondary numerals; `subtitle` for screen
 * and section headings.
 */
export type ThemedTextType =
  | 'hero'
  | 'title'
  | 'subtitle'
  | 'default'
  | 'small'
  | 'smallBold'
  | 'micro'
  | 'link'
  | 'linkPrimary'
  | 'code';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // `linkPrimary` is the one variant whose color is part of its identity; the
  // token still comes from the theme, and an explicit `themeColor` overrides it.
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'accentText' : 'text')];

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  hero: {
    fontFamily: FontWeight.main,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '500',
    letterSpacing: -1.2,
  },
  title: {
    fontFamily: FontWeight.main,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '500',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: FontWeight.main,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  default: {
    fontFamily: FontWeight.main,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  small: {
    fontFamily: FontWeight.other,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '300',
  },
  smallBold: {
    fontFamily: FontWeight.main,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  micro: {
    fontFamily: FontWeight.other,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '300',
    letterSpacing: 0.1,
  },
  link: {
    fontFamily: FontWeight.other,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
  },
  linkPrimary: {
    fontFamily: FontWeight.other,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: '700' as const }) ?? ('500' as const),
    fontSize: 12,
  },
});
