// Every tappable control in the app, in three weights. Before this existed the
// same Pressable + ThemedView + ThemedText stack was hand-rolled on a dozen
// screens, which is how "disabled" ended up meaning three different things —
// here it means exactly one: muted fill, muted label, no press feedback.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientFill } from '@/components/ui/gradient';
import { FontWeight, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * `soft` is the app's commit action, near enough everywhere: an accent-washed
 * fill with a tinted edge instead of a solid one. "Log a meal", "Save profile",
 * "Estimate", "Save changes", "Set PIN", "Sign in" — all of them. A filled
 * button out-shouts the content it belongs to, and keeping the brightest fill
 * rare is what lets it mean something.
 *
 * `primary` is the filled accent, and it is now the exception rather than the
 * rule: navigation out of a dead end ("Back to today", "Go back", "Set up your
 * profile"), where there is nothing else on screen to compete with. It used to
 * be documented as *the* commit action inside a form or dialog, which is why
 * the sign-in and PIN screens were built with it — and that made the front
 * door the one part of the app whose buttons looked like a different product.
 * If you are adding a submit button, you almost certainly want `soft`.
 */
export type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export function AppButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'medium',
  disabled = false,
  pending = false,
  /** Leading glyph. A string is emoji or a single character — this app ships
   *  no icon font — but anything drawn (see `PlusBadge`) can be passed too,
   *  and is rendered as-is rather than being wrapped in text. */
  icon,
  /** Stretch to the container's width instead of hugging the label. */
  full = false,
  /** Set the label in the bold face (`FontWeight.strong`) — for a control that
   *  has to carry weight against the copy around it. */
  strong = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  pending?: boolean;
  icon?: ReactNode;
  full?: boolean;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  // A pending button is not tappable either — otherwise the second tap fires
  // whatever the first one is still doing.
  const inert = disabled || pending;
  // The gradient is what makes a primary button read as *the* action. It is
  // dropped while inert so a disabled button can't look like the live one.
  const gradient = variant === 'primary' && !inert;

  const fill =
    inert && variant !== 'ghost'
      ? theme.surfaceSoft
      : variant === 'primary'
        ? theme.accent
        : variant === 'danger'
          ? theme.danger
          : variant === 'ghost'
            ? 'transparent'
            : variant === 'soft'
              ? theme.accentSoft
              : theme.surfaceSoft;

  const labelColor = inert
    ? 'textMuted'
    : variant === 'primary' || variant === 'danger'
      ? 'onAccent'
      : variant === 'ghost' || variant === 'soft'
        ? 'accentText'
        : 'text';

  // `soft` and `ghost` are the outlined pair. Disabled drops the tint back to
  // the neutral hairline, so "live" and "inert" differ by the edge as well as
  // by the label — the fill alone is nearly the same grey either way.
  //
  // An *inert* button is outlined whatever its variant, which is the fix for a
  // disabled `primary` (or `danger`) reading as an unstyled panel rather than a
  // button: it loses its gradient, its fill drops to `surfaceSoft` and its label
  // greys out, and with no edge left there was nothing on a dark card to say it
  // was a control at all. That is the state a form's submit sits in until the
  // fields are filled — the first thing the owner sees on the sign-in and
  // account-confirmation screens — so it has to look like a button that isn't
  // ready yet, not like a mistake.
  const outlined = variant === 'soft' || variant === 'ghost' || inert;
  const borderColor = inert ? theme.border : variant === 'soft' ? theme.accentBorder : theme.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: pending }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [full ? styles.full : styles.hug, pressed && !inert && styles.pressed, style]}>
      <ThemedView
        type="transparent"
        style={[
          styles.body,
          sizeStyles[size],
          { backgroundColor: fill },
          outlined && {
            // A full 1px, not a hairline: on a dark canvas a sub-pixel edge
            // fades out entirely and the button reads as a flat panel.
            borderWidth: 1,
            borderColor,
          },
        ]}>
        {gradient ? (
          <GradientFill from={theme.accentFrom} to={theme.accentTo} direction="horizontal" />
        ) : null}
        {pending ? (
          <ActivityIndicator size="small" color={theme[labelColor]} />
        ) : (
          <>
            {typeof icon === 'string' ? (
              <ThemedText
                // An emoji ignores `themeColor` — it carries its own palette —
                // so a disabled button would keep a full-strength icon beside
                // its muted label. Opacity is what dims it instead.
                style={[styles.icon, iconSizeStyles[size], inert && styles.iconInert]}
                themeColor={labelColor}>
                {icon}
              </ThemedText>
            ) : (
              (icon ?? null)
            )}
            {/* One line, always. A label that wraps turns a control into a
                paragraph with a border: the box grows taller than its row,
                every button beside it stops lining up, and the second line
                usually lands under the icon rather than the first. If a label
                genuinely cannot fit, the honest outcomes are a shorter label or
                a wider button — never two lines. */}
            <ThemedText
              type={size === 'large' ? 'default' : 'smallBold'}
              themeColor={labelColor}
              numberOfLines={1}
              style={[styles.label, strong && styles.labelStrong]}>
              {label}
            </ThemedText>
          </>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hug: {
    alignSelf: 'flex-start',
  },
  full: {
    alignSelf: 'stretch',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    // Clips the gradient layer to the button's corners.
    overflow: 'hidden',
  },
  label: {
    // Keeps the label vertically centered against a taller leading glyph.
    includeFontPadding: false,
  },
  labelStrong: {
    // Both, not either: the family is what actually renders bold, the numeric
    // weight is what web's font matching uses to pick that face.
    fontFamily: FontWeight.strong,
    fontWeight: '700',
  },
  icon: {
    // A glyph's default line box carries the font's full ascent/descent, which
    // is what makes a bare `+` sit high and undersized next to its label. Trim
    // it to the glyph and center it on the label's own line instead.
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  iconInert: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.65,
  },
});

const sizeStyles = StyleSheet.create({
  small: {
    paddingVertical: Spacing.two - 1,
    paddingHorizontal: Spacing.three,
    minHeight: 34,
  },
  medium: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    minHeight: 44,
  },
  large: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    minHeight: 54,
    // No radius override. `large` used to round itself into a pill, which made
    // the single most important button on a screen — "Log it", "Unlock" — the
    // one button shaped unlike every other control around it. Size is what
    // marks a button as primary here; shape belongs to the whole family, and
    // `styles.body` owns it.
  },
});

// A step larger than the label at every size, with the line height pinned to
// the label's so the two share a baseline box: an icon that matches its label's
// size reads as a stray character rather than as an affordance.
const iconSizeStyles = StyleSheet.create({
  small: { fontSize: 17, lineHeight: 19 },
  medium: { fontSize: 18, lineHeight: 19 },
  large: { fontSize: 21, lineHeight: 22 },
});
