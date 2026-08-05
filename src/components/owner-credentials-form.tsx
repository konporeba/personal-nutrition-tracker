// The email + password pair, and the button that submits it.
//
// Extracted because the app asks for the account in two places that are not
// the same screen: the first-run sign-in (`owner-sign-in.tsx`), and the PIN
// gate's one-time link-up, where a device whose PIN predates the credential
// vault confirms the account once so its PIN can carry it from then on. Both
// want identical fields, identical validation and the same pending behaviour;
// only the framing around them differs.
import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Field } from '@/components/ui/field';
import { Spacing } from '@/constants/theme';

export function OwnerCredentialsForm({
  submitLabel,
  onSubmit,
  /** Pre-filled and locked — the link-up already knows whose account this is. */
  email: fixedEmail,
  footer,
}: {
  submitLabel: string;
  /** Rejects by throwing; the message is shown under the fields. */
  onSubmit: (email: string, password: string) => Promise<void>;
  email?: string | null;
  footer?: ReactNode;
}) {
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView type="transparent" style={styles.form}>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!submitting && !fixedEmail}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
        autoFocus={Boolean(fixedEmail)}
      />

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <AppButton
        label={submitLabel}
        // The key, not a padlock: a padlock is what the PIN screen means by
        // "locked", and reusing it here would say the two screens do the same
        // job. This one hands over a credential.
        icon="🔑"
        // `soft`, not `primary` — see the variant note in `ui/app-button.tsx`.
        // Every commit action the owner meets is tinted; the front door should
        // not be the one place that looks like a different app.
        variant="soft"
        size="large"
        full
        onPress={submit}
        disabled={!canSubmit}
        pending={submitting}
      />

      {footer}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
