// A labeled text input. Every form in the app was hand-assembling the same
// label + TextInput + theme colors; the numeric variant additionally repeated
// the "strip anything that isn't a number as it is typed" rule five times.
//
// That sanitizing is not cosmetic: it is what guarantees an empty field can
// only ever mean "unknown" (null) and never a value the parser had to guess
// at — see `toNumberOrNull` in the screens that consume this.
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Field({
  label,
  unit,
  value,
  onChangeText,
  /** Digits and a single decimal point only, enforced keystroke by keystroke. */
  numeric = false,
  placeholder,
  hint,
  /** Right-aligned annotation on the label row — e.g. an "Estimated" tag. */
  badge,
  /** Controls sitting on the input's own line, to its right — e.g. the daily
   *  targets' per-field save/reset pair. They share the input's row rather than
   *  appearing under it, so acting on the field can't change the field's height
   *  and shove the rest of the form down the page. */
  trailing,
  /** Drop the visible label. It still names the input for a screen reader, so
   *  this is for the layouts that label the field somewhere else — never for
   *  leaving an input unlabelled. */
  hideLabel = false,
  multiline = false,
  editable = true,
  ...rest
}: Omit<TextInputProps, 'onChangeText' | 'value' | 'style'> & {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (next: string) => void;
  numeric?: boolean;
  hint?: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  hideLabel?: boolean;
}) {
  const theme = useTheme();

  return (
    <ThemedView type="transparent" style={styles.field}>
      {hideLabel && !badge ? null : (
        <ThemedView type="transparent" style={styles.labelRow}>
          {hideLabel ? null : (
            <ThemedText type="small" themeColor="textMuted">
              {label}
              {unit ? ` (${unit})` : ''}
            </ThemedText>
          )}
          {badge}
        </ThemedView>
      )}
      <ThemedView type="transparent" style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            styles.inputBody,
            multiline && styles.multiline,
            {
              color: theme.text,
              backgroundColor: theme.surfaceSoft,
              borderColor: theme.border,
            },
            !editable && { color: theme.textMuted },
          ]}
          value={value}
          onChangeText={(next) => onChangeText(numeric ? onlyNumeric(next) : next)}
          placeholder={placeholder ?? (numeric ? '—' : undefined)}
          placeholderTextColor={theme.textMuted}
          keyboardType={numeric ? 'decimal-pad' : undefined}
          inputMode={numeric ? 'decimal' : undefined}
          multiline={multiline}
          editable={editable}
          accessibilityLabel={label}
          {...rest}
        />
        {trailing}
      </ThemedView>
      {hint ? (
        <ThemedText type="micro" themeColor="textMuted">
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

/** Keep digits and a single decimal point; drop everything else. */
export function onlyNumeric(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

/**
 * An empty field means "unknown", which is `null` — not `0`. Zero is a real
 * measurement and must only be stored when the owner actually typed it.
 */
export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Seed a form field from a stored value. Null/undefined becomes empty. */
export function seedField(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one + 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // A label and a badge that together outgrow a narrow field drop onto two
    // lines instead of pushing the field's own box wider than its column.
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    // Trailing controls are the input's height, so they align on the box and
    // not on the text baseline inside it.
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  inputBody: {
    // Takes the row, leaving the trailing controls at their natural width.
    flex: 1,
    // Not redundant with `flex: 1`, and the fix for two separate bugs. On web a
    // TextInput is an `<input>`, whose automatic minimum size in a flex line is
    // its *intrinsic* width — about 20 characters, ~180pt — and `min-width:
    // auto` stops a flex item shrinking below that no matter what its basis
    // says. So the input refused to give up ~210pt with padding: in the
    // profile's Height/Age pair it overran its own column and printed over the
    // field beside it, and in a daily-target row it shoved the reset button off
    // the right edge of the screen. `minWidth: 0` is what lets `flex: 1` mean
    // what it says.
    minWidth: 0,
  },
  input: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 46,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
