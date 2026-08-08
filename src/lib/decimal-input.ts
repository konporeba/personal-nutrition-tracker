// Everything the app knows about turning typed text into a number.
//
// **Both separators are decimal separators.** A phone's keyboard emits whatever
// its locale uses — a comma across most of Europe, a dot in the US — and the
// owner does not get to choose which key their keyboard offers. Refusing the
// comma meant the decimal key on a Polish keyboard produced a character the
// field silently dropped, so 1,5 became 15: not a rejected entry, a wrong one.
// So the sanitizer accepts either, keeps whichever was typed, and the parsers
// normalize before reading. Nothing downstream ever sees a comma.
//
// This is deliberately one dependency-free module rather than a helper on the
// `Field` component: the same rule was hand-copied into four files, which is
// how three of them ended up identical and the fourth quietly different. Every
// numeric input in the app now goes through here.
//
// What is *not* handled, on purpose: thousands separators. "1.500" reads as
// one-and-a-half, not fifteen hundred. Grouping is ambiguous with the decimal
// mark by definition (1.500 is both, depending on the locale), and no field in
// this app asks for a number big enough to want grouping.

/** The first separator wins and the rest are dropped, so `1,5.2` is `1,5`. */
const SEPARATOR = /[.,]/;

/**
 * Digits and at most one decimal separator, enforced keystroke by keystroke.
 * The separator the owner typed is the one kept — rewriting their comma to a
 * dot mid-keystroke fights the keyboard they are holding.
 *
 * This sanitizing is not cosmetic: it is what guarantees an empty field can
 * only ever mean "unknown" (null) and never a value a parser had to guess at.
 */
export function onlyDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  const at = cleaned.search(SEPARATOR);
  if (at === -1) return cleaned;
  return `${cleaned.slice(0, at)}${cleaned[at]}${cleaned.slice(at + 1).replace(/[.,]/g, '')}`;
}

/** Digits only — for the fields that measure in whole units, like minutes. */
export function onlyInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/**
 * The shared read: normalize the separator, then parse. `null` for anything
 * that isn't a finite number, including the empty field and a lone separator
 * (the two states a half-typed "0,5" passes through).
 */
function parse(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '.');
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * An empty field means "unknown", which is `null` — not `0`. Zero is a real
 * measurement and must only be stored when the owner actually typed it.
 */
export function toNumberOrNull(value: string): number | null {
  const parsed = parse(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/**
 * As `toNumberOrNull`, but zero is not an answer either — for the quantities
 * that make no sense at nothing: a training session that burned 0 kcal, a
 * serving count of 0, a plate that weighs 0 g.
 */
export function toPositiveOrNull(value: string): number | null {
  const parsed = parse(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/** A whole positive count. `90,5` minutes is not a duration — it is a typo. */
export function toIntOrNull(value: string): number | null {
  const parsed = parse(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
