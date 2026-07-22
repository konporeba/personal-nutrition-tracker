// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Supabase Edge Functions are a separate Deno project — checked with
    // `deno check` / Supabase deploy, not the app's ESLint/tsc.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
