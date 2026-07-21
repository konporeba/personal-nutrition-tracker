// Web: TanStack Query's default window focus + navigator.onLine handling already
// gives fetch-on-focus and connectivity tracking, so there is nothing to wire up.
export function setupQueryRuntime(): () => void {
  return () => {};
}
