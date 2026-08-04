# Redesign brief — Cal AI–style UI with light + dark mode

**Audience:** the coding agent working in this repo.
**Goal:** restyle the Personal Nutrition Tracker to match the visual language of Cal AI (clean, calm, photo-first, big rounded cards, ring-based data viz) with a fully supported light and dark mode. This is a **visual + component** redesign on top of the existing architecture — not a rewrite, and not a change to the data layer or product model.

---

## 0. Non-negotiable guardrails

Read these before writing any code.

- **Read the SDK 57 versioned docs first.** This project is on Expo SDK 57 / React Native 0.86 / React 19.2 / Reanimated 4. Do not rely on memory of older Expo, expo-router, or Reanimated 3 APIs. Confirm against https://docs.expo.dev/versions/v57.0.0/ before using any native/router/animation API.
- **Extend the home-grown theme; do not add a UI framework.** All theming stays in `src/constants/theme.ts` + `useTheme()` + `ThemedText`/`ThemedView`. Do **not** introduce NativeWind, Tamagui, gluestack, or any component library. The comments mentioning them are stale.
- **No hardcoded colors in screens or components.** Every color comes from a token in `theme.ts` via `useTheme()`. If a value isn't a token, add a token — don't inline a hex.
- **Respect the platform split.** Navigation exists twice: `app-tabs.tsx` (native `NativeTabs`) and `app-tabs.web.tsx` (custom bar via `expo-router/ui`). Any nav change updates **both**. Same for the other `*.web.tsx` splits (`use-color-scheme`, `animated-icon`).
- **Do not touch the data layer to do this.** Reads/writes stay behind the repo seam (`src/data/*.repo.ts`); keep `deleted_at IS NULL` filters; never write `updated_at` from the client. UI work only.
- **Use the `Spacing` scale, not magic numbers**, and build from `ThemedText`/`ThemedView` rather than raw `Text`/`View`.
- **Animations run on the UI thread** (Reanimated shared values / `useAnimatedProps`), never per-frame `setState`. Honor `useReducedMotion()`.
- **Run `npm run lint` and test iOS + Android + web** after each phase.

---

## 1. Design direction (what "Cal AI style" means here)

Translate the *patterns and feel*, adapted to this app's brand and calorie model — not a pixel clone.

- **Calm, near-monochrome base + one accent.** Warm off-white / charcoal surfaces, generous whitespace, big rounded cards (radius ~24px), oversized numerals for the numbers that matter.
- **Ring-first data viz.** The daily calorie budget is the hero: a big progress ring with the remaining number huge in the center. Macros are three smaller color-coded rings.
- **Photo-first.** The camera/capture action is the single most prominent control in the app.
- **Scannable secondary detail.** Recent meals as a clean list; secondary stats (fiber, sodium, etc.) tucked into a swipeable row rather than crowding the home screen.
- **Estimates read as provisional.** Every AI-derived value is visibly editable and tagged (e.g. an "AI est." chip). This is a design requirement, not decoration — it enforces the PRD rule to never present a fabricated value as final.
- **Motion confirms, never decorates.** Rings fill on load; logging a meal animates the ring and fires a haptic tick; rows swipe to edit/delete.

### App-specific deviations from Cal AI (keep these)

- **Accent is our own green**, not Cal AI's branding.
- **The hero reflects the sedentary-baseline model:** `remaining = base − food + exercise`. Show the breakdown (e.g. `Base 2,100 · Food −850 · Exercise +170`). Exercise is added back explicitly; do not double-count activity.
- **Single-user, PIN gate** — no account/profile-switching UI.

---

## 2. Design tokens (the core of light/dark mode)

Extend `Colors` in `src/constants/theme.ts` with the keys below. Keep both maps in exact key parity so `useTheme()` returns the same shape in either mode. `ThemedView`'s `type` maps to the background-role keys; `ThemedText` uses the text keys.

```ts
export const Colors = {
  light: {
    background:  '#F4F5F1', // page canvas
    surface:     '#FFFFFF', // cards
    surfaceSoft: '#EFF1EA', // chips, subtle fills
    text:        '#14170F',
    textMuted:   '#8A9081',
    accent:      '#1FA363', // brand green
    onAccent:    '#FFFFFF', // text/icon on accent
    track:       '#E9EBE3', // ring track (unfilled)
    protein:     '#F0567A',
    carbs:       '#EFA636',
    fat:         '#3E8BEE',
    border:      'rgba(0,0,0,0.07)',
    success:     '#1FA363',
    warning:     '#EFA636',
    danger:      '#E24B4A',
  },
  dark: {
    background:  '#0E100C',
    surface:     '#181B14',
    surfaceSoft: '#20241C',
    text:        '#F3F5EC',
    textMuted:   '#9AA08F',
    accent:      '#35C77E',
    onAccent:    '#FFFFFF',
    track:       '#2A2E24',
    protein:     '#FF6E90',
    carbs:       '#FAB84D',
    fat:         '#5AA0F5',
    border:      'rgba(255,255,255,0.09)',
    success:     '#35C77E',
    warning:     '#FAB84D',
    danger:      '#F0716F',
  },
} as const;
```

Rules for the agent:
- Dark mode is **not** an inversion — these values are tuned per mode (surfaces are near-black, not pure black; accent brightens slightly). Use exactly these unless a contrast check fails.
- Contrast: body text on its surface and any text on the accent must pass WCAG AA. Verify both modes.
- Corner radius: cards `24`, controls/chips `14–16`, pills `999`. Add to the theme (`Radius`) rather than inlining.

### Theme preference (light AND dark, per the request)

- Default to the OS scheme via the existing `use-color-scheme` split.
- Add a **manual override**: `'system' | 'light' | 'dark'`, persisted locally (AsyncStorage native / storage web — mirror the pattern already used by the Supabase client split). Expose it as a control on the Profile screen.
- `useTheme()` resolves: manual override if set, else OS scheme.

---

## 3. Typography & spacing

- Keep `Fonts` per-platform as-is; introduce `ThemedText` `type` variants sized for this look: `hero` (~40, weight 500, for the big kcal number), `title` (~19/500), `body` (~15/400), `caption` (~13/400), `micro` (~11–12/400). Two weights only (400/500).
- Sentence case everywhere. No ALL CAPS, no Title Case except proper nouns.
- Use the `Spacing` scale (`half`…`six`) for all vertical rhythm and gaps. Respect `MaxContentWidth` on web (center content, don't stretch the phone layout full-bleed) and `BottomTabInset`.

---

## 4. Components to build (primitives first)

Build these as themed, platform-agnostic primitives, then compose screens from them.

| Component | Notes |
|---|---|
| `Card` | `ThemedView` wrapper: `surface` bg, radius 24, padding from `Spacing`. |
| `CalorieRing` | `react-native-svg` (Expo-bundled). Animated `strokeDashoffset` via Reanimated `useAnimatedProps` on an `AnimatedCircle`. Center shows remaining kcal (`hero`) + label. Track = `track`, fill = `accent`, rounded linecap, starts at top (`rotate(-90)`). |
| `MacroRing` | Small ring; color per macro token; center = percentage; label + `82 / 130 g` below. Three across in a `Card`. |
| `DateStrip` | Horizontal week of day pills; today filled with `accent` + `onAccent`. |
| `MealRow` | Soft colored icon tile + name + `time · macro` + kcal + `AI est.` chip. Swipe-to-edit/delete via `react-native-gesture-handler`. |
| `Chip` | `surfaceSoft` bg, `micro` text; used for the hero breakdown and the AI-estimate tag. |
| `SectionHeader` | Title + optional trailing action (e.g. "See all" in `accent`). |
| `CaptureButton` | Prominent camera action — see nav note below. |

---

## 5. Screen-by-screen

### Home (`index.tsx`) — the hero
Top → bottom: greeting + date; `DateStrip`; `CalorieRing` card with the sedentary-baseline breakdown chips; macros `Card` (3 `MacroRing`s); a swipeable secondary-stats row (fiber, sodium, water) as detail-on-demand; `Recently logged` section (`SectionHeader` + `MealRow`s). Keep it calm — one accent, lots of whitespace.

### Capture (core loop entry)
Photo-first: camera as the primary path, plus barcode and free-text/saved-meal fallbacks. Show a clear "analyzing" state during AI estimation (this latency is real — design the wait, don't hide it). Use `expo-blur` for any overlay/scan UI.

### Review estimate (make-or-break screen)
Photo on top; detected items with **inline-editable** macros and portion steppers; a visible confidence signal; and — per the PRD — a frictionless **manual-entry fallback when input is unrecognized**. Nothing here may look like a locked, final value. Confirm logs the entry, animates the home ring, and fires a success haptic (`expo-haptics`).

### Meals, Insights, Profile
Meals: list/library of saved meals + history. Insights: trends/charts (defer heavy charting; a simple ring/bar recap first). Profile: goals, and the **theme preference control** (system/light/dark).

---

## 6. Navigation & the capture button (decision point)

The Cal AI look puts a raised camera button in the center of the tab bar. Native `NativeTabs` does **not** cleanly support a custom raised center tab. Resolve deliberately, and implement per platform:

- **Mobile (`app-tabs.tsx`):** either (a) a floating capture FAB overlaid above the native tab bar, or (b) capture as a standard prominent tab that opens the camera. Prefer (a) for the Cal AI feel; verify against SDK 57 `NativeTabs` docs whether an overlay is viable before committing.
- **Web (`app-tabs.web.tsx`):** the custom bar can render the raised center button directly.

Document whichever you pick in the PR. Do not fake parity — each platform gets the idiomatic version.

---

## 7. Motion

- **Ring fill** on data load: animate a shared value 0→target, drive `strokeDashoffset` with `useAnimatedProps`. Ease-out, ~1s, small stagger across the macro rings.
- **Log confirmation:** ring re-animates to the new value + `Haptics.notificationAsync(Success)`.
- **Row gestures:** swipe-to-edit/delete via Gesture Handler (wrap app root in `GestureHandlerRootView`).
- **Reduced motion:** gate every animation behind `useReducedMotion()` — jump to final state when enabled.
- Prefer Reanimated presets (entering/exiting/layout) before hand-writing animations. Skip Moti unless you first confirm it targets Reanimated 4 on SDK 57.

---

## 8. Definition of done

- [ ] `theme.ts` holds both light and dark maps with identical keys; nothing colored is hardcoded outside it.
- [ ] Theme follows OS by default; manual system/light/dark override persists and applies instantly.
- [ ] Both modes pass WCAG AA for body text and text-on-accent.
- [ ] Home, capture, review-estimate, meals, insights, profile all restyled and rendering on iOS, Android, and web.
- [ ] Calorie + macro rings animate on load and on log; all motion respects reduced-motion.
- [ ] Capture is reachable in one tap and is the most prominent control; solution implemented for both `app-tabs.tsx` and `app-tabs.web.tsx`.
- [ ] Review-estimate never presents a value as final/uneditable and offers manual entry on unrecognized input; AI-derived values are tagged.
- [ ] Data layer untouched; reads still go through repos with `deleted_at IS NULL`.
- [ ] `npm run lint` passes.

---

## 9. Suggested order

1. **Tokens + theme preference** (Section 2) — foundation; verify `ThemedText`/`ThemedView` consume new tokens in both modes.
2. **Primitives** (Section 4).
3. **Home** (Section 5) — proves the system end to end.
4. **Capture → review-estimate** flow.
5. **Meals / Insights / Profile** (+ theme toggle).
6. **Motion + haptics + reduced-motion + accessibility pass.**

Verify against the SDK 57 docs and run lint at every step.
