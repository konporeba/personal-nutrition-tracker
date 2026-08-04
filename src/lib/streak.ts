// The logging streak: how many days in a row the owner has recorded *something*
// — a meal or a training session. Kept dependency-free, in one place, so the
// smoke script asserts against the same code the UI runs — the
// `adherence.ts` / `day-ledger.ts` pattern.
//
// "Something", not "a complete day": the streak rewards the habit of opening
// the app and logging, which is the behaviour the tracker actually needs. It
// deliberately says nothing about whether the day hit its budget — that is the
// week rail's job (see `classifyDayAdherence`).

/** `YYYY-MM-DD` in the device's local timezone, matching the app's day bucketing. */
function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

/**
 * Count the unbroken run of logged days ending at `today`.
 *
 * Today not being logged yet does **not** break the streak — it is only
 * mid-morning, and a counter that reset to 0 every midnight and climbed back
 * at breakfast would be noise. The run is anchored at today when today has
 * something, and at yesterday otherwise; if neither does, the streak is 0.
 *
 * `timestamps` are absolute ISO instants (`logged_at`); they are bucketed into
 * local calendar days here, the same way every other day-scoped read in the
 * app does it.
 */
export function computeLoggingStreak(timestamps: string[], today: Date = new Date()): number {
  const logged = new Set<string>();
  for (const timestamp of timestamps) {
    const at = new Date(timestamp);
    if (Number.isNaN(at.getTime())) continue;
    logged.add(localDayKey(at));
  }
  if (logged.size === 0) return 0;

  // Anchor: today if it counts, else yesterday. Anywhere else and a gap of one
  // day would be counted as a streak of its own.
  let cursor = logged.has(localDayKey(today)) ? today : addDays(today, -1);

  let streak = 0;
  while (logged.has(localDayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
