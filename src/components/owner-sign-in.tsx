// Owner sign-in. This is infrastructure UI, not feature UI: the owner enters
// credentials once per client at setup, and from then on the device PIN is the
// front door — a correct PIN can mint a fresh session on its own, so this
// screen is not what a lapsed session drops you back onto. On success the
// auth-state listener in `useOwnerSession` swaps it out for the PIN setup.
import { StyleSheet } from 'react-native';

import { OwnerCredentialsForm } from '@/components/owner-credentials-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { rememberCredentials } from '@/lib/credential-vault';
import { signInOwner } from '@/lib/session';

export default function OwnerSignIn() {
  async function onSubmit(email: string, password: string) {
    await signInOwner(email, password);
    // Held in memory only, for the PIN setup that follows to seal under the new
    // PIN. That seal is what makes the next launch a six-digit affair rather
    // than this screen again.
    rememberCredentials({ email, password });
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

        <OwnerCredentialsForm
          submitLabel="Sign in"
          onSubmit={onSubmit}
          footer={
            // This screen is also where a signed-out owner lands, and from
            // there it looks like a dead end. It isn't — nothing lives on the
            // device that signing in doesn't bring straight back.
            <ThemedText type="micro" themeColor="textMuted">
              Everything you log lives in your account, not on this device. Signing in restores all
              of it, and you&apos;ll choose a PIN for this device next — after that the PIN is all
              you need to get back in.
            </ThemedText>
          }
        />
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
