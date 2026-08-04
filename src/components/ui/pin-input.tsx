// A PIN entry rendered as one box per digit — the standard, professional-
// looking PIN/OTP pattern — backed by a single real, invisible `TextInput`
// rather than `PIN_LENGTH` separate inputs. One input means paste, backspace,
// and web keyboard/screen-reader behavior all come from the platform for
// free; N inputs would mean hand-rolling all three, and backspace-across-
// boxes in particular is unreliable on Android's soft keyboard.
//
// The boxes flex rather than sit at a fixed width: six 44px boxes plus their
// gaps overflow a 360px phone once the card and screen gutters are taken out,
// which is what used to push the last box off the edge of the lock screen.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PIN_LENGTH } from '@/lib/pin-gate';

/** Widest a single box is allowed to get once there is room to spare. */
const BOX_MAX_WIDTH = 52;
const BOX_HEIGHT = 56;
const BOX_GAP = Spacing.two;

export type PinTone = 'default' | 'danger';

export function PinInput({
  value,
  onChangeText,
  label,
  /** Caption under the boxes. Falls back to a live digit counter. */
  hint,
  /** `danger` reddens the boxes and shakes them — see the note on the effect. */
  tone = 'default',
  /** Fires with the completed value the moment the last digit lands, for the
   *  screens that submit on their own rather than waiting for a button. */
  onComplete,
  editable = true,
  autoFocus = false,
  align = 'left',
}: {
  value: string;
  onChangeText: (next: string) => void;
  label: string;
  hint?: string;
  tone?: PinTone;
  onComplete?: (pin: string) => void;
  editable?: boolean;
  autoFocus?: boolean;
  align?: 'left' | 'center';
}) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();

  const danger = tone === 'danger';
  const caretIndex = value.length;
  const showCaret = editable && caretIndex < PIN_LENGTH;

  // Shake on rejection. This fires on the *transition* into `danger`, which
  // works because every caller clears its error before each attempt — so a
  // second wrong PIN in a row passes through `default` and shakes again.
  const shift = useSharedValue(0);
  useEffect(() => {
    if (!danger || reducedMotion) return;
    shift.value = withSequence(
      withTiming(-7, { duration: 45 }),
      withRepeat(withTiming(7, { duration: 90 }), 3, true),
      withTiming(0, { duration: 45 })
    );
  }, [danger, reducedMotion, shift]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  // The caret is drawn, not native: `secureTextEntry` + `caretHidden` is what
  // keeps the real input invisible, so the blinking bar in the next empty box
  // is the only thing telling the owner where their typing lands.
  const blink = useSharedValue(1);
  useEffect(() => {
    if (!showCaret || reducedMotion) {
      cancelAnimation(blink);
      blink.value = 1;
      return;
    }
    blink.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 500, easing: Easing.linear }),
        withTiming(1, { duration: 500, easing: Easing.linear })
      ),
      -1,
      false
    );
    return () => cancelAnimation(blink);
  }, [showCaret, reducedMotion, blink]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  const caption = hint ?? `${value.length} of ${PIN_LENGTH} digits`;

  return (
    <ThemedView type="transparent" style={styles.field}>
      <ThemedText type="small" themeColor="textMuted" style={align === 'center' && styles.centered}>
        {label}
      </ThemedText>

      <Pressable onPress={() => inputRef.current?.focus()} disabled={!editable}>
        <Animated.View
          style={[styles.row, align === 'center' && styles.rowCentered, shakeStyle]}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => {
            // Boxes are decorative — the real, labeled input below is the only
            // thing a screen reader should stop on.
            const filled = index < value.length;
            const active = editable && index === caretIndex;
            return (
              <View
                key={index}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.box,
                  {
                    backgroundColor: active ? theme.accentSoft : theme.surfaceSoft,
                    borderColor: danger
                      ? theme.danger
                      : active
                        ? theme.accent
                        : filled
                          ? theme.accentBorder
                          : theme.border,
                  },
                ]}>
                {filled ? (
                  <View
                    style={[styles.dot, { backgroundColor: danger ? theme.danger : theme.text }]}
                  />
                ) : active && showCaret ? (
                  <Animated.View
                    style={[styles.caret, { backgroundColor: theme.accent }, caretStyle]}
                  />
                ) : null}
              </View>
            );
          })}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={(next) => {
              onChangeText(next);
              // `next` is raw here; the caller's filter is what decides what
              // actually lands. Only a clean, full-length entry counts as done.
              const digits = next.replace(/[^0-9]/g, '');
              if (digits.length === PIN_LENGTH) onComplete?.(digits);
            }}
            keyboardType="number-pad"
            // Selects the numeric QuickType bar and quiets iOS's password-manager
            // suggestions. There's no real one-time-code source to autofill from
            // — this is a locally-generated device PIN — so nothing is expected
            // to actually fill in from it.
            textContentType="oneTimeCode"
            autoComplete="off"
            secureTextEntry
            caretHidden
            maxLength={PIN_LENGTH}
            editable={editable}
            autoFocus={autoFocus}
            accessibilityLabel={label}
            style={styles.hiddenInput}
          />
        </Animated.View>
      </Pressable>

      <ThemedText
        type="micro"
        themeColor={danger ? 'danger' : 'textMuted'}
        style={align === 'center' && styles.centered}>
        {caption}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one + 2,
  },
  centered: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: BOX_GAP,
  },
  rowCentered: {
    // Capped so six boxes at their full width stay centered as a group rather
    // than stretching apart on a wide card.
    alignSelf: 'center',
    maxWidth: PIN_LENGTH * BOX_MAX_WIDTH + (PIN_LENGTH - 1) * BOX_GAP,
    width: '100%',
  },
  box: {
    // Share the row evenly, up to the cap — narrow phones get narrower boxes
    // instead of a row that runs off the edge of the card.
    flex: 1,
    minWidth: 0,
    maxWidth: BOX_MAX_WIDTH,
    height: BOX_HEIGHT,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
  },
  caret: {
    width: 2,
    height: 22,
    borderRadius: Radius.pill,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
});
