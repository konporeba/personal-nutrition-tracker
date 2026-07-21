// Web / Node UUID source. Browsers and Node 19+ expose a global
// `crypto.randomUUID()`, so no native module is needed.
export const newId = (): string => globalThis.crypto.randomUUID();
