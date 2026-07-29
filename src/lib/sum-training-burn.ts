// The day's total logged training burn, in one dependency-free place so the
// smoke script asserts against the same code the UI runs — the
// `sum-calories.ts` pattern, one level up. Unlike `sumCalories`, `burn_kcal`
// is a required (`not null`) column on `training_sessions`, so there is no
// null to skip.
export function sumTrainingBurn(sessions: { burn_kcal: number }[]): number {
  return sessions.reduce((total, session) => total + session.burn_kcal, 0);
}
