// The one place a `classifyDayAdherence` verdict becomes a color.
//
// It exists because the app briefly had two answers to "is this day over
// budget". The week rail asked `classifyDayAdherence` (a ±5% tolerance band);
// the hero ring and the net-vs-budget bar each hand-rolled a strict `> 0`
// test. At 16 kcal over, the calendar said on-target while the dashboard said
// over — the same day, two verdicts, on one screen.
//
// So: one classifier (`lib/adherence.ts`) decides *what* a day is, this table
// decides what that *looks like*, and nothing colors an adherence state
// without going through both.
import type { ThemeColor } from '@/constants/theme';
import type { DayAdherence } from '@/lib/adherence';

/**
 * Under-budget is `info`, not `warning`: in a deficit, coming in under is a
 * good day. The color says "not on target", not "you did badly".
 */
export const ADHERENCE_COLOR: Record<DayAdherence, ThemeColor> = {
  on: 'success',
  over: 'danger',
  under: 'info',
};

/** Spoken form of the same verdict, for accessibility labels. */
export const ADHERENCE_LABEL: Record<DayAdherence, string> = {
  on: 'on target',
  over: 'over target',
  under: 'under target',
};
