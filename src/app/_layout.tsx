import {
  ElmsSans_300Light,
  ElmsSans_500Medium,
  ElmsSans_700Bold,
  useFonts,
} from '@expo-google-fonts/elms-sans';
import type { Session } from '@supabase/supabase-js';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AddMealProvider } from '@/components/add-meal-provider';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import OwnerSignIn from '@/components/owner-sign-in';
import PinGateScreen from '@/components/pin-gate-screen';
import { Colors } from '@/constants/theme';
import { asyncStoragePersister, queryClient } from '@/data/query-client';
import { setupQueryRuntime } from '@/data/query-runtime';
import { PinGateProvider, usePinGate } from '@/lib/pin-gate';
import { useOwnerSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

/**
 * Which tab `/` resolves to.
 *
 * Today is the only tab that is still a *group* (`(today)`), so it is the only
 * one whose index claims `/`. The other three are plain segments and own
 * `/training`, `/analytics`, `/profile`. That is the real fix for "a refresh
 * opens Analytics": when all four were groups, all four indexes mapped to `/`,
 * and the router resolved the collision alphabetically — `(analytics)` first.
 * Naming an initial route could not override a URL that genuinely matched four
 * screens; it is kept here so the intent survives a future tab being added.
 */
export const unstable_settings = {
  initialRouteName: '(today)',
};

// Navigation's own surfaces (headers, card backgrounds, the push animation's
// backdrop) come from react-navigation's theme, not ours — feed it the same
// tokens so a pushed screen doesn't flash a foreign background.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
    primary: Colors.accent,
  },
};

export default function RootLayout() {
  // Native: refetch on app foreground. No-op on web (library default handles it).
  useEffect(() => setupQueryRuntime(), []);

  // Hold the native splash (already prevented from auto-hiding above) until
  // Elms Sans is registered — `AnimatedSplashOverlay` only hands off once it
  // mounts, so returning null here keeps the splash up without any change
  // to that hand-off logic.
  const [fontsLoaded, fontError] = useFonts({
    ElmsSans_500Medium,
    ElmsSans_300Light,
    ElmsSans_700Bold,
  });
  const ready = fontsLoaded || fontError;

  return (
    <>
      {/* Document title/description for the web export. `web.name` in app.json
          does not reach the rendered <title> under static rendering — helmet
          owns it, and <Head> is the documented way in. It sits *above* the font
          gate on purpose: static rendering runs in Node, where the fonts never
          resolve, so anything below that gate renders to an empty document.
          Set once here so every route inherits it; a screen can override with
          its own <Head>. Renders nothing on native. */}
      <Head>
        <title>CalTracker</title>
        <meta name="description" content="Personal calorie and macro tracker." />
      </Head>
      {/* Gesture Handler has to wrap the whole tree, above navigation, for the
          swipe gestures on list rows to receive touches. */}
      {ready && (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: asyncStoragePersister }}>
            <ThemedRoot />
          </PersistQueryClientProvider>
        </GestureHandlerRootView>
      )}
    </>
  );
}

function ThemedRoot() {
  // Gate the app on an authenticated owner session. While the persisted session
  // resolves, render only the splash; then hand over to the gate below.
  const { session, loading } = useOwnerSession();

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <PinGateProvider>
        <AnimatedSplashOverlay />
        {!loading && <Gate session={session} />}
      </PinGateProvider>
    </ThemeProvider>
  );
}

/**
 * Which of the three front doors to show: the PIN, the credential form, or the
 * app itself.
 *
 * The PIN comes *first* once one exists, ahead of the account session. That
 * ordering is the point: the session is not durable — a rotated or expired
 * refresh token leaves `getSession()` with nothing — and when the sign-in
 * screen sat in front of the PIN, every such lapse meant typing an email and a
 * password before being asked for six digits anyway. A set PIN can mint a
 * session by itself (see `credential-vault.ts`), so it is what the owner meets,
 * and the credential form is reserved for the two cases that genuinely need it:
 * a device with no PIN yet, and one whose PIN was set before it could carry an
 * account.
 */
function Gate({ session }: { session: Session | null }) {
  const { loading, hasPinSet, unlocked } = usePinGate();
  if (loading) return null;

  // The gate needs the owner's address when there is a session: its recovery
  // path re-checks the account password in place rather than signing out, and
  // this is the session it must check against.
  const ownerEmail = session?.user.email ?? null;

  if (hasPinSet && !(unlocked && session)) {
    return <PinGateScreen ownerEmail={ownerEmail} hasSession={session !== null} />;
  }
  if (!session) return <OwnerSignIn />;
  if (!unlocked) return <PinGateScreen ownerEmail={ownerEmail} hasSession />;

  // The add-meal popup is provided above the tabs, not inside a screen: the
  // controls that open it (mobile web's center ＋, native's FAB) are part of
  // the shell and outlive whichever tab is showing.
  return (
    <AddMealProvider>
      <AppTabs />
    </AddMealProvider>
  );
}
