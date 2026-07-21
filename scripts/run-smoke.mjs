// Build + run the smoke script under Node.
//
// The repo imports the platform-split `@/lib/supabase` (native pulls in
// react-native/AsyncStorage) and `@/lib/new-id` (native pulls in expo-crypto),
// neither of which loads under plain Node — and tsx does not honour a `.web`
// remap. So we bundle with esbuild, using an onResolve plugin to force the
// Node-safe web variants and to no-op the RN URL polyfill, then import the
// bundle. Run via `npm run smoke` (which supplies env via --env-file).
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const nodeShim = {
  name: 'node-shim',
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({
      path: resolve('src/lib/supabase.web.ts'),
    }));
    b.onResolve({ filter: /^@\/lib\/new-id$/ }, () => ({
      path: resolve('src/lib/new-id.web.ts'),
    }));
    b.onResolve({ filter: /^react-native-url-polyfill\/auto$/ }, () => ({
      path: resolve('scripts/node-stub-url-polyfill.js'),
    }));
  },
};

const outfile = join(tmpdir(), `smoke-store-${Date.now()}.mjs`);
await build({
  entryPoints: ['scripts/smoke-store.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  plugins: [nodeShim],
  tsconfig: 'tsconfig.json',
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);
