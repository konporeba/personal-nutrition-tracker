// The inverse of `section-for-time.ts`: a representative clock time for each
// section.
//
// It exists for one job — giving a *backdated* meal a plausible timestamp.
// Logging into a past day has no real instant to reach for: the clock says
// whenever the owner happened to be typing, which for the case this feature was
// built for ("I missed midnight by five minutes") means a supper landing at
// 00:05 the next morning — sorted first in the day's ledger and inferred as
// breakfast. A section-derived time is a fiction, but it is a fiction that
// orders correctly and reads correctly, which the real one does not.
//
// Only backdated writes use it. A meal logged into *today* keeps the true
// instant (see `logged-at-for-day.ts`), so nothing in the common path is
// approximated.
import type { Section } from '@/data/types';

/** A wall-clock time of day, with no date attached. */
export type TimeOfDay = { hours: number; minutes: number };

/**
 * Mid-window for each section, per the boundaries in `section-for-time.ts`
 * (10:30 / 12:00 / 15:00 / 18:00).
 *
 * **Invariant**: every value here round-trips —
 * `sectionForTime(<any day at TIME_FOR_SECTION[s]>) === s` for all five.
 * Anything that changes these times or those boundaries has to keep that true,
 * or a backdated meal would display in one section and re-infer into another.
 */
const TIME_FOR_SECTION: Record<Section, TimeOfDay> = {
  breakfast: { hours: 8, minutes: 0 },
  snack: { hours: 11, minutes: 0 },
  lunch: { hours: 13, minutes: 0 },
  bite: { hours: 16, minutes: 30 },
  supper: { hours: 19, minutes: 30 },
};

/** The clock time a meal backdated into `section` is stamped with. */
export function timeForSection(section: Section): TimeOfDay {
  return TIME_FOR_SECTION[section];
}
