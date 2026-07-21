// Minimal one-time owner sign-in. This is infrastructure UI, not feature UI:
// the owner enters credentials once per client at setup, the resulting session
// is persisted, and this screen is never seen again during daily use. On success
// the auth-state listener in `useOwnerSession` swaps this out for the app.
import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInOwner } from '@/lib/session';

export default function OwnerSignIn() {
  const theme = useTheme();
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

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Owner sign-in</ThemedText>
      <ThemedText themeColor="textSecondary">One-time setup for this device.</ThemedText>
      <TextInput
        style={inputStyle}
        placeholder="email"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!submitting}
      />
      <TextInput
        style={inputStyle}
        placeholder="password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
      />
      {error ? <ThemedText themeColor="textSecondary">{error}</ThemedText> : null}
      {submitting ? (
        <ActivityIndicator />
      ) : (
        <Button title="Sign in" onPress={onSubmit} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
