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

/** SHA-256 hash of `salt + pin`, hex-encoded. Never store the raw PIN. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${pin}`);
}
