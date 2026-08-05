// PIN gate — the app's front door once a PIN exists. Setup mode (no PIN stored
// yet) asks for a new PIN twice; entry mode asks for the existing PIN and
// offers forgot-PIN recovery. Swapped out by the root layout as soon as the
// device is unlocked *and* an account session is in hand.
//
// Entry mode does more than flip a flag. The Supabase session behind it is not
// durable — a lapsed refresh token leaves the app with nothing, and the old
// answer to that was to fall back to the sign-in form on launch. So a correct
// PIN here also mints a session from the credentials sealed under it
// (`credential-vault.ts`) whenever the persisted one is gone. Six digits is
// the whole of getting back in.
//
// This is the app's front door — the one screen a returning owner sees every
// time they come back — so it is built as a real screen rather than as a form
// on a blank canvas: the same ambient wash the tab screens sit on, the mark in
// a badge, a status chip, and, under the card, a plain statement of what the
// PIN actually protects. Everything the owner might wonder about here (how
// many digits, how many attempts they've missed, what "forgot" will do to
// them) is on screen instead of implied.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OwnerCredentialsForm } from '@/components/owner-credentials-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { Checklist, type ChecklistItem } from '@/components/ui/checklist';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { GradientFill } from '@/components/ui/gradient';
import { PinInput } from '@/components/ui/pin-input';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openVault, rememberCredentials } from '@/lib/credential-vault';
import { PIN_LENGTH, usePinGate } from '@/lib/pin-gate';
import { onlyDigits, pinWeakness, pinWeaknessMessage } from '@/lib/pin-rules';
import { signInOwner, signOutOwner, verifyOwnerPassword } from '@/lib/session';

export default function PinGateScreen({
  ownerEmail,
  hasSession,
}: {
  ownerEmail: string | null;
  /** Whether an account session is already live. False means unlocking has to
   *  restore one from the vault before the app can be shown. */
  hasSession: boolean;
}) {
  const { hasPinSet } = usePinGate();
  return hasPinSet ? <PinEntry ownerEmail={ownerEmail} hasSession={hasSession} /> : <PinSetup />;
}

function PinSetup() {
  const { setPin } = usePinGate();
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = pin.length === PIN_LENGTH;
  const confirmComplete = confirmPin.length === PIN_LENGTH;
  const matches = complete && pin === confirmPin;
  // Caught while typing rather than on press: a button that refuses to fire
  // and explains why beats one that fires and then reports a mismatch.
  const mismatch = confirmComplete && !matches;
  const weakness = pinWeakness(pin);
  const canSubmit = matches && !submitting;

  const requirements: ChecklistItem[] = [
    { label: `${PIN_LENGTH} digits`, state: complete ? 'done' : 'todo' },
    { label: 'Both entries match', state: matches ? 'done' : 'todo' },
    weakness
      ? { label: pinWeaknessMessage(weakness), state: 'warn' }
      : { label: 'Not an obvious pattern', state: complete ? 'done' : 'todo' },
  ];

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await setPin(pin);
    } catch {
      setError("Couldn't save your PIN. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GateShell
      // Not "First run": this is also where recovery lands after a reset.
      status="Setup"
      title="Create your PIN"
      subtitle={`Pick ${PIN_LENGTH} digits. This locks the app on this device — your account sign-in is separate and stays as it is.`}>
      <PinInput
        label="New PIN"
        value={pin}
        onChangeText={(next) => setPinValue(onlyDigits(next))}
        editable={!submitting}
        autoFocus
      />
      <PinInput
        label="Confirm PIN"
        value={confirmPin}
        onChangeText={(next) => setConfirmPin(onlyDigits(next))}
        tone={mismatch ? 'danger' : 'default'}
        hint={mismatch ? "PINs don't match" : undefined}
        editable={!submitting}
      />

      <Checklist items={requirements} />

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <AppButton
        label="Set PIN"
        icon="🔒"
        variant="soft"
        size="large"
        full
        onPress={onSubmit}
        disabled={!canSubmit}
        pending={submitting}
      />
    </GateShell>
  );
}

/** Why the gate is asking to see the account again after a correct PIN. */
type LinkUp = { pin: string; reason: string };

function PinEntry({ ownerEmail, hasSession }: { ownerEmail: string | null; hasSession: boolean }) {
  const { verify, markUnlocked } = usePinGate();
  const [pin, setPinValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [linkUp, setLinkUp] = useState<LinkUp | null>(null);

  const canSubmit = pin.length === PIN_LENGTH && !submitting;

  // Takes the PIN explicitly so the auto-submit below can pass the digits that
  // completed the entry — `pin` state hasn't caught up yet at that point.
  async function onSubmit(candidate: string) {
    if (candidate.length !== PIN_LENGTH || submitting) return;
    setSubmitting(true);
    // Clearing first is what lets a repeat failure re-trigger the input's
    // shake: the tone passes back through `default` on the way.
    setError(null);
    try {
      const ok = await verify(candidate);
      if (!ok) {
        const failed = attempts + 1;
        setAttempts(failed);
        setError(failed === 1 ? 'Wrong PIN. Try again.' : `Wrong PIN — ${failed} failed attempts`);
        setPinValue('');
        return;
      }

      // The PIN is right, but a right PIN over a lapsed session is only half of
      // getting in. Unseal the account and sign back in *before* unlocking —
      // flipping the flag first would hand the app a session it doesn't have.
      if (!hasSession && !(await restoreSession(candidate, setLinkUp))) return;

      await markUnlocked();
    } catch {
      setError("Couldn't unlock. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Both of these take over the whole gate rather than unfolding under the
  // keypad: each is a different task with its own way out, and a Cancel buried
  // below a PIN pad is the wrong shape for either.
  if (linkUp) {
    return <PinLinkUp linkUp={linkUp} onCancel={() => setLinkUp(null)} />;
  }
  if (recovering) {
    return (
      <PinRecovery
        ownerEmail={hasSession ? ownerEmail : null}
        onCancel={() => setRecovering(false)}
      />
    );
  }

  return (
    <GateShell status="Locked" title="Welcome back" subtitle="Enter your PIN to unlock this device.">
      <PinInput
        label="PIN"
        align="center"
        value={pin}
        onChangeText={(next) => setPinValue(onlyDigits(next))}
        onComplete={onSubmit}
        tone={error ? 'danger' : 'default'}
        hint={error ?? undefined}
        editable={!submitting}
        autoFocus
      />

      <AppButton
        label="Unlock"
        icon="🔓"
        variant="soft"
        size="large"
        full
        onPress={() => onSubmit(pin)}
        disabled={!canSubmit}
        pending={submitting}
      />

      <Pressable
        onPress={() => setRecovering(true)}
        disabled={submitting}
        accessibilityRole="button"
        style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}>
        <ThemedText type="linkPrimary">Forgot PIN?</ThemedText>
      </Pressable>
    </GateShell>
  );
}

/**
 * Signs back in using the credentials sealed under `pin`. True when the app has
 * a session again; false when it needs the owner to confirm the account by hand
 * first, in which case `onLinkUp` has been told why.
 *
 * The two failure modes are genuinely different and the copy says which: a
 * device whose PIN predates the vault has nothing sealed at all, while a device
 * whose stored password has since been changed elsewhere has something sealed
 * that the server no longer accepts.
 */
async function restoreSession(pin: string, onLinkUp: (linkUp: LinkUp) => void): Promise<boolean> {
  const credentials = await openVault(pin);
  if (!credentials) {
    onLinkUp({
      pin,
      reason:
        'Your PIN is right. This device set it up before it could carry your account, so confirm the account once and the PIN is all you will need from now on.',
    });
    return false;
  }

  try {
    await signInOwner(credentials.email, credentials.password);
    return true;
  } catch {
    onLinkUp({
      pin,
      reason:
        'Your PIN is right, but the account password stored on this device no longer works — it was most likely changed elsewhere. Enter the current one and this device is back in step.',
    });
    return false;
  }
}

/**
 * One-time account confirmation behind a correct PIN. The PIN has already been
 * verified to get here, so this is not a second lock: it is the gate collecting
 * what it needs to make the PIN self-sufficient, and it re-seals on success so
 * this screen is not seen twice.
 */
function PinLinkUp({ linkUp, onCancel }: { linkUp: LinkUp; onCancel: () => void }) {
  const { sealCredentials, markUnlocked } = usePinGate();

  async function onSubmit(email: string, password: string) {
    await signInOwner(email, password);
    await sealCredentials(linkUp.pin, email, password);
    await markUnlocked();
  }

  return (
    <GateShell status="Unlocked" title="Confirm your account" subtitle={linkUp.reason}>
      <OwnerCredentialsForm submitLabel="Confirm account" onSubmit={onSubmit} />
      <AppButton label="Back to PIN" variant="ghost" size="large" full onPress={onCancel} />
    </GateShell>
  );
}

/**
 * Forgot-PIN recovery. A PIN can't be recovered — it is stored hashed — so the
 * owner has to prove themselves some other way before setting a new one, and
 * the account password is that other way.
 *
 * Nothing here is destructive: the session is kept, the PIN stays set until the
 * password actually checks out, and Cancel goes straight back to the keypad.
 * Signing out is still reachable, but as its own labelled action with its
 * consequence spelled out — not as the thing "Forgot PIN?" silently did.
 */
function PinRecovery({
  ownerEmail,
  onCancel,
}: {
  ownerEmail: string | null;
  onCancel: () => void;
}) {
  const { clearPin } = usePinGate();
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = verifying || signingOut;
  // Without an address on the session there is no password to check against,
  // so the only honest route left is a full sign-out.
  const canVerify = ownerEmail !== null && password.length > 0 && !busy;

  async function onVerify() {
    if (ownerEmail === null || !canVerify) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyOwnerPassword(ownerEmail, password);
      // Park the credentials for the PIN setup that `clearPin` drops us onto,
      // so the new PIN is sealed over the account exactly as a fresh sign-in
      // would have left it. Without this, recovery would quietly produce a PIN
      // that can't restore a session.
      rememberCredentials({ email: ownerEmail, password });
      // Only now — the PIN survives a wrong password untouched, so a failed
      // attempt here leaves the device exactly as locked as it was.
      await clearPin();
    } catch {
      setError("That password doesn't match. Try again.");
      setPassword('');
    } finally {
      setVerifying(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      // Order matters: sign out first, so a failure here leaves the local PIN
      // intact (fails closed). Clearing the PIN only after sign-out has
      // actually succeeded means a partial failure can never strand a live
      // session with no PIN to check against.
      //
      // `ownerEmail === null` means there is no live session to end — the
      // lapsed-session case — and signing out of nothing is not a failure that
      // should block the reset the owner asked for.
      if (ownerEmail !== null) await signOutOwner();
      await clearPin();
    } catch {
      setError("Couldn't sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <GateShell
      status="Recovery"
      title="Reset your PIN"
      subtitle="A PIN can't be looked up — it's stored hashed. Confirm your account password and you can set a new one.">
      {ownerEmail ? (
        <>
          <Card tone="soft" elevated={false} style={styles.identity}>
            <ThemedText type="micro" themeColor="textMuted">
              Signed in as
            </ThemedText>
            <ThemedText type="smallBold" numberOfLines={1}>
              {ownerEmail}
            </ThemedText>
          </Card>

          <Field
            label="Account password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            autoFocus
            hint="You stay signed in — nothing you've logged is touched."
          />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <AppButton
            label="Confirm and set a new PIN"
            icon="☑️"
            variant="soft"
            size="large"
            full
            onPress={onVerify}
            disabled={!canVerify}
            pending={verifying}
          />
        </>
      ) : (
        <ThemedText type="small" themeColor="textMuted">
          There is no live account session on this device to check a password against, so the
          in-place check isn&apos;t available here. Starting over with your email and password is the
          way through.
        </ThemedText>
      )}

      <AppButton
        label="Back to PIN"
        variant="ghost"
        size="large"
        full
        onPress={onCancel}
        disabled={busy}
      />

      <ThemedView type="transparent" style={styles.lastResort}>
        <ThemedText type="micro" themeColor="textMuted">
          Forgotten the password too, or handing this device on? This clears the PIN and the account
          stored behind it, and returns you to the sign-in screen. Your logged data stays in your
          account — signing back in brings all of it back.
        </ThemedText>
        <AppButton
          label={ownerEmail ? 'Sign out of this device' : 'Start over with email and password'}
          icon="🔑"
          variant="soft"
          onPress={onSignOut}
          disabled={verifying}
          pending={signingOut}
        />
      </ThemedView>
    </GateShell>
  );
}

/**
 * Shared frame for both modes — the page wash, a centered card badged with the
 * brand mark and a status chip, and the reassurance line beneath it. The lock
 * screen should look like the front door of the app rather than a form.
 */
function GateShell({
  status,
  title,
  subtitle,
  children,
}: {
  status: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.canvas}>
      {/* The same ambient wash every tab screen sits on (see `ui/screen.tsx`),
          so the gate reads as part of the app and not as a system dialog. */}
      <View pointerEvents="none" style={styles.wash}>
        <GradientFill from={theme.glowFrom} to={theme.glowTo} direction="vertical" />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <ThemedView type="transparent" style={styles.header}>
            <ThemedView
              type="transparent"
              style={[
                styles.badge,
                { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
              ]}>
              <BrandMark size={34} />
            </ThemedView>
            <Chip label={status} tone="accent" />
            <ThemedText type="subtitle" style={styles.centered}>
              {title}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
              {subtitle}
            </ThemedText>
          </ThemedView>

          {children}
        </Card>

        <ThemedText type="micro" themeColor="textMuted" style={[styles.centered, styles.footnote]}>
          Your PIN is hashed and kept on this device only. It is never uploaded and never syncs to
          your other devices.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

/** How far the page's ambient wash reaches down from the top edge. */
const WASH_HEIGHT = 360;

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: WASH_HEIGHT,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    // Deliberately more than the gutters: the card centers on a short screen,
    // but on a tall setup form with the keyboard up it scrolls, and this is
    // what keeps its top clear of the notch on the way past.
    paddingVertical: Spacing.five,
    gap: Spacing.three,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    gap: Spacing.three,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
  footnote: {
    maxWidth: MaxContentWidth / 2,
    paddingHorizontal: Spacing.two,
  },
  identity: {
    gap: Spacing.half,
    padding: Spacing.three,
  },
  lastResort: {
    alignItems: 'flex-start',
    gap: Spacing.two,
    // The one irreversible action on the screen, set apart from the two that
    // aren't rather than sitting in the same run of buttons.
    paddingTop: Spacing.two,
  },
  forgot: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
