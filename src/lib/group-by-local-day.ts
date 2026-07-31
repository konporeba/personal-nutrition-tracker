// Bucket a range's rows into one array per calendar day (S-11), in one
// dependency-free place so the smoke script asserts against the same code the
// UI runs — the `group-by-section.ts` pattern, one axis over: there every
// bucket is a section, here every bucket is a day.
import { localDayKey } from '@/data/query-keys';

/**
 * Group `rows` into one array per entry in `days`, in the same order. A day
 * with no matching rows still gets a slot — an empty array, never an omitted
 * one — so every downstream consumer (a moving average, an adherence count)
 * can assume a fixed-length, gap-free day list.
 */
export function groupByLocalDay<T>(
  rows: T[],
  getDate: (row: T) => Date,
  days: Date[],
): T[][] {
  return days.map((day) => {
    const key = localDayKey(day);
    return rows.filter((row) => localDayKey(getDate(row)) === key);
  });
}
