// PIN gate — shown once a Supabase session exists but the device isn't
// unlocked. Setup mode (no PIN stored yet) asks for a new PIN twice; entry
// mode asks for the existing PIN and offers forgot-PIN recovery. Swapped out
// by the root layout as soon as usePinGate().unlocked flips to true.
import { useState } from 'react';
import { ActivityIndicator, Button, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePinGate } from '@/lib/pin-gate';
import { signOutOwner } from '@/lib/session';

const PIN_LENGTH = 6;

export default function PinGateScreen() {
  const { hasPinSet } = usePinGate();
  return hasPinSet ? <PinEntry /> : <PinSetup />;
}

function PinSetup() {
  const theme = useTheme();
  const { setPin } = usePinGate();
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = pin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH && !submitting;

  async function onSubmit() {
    if (pin !== confirmPin) {
      setError("PINs don't match");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setPin(pin);
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
      <ThemedText type="subtitle">Set a PIN</ThemedText>
      <ThemedText themeColor="textSecondary">
        Choose a {PIN_LENGTH}-digit PIN for this device.
      </ThemedText>
      <TextInput
        style={inputStyle}
        placeholder="new PIN"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_LENGTH}
        value={pin}
        onChangeText={(next) => setPinValue(onlyDigits(next))}
        editable={!submitting}
      />
      <TextInput
        style={inputStyle}
        placeholder="confirm PIN"
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
        <Button title="Set PIN" onPress={onSubmit} disabled={!canSubmit} />
      )}
    </ThemedView>
  );
}

function PinEntry() {
  const theme = useTheme();
  const { unlock, clearPin } = usePinGate();
  const [pin, setPinValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  const canSubmit = pin.length === PIN_LENGTH && !submitting;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const ok = await unlock(pin);
      if (!ok) {
        setError('Wrong PIN');
        setPinValue('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotPin() {
    setRecovering(true);
    try {
      // Both must happen: clearing only the local PIN still shows the app
      // (nothing to check the PIN against); signing out only re-prompts
      // sign-in but re-enters PIN entry with the same forgotten PIN.
      await clearPin();
      await signOutOwner();
    } finally {
      setRecovering(false);
    }
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Enter PIN</ThemedText>
      <TextInput
        style={inputStyle}
        placeholder="PIN"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_LENGTH}
        value={pin}
        onChangeText={(next) => setPinValue(onlyDigits(next))}
        editable={!submitting && !recovering}
      />
      {error ? <ThemedText themeColor="textSecondary">{error}</ThemedText> : null}
      {submitting ? (
        <ActivityIndicator />
      ) : (
        <Button title="Unlock" onPress={onSubmit} disabled={!canSubmit} />
      )}
      <Pressable
        onPress={onForgotPin}
        disabled={recovering}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="linkPrimary">Forgot PIN?</ThemedText>
      </Pressable>
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
  pressed: {
    opacity: 0.7,
  },
});
