// Minimal one-time owner sign-in. This is infrastructure UI, not feature UI:
// the owner enters credentials once per client at setup, the resulting session
// is persisted, and this screen is never seen again during daily use. On success
// the auth-state listener in `useOwnerSession` swaps this out for the app.
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { signInOwner } from '@/lib/session';

export default function OwnerSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await signInOwner(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Card style={styles.card}>
        <ThemedView type="transparent" style={styles.brand}>
          <BrandMark size={44} />
          <ThemedView type="transparent">
            <ThemedText type="subtitle">Owner sign-in</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              One-time setup for this device.
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!submitting}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          editable={!submitting}
        />

        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}

        <AppButton
          label="Sign in"
          variant="primary"
          size="large"
          full
          onPress={onSubmit}
          pending={submitting}
        />

        {/* This screen is also where a signed-out owner lands, and from there
            it looks like a dead end. It isn't — nothing lives on the device
            that signing in doesn't bring straight back. */}
        <ThemedText type="micro" themeColor="textMuted">
          Everything you log lives in your account, not on this device. Signing in restores all of
          it, and you&apos;ll be asked to choose a PIN for this device afterwards.
        </ThemedText>
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    gap: Spacing.three,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
