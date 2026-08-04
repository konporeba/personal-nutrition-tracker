// One row of the Training list: type + intensity on the left, burn on the
// right — the shared `ListRow` shape, one slice over. The accent-tinted icon
// tile is what distinguishes a session from a meal at a glance; the emoji
// inside it names the activity (`training-emoji.ts`), which is what a row of
// ten identical flames never did.
//
// Tapping opens the session popup (edit/delete); there is no long-press gesture.
import { ThemedText } from '@/components/themed-text';
import { ListRow, RowValue } from '@/components/ui/list-row';
import type { TrainingIntensity, TrainingSession } from '@/data/types';
import { emojiForTraining } from '@/lib/training-emoji';

const INTENSITY_LABELS: Record<TrainingIntensity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function TrainingSessionRow({
  session,
  /** The session's day, spelled out in the subtitle — for a cross-day list
   *  (the Training tab's history) where the date isn't otherwise implied. */
  date,
  onPress,
}: {
  session: TrainingSession;
  date?: Date;
  onPress?: () => void;
}) {
  return (
    <ListRow
      icon={emojiForTraining(session.session_type)}
      accentIcon
      title={session.session_type}
      subtitle={
        <ThemedText type="micro" themeColor="textMuted">
          {date ? `${dateFormat.format(date)} · ` : ''}
          {INTENSITY_LABELS[session.intensity]} · {session.duration_minutes} min
        </ThemedText>
      }
      trailing={<RowValue value={session.burn_kcal} />}
      onPress={onPress}
    />
  );
}
