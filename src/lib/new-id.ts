// Native UUID source. React Native has no global `crypto.randomUUID()`, so we
// use expo-crypto. Web/Node use the platform file (`new-id.web.ts`), which is
// also what the Node smoke script resolves to (expo-crypto is native-only).
import * as Crypto from 'expo-crypto';

export const newId = (): string => Crypto.randomUUID();
