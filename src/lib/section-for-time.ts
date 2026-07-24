// Map a log instant onto one of the five day sections.
//
// `meal_entries.section` is NOT NULL, but the sectioned day view is S-06 — so
// S-01 has to supply a section it never displays. Inferring it from the clock
// (rather than defaulting every row to one value) is what lets S-06 light up
// over real history instead of a wall of "breakfast".
//
// The boundaries are provisional (OQ-10), following the PRD's own worked example
// ("anything before 10:30 is breakfast"). This function is the seam S-06 extends
// with a user-facing override.
import type { Section } from '@/data/types';

const HALF_PAST_TEN = 10 * 60 + 30;
const NOON = 12 * 60;
const THREE_PM = 15 * 60;
const SIX_PM = 18 * 60;

/**
 * The section a meal logged at `date` belongs to, by the device's local clock.
 *
 * Total by construction — every instant maps, and each boundary belongs to the
 * later section (10:30 is snack, 12:00 is lunch, and so on).
 */
export function sectionForTime(date: Date): Section {
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (minutes < HALF_PAST_TEN) return 'breakfast';
  if (minutes < NOON) return 'snack';
  if (minutes < THREE_PM) return 'lunch';
  if (minutes < SIX_PM) return 'bite';
  return 'supper';
}
