// Build + run the icon smoke script under Node.
//
// Same shim as scripts/run-estimate-smoke.mjs: the repo imports the
// platform-split `@/lib/supabase` (native pulls in react-native/AsyncStorage)
// and `@/lib/new-id` (native pulls in expo-crypto), neither of which loads under
// plain Node — and tsx does not honour a `.web` remap. So we bundle with
// esbuild, forcing the Node-safe web variants and no-oping the RN URL polyfill,
// then import the bundle. Run via `npm run smoke:icon` (supplies env via
// --env-file).
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

const outfile = join(tmpdir(), `icon-smoke-${Date.now()}.mjs`);
await build({
  entryPoints: ['scripts/icon-smoke.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  plugins: [nodeShim],
  tsconfig: 'tsconfig.json',
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);
