// The owner's account credentials, sealed under the device PIN.
//
// Why this exists: the Supabase session is not durable enough to be the only
// thing standing between the owner and their data. Its refresh token can be
// rotated out, expire, or be dropped by the client after a failed refresh, and
// when that happens `getSession()` returns null and the app has no choice but
// to ask for an email and a password again — on every launch, in the worst
// case. The PIN, meanwhile, is already stored durably and is already the thing
// the owner types to get in. Sealing the credentials under it lets a correct
// PIN mint a *fresh* session whenever the persisted one is gone, so the front
// door stays "six digits" instead of degrading to a login form (S-12, FR-042).
//
// The trade-off, stated plainly: the account password lives on this device,
// encrypted with a key derived from a six-digit PIN. Anyone who can read this
// device's storage can brute-force six digits offline and recover it. That is
// weaker than not storing it at all, and stronger than the alternative the app
// actually had — a password typed into a form on every launch, which is the
// thing that gets reused, shoulder-surfed, and autofilled into the wrong site.
// `clearVault()` on sign-out is what bounds the exposure.
//
// The cipher is SHA-256 in counter mode with a MAC of the same construction:
// expo-crypto gives digests and random bytes on every platform and nothing
// else, and pulling in a native AES dependency for a single small blob is not
// worth it. The PIN is the entropy bottleneck here regardless of the cipher.
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as Crypto from 'expo-crypto';

import { generateSalt, hashPin } from '@/lib/pin-crypto';

const STORAGE_KEY = '@caltracker/owner-vault';
const VERSION = 1;

export type OwnerCredentials = {
  email: string;
  password: string;
};

type SealedVault = {
  v: number;
  salt: string;
  cipher: string;
  mac: string;
};

/* ------------------------------------------------------------- in memory -- */

// The hand-off from "signed in" to "PIN chosen". Those are two screens apart,
// and the password is only in hand during the first — so it is parked here
// until `setPin` can seal it, and dropped either way. Module state, not
// storage: an unsealed password must never touch the disk.
let pending: OwnerCredentials | null = null;

/** Park the credentials a successful sign-in just used, for PIN setup to seal. */
export function rememberCredentials(credentials: OwnerCredentials): void {
  pending = credentials;
}

/** Take the parked credentials, clearing them. Null if sign-in didn't go through this launch. */
export function takeRememberedCredentials(): OwnerCredentials | null {
  const held = pending;
  pending = null;
  return held;
}

/* ----------------------------------------------------------------- codec -- */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

// Hand-rolled rather than `TextEncoder`, which is not guaranteed on every
// engine this bundle runs on. A password is not necessarily ASCII.
function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const point = text.codePointAt(i) as number;
    if (point > 0xffff) i++; // surrogate pair — codePointAt consumed both
    if (point < 0x80) {
      out.push(point);
    } else if (point < 0x800) {
      out.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    } else if (point < 0x10000) {
      out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    } else {
      out.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 63),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
      );
    }
  }
  return Uint8Array.from(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; ) {
    const lead = bytes[i];
    let point: number;
    let width: number;
    if (lead < 0x80) {
      point = lead;
      width = 1;
    } else if ((lead & 0xe0) === 0xc0) {
      point = lead & 31;
      width = 2;
    } else if ((lead & 0xf0) === 0xe0) {
      point = lead & 15;
      width = 3;
    } else {
      point = lead & 7;
      width = 4;
    }
    for (let k = 1; k < width; k++) point = (point << 6) | (bytes[i + k] & 63);
    text += String.fromCodePoint(point);
    i += width;
  }
  return text;
}

/* ---------------------------------------------------------------- cipher -- */

/**
 * A keystream as long as `length`, from SHA-256 over a counter. Same root key
 * and the same counter always give the same bytes, which is what makes the XOR
 * reversible — so the root key must never be reused across two seals. It isn't:
 * every seal draws a fresh salt.
 */
async function keystream(rootKey: string, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  for (let offset = 0, block = 0; offset < length; offset += 32, block++) {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${rootKey}:ks:${block}`,
    );
    out.set(fromHex(digest).subarray(0, Math.min(32, length - offset)), offset);
  }
  return out;
}

/** Derived from the PIN by the same key-stretching the PIN hash uses, under a
 *  different label so the stored hash and the encryption key can never be the
 *  same value. */
function deriveRootKey(pin: string, salt: string): Promise<string> {
  return hashPin(`vault:${pin}`, salt);
}

async function macFor(rootKey: string, cipher: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${rootKey}:mac:${cipher}`);
}

/* ------------------------------------------------------------------- api -- */

/** Encrypts `credentials` under `pin`, replacing whatever was stored. */
export async function sealVault(pin: string, credentials: OwnerCredentials): Promise<void> {
  const salt = await generateSalt();
  const rootKey = await deriveRootKey(pin, salt);
  const plain = utf8Encode(JSON.stringify(credentials));
  const stream = await keystream(rootKey, plain.length);
  const cipherBytes = plain.map((byte, i) => byte ^ stream[i]);
  const cipher = toHex(cipherBytes);
  const sealed: SealedVault = { v: VERSION, salt, cipher, mac: await macFor(rootKey, cipher) };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sealed));
}

/**
 * Decrypts the stored credentials with `pin`. Null when there is nothing
 * stored, when the PIN is wrong, or when the blob doesn't verify — the caller
 * can't act differently on those, and saying which would be a free oracle.
 */
export async function openVault(pin: string): Promise<OwnerCredentials | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const sealed = JSON.parse(raw) as SealedVault;
    if (sealed.v !== VERSION) return null;
    const rootKey = await deriveRootKey(pin, sealed.salt);
    if ((await macFor(rootKey, sealed.cipher)) !== sealed.mac) return null;
    const cipherBytes = fromHex(sealed.cipher);
    const stream = await keystream(rootKey, cipherBytes.length);
    const plain = cipherBytes.map((byte, i) => byte ^ stream[i]);
    const parsed = JSON.parse(utf8Decode(plain)) as OwnerCredentials;
    return parsed.email && parsed.password ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether a PIN could restore a session on its own, without asking to see the blob. */
export async function hasVault(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY)) !== null;
}

/** Wipes the stored credentials. Called wherever the PIN itself is cleared. */
export async function clearVault(): Promise<void> {
  pending = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
