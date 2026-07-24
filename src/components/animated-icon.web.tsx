// Web counterpart of the native splash overlay. There is no native splash screen
// to hand off from in the browser, so this is deliberately a no-op — the file
// exists only so `@/components/animated-icon` resolves on both platforms.
export function AnimatedSplashOverlay() {
  return null;
}
