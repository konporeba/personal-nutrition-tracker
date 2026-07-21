// Native fetch-on-focus wiring. Foregrounding the app marks queries focused so
// TanStack Query refetches — the mechanism behind cross-client freshness without
// Realtime. Web uses the library's default window-focus behavior (see .web.ts).
import { focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/** Wire focus to AppState. Returns a teardown to remove the listener. */
export function setupQueryRuntime(): () => void {
  const onChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}
