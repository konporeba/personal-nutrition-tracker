// Root HTML document for the static web export (web only — this file never
// runs on native, and only ever runs in Node during `expo export`).
//
// Two jobs beyond the Expo defaults:
//  1. Make the deployed site behave like an installed app when the owner adds
//     it to their phone's home screen — standalone display, no pinch-zoom,
//     status bar drawn under our own dark chrome.
//  2. Paint the dark background *before* the JS bundle boots, so a cold load
//     on the home screen doesn't flash white before the themed UI mounts.
//
// Constraints (per the expo-router docs): no browser APIs, no native modules,
// no global CSS imports — those belong in the root _layout.
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/** Kept in sync with `Colors.dark.background` in constants/theme.ts. */
const BACKGROUND = '#0F1120';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` lets the app paint into the iPhone safe areas;
            `user-scalable=no` stops a double-tap on a number from zooming the
            whole ledger, which is the main way a web app feels non-native. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Add-to-home-screen. iOS still reads the apple-* pair rather than
            the manifest's `display`, so both are set. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={BACKGROUND} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CalTracker" />
        {/* The mark, on our own dark ground: iOS composites a home-screen icon
            onto black, so a transparent PNG here would lose the apple's edges.
            The tab icon is the same artwork with its transparency intact —
            declared as a PNG so browsers pick it over the generated .ico. */}
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon.png" />

        {/* Single-owner app: there is nothing here to index. */}
        <meta name="robots" content="noindex, nofollow" />

        <ScrollViewStyleReset />

        {/* Beats the JS bundle to the paint. */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background-color:${BACKGROUND};}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
