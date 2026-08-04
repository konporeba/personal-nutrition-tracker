// The training type → emoji mapping, the `food-emoji.ts` pattern one slice
// over: dependency-free, in `src/lib`, so the smoke script and the UI resolve
// icons through the same code.
//
// Every session used to render 🔥, which said "this is exercise" — something
// the accent-tinted tile already says — and nothing about *which* exercise. A
// list of ten sessions was ten identical flames.
//
// `session_type` is a free `text` column: the composer offers five presets,
// but `Other` writes whatever the owner typed, and rows logged before that
// picker existed hold arbitrary strings. So this matches on keywords rather
// than on the preset list, and multilingual stems are included for the same
// reason the estimate prompts ask for English — the data predates that rule.

/** The fallback when nothing in the table matches. Still says "exercise". */
export const GENERIC_TRAINING = '🔥';

type TrainingRule = { emoji: string; match: string[] };

/**
 * Ordered type → emoji table. **Order is load-bearing**: the first matching
 * rule wins, so anything that could be shadowed goes first. `walk` precedes
 * `run` so "walk/run" reads as the gentler of the two; `spin` precedes the
 * generic gym rule so a spin class is a bike, not a dumbbell.
 */
const TRAINING_TABLE: TrainingRule[] = [
  { emoji: '🚴', match: ['cycling', 'cycle', 'bike', 'biking', 'spin', 'spinning', 'rower'] },
  { emoji: '🏊', match: ['swimming', 'swim', 'pool', 'lengths', 'plywanie'] },
  { emoji: '🥾', match: ['trekking', 'trek', 'hike', 'hiking', 'walk', 'walking', 'trail'] },
  { emoji: '🏃', match: ['running', 'run', 'jog', 'jogging', 'sprint', 'bieganie', '5k', '10k'] },
  { emoji: '🏋️', match: ['gym', 'weights', 'lifting', 'strength', 'squat', 'deadlift', 'bench'] },

  // Beyond the five presets — these only ever arrive through `Other`, but a
  // named activity deserves its own mark as much as a preset does.
  { emoji: '🧘', match: ['yoga', 'pilates', 'stretch', 'stretching', 'mobility'] },
  { emoji: '🥊', match: ['boxing', 'box', 'kickboxing', 'mma', 'sparring'] },
  { emoji: '⚽', match: ['football', 'soccer', 'futsal'] },
  { emoji: '🏀', match: ['basketball', 'basket'] },
  { emoji: '🎾', match: ['tennis', 'padel', 'squash', 'badminton'] },
  { emoji: '🧗', match: ['climbing', 'climb', 'bouldering', 'boulder'] },
  { emoji: '⛷️', match: ['ski', 'skiing', 'snowboard', 'snowboarding'] },
  { emoji: '🚣', match: ['rowing', 'row', 'kayak', 'kayaking', 'paddle'] },
  { emoji: '💃', match: ['dance', 'dancing', 'zumba'] },
  { emoji: '🤸', match: ['hiit', 'crossfit', 'circuit', 'calisthenics', 'cardio'] },
];

/** Lowercase, collapse any non-alphanumeric run to a single space, trim. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Light singularization so "weights" matches "weight". Guards short words. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * Resolve a session type to an emoji. Normalizes, then scans the ordered
 * table: multi-word tokens match as a substring of the whole string,
 * single-word tokens match a whole (singularized) word. Whole-word matching is
 * what stops "row" matching "throw" or "box" matching "boxer briefs". First
 * match wins; no match — including null/empty input — returns
 * `GENERIC_TRAINING`. Total.
 */
export function emojiForTraining(sessionType: string | null | undefined): string {
  if (!sessionType) return GENERIC_TRAINING;
  const norm = normalize(sessionType);
  if (norm === '') return GENERIC_TRAINING;

  const words = new Set(norm.split(' ').map(singular));
  for (const rule of TRAINING_TABLE) {
    for (const token of rule.match) {
      if (token.includes(' ')) {
        if (norm.includes(token)) return rule.emoji;
      } else if (words.has(singular(token))) {
        return rule.emoji;
      }
    }
  }
  return GENERIC_TRAINING;
}
