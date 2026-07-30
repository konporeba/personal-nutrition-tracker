// Salted PIN hashing for the local PIN gate (see pin-gate.tsx). Cross-platform:
// expo-crypto's digestStringAsync and getRandomBytesAsync both work on web
// (over a secure origin) as well as native, so no .web.ts split is needed here.
import * as Crypto from 'expo-crypto';

/** A fresh random salt, hex-encoded. */
export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const HASH_ROUNDS = 1000;

/**
 * Salted, iterated SHA-256 hash of `pin`, hex-encoded. Never store the raw
 * PIN. 1000 rounds is modest key-stretching, not a real KDF — acceptable
 * given the PIN is a convenience gate layered on the Supabase credential,
 * but cheap enough to stay imperceptible on unlock.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  let digest = `${salt}${pin}`;
  for (let round = 0; round < HASH_ROUNDS; round++) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digest);
  }
  return digest;
}
