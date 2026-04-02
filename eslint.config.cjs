const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  // Ignored paths
  {
    ignores: ['dist/**', 'node_modules/**', 'build/**', 'coverage/**'],
  },
  // TypeScript source files — parser + minimal safe rules
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Guard: never ship debugger statements
      'no-debugger': 'error',
      // Explicitly disabled — codebase uses `any` intentionally in service layers
      '@typescript-eslint/no-explicit-any': 'off',
      // Explicitly disabled — unused vars handled by TypeScript compiler itself
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
