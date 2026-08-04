// Change PIN — verify the current PIN, then set and confirm a new one. Pushed
// over the profile form via the Profile tab's Stack, mirroring weight.tsx.
//
// The form is three identical-looking PIN rows, which is exactly the shape
// that goes wrong silently, so each one is numbered and the live checklist
// under them says what is still missing. Everything that decides whether the
// button fires is checked as the owner types — pressing it should never be how
// you find out the entries didn't match. The panel below answers the questions
// a PIN screen raises but usually doesn't: where it is stored, what it covers,
// and what happens if you forget it.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { Card } from '@/components/ui/card';
import { Checklist, type ChecklistItem } from '@/components/ui/checklist';
import { PinInput } from '@/components/ui/pin-input';
import { useTabBarClearance } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { PIN_LENGTH, usePinGate } from '@/lib/pin-gate';
import { onlyDigits, pinWeakness, pinWeaknessMessage } from '@/lib/pin-rules';

const FACTS = [
  'It is stored hashed on this device and never uploaded — changing it here touches nothing in your account or your logged data.',
  'Each device you sign in on keeps its own PIN, so this change applies here only.',
  'There is no recovery: if you forget it, the lock screen can sign you out and start over with a new one.',
];

export default function PinSecurityScreen() {
  const router = useRouter();
  // Clears the floating tab bar this pushed screen scrolls underneath.
  const tabBarClearance = useTabBarClearance();
  const { changePin } = usePinGate();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentComplete = currentPin.length === PIN_LENGTH;
  const newComplete = newPin.length === PIN_LENGTH;
  const matches = newComplete && newPin === confirmPin;
  const mismatch = confirmPin.length === PIN_LENGTH && !matches;
  // A "change" that changes nothing is a mistake, not a request — the gate
  // would accept it happily and the owner would never know it was a no-op.
  const unchanged = currentComplete && newComplete && currentPin === newPin;
  const weakness = pinWeakness(newPin);

  const canSubmit = currentComplete && matches && !unchanged && !submitting;

  const requirements: ChecklistItem[] = [
    { label: 'Current PIN entered', state: currentComplete ? 'done' : 'todo' },
    unchanged
      ? { label: 'New PIN is the same as your current one', state: 'warn' }
      : {
          label: `New PIN is ${PIN_LENGTH} digits and different from the current one`,
          state: newComplete ? 'done' : 'todo',
        },
    { label: 'Both new entries match', state: matches ? 'done' : 'todo' },
    weakness
      ? { label: pinWeaknessMessage(weakness), state: 'warn' }
      : { label: 'Not an obvious pattern', state: newComplete ? 'done' : 'todo' },
  ];

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    // Cleared before every attempt so a repeat failure re-triggers the input's
    // shake — see the note in `ui/pin-input.tsx`.
    setError(null);
    try {
      const ok = await changePin(currentPin, newPin);
      if (ok) {
        router.back();
      } else {
        setError('Current PIN is wrong');
        setCurrentPin('');
      }
    } catch {
      setError("Couldn't change your PIN. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Change PIN' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <ThemedView type="transparent" style={styles.head}>
            <ThemedText type="subtitle">Change your PIN</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Takes effect straight away. You stay unlocked here — the next lock is what asks for
              the new one.
            </ThemedText>
          </ThemedView>

          <PinInput
            label="1 · Current PIN"
            value={currentPin}
            onChangeText={(next) => setCurrentPin(onlyDigits(next))}
            tone={error ? 'danger' : 'default'}
            hint={error ?? undefined}
            editable={!submitting}
            autoFocus
          />
          <PinInput
            label="2 · New PIN"
            value={newPin}
            onChangeText={(next) => setNewPin(onlyDigits(next))}
            tone={unchanged ? 'danger' : 'default'}
            hint={unchanged ? 'Pick a PIN you are not already using' : undefined}
            editable={!submitting}
          />
          <PinInput
            label="3 · Confirm new PIN"
            value={confirmPin}
            onChangeText={(next) => setConfirmPin(onlyDigits(next))}
            tone={mismatch ? 'danger' : 'default'}
            hint={mismatch ? "New PINs don't match" : undefined}
            editable={!submitting}
          />

          <Checklist items={requirements} />

          <ThemedView type="transparent" style={styles.actions}>
            <AppButton
              label="Change PIN"
              variant="primary"
              size="large"
              onPress={onSubmit}
              disabled={!canSubmit}
              pending={submitting}
              style={styles.submit}
            />
            <AppButton
              label="Cancel"
              variant="ghost"
              size="large"
              onPress={() => router.back()}
              disabled={submitting}
            />
          </ThemedView>
        </Card>

        <Card tone="soft" elevated={false} style={styles.card}>
          <ThemedText type="smallBold">How your PIN works</ThemedText>
          {FACTS.map((fact) => (
            <ThemedView key={fact} type="transparent" style={styles.factRow}>
              <ThemedText
                type="small"
                themeColor="accentText"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.bullet}>
                •
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted" style={styles.factText}>
                {fact}
              </ThemedText>
            </ThemedView>
          ))}
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    // The column stays centered in a wide window rather than pinning left.
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  card: {
    gap: Spacing.three,
  },
  head: {
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  submit: {
    // Takes the row, leaving Cancel at its own width beside it — and wraps to
    // full width of its own line on a narrow screen.
    flexGrow: 1,
    flexBasis: 180,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bullet: {
    width: 8,
    textAlign: 'center',
  },
  factText: {
    flex: 1,
  },
});
