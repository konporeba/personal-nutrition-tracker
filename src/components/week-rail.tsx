// `DateStrip` with the last seven days' adherence wired into it.
//
// The split is deliberate: `ui/date-strip.tsx` is presentational and knows
// nothing about the data layer, this component owns the read. It reuses the
// S-11 analytics window rather than issuing seven day queries — `useAnalyticsRange(7)`
// is exactly this rail's range, already gap-filled and already carrying each
// day's `daily_targets` snapshot, so the ring is judged against the target that
// was in force *that* day rather than today's.
import { DateStrip, type DayProgress } from '@/components/ui/date-strip';
import { localDayKey } from '@/data/query-keys';
import { useAnalyticsRange } from '@/data/use-analytics';
import { classifyDayAdherence } from '@/lib/adherence';
import { budgetFraction } from '@/lib/day-ledger';

export function WeekRail({
  selected,
  today,
  onSelect,
}: {
  selected: Date;
  today: Date;
  onSelect: (date: Date) => void;
}) {
  const { days } = useAnalyticsRange(7);

  // Rebuilt every render rather than memoized: `useAnalyticsRange` re-derives
  // `days` per render (it has to — the window rolls at midnight), so a memo
  // keyed on it would never hit. Seven entries; the map is the cheap part.
  const byDay = new Map<string, DayProgress>();
  for (const day of days) {
    // Nothing logged is not "0% of target" — it is no answer at all, and the
    // rail draws a bare track for it (see `DateStrip`).
    const logged = day.consumed > 0 || day.burned > 0;
    byDay.set(localDayKey(day.day), {
      // `budgetFraction`, never a local ratio: this ring and the hero's have to
      // be the same length on the same day, and they were not — see its note.
      fraction: budgetFraction(day),
      status: logged ? classifyDayAdherence(day.net, day.target) : null,
    });
  }

  return (
    <DateStrip
      selected={selected}
      today={today}
      onSelect={onSelect}
      progressFor={(date) => byDay.get(localDayKey(date)) ?? null}
    />
  );
}
