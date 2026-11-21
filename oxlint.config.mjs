import { defineConfig } from 'oxlint';
import { oxlint } from 'oxc-config-mantine';

export default defineConfig({
  ...oxlint,
  ignorePatterns: ['**/*.{mjs,cjs,js,d.ts,d.mts}', '.next', '.trash'],
  rules: {
    ...oxlint.rules,
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
});
