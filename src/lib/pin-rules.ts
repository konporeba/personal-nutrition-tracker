// What counts as a valid — and as a sensible — PIN, in one place.
//
// The digit filter used to be copy-pasted into every screen that owns a PIN
// field, which is how two screens end up disagreeing about the same six digits.
// The weakness checks are the new part: they are what lets the setup and change
// screens say *why* a PIN is a poor one while it is being typed, instead of
// accepting `111111` in silence.
//
// Weakness is advisory, deliberately. The gate protects a single-owner personal
// tracker on a device the owner has already unlocked; refusing an obvious PIN
// outright would be the app overruling its only user. It says its piece and
// lets them decide — `pin-gate.tsx` remains the only place a PIN is *rejected*,
// and it rejects on shape (six digits) alone.
import { PIN_LENGTH } from '@/lib/pin-gate';

/** Keep digits only, capped at the PIN length. */
export function onlyDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
}

export type PinWeakness = 'repeated' | 'sequential';

/**
 * The obvious-guess check, for a complete PIN. Returns null while the PIN is
 * still being typed — half a PIN is always "1234"-shaped, and warning about a
 * prefix the owner hasn't finished would cry wolf on every entry.
 */
export function pinWeakness(pin: string): PinWeakness | null {
  if (pin.length < PIN_LENGTH) return null;
  if (/^(\d)\1*$/.test(pin)) return 'repeated';
  if (isRun(pin)) return 'sequential';
  return null;
}

export function pinWeaknessMessage(weakness: PinWeakness): string {
  return weakness === 'repeated'
    ? 'Every digit is the same — easy to guess.'
    : 'Straight run of digits — easy to guess.';
}

/** A strictly ascending or descending run of consecutive digits. */
function isRun(pin: string): boolean {
  const step = Number(pin[1]) - Number(pin[0]);
  if (step !== 1 && step !== -1) return false;
  for (let index = 2; index < pin.length; index += 1) {
    if (Number(pin[index]) - Number(pin[index - 1]) !== step) return false;
  }
  return true;
}
