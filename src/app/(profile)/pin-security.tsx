// Change PIN — verify the current PIN, then set and confirm a new one. Pushed
// over the profile form via the Profile tab's Stack, mirroring weight.tsx.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePinGate } from '@/lib/pin-gate';

const PIN_LENGTH = 6;

export default function PinSecurityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { changePin } = usePinGate();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPin.length === PIN_LENGTH &&
    newPin.length === PIN_LENGTH &&
    confirmPin.length === PIN_LENGTH &&
    !submitting;

  async function onSubmit() {
    if (newPin !== confirmPin) {
      setError("New PINs don't match");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ok = await changePin(currentPin, newPin);
      if (ok) {
        router.back();
      } else {
        setError('Current PIN is wrong');
        setCurrentPin('');
      }
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
      <Stack.Screen options={{ title: 'Change PIN' }} />
      <ThemedView style={styles.inner}>
        <TextInput
          style={inputStyle}
          placeholder="current PIN"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
          value={currentPin}
          onChangeText={(next) => setCurrentPin(onlyDigits(next))}
          editable={!submitting}
        />
        <TextInput
          style={inputStyle}
          placeholder="new PIN"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
          value={newPin}
          onChangeText={(next) => setNewPin(onlyDigits(next))}
          editable={!submitting}
        />
        <TextInput
          style={inputStyle}
          placeholder="confirm new PIN"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
          value={confirmPin}
          onChangeText={(next) => setConfirmPin(onlyDigits(next))}
          editable={!submitting}
        />
        {error ? <ThemedText themeColor="textSecondary">{error}</ThemedText> : null}
        {submitting ? (
          <ActivityIndicator />
        ) : (
          <Button title="Change PIN" onPress={onSubmit} disabled={!canSubmit} />
        )}
      </ThemedView>
    </ThemedView>
  );
}

/** Keep digits only, capped at the PIN length. */
function onlyDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
