// The bottom sheet the app's three action modals share. RN's built-in `Modal`
// — no new dependency, matching the project's home-grown-theming stance (no
// component library).
//
// The backdrop scrim is the one place a literal color is unavoidable: it is a
// veil over arbitrary content, not a surface, so it is the same in both modes
// and belongs to the component rather than to the palette. It is mixed from
// the deep brand indigo rather than pure black — over a lilac canvas a neutral
// scrim reads as grey haze instead of as depth.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { floatShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SCRIM = 'rgba(23, 26, 51, 0.55)';

/** Wide enough for the composer's section picker to keep all five options on
 *  one line, narrow enough to still read as a dialog rather than a page. */
const DIALOG_MAX_WIDTH = 560;

/**
 * `bottom` is the classic phone idiom: anchored to the bottom edge, full width,
 * with a grabber. `center` is a floating dialog in the middle of the window,
 * capped in width — the desktop shape, and now the phone's too for anything
 * with a form in it, because a bottom sheet whose content outgrows the
 * viewport has nowhere to go but off the top of the screen.
 *
 * Either way the body scrolls inside a capped height rather than pushing the
 * dialog past the edges of the window, and the whole thing lifts above the
 * keyboard. Sheets that are just a short list of options (`SheetOption` rows)
 * keep `bottom`; sheets that ask for typing use `center`.
 */
export type SheetPlacement = 'bottom' | 'center';

export function Sheet({
  visible,
  title,
  subtitle,
  onRequestClose,
  placement = 'bottom',
  /** Sits left of the title — an `IconChip`, so a popup about one row opens
   *  wearing the same mark that row wears in the list. */
  leading,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onRequestClose: () => void;
  placement?: SheetPlacement;
  leading?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const centered = placement === 'center';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Outer press dismisses; the inner no-op press stops a tap on the sheet
            itself from bubbling up to it. */}
        <Pressable
          style={[styles.backdrop, centered && styles.backdropCentered]}
          onPress={onRequestClose}>
          <Pressable onPress={() => {}} style={centered ? styles.dialogAnchor : styles.fullWidth}>
            <ThemedView
              type="surface"
              style={[
                styles.sheet,
                centered
                  ? [styles.dialog, { borderColor: theme.border }, floatShadow(theme.shadow)]
                  : styles.sheetBottom,
              ]}>
              {/* A bottom sheet pads only its bottom edge for the home indicator
                  / gesture bar; a centered dialog floats clear of every edge. */}
              <SafeAreaView edges={centered ? [] : ['bottom']} style={styles.inner}>
                {/* The grabber says "drag me down"; a centered dialog can't be
                    dragged anywhere, so it doesn't get one. */}
                {centered ? null : (
                  <ThemedView type="transparent" style={styles.grabber}>
                    <ThemedView style={[styles.grabberBar, { backgroundColor: theme.track }]} />
                  </ThemedView>
                )}
                <ThemedView type="transparent" style={styles.headRow}>
                  {leading}
                  <ThemedView type="transparent" style={styles.head}>
                    <ThemedText type="subtitle" numberOfLines={1}>
                      {title}
                    </ThemedText>
                    {subtitle ? (
                      <ThemedText type="small" themeColor="textMuted">
                        {subtitle}
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                </ThemedView>
                {/* The body scrolls, the head and the Cancel row don't. A tall
                    form on a short phone used to grow the sheet until its top
                    (and, in a centered dialog, its buttons) left the viewport
                    with no way to reach them. */}
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.bodyContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  {children}
                </ScrollView>
                <Pressable
                  onPress={onRequestClose}
                  accessibilityRole="button"
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="transparent" style={styles.cancel}>
                    <ThemedText type="smallBold" themeColor="textMuted">
                      Cancel
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              </SafeAreaView>
            </ThemedView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One row of a sheet. `destructive` is the only color-coded state — it marks
 *  the action that cannot be undone by tapping again. */
export function SheetOption({
  label,
  detail,
  onPress,
  disabled = false,
  destructive = false,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <ThemedView
        type="transparent"
        style={[
          styles.option,
          // A disabled option stays legible but loses its fill, so the tappable
          // rows read as a group and it reads as context.
          disabled
            ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }
            : { backgroundColor: theme.surfaceSoft },
        ]}>
        <ThemedText themeColor={disabled ? 'textMuted' : destructive ? 'danger' : 'text'}>
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted">
            {detail}
          </ThemedText>
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: SCRIM,
  },
  backdropCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    // The gutter between the dialog and the window. One step down from the
    // `four` this used to be: on a phone those extra 16pt come straight out of
    // the dialog's content, and the five-across section picker inside needs
    // every one of them.
    padding: Spacing.three,
  },
  // Both anchors cap their height against the backdrop, which is the one box in
  // here with a definite height for a percentage to resolve against. That cap
  // is what the `flexShrink`s below have to shrink *to*.
  dialogAnchor: {
    width: '100%',
    maxWidth: DIALOG_MAX_WIDTH,
    maxHeight: '100%',
  },
  fullWidth: {
    width: '100%',
    maxHeight: '92%',
  },
  sheet: {
    // Default is 0: without this the sheet keeps its content height and
    // overflows the anchor's cap instead of letting its body scroll.
    flexShrink: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  sheetBottom: {
    borderTopLeftRadius: Radius.card + 8,
    borderTopRightRadius: Radius.card + 8,
  },
  dialog: {
    paddingTop: Spacing.four,
    borderRadius: Radius.card + 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    flexShrink: 1,
    gap: Spacing.two,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    gap: Spacing.two,
    // Clears the scroll's own edge so a focused input's ring isn't clipped.
    paddingVertical: 1,
  },
  grabber: {
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },
  grabberBar: {
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  head: {
    gap: 1,
    // Lets a long title truncate against the leading mark instead of pushing
    // it off the sheet.
    flexShrink: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.control,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
