// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'test/engine/.dist/*', 'public/engine/*', 'src/features/engine/generated/*'],
  },
  {
    // Node scripts (web smoke test, build and fixture tools).
    files: ['test/e2e/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
]);
